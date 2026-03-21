import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchPeopleByDomain } from '@/lib/apollo'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  // Get prospect
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
  if (!prospect.domain) return NextResponse.json({ error: 'Prospect has no domain — cannot enrich' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const titles = body.titles || ['CEO', 'CTO', 'COO', 'VP', 'Head', 'Director', 'Founder']

  try {
    const people = await searchPeopleByDomain(prospect.domain, titles)

    if (people.length === 0) {
      return NextResponse.json({ message: 'No contacts found', contacts: [] })
    }

    const contacts = people.map(p => ({
      prospect_id: params.id,
      campaign_id: prospect.campaign_id,
      first_name: p.first_name || 'Unknown',
      last_name: p.last_name || 'Unknown',
      email: p.email || null,
      email_status: mapEmailStatus(p.email_status),
      title: p.title || null,
      linkedin_url: p.linkedin_url || null,
      phone: p.phone_numbers?.[0]?.raw_number || null,
      apollo_id: p.id,
      source: 'apollo' as const,
    }))

    const { data, error: insertError } = await supabase
      .from('contacts')
      .insert(contacts)
      .select()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    return NextResponse.json({ found: people.length, contacts: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 }
    )
  }
}

function mapEmailStatus(status: string | null): string {
  if (!status) return 'unknown'
  const map: Record<string, string> = {
    verified: 'verified',
    guessed: 'unverified',
    unavailable: 'unknown',
    bounced: 'bounced',
    catch_all: 'catch_all',
  }
  return map[status] || 'unknown'
}
