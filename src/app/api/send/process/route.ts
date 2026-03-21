import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, GMAIL_LIMITS } from '@/lib/gmail'

export async function POST() {
  const supabase = createAdminClient()

  // Get account timezone from settings
  const { data: tokenSettings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'gmail_tokens')
    .single()

  const accountTimezone = (tokenSettings?.value as { timezone?: string })?.timezone || 'America/Sao_Paulo'

  // Get current time in account timezone
  const now = new Date()
  const tzTime = new Date(now.toLocaleString('en-US', { timeZone: accountTimezone }))
  const currentHour = tzTime.getHours()

  // Check how many sent today (using account timezone for "today")
  const todayInTz = new Date(tzTime)
  todayInTz.setHours(0, 0, 0, 0)
  // Convert back to UTC for the query
  const todayStart = new Date(now.getTime() - (tzTime.getTime() - todayInTz.getTime()))

  const { count: sentToday } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('send_status', 'sent')
    .gte('sent_at', todayStart.toISOString())

  if ((sentToday || 0) >= GMAIL_LIMITS.maxPerDay) {
    return NextResponse.json({ message: 'Daily send limit reached', sent: 0 })
  }

  // Check sending hours in account timezone
  if (currentHour < GMAIL_LIMITS.sendingHoursStart || currentHour >= GMAIL_LIMITS.sendingHoursEnd) {
    return NextResponse.json({ message: `Outside sending hours (${currentHour}h in ${accountTimezone})`, sent: 0 })
  }

  // Get approved, scheduled emails ready to send — only from active sequences
  const { data: activeSequences } = await supabase
    .from('sequences')
    .select('id')
    .eq('status', 'active')

  if (!activeSequences?.length) {
    return NextResponse.json({ message: 'No active sequences', sent: 0 })
  }

  const { data: activeSteps } = await supabase
    .from('sequence_steps')
    .select('id, sequence_id, step_number')
    .in('sequence_id', activeSequences.map(s => s.id))

  if (!activeSteps?.length) {
    return NextResponse.json({ message: 'No steps in active sequences', sent: 0 })
  }

  const activeStepIds = activeSteps.map(s => s.id)

  const { data: emails, error } = await supabase
    .from('emails')
    .select('*, contacts(email, first_name, last_name, status), prospects(company_name)')
    .in('approval_status', ['approved', 'edited'])
    .eq('send_status', 'scheduled')
    .in('sequence_step_id', activeStepIds)
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(GMAIL_LIMITS.maxPerHour)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!emails?.length) return NextResponse.json({ message: 'No emails ready to send', sent: 0 })

  // Build a map of step info for ordering checks
  const stepInfoMap = Object.fromEntries(
    activeSteps.map(s => [s.id, { sequence_id: s.sequence_id, step_number: s.step_number }])
  )

  let sentCount = 0
  const results: { id: string; status: string; error?: string }[] = []
  const completedSequences = new Set<string>()

  for (const email of emails) {
    // Skip if contact has no email or is not active
    if (!email.contacts?.email || email.contacts.status !== 'active') {
      await supabase.from('emails').update({ send_status: 'skipped' }).eq('id', email.id)
      results.push({ id: email.id, status: 'skipped', error: 'No email or contact inactive' })
      continue
    }

    // Check if contact already replied
    if (email.contacts.status === 'replied') {
      await supabase.from('emails').update({ send_status: 'skipped' }).eq('id', email.id)
      results.push({ id: email.id, status: 'skipped', error: 'Contact already replied' })
      continue
    }

    // Enforce step ordering: don't send step 2+ until prior step is sent for this contact
    const stepInfo = stepInfoMap[email.sequence_step_id]
    if (stepInfo && stepInfo.step_number > 1) {
      // Find the previous step
      const prevStep = activeSteps.find(
        s => s.sequence_id === stepInfo.sequence_id && s.step_number === stepInfo.step_number - 1
      )
      if (prevStep) {
        const { data: prevEmail } = await supabase
          .from('emails')
          .select('send_status')
          .eq('sequence_step_id', prevStep.id)
          .eq('contact_id', email.contact_id)
          .single()

        if (prevEmail && prevEmail.send_status !== 'sent' && prevEmail.send_status !== 'skipped') {
          // Previous step not yet sent — skip for now
          results.push({ id: email.id, status: 'waiting', error: 'Previous step not yet sent' })
          continue
        }
      }
    }

    // Rate limit between sends
    if (sentCount > 0) {
      await new Promise(resolve => setTimeout(resolve, GMAIL_LIMITS.minIntervalMs))
    }

    try {
      // Mark as sending
      await supabase.from('emails').update({ send_status: 'sending' }).eq('id', email.id)

      // Check if this is a follow-up that should thread with step 1
      let threadId: string | undefined
      if (stepInfo && stepInfo.step_number > 1) {
        // Find the step 1 email for this contact in this sequence
        const step1 = activeSteps.find(
          s => s.sequence_id === stepInfo.sequence_id && s.step_number === 1
        )
        if (step1) {
          const { data: step1Email } = await supabase
            .from('emails')
            .select('gmail_thread_id, gmail_message_id')
            .eq('sequence_step_id', step1.id)
            .eq('contact_id', email.contact_id)
            .eq('send_status', 'sent')
            .single()

          if (step1Email?.gmail_thread_id) {
            threadId = step1Email.gmail_thread_id
          }
        }
      }

      // Wrap email body in HTML
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
${email.body.replace(/\n/g, '<br/>')}
</div>`

      const result = await sendEmail({
        to: email.contacts.email,
        subject: email.subject,
        htmlBody,
        trackingPixelId: email.tracking_pixel_id,
        threadId,
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
        details: { subject: email.subject, to: email.contacts.email, step: stepInfo?.step_number },
      })

      sentCount++
      results.push({ id: email.id, status: 'sent' })

      // Track which sequences have sent emails for completion check
      if (stepInfo) completedSequences.add(stepInfo.sequence_id)
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

  // Auto-complete sequences where all emails are sent/skipped
  for (const seqId of Array.from(completedSequences)) {
    const seqSteps = activeSteps.filter(s => s.sequence_id === seqId)
    const seqStepIds = seqSteps.map(s => s.id)

    const { count: remaining } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .in('sequence_step_id', seqStepIds)
      .in('send_status', ['queued', 'scheduled', 'sending'])

    if (remaining === 0) {
      await supabase
        .from('sequences')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', seqId)
    }
  }

  return NextResponse.json({ sent: sentCount, results })
}
