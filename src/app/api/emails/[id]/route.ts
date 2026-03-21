import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('emails')
    .select('*, contacts(*), prospects(*), sequence_steps(*)')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const body = await request.json()

  const update: Record<string, unknown> = {}
  if (body.subject !== undefined) update.subject = body.subject
  if (body.body !== undefined) update.body = body.body
  if (body.approval_status !== undefined) {
    update.approval_status = body.approval_status
    if (body.approval_status === 'approved') {
      update.approved_at = new Date().toISOString()
    }
  }
  if (body.send_status !== undefined) update.send_status = body.send_status

  const { data, error } = await supabase
    .from('emails')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
