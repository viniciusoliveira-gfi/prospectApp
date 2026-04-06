import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSequenceReadiness } from '@/lib/scheduling'
import { syncCampaignStatus } from '@/lib/campaign-status'
import { resolveSendingConfig } from '@/lib/send-config'
import { nextSendDay, getTimezoneNow } from '@/lib/schedule-helpers'

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

  // Resolve campaign + global sending config
  const config = await resolveSendingConfig(sequence.campaign_id)
  const senderAccounts = config.senderAccounts

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
  const dailyCapacity = config.dailyCapacity

  // Base date in timezone
  const tzNow = getTimezoneNow(config.timezone)

  // Group emails by step
  const emailsByStep: Record<string, typeof emails> = {}
  for (const step of steps) {
    emailsByStep[step.id] = emails.filter(e => e.sequence_step_id === step.id)
  }

  const schedule: { step: number; count: number; lastDay: string }[] = []

  for (const step of steps) {
    const stepEmails = emailsByStep[step.id] || []
    if (!stepEmails.length) continue

    let currentDate = nextSendDay(tzNow, step.delay_days, config.sendDays, config.hoursStart)
    let assignedToday = 0

    for (const email of stepEmails) {
      if (assignedToday >= dailyCapacity) {
        currentDate = nextSendDay(currentDate, 1, config.sendDays, config.hoursStart)
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
