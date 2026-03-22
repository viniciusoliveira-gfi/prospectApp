import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Recalculates scheduled_for timestamps for all unsent emails in a sequence,
 * distributing them across days respecting per-account daily limits.
 *
 * Called when:
 * - Sequence is started
 * - Campaign settings change (sender accounts, daily limit)
 * - Main settings change
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const sequenceId = params.id

  // Get sequence with steps
  const { data: sequence, error: seqErr } = await supabase
    .from('sequences')
    .select('*, sequence_steps(*)')
    .eq('id', sequenceId)
    .single()

  if (seqErr || !sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  }

  // Get campaign settings
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('send_settings, sending_account, daily_send_limit')
    .eq('id', sequence.campaign_id)
    .single()

  const sendSettings = (campaign?.send_settings || {}) as {
    sender_accounts?: string[]
    send_days?: string[]
    send_hours_start?: number
    send_hours_end?: number
    timezone?: string
    daily_limit_per_account?: number
  }

  // Get global settings as fallback
  const { data: globalSettings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'sending_defaults')
    .single()

  const global = (globalSettings?.value || {}) as Record<string, string>

  // Resolve settings with fallbacks
  const senderAccounts = sendSettings.sender_accounts?.length
    ? sendSettings.sender_accounts
    : campaign?.sending_account ? [campaign.sending_account] : ['_default']

  const dailyLimitPerAccount = sendSettings.daily_limit_per_account
    || parseInt(global.daily_limit_per_account || global.daily_limit || '25')

  const sendDays = sendSettings.send_days?.length
    ? sendSettings.send_days
    : global.send_days ? JSON.parse(global.send_days) : ['1', '2', '3', '4', '5']

  const hoursStart = sendSettings.send_hours_start ?? parseInt(global.hours_start || '9')
  const timezone = sendSettings.timezone || global.timezone || 'America/Sao_Paulo'

  // Total daily capacity = accounts × limit per account
  const dailyCapacity = senderAccounts.length * dailyLimitPerAccount

  // Get steps sorted
  const steps = (sequence.sequence_steps as { id: string; step_number: number; delay_days: number }[])
    .sort((a, b) => a.step_number - b.step_number)

  if (!steps.length) {
    return NextResponse.json({ error: 'No steps found' }, { status: 400 })
  }

  // Get unsent emails grouped by step
  const stepIds = steps.map(s => s.id)
  const { data: emails } = await supabase
    .from('emails')
    .select('id, sequence_step_id, prospect_id, contact_id, sent_from')
    .in('sequence_step_id', stepIds)
    .in('send_status', ['queued', 'scheduled'])

  if (!emails?.length) {
    return NextResponse.json({ message: 'No unsent emails to schedule', rescheduled: 0 })
  }

  // Group emails by step
  const emailsByStep: Record<string, typeof emails> = {}
  for (const step of steps) {
    emailsByStep[step.id] = emails.filter(e => e.sequence_step_id === step.id)
  }

  // Calculate base date (now or sequence start)
  const now = new Date()
  const baseDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))

  // Helper: find the next valid sending day from a given date
  function nextSendDay(from: Date, addDays: number): Date {
    const target = new Date(from)
    target.setDate(target.getDate() + addDays)
    target.setHours(hoursStart, 0, 0, 0)

    // If target day is not a send day, find next valid day
    let safety = 0
    while (!sendDays.includes(String(target.getDay())) && safety < 7) {
      target.setDate(target.getDate() + 1)
      safety++
    }
    return target
  }

  // For each step, calculate the base send date
  const stepBaseDates: Record<string, Date> = {}
  for (const step of steps) {
    stepBaseDates[step.id] = nextSendDay(baseDate, step.delay_days)
  }

  // Now distribute emails across days within each step, respecting daily capacity
  let totalRescheduled = 0
  const schedule: { step: number; day: string; count: number }[] = []

  for (const step of steps) {
    const stepEmails = emailsByStep[step.id] || []
    if (!stepEmails.length) continue

    let currentDate = new Date(stepBaseDates[step.id])
    let assignedToday = 0

    for (const email of stepEmails) {
      // If we've hit daily capacity, move to next send day
      if (assignedToday >= dailyCapacity) {
        currentDate = nextSendDay(currentDate, 1)
        assignedToday = 0
      }

      await supabase
        .from('emails')
        .update({
          scheduled_for: currentDate.toISOString(),
          send_status: 'scheduled',
        })
        .eq('id', email.id)

      assignedToday++
      totalRescheduled++
    }

    schedule.push({
      step: step.step_number,
      day: currentDate.toLocaleDateString(),
      count: stepEmails.length,
    })
  }

  return NextResponse.json({
    message: 'Schedule recalculated',
    rescheduled: totalRescheduled,
    daily_capacity: dailyCapacity,
    accounts: senderAccounts.length,
    limit_per_account: dailyLimitPerAccount,
    schedule,
  })
}
