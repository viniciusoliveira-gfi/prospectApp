import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGmailClient } from '@/lib/gmail'

export async function POST() {
  const supabase = createAdminClient()

  // Get all sent emails that haven't been marked as replied or bounced
  const { data: sentEmails, error } = await supabase
    .from('emails')
    .select('id, gmail_thread_id, gmail_message_id, contact_id, prospect_id, experiment_id, sent_from')
    .eq('send_status', 'sent')
    .is('replied_at', null)
    .is('bounced_at', null)
    .not('gmail_thread_id', 'is', null)
    .limit(500)

  if (error || !sentEmails?.length) {
    return NextResponse.json({ checked: 0, replies_found: 0, bounces_found: 0 })
  }

  let repliesFound = 0
  let bouncesFound = 0

  const BOUNCE_SENDERS = ['mailer-daemon', 'postmaster', 'mail-noreply@google.com']

  // Group emails by sender account so we use the right Gmail client
  const emailsBySender = new Map<string, typeof sentEmails>()
  for (const email of sentEmails) {
    const sender = email.sent_from || '_default'
    if (!emailsBySender.has(sender)) emailsBySender.set(sender, [])
    emailsBySender.get(sender)!.push(email)
  }

  try {
    for (const [sender, senderEmails] of Array.from(emailsBySender)) {
    // Get the right Gmail client for this sender account
    let gmail, senderEmail: string
    try {
      const client = await getGmailClient(sender !== '_default' ? sender : undefined)
      gmail = client.gmail
      senderEmail = client.email
    } catch {
      continue // skip if account can't be reached
    }

    const threadIds = Array.from(new Set(senderEmails.map(e => e.gmail_thread_id!)))

    for (const threadId of threadIds) {
      try {
        const thread = await gmail.users.threads.get({
          userId: 'me',
          id: threadId,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject'],
        })

        const messages = thread.data.messages || []
        if (messages.length <= 1) continue // No replies or bounces

        // Check for bounces first (mailer-daemon, postmaster, delivery failure)
        const bounceMessage = messages.find(msg => {
          const fromHeader = (msg.payload?.headers?.find(h => h.name === 'From')?.value || '').toLowerCase()
          const subject = (msg.payload?.headers?.find(h => h.name === 'Subject')?.value || '').toLowerCase()
          return BOUNCE_SENDERS.some(bs => fromHeader.includes(bs)) ||
            subject.includes('delivery status notification') ||
            subject.includes('undeliverable') ||
            subject.includes('mail delivery failed') ||
            subject.includes('delivery failure')
        })

        if (bounceMessage) {
          const snippet = bounceMessage.snippet || ''
          const threadEmails = senderEmails.filter(e => e.gmail_thread_id === threadId)

          for (const email of threadEmails) {
            await supabase
              .from('emails')
              .update({
                bounced_at: new Date().toISOString(),
                error_message: `Bounce: ${snippet.substring(0, 300)}`,
              })
              .eq('id', email.id)

            // Update contact status to bounced
            await supabase
              .from('contacts')
              .update({ status: 'bounced' })
              .eq('id', email.contact_id)

            // Skip remaining unsent emails for this contact
            const { data: stepData } = await supabase
              .from('emails')
              .select('sequence_step_id')
              .eq('id', email.id)
              .single()

            if (stepData) {
              const { data: step } = await supabase
                .from('sequence_steps')
                .select('sequence_id')
                .eq('id', stepData.sequence_step_id)
                .single()

              if (step) {
                const { data: allSteps } = await supabase
                  .from('sequence_steps')
                  .select('id')
                  .eq('sequence_id', step.sequence_id)

                if (allSteps?.length) {
                  await supabase
                    .from('emails')
                    .update({ send_status: 'skipped', error_message: 'Skipped — contact bounced' })
                    .eq('contact_id', email.contact_id)
                    .in('sequence_step_id', allSteps.map(s => s.id))
                    .in('send_status', ['queued', 'scheduled'])
                }
              }
            }

            // Log activity
            await supabase.from('activity_log').insert({
              email_id: email.id,
              contact_id: email.contact_id,
              prospect_id: email.prospect_id,
              action: 'email_bounced',
              details: { snippet: snippet.substring(0, 200) },
            })

            bouncesFound++
          }
          continue // Don't also check for replies on bounced threads
        }

        // Check for replies (not from us, not a bounce)
        const hasReply = messages.some(msg => {
          const fromHeader = msg.payload?.headers?.find(h => h.name === 'From')?.value || ''
          const fromLower = fromHeader.toLowerCase()
          return !fromLower.includes(senderEmail.toLowerCase()) &&
            !BOUNCE_SENDERS.some(bs => fromLower.includes(bs))
        })

        if (!hasReply) continue

        // Get snippet from the latest reply
        const latestReply = messages[messages.length - 1]
        const snippet = latestReply.snippet || ''

        // Mark all emails in this thread as replied
        const threadEmails = senderEmails.filter(e => e.gmail_thread_id === threadId)
        for (const email of threadEmails) {
          await supabase
            .from('emails')
            .update({
              replied_at: new Date().toISOString(),
              reply_snippet: snippet.substring(0, 500),
            })
            .eq('id', email.id)

          // Update contact status to replied
          await supabase
            .from('contacts')
            .update({ status: 'replied' })
            .eq('id', email.contact_id)

          // Skip remaining unsent emails for this contact in the same sequence
          const { data: stepData } = await supabase
            .from('emails')
            .select('sequence_step_id')
            .eq('id', email.id)
            .single()

          if (stepData) {
            const { data: step } = await supabase
              .from('sequence_steps')
              .select('sequence_id')
              .eq('id', stepData.sequence_step_id)
              .single()

            if (step) {
              // Get all step IDs for this sequence
              const { data: allSteps } = await supabase
                .from('sequence_steps')
                .select('id')
                .eq('sequence_id', step.sequence_id)

              if (allSteps?.length) {
                await supabase
                  .from('emails')
                  .update({ send_status: 'skipped' })
                  .eq('contact_id', email.contact_id)
                  .in('sequence_step_id', allSteps.map(s => s.id))
                  .in('send_status', ['queued', 'scheduled'])
              }
            }
          }

          // Update experiment assignment if applicable
          if (email.experiment_id) {
            try {
              await supabase.rpc('increment_experiment_replied', {
                p_experiment_id: email.experiment_id,
                p_contact_id: email.contact_id,
              })
            } catch { /* best-effort */ }
          }

          // Log activity
          await supabase.from('activity_log').insert({
            email_id: email.id,
            contact_id: email.contact_id,
            prospect_id: email.prospect_id,
            action: 'reply_detected',
            details: { snippet: snippet.substring(0, 200) },
          })

          repliesFound++
        }
      } catch {
        // Skip threads that fail (e.g., deleted)
        continue
      }
    }
    } // end sender loop
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to check replies' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    checked: sentEmails.length,
    threads_checked: Array.from(new Set(sentEmails.map(e => e.gmail_thread_id))).length,
    replies_found: repliesFound,
    bounces_found: bouncesFound,
  })
}
