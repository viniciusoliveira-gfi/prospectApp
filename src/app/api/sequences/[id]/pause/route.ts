import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recalculateSchedulesAfterResume } from '@/lib/scheduling'

// POST /api/sequences/[id]/pause?action=pause|resume
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const sequenceId = params.id
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'pause'

  const { data: sequence, error } = await supabase
    .from('sequences')
    .select('*')
    .eq('id', sequenceId)
    .single()

  if (error || !sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  }

  const now = new Date()

  if (action === 'pause') {
    if (sequence.status !== 'active') {
      return NextResponse.json(
        { error: 'Can only pause an active sequence' },
        { status: 400 }
      )
    }

    await supabase
      .from('sequences')
      .update({ status: 'paused', paused_at: now.toISOString() })
      .eq('id', sequenceId)

    return NextResponse.json({ message: 'Sequence paused', paused_at: now.toISOString() })
  }

  if (action === 'resume') {
    if (sequence.status !== 'paused') {
      return NextResponse.json(
        { error: 'Can only resume a paused sequence' },
        { status: 400 }
      )
    }

    const pausedAt = new Date(sequence.paused_at)

    // Get unsent scheduled emails for this sequence
    const { data: steps } = await supabase
      .from('sequence_steps')
      .select('id')
      .eq('sequence_id', sequenceId)

    const stepIds = (steps || []).map(s => s.id)

    const { data: emails } = await supabase
      .from('emails')
      .select('id, scheduled_for')
      .in('sequence_step_id', stepIds)
      .eq('send_status', 'scheduled')

    // Shift schedules forward by pause duration
    if (emails?.length) {
      const shifted = recalculateSchedulesAfterResume(emails, pausedAt, now)
      for (const update of shifted) {
        await supabase
          .from('emails')
          .update({ scheduled_for: update.scheduled_for })
          .eq('id', update.id)
      }
    }

    await supabase
      .from('sequences')
      .update({ status: 'active', paused_at: null })
      .eq('id', sequenceId)

    return NextResponse.json({
      message: 'Sequence resumed',
      emails_rescheduled: emails?.length || 0,
    })
  }

  return NextResponse.json({ error: 'Invalid action. Use "pause" or "resume".' }, { status: 400 })
}
