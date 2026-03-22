import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateScheduledFor, checkSequenceReadiness } from '@/lib/scheduling'

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

  // Calculate scheduled_for and assign sender for each email
  const now = new Date()
  const stepDelayMap = Object.fromEntries(steps.map(s => [s.id, s.delay_days]))

  for (const email of emails) {
    const prospectKey = email.prospect_id || email.contact_id
    const sender = assignSender(prospectKey)

    await supabase
      .from('emails')
      .update({
        scheduled_for: calculateScheduledFor({
          startTime: now,
          delayDays: stepDelayMap[email.sequence_step_id],
        }).toISOString(),
        send_status: 'scheduled' as const,
        sent_from: sender,
      })
      .eq('id', email.id)
  }

  // Set sequence to active
  await supabase
    .from('sequences')
    .update({
      status: 'active',
      started_at: now.toISOString(),
    })
    .eq('id', sequenceId)

  return NextResponse.json({
    message: 'Sequence started',
    emails_scheduled: emails.length,
    sender_accounts: senderAccounts,
    schedule: steps.map(step => ({
      step_number: step.step_number,
      delay_days: step.delay_days,
      scheduled_for: calculateScheduledFor({
        startTime: now,
        delayDays: step.delay_days,
      }).toISOString(),
    })),
  })
}
