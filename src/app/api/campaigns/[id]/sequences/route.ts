import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sequences')
    .select('*, sequence_steps(count)')
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const body = await request.json()

  const { data: sequence, error } = await supabase
    .from('sequences')
    .insert({ campaign_id: params.id, name: body.name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If steps provided, insert them
  if (body.steps?.length > 0) {
    const steps = body.steps.map((s: Record<string, unknown>, i: number) => ({
      sequence_id: sequence.id,
      step_number: i + 1,
      delay_days: s.delay_days || 0,
      subject_template: s.subject_template || '',
      body_template: s.body_template || '',
      step_type: s.step_type || 'email',
    }))

    await supabase.from('sequence_steps').insert(steps)
  }

  return NextResponse.json(sequence, { status: 201 })
}
