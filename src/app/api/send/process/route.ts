import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, GMAIL_LIMITS } from '@/lib/gmail'

export async function POST() {
  const supabase = createAdminClient()

  // Check how many sent today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { count: sentToday } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('send_status', 'sent')
    .gte('sent_at', today.toISOString())

  if ((sentToday || 0) >= GMAIL_LIMITS.maxPerDay) {
    return NextResponse.json({ message: 'Daily send limit reached', sent: 0 })
  }

  // Check sending hours
  const now = new Date()
  const currentHour = now.getHours()
  if (currentHour < GMAIL_LIMITS.sendingHoursStart || currentHour >= GMAIL_LIMITS.sendingHoursEnd) {
    return NextResponse.json({ message: 'Outside sending hours', sent: 0 })
  }

  // Get approved, queued/scheduled emails ready to send
  const { data: emails, error } = await supabase
    .from('emails')
    .select('*, contacts(email, first_name, last_name, status), prospects(company_name)')
    .in('approval_status', ['approved', 'edited'])
    .in('send_status', ['queued', 'scheduled'])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(GMAIL_LIMITS.maxPerHour)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!emails?.length) return NextResponse.json({ message: 'No emails to send', sent: 0 })

  let sentCount = 0
  const results: { id: string; status: string; error?: string }[] = []

  for (const email of emails) {
    // Skip if contact has no email or is not active
    if (!email.contacts?.email || email.contacts.status !== 'active') {
      await supabase.from('emails').update({ send_status: 'skipped' }).eq('id', email.id)
      results.push({ id: email.id, status: 'skipped', error: 'No email or contact inactive' })
      continue
    }

    // Check if contact already replied to a previous step in this sequence
    if (email.contacts.status === 'replied') {
      await supabase.from('emails').update({ send_status: 'skipped' }).eq('id', email.id)
      results.push({ id: email.id, status: 'skipped', error: 'Contact already replied' })
      continue
    }

    // Rate limit between sends
    if (sentCount > 0) {
      await new Promise(resolve => setTimeout(resolve, GMAIL_LIMITS.minIntervalMs))
    }

    try {
      // Mark as sending
      await supabase.from('emails').update({ send_status: 'sending' }).eq('id', email.id)

      // Wrap email body in HTML
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
${email.body.replace(/\n/g, '<br/>')}
</div>`

      const result = await sendEmail({
        to: email.contacts.email,
        subject: email.subject,
        htmlBody,
        trackingPixelId: email.tracking_pixel_id,
      })

      await supabase.from('emails').update({
        send_status: 'sent',
        sent_at: new Date().toISOString(),
        gmail_message_id: result.messageId,
        gmail_thread_id: result.threadId,
      }).eq('id', email.id)

      // Log activity
      await supabase.from('activity_log').insert({
        email_id: email.id,
        contact_id: email.contact_id,
        prospect_id: email.prospect_id,
        action: 'email_sent',
        details: { subject: email.subject, to: email.contacts.email },
      })

      sentCount++
      results.push({ id: email.id, status: 'sent' })
    } catch (err) {
      await supabase.from('emails').update({
        send_status: 'failed',
        error_message: err instanceof Error ? err.message : 'Send failed',
      }).eq('id', email.id)

      results.push({ id: email.id, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' })
    }

    // Check daily limit
    if ((sentToday || 0) + sentCount >= GMAIL_LIMITS.maxPerDay) break
  }

  return NextResponse.json({ sent: sentCount, results })
}
