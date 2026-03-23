import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSequenceReadiness } from '@/lib/scheduling'
import { syncCampaignStatus } from '@/lib/campaign-status'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const sequenceId = params.id

  // Get sequence
  const { data: sequence, error: seqErr } = await supabase
    .from('sequences')
    .select('*, sequence_steps(*)')
    .eq('id', sequenceId)
    .single()

  if (seqErr || !sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  }

  if (sequence.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot start a sequence with status "${sequence.status}". Must be "draft".` },
      { status: 400 }
    )
  }

  // Get all emails for this sequence with prospect_id for sender assignment
  const steps = (sequence.sequence_steps as { id: string; step_number: number; delay_days: number }[])
    .sort((a, b) => a.step_number - b.step_number)

  const stepIds = steps.map(s => s.id)
  const { data: emails, error: emailsErr } = await supabase
    .from('emails')
    .select('id, approval_status, sequence_step_id, prospect_id, contact_id')
    .in('sequence_step_id', stepIds)

  if (emailsErr) {
    return NextResponse.json({ error: emailsErr.message }, { status: 500 })
  }

  if (!emails?.length) {
    return NextResponse.json(
      { error: 'No emails found. Generate emails before starting.' },
      { status: 400 }
    )
  }

  // Check readiness
  const readiness = checkSequenceReadiness(emails)
  if (!readiness.ready) {
    return NextResponse.json(
      {
        error: `Not all emails are approved. ${readiness.approved}/${readiness.total} approved, ${readiness.unapproved} still need approval.`,
        readiness,
      },
      { status: 400 }
    )
  }

  // Get campaign send settings for sender assignment
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('send_settings, sending_account')
    .eq('id', sequence.campaign_id)
    .single()

  const sendSettings = campaign?.send_settings as {
    sender_accounts?: string[]
  } | null

  // Determine sender accounts
  let senderAccounts = sendSettings?.sender_accounts || []
  if (!senderAccounts.length && campaign?.sending_account) {
    senderAccounts = [campaign.sending_account]
  }
  if (!senderAccounts.length) {
    // Fall back to primary Gmail account
    const { data: gmailData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gmail_tokens')
      .single()

    if (gmailData?.value) {
      const tokens = gmailData.value as { email?: string }
      if (tokens.email) senderAccounts = [tokens.email]
    }
  }

  // Assign senders: same sender per prospect, distributed evenly
  const prospectSenderMap: Record<string, string> = {}
  const senderCount: Record<string, number> = {}

  function assignSender(prospectKey: string): string | null {
    if (!senderAccounts.length) return null
    if (prospectSenderMap[prospectKey]) return prospectSenderMap[prospectKey]

    // Pick sender with fewest assignments
    const sorted = [...senderAccounts].sort(
      (a, b) => (senderCount[a] || 0) - (senderCount[b] || 0)
    )
    const chosen = sorted[0]
    prospectSenderMap[prospectKey] = chosen
    senderCount[chosen] = (senderCount[chosen] || 0) + 1
    return chosen
  }

  // Assign senders to all emails (same sender per prospect, evenly distributed)
  for (const email of emails) {
    const prospectKey = email.prospect_id || email.contact_id
    const sender = assignSender(prospectKey)

    await supabase
      .from('emails')
      .update({ sent_from: sender })
      .eq('id', email.id)
  }

  // Set sequence to active
  const now = new Date()
  await supabase
    .from('sequences')
    .update({
      status: 'active',
      started_at: now.toISOString(),
    })
    .eq('id', sequenceId)

  // Sync campaign status
  await syncCampaignStatus(sequence.campaign_id)

  // Smart schedule: distribute emails across days respecting daily limits
  // Resolve campaign + global settings
  const sendSettingsRaw = (campaign?.send_settings || {}) as {
    send_days?: string[]
    send_hours_start?: number
    timezone?: string
    daily_limit_per_account?: number
  }

  const { data: globalSettings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'sending_defaults')
    .single()

  const global = (globalSettings?.value || {}) as Record<string, string>

  const sendDays = sendSettingsRaw.send_days?.length
    ? sendSettingsRaw.send_days
    : global.send_days ? JSON.parse(global.send_days) : ['1', '2', '3', '4', '5']

  const hoursStart = sendSettingsRaw.send_hours_start ?? parseInt(global.hours_start || '9')
  const timezone = sendSettingsRaw.timezone || global.timezone || 'America/Sao_Paulo'
  const dailyLimitPerAccount = sendSettingsRaw.daily_limit_per_account
    || parseInt(global.daily_limit_per_account || global.daily_limit || '25')

  const dailyCapacity = senderAccounts.length * dailyLimitPerAccount

  // Base date in timezone
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))

  // Helper: find next valid send day
  function nextSendDay(from: Date, addDays: number): Date {
    const target = new Date(from)
    target.setDate(target.getDate() + addDays)
    target.setHours(hoursStart, 0, 0, 0)
    let safety = 0
    while (!sendDays.includes(String(target.getDay())) && safety < 7) {
      target.setDate(target.getDate() + 1)
      safety++
    }
    return target
  }

  // Group emails by step
  const emailsByStep: Record<string, typeof emails> = {}
  for (const step of steps) {
    emailsByStep[step.id] = emails.filter(e => e.sequence_step_id === step.id)
  }

  const schedule: { step: number; count: number; lastDay: string }[] = []

  for (const step of steps) {
    const stepEmails = emailsByStep[step.id] || []
    if (!stepEmails.length) continue

    let currentDate = nextSendDay(tzNow, step.delay_days)
    let assignedToday = 0

    for (const email of stepEmails) {
      if (assignedToday >= dailyCapacity) {
        currentDate = nextSendDay(currentDate, 1)
        assignedToday = 0
      }

      await supabase
        .from('emails')
        .update({
          scheduled_for: currentDate.toISOString(),
          send_status: 'scheduled' as const,
        })
        .eq('id', email.id)

      assignedToday++
    }

    schedule.push({
      step: step.step_number,
      count: stepEmails.length,
      lastDay: currentDate.toLocaleDateString(),
    })
  }

  return NextResponse.json({
    message: 'Sequence started',
    emails_scheduled: emails.length,
    sender_accounts: senderAccounts,
    daily_capacity: dailyCapacity,
    schedule,
  })
}
