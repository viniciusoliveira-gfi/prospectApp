import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const url = new URL(request.url)
  const status = url.searchParams.get('approval_status')

  let query = supabase
    .from('emails')
    .select('*, contacts(first_name, last_name, email, title), sequence_steps(step_number, delay_days), prospects(company_name)')
    .eq('sequence_step_id', params.id)

  // If sequence_id passed, get all steps for this sequence
  // Actually, we need to get emails for all steps in this sequence
  const { data: steps } = await supabase
    .from('sequence_steps')
    .select('id')
    .eq('sequence_id', params.id)

  if (steps?.length) {
    query = supabase
      .from('emails')
      .select('*, contacts(first_name, last_name, email, title), sequence_steps(step_number, delay_days), prospects(company_name)')
      .in('sequence_step_id', steps.map(s => s.id))
  }

  if (status) query = query.eq('approval_status', status)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
