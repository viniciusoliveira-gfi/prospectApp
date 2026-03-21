import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sequences')
    .select('*, sequence_steps(*)')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Sort steps by step_number
  if (data.sequence_steps) {
    data.sequence_steps.sort((a: { step_number: number }, b: { step_number: number }) =>
      a.step_number - b.step_number
    )
  }

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const body = await request.json()

  // Update sequence metadata
  if (body.name || body.status) {
    const update: Record<string, unknown> = {}
    if (body.name) update.name = body.name
    if (body.status) update.status = body.status

    await supabase.from('sequences').update(update).eq('id', params.id)
  }

  // Update steps if provided
  if (body.steps) {
    // Delete existing steps
    await supabase.from('sequence_steps').delete().eq('sequence_id', params.id)

    // Insert new steps
    const steps = body.steps.map((s: Record<string, unknown>, i: number) => ({
      sequence_id: params.id,
      step_number: i + 1,
      delay_days: s.delay_days || 0,
      subject_template: s.subject_template || '',
      body_template: s.body_template || '',
      step_type: s.step_type || 'email',
    }))

    await supabase.from('sequence_steps').insert(steps)
  }

  // Fetch and return updated sequence
  const { data } = await supabase
    .from('sequences')
    .select('*, sequence_steps(*)')
    .eq('id', params.id)
    .single()

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { error } = await supabase.from('sequences').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
