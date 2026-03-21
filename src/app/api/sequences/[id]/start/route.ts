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

  // Get all emails for this sequence
  const steps = (sequence.sequence_steps as { id: string; step_number: number; delay_days: number }[])
    .sort((a, b) => a.step_number - b.step_number)

  const stepIds = steps.map(s => s.id)
  const { data: emails, error: emailsErr } = await supabase
    .from('emails')
    .select('id, approval_status, sequence_step_id')
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

  // Calculate scheduled_for for each email based on its step's delay_days
  const now = new Date()
  const stepDelayMap = Object.fromEntries(steps.map(s => [s.id, s.delay_days]))

  const updates = emails.map(email => ({
    id: email.id,
    scheduled_for: calculateScheduledFor({
      startTime: now,
      delayDays: stepDelayMap[email.sequence_step_id],
    }).toISOString(),
    send_status: 'scheduled' as const,
  }))

  // Update all emails with scheduled times
  for (const update of updates) {
    await supabase
      .from('emails')
      .update({
        scheduled_for: update.scheduled_for,
        send_status: update.send_status,
      })
      .eq('id', update.id)
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
    emails_scheduled: updates.length,
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
