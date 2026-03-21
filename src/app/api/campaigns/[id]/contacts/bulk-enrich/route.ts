import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchPeopleByDomain } from '@/lib/apollo'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const body = await request.json().catch(() => ({}))
  const titles = body.titles || ['CEO', 'CTO', 'COO', 'VP', 'Head', 'Director', 'Founder']

  // Get all prospects with domains
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, campaign_id, domain, company_name')
    .eq('campaign_id', params.id)
    .not('domain', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!prospects?.length) return NextResponse.json({ message: 'No prospects with domains found' })

  const results: { prospect: string; found: number; error?: string }[] = []

  for (const prospect of prospects) {
    try {
      const people = await searchPeopleByDomain(prospect.domain!, titles, 5)

      if (people.length > 0) {
        const contacts = people.map(p => ({
          prospect_id: prospect.id,
          campaign_id: params.id,
          first_name: p.first_name || 'Unknown',
          last_name: p.last_name || 'Unknown',
          email: p.email || null,
          email_status: p.email_status === 'verified' ? 'verified' : 'unknown',
          title: p.title || null,
          linkedin_url: p.linkedin_url || null,
          phone: p.phone_numbers?.[0]?.raw_number || null,
          apollo_id: p.id,
          source: 'apollo' as const,
        }))

        await supabase.from('contacts').insert(contacts)
      }

      results.push({ prospect: prospect.company_name, found: people.length })
    } catch {
      results.push({ prospect: prospect.company_name, found: 0, error: 'Failed' })
    }
  }

  return NextResponse.json({ results })
}
