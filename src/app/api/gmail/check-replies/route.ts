import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGmailClient } from '@/lib/gmail'
import { gmail_v1 } from 'googleapis'

export async function POST(request: Request) {
  // Verify cron secret for direct calls
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('x-cron-secret')
    const url = new URL(request.url)
    const urlSecret = url.searchParams.get('secret')
    if (authHeader !== cronSecret && urlSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

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

  // Group emails by sender account
  const emailsBySender = new Map<string, typeof sentEmails>()
  for (const email of sentEmails) {
    const sender = email.sent_from || '_default'
    if (!emailsBySender.has(sender)) emailsBySender.set(sender, [])
    emailsBySender.get(sender)!.push(email)
  }

  try {
    // REPLY + IN-THREAD BOUNCE CHECK: check each sender's threads
    for (const [sender, senderEmails] of Array.from(emailsBySender)) {
      let gmail: gmail_v1.Gmail
      let senderEmail: string
      try {
        const client = await getGmailClient(sender !== '_default' ? sender : undefined)
        gmail = client.gmail
        senderEmail = client.email
      } catch {
        continue
      }

      // Get ALL sender identities (primary + aliases) so we don't count our own follow-ups as replies
      const ourAddresses: string[] = [senderEmail.toLowerCase()]
      // Add the sender alias itself
      if (sender !== '_default' && sender !== senderEmail) {
        ourAddresses.push(sender.toLowerCase())
      }
      // Get stored aliases from settings
      const { data: accountSettings } = await supabase
        .from('settings')
        .select('value')
        .like('key', 'gmail_tokens%')

      for (const row of (accountSettings || [])) {
        const val = row.value as { email?: string; aliases?: string[] }
        if (val.email?.toLowerCase() === senderEmail.toLowerCase()) {
          if (val.aliases) {
            for (const alias of val.aliases) {
              if (!ourAddresses.includes(alias.toLowerCase())) {
                ourAddresses.push(alias.toLowerCase())
              }
            }
          }
          break
        }
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
          if (messages.length <= 1) continue

          // Check for bounces in thread
          const bounceMessage = messages.find((msg) => {
            const fromHeader = (msg.payload?.headers?.find((h) => h.name === 'From')?.value || '').toLowerCase()
            const subject = (msg.payload?.headers?.find((h) => h.name === 'Subject')?.value || '').toLowerCase()
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
              await markBounced(supabase, email, snippet)
              bouncesFound++
            }
            continue
          }

          // Check for replies — message must NOT be from any of our addresses
          const hasReply = messages.some((msg) => {
            const fromHeader = msg.payload?.headers?.find((h) => h.name === 'From')?.value || ''
            const fromLower = fromHeader.toLowerCase()
            // Check if this message is from ANY of our addresses (primary + aliases)
            const isFromUs = ourAddresses.some(addr => fromLower.includes(addr))
            const isBounce = BOUNCE_SENDERS.some(bs => fromLower.includes(bs))
            return !isFromUs && !isBounce
          })

          if (!hasReply) continue

          const latestReply = messages[messages.length - 1]
          const snippet = latestReply.snippet || ''
          const threadEmails = senderEmails.filter(e => e.gmail_thread_id === threadId)

          for (const email of threadEmails) {
            await markReplied(supabase, email, snippet)
            repliesFound++
          }
        } catch {
          continue
        }
      }
    }

    // BOUNCE INBOX SEARCH: Search Gmail for mailer-daemon messages (separate threads)
    const checkedAccounts = new Set<string>()
    for (const [sender] of Array.from(emailsBySender)) {
      let gmailClient: gmail_v1.Gmail
      let accountEmail: string
      try {
        const client = await getGmailClient(sender !== '_default' ? sender : undefined)
        gmailClient = client.gmail
        accountEmail = client.email
      } catch {
        continue
      }

      if (checkedAccounts.has(accountEmail)) continue
      checkedAccounts.add(accountEmail)

      try {
        const { data: searchResult } = await gmailClient.users.messages.list({
          userId: 'me',
          q: 'from:(mailer-daemon OR postmaster) newer_than:7d',
          maxResults: 50,
        })

        if (!searchResult.messages?.length) continue

        for (const msg of searchResult.messages) {
          try {
            const { data: message } = await gmailClient.users.messages.get({
              userId: 'me',
              id: msg.id!,
              format: 'full',
            })

            const snippet = message.snippet || ''
            const body = message.payload?.parts?.[0]?.body?.data
              ? Buffer.from(message.payload.parts[0].body.data, 'base64url').toString()
              : snippet

            // Extract bounced recipient email
            const toHeader = message.payload?.headers?.find((h) => h.name === 'X-Failed-Recipients')?.value
            const bodyMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
            const bouncedEmail = toHeader || bodyMatch?.[1]

            if (!bouncedEmail) continue

            // Look up ALL contacts with this email (duplicates may exist)
            const { data: bouncedContacts } = await supabase
              .from('contacts')
              .select('id')
              .eq('email', bouncedEmail.toLowerCase())

            if (!bouncedContacts?.length) continue

            // Find sent email matching ANY of these contact IDs
            const bouncedContactIds = bouncedContacts.map(c => c.id)
            const emailRecord = sentEmails.find(e => bouncedContactIds.includes(e.contact_id))
            if (!emailRecord) continue

            // Check if already bounced
            const { data: existing } = await supabase
              .from('emails')
              .select('bounced_at')
              .eq('id', emailRecord.id)
              .single()

            if (existing?.bounced_at) continue

            await markBounced(supabase, emailRecord, snippet)
            bouncesFound++
          } catch {
            continue
          }
        }
      } catch {
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
    bounces_found: bouncesFound,
  })
}

// Helper: mark email as bounced and skip remaining steps
async function markBounced(
  supabase: ReturnType<typeof createAdminClient>,
  email: { id: string; contact_id: string; prospect_id: string | null; experiment_id: string | null },
  snippet: string
) {
  await supabase.from('emails').update({
    bounced_at: new Date().toISOString(),
    error_message: `Bounce: ${snippet.substring(0, 300)}`,
  }).eq('id', email.id)

  await supabase.from('contacts').update({ status: 'bounced' }).eq('id', email.contact_id)

  // Skip remaining unsent emails for this contact
  const { data: stepData } = await supabase
    .from('emails').select('sequence_step_id').eq('id', email.id).single()

  if (stepData) {
    const { data: step } = await supabase
      .from('sequence_steps').select('sequence_id').eq('id', stepData.sequence_step_id).single()

    if (step) {
      const { data: allSteps } = await supabase
        .from('sequence_steps').select('id').eq('sequence_id', step.sequence_id)

      if (allSteps?.length) {
        await supabase.from('emails')
          .update({ send_status: 'skipped', error_message: 'Skipped — contact bounced' })
          .eq('contact_id', email.contact_id)
          .in('sequence_step_id', allSteps.map(s => s.id))
          .in('send_status', ['queued', 'scheduled'])
      }
    }
  }

  await supabase.from('activity_log').insert({
    email_id: email.id,
    contact_id: email.contact_id,
    prospect_id: email.prospect_id,
    action: 'email_bounced',
    details: { snippet: snippet.substring(0, 200) },
  })
}

// Helper: mark email as replied and skip remaining steps
async function markReplied(
  supabase: ReturnType<typeof createAdminClient>,
  email: { id: string; contact_id: string; prospect_id: string | null; experiment_id: string | null },
  snippet: string
) {
  await supabase.from('emails').update({
    replied_at: new Date().toISOString(),
    reply_snippet: snippet.substring(0, 500),
  }).eq('id', email.id)

  await supabase.from('contacts').update({ status: 'replied' }).eq('id', email.contact_id)

  // Skip remaining unsent emails
  const { data: stepData } = await supabase
    .from('emails').select('sequence_step_id').eq('id', email.id).single()

  if (stepData) {
    const { data: step } = await supabase
      .from('sequence_steps').select('sequence_id').eq('id', stepData.sequence_step_id).single()

    if (step) {
      const { data: allSteps } = await supabase
        .from('sequence_steps').select('id').eq('sequence_id', step.sequence_id)

      if (allSteps?.length) {
        await supabase.from('emails')
          .update({ send_status: 'skipped' })
          .eq('contact_id', email.contact_id)
          .in('sequence_step_id', allSteps.map(s => s.id))
          .in('send_status', ['queued', 'scheduled'])
      }
    }
  }

  // Update experiment
  if (email.experiment_id) {
    try {
      await supabase.rpc('increment_experiment_replied', {
        p_experiment_id: email.experiment_id,
        p_contact_id: email.contact_id,
      })
    } catch { /* best-effort */ }
  }

  await supabase.from('activity_log').insert({
    email_id: email.id,
    contact_id: email.contact_id,
    prospect_id: email.prospect_id,
    action: 'reply_detected',
    details: { snippet: snippet.substring(0, 200) },
  })
}
