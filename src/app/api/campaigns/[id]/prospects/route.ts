import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('prospects')
    .select('*, contacts(count)')
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

  // Support single or bulk insert
  const prospects = Array.isArray(body) ? body : [body]
  const records = prospects.map((p: Record<string, unknown>) => ({
    campaign_id: params.id,
    company_name: p.company_name,
    domain: p.domain || null,
    website: p.website || null,
    country: p.country || null,
    size: p.size || null,
    industry: p.industry || null,
    description: p.description || null,
    tags: p.tags || null,
  }))

  const { data, error } = await supabase
    .from('prospects')
    .insert(records)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
