import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGmailClient } from '@/lib/gmail'

export async function POST() {
  const supabase = createAdminClient()

  // Get all sent emails that haven't been marked as replied
  const { data: sentEmails, error } = await supabase
    .from('emails')
    .select('id, gmail_thread_id, gmail_message_id, contact_id, prospect_id, experiment_id')
    .eq('send_status', 'sent')
    .is('replied_at', null)
    .not('gmail_thread_id', 'is', null)

  if (error || !sentEmails?.length) {
    return NextResponse.json({ checked: 0, replies_found: 0 })
  }

  let repliesFound = 0

  try {
    const { gmail } = await getGmailClient()

    // Group by thread to avoid duplicate API calls
    const threadIds = Array.from(new Set(sentEmails.map(e => e.gmail_thread_id!)))

    for (const threadId of threadIds) {
      try {
        const thread = await gmail.users.threads.get({
          userId: 'me',
          id: threadId,
          format: 'metadata',
          metadataHeaders: ['From'],
        })

        const messages = thread.data.messages || []
        if (messages.length <= 1) continue // No replies

        // Check if any message is NOT from us (i.e., a reply from the contact)
        const { email: senderEmail } = await getGmailClient()
        const hasReply = messages.some(msg => {
          const fromHeader = msg.payload?.headers?.find(h => h.name === 'From')?.value || ''
          return !fromHeader.includes(senderEmail)
        })

        if (!hasReply) continue

        // Get snippet from the latest reply
        const latestReply = messages[messages.length - 1]
        const snippet = latestReply.snippet || ''

        // Mark all emails in this thread as replied
        const threadEmails = sentEmails.filter(e => e.gmail_thread_id === threadId)
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
              await supabase
                .from('experiment_assignments')
                .update({ emails_replied: 1 })
                .eq('experiment_id', email.experiment_id)
                .eq('contact_id', email.contact_id)
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
  })
}
