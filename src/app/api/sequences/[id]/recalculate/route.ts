import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSendingConfig } from '@/lib/send-config'
import { nextSendDay, getTimezoneNow } from '@/lib/schedule-helpers'

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

  // Resolve campaign + global sending config
  const config = await resolveSendingConfig(sequence.campaign_id)
  const dailyCapacity = config.dailyCapacity

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
  const baseDate = getTimezoneNow(config.timezone)

  // For each step, calculate the base send date
  const stepBaseDates: Record<string, Date> = {}
  for (const step of steps) {
    stepBaseDates[step.id] = nextSendDay(baseDate, step.delay_days, config.sendDays, config.hoursStart)
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
        currentDate = nextSendDay(currentDate, 1, config.sendDays, config.hoursStart)
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
    accounts: config.senderAccounts.length,
    limit_per_account: config.dailyLimitPerAccount,
    schedule,
  })
}
