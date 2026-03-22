import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, GMAIL_LIMITS } from '@/lib/gmail'

export async function POST() {
  const supabase = createAdminClient()

  // Load sending settings
  const { data: sendingSettings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'sending_defaults')
    .single()

  const settings = (sendingSettings?.value || {}) as Record<string, string>
  const accountTimezone = settings.timezone || 'America/Sao_Paulo'
  const hoursStart = parseInt(settings.hours_start || '9')
  const hoursEnd = parseInt(settings.hours_end || '18')
  const globalDailyLimitPerAccount = parseInt(settings.daily_limit_per_account || settings.daily_limit || '25')
  const sendDays: string[] = settings.send_days ? JSON.parse(settings.send_days) : ['1', '2', '3', '4', '5']

  // Get current time in account timezone
  const now = new Date()
  const tzTime = new Date(now.toLocaleString('en-US', { timeZone: accountTimezone }))
  const currentHour = tzTime.getHours()
  const currentDay = String(tzTime.getDay())

  // Check if today is a sending day
  if (!sendDays.includes(currentDay)) {
    return NextResponse.json({ message: `Not a sending day (${accountTimezone})`, sent: 0 })
  }

  // Calculate today's start in account timezone for per-account limit checks
  const todayInTz = new Date(tzTime)
  todayInTz.setHours(0, 0, 0, 0)
  const todayStart = new Date(now.getTime() - (tzTime.getTime() - todayInTz.getTime()))

  // Get per-account sent counts for today
  const { data: sentTodayData } = await supabase
    .from('emails')
    .select('sent_from')
    .eq('send_status', 'sent')
    .gte('sent_at', todayStart.toISOString())

  const perAccountSentToday: Record<string, number> = {}
  for (const e of (sentTodayData || [])) {
    const sender = e.sent_from || '_default'
    perAccountSentToday[sender] = (perAccountSentToday[sender] || 0) + 1
  }

  // Check sending hours in account timezone
  if (currentHour < hoursStart || currentHour >= hoursEnd) {
    return NextResponse.json({ message: `Outside sending hours (${currentHour}h in ${accountTimezone})`, sent: 0 })
  }

  // Get approved, scheduled emails ready to send — only from active sequences
  const { data: activeSequences } = await supabase
    .from('sequences')
    .select('id, campaign_id')
    .eq('status', 'active')

  if (!activeSequences?.length) {
    return NextResponse.json({ message: 'No active sequences', sent: 0 })
  }

  // Get campaign settings for sender accounts, tracking, etc.
  const campaignIds = Array.from(new Set(activeSequences.map(s => s.campaign_id)))
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, sending_account, send_settings')
    .in('id', campaignIds)

  interface CampaignConfig {
    sending_account: string | null
    sender_accounts: string[]
    track_opens: boolean
  }
  const campaignConfigs: Record<string, CampaignConfig> = {}
  for (const c of (campaigns || [])) {
    const ss = c.send_settings as { sender_accounts?: string[]; track_opens?: boolean } | null
    campaignConfigs[c.id] = {
      sending_account: c.sending_account,
      sender_accounts: ss?.sender_accounts || [],
      track_opens: ss?.track_opens !== false, // default true
    }
  }

  const sequenceCampaignMap = Object.fromEntries(
    activeSequences.map(s => [s.id, s.campaign_id])
  )

  // Build sender assignment: same sender per prospect (company)
  // Track which sender was used for each prospect
  const prospectSenderMap: Record<string, string> = {}
  const senderSentCount: Record<string, number> = {}

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

      // Resolve sender — use pre-assigned sent_from or determine from config
      const emailCampaignId = stepInfo ? sequenceCampaignMap[stepInfo.sequence_id] : undefined
      const config = emailCampaignId ? campaignConfigs[emailCampaignId] : undefined
      const campaignLimit = (config as unknown as { daily_limit_per_account?: number })?.daily_limit_per_account
      const dailyLimit = campaignLimit || globalDailyLimitPerAccount
      let fromAlias: string | undefined = email.sent_from || undefined

      if (!fromAlias) {
        if (config && config.sender_accounts.length > 0) {
          const prospectKey = email.prospect_id || email.contact_id
          if (prospectSenderMap[prospectKey]) {
            fromAlias = prospectSenderMap[prospectKey]
          } else {
            const sorted = [...config.sender_accounts].sort(
              (a, b) => (senderSentCount[a] || 0) - (senderSentCount[b] || 0)
            )
            fromAlias = sorted[0]
            prospectSenderMap[prospectKey] = fromAlias
          }
          senderSentCount[fromAlias] = (senderSentCount[fromAlias] || 0) + 1
        } else if (config?.sending_account) {
          fromAlias = config.sending_account
        }
      }

      // Check per-account daily limit
      const senderKey = fromAlias || '_default'
      const accountSentToday = (perAccountSentToday[senderKey] || 0) + (senderSentCount[senderKey] || 0)
      if (accountSentToday >= dailyLimit) {
        results.push({ id: email.id, status: 'skipped_limit', error: `Account ${senderKey} hit daily limit (${dailyLimit})` })
        continue
      }

      // Check if tracking is enabled for this campaign
      const trackOpens = config?.track_opens !== false

      const result = await sendEmail({
        to: email.contacts.email,
        subject: email.subject,
        htmlBody,
        trackingPixelId: trackOpens ? email.tracking_pixel_id : undefined,
        threadId,
        fromAlias: fromAlias || undefined,
      })

      await supabase.from('emails').update({
        send_status: 'sent',
        sent_at: new Date().toISOString(),
        gmail_message_id: result.messageId,
        gmail_thread_id: result.threadId,
        sent_from: fromAlias || null,
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
