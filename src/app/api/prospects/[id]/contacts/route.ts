import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('prospect_id', params.id)
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

  // Get prospect to find campaign_id
  const { data: prospect } = await supabase
    .from('prospects')
    .select('campaign_id')
    .eq('id', params.id)
    .single()

  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      prospect_id: params.id,
      campaign_id: prospect.campaign_id,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email || null,
      title: body.title || null,
      linkedin_url: body.linkedin_url || null,
      phone: body.phone || null,
      source: 'manual',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
