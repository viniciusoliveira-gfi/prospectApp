import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Get counts
  const [prospects, contacts] = await Promise.all([
    supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('campaign_id', params.id),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', params.id),
  ])

  return NextResponse.json({
    ...campaign,
    stats: {
      prospects_count: prospects.count || 0,
      contacts_count: contacts.count || 0,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('campaigns')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('campaigns')
    .update({ status: 'archived' })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
