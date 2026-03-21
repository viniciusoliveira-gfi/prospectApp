import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const [campaign, prospects, contacts, emails] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', params.id).single(),
    supabase.from('prospects').select('id, company_name, tier', { count: 'exact' }).eq('campaign_id', params.id),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', params.id),
    supabase.from('emails').select('id, send_status, open_count, replied_at, bounced_at, sequence_steps(step_number)')
      .eq('prospect_id', params.id),
  ])

  if (campaign.error) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const allEmails = emails.data || []
  const sent = allEmails.filter(e => e.send_status === 'sent')
  const opened = sent.filter(e => e.open_count > 0)
  const replied = sent.filter(e => e.replied_at)
  const bounced = sent.filter(e => e.bounced_at)

  // Stats per step
  const stepStats: Record<number, { sent: number; opened: number; replied: number }> = {}
  for (const e of allEmails) {
    const stepNum = (e.sequence_steps as unknown as { step_number: number })?.step_number || 0
    if (!stepStats[stepNum]) stepStats[stepNum] = { sent: 0, opened: 0, replied: 0 }
    if (e.send_status === 'sent') {
      stepStats[stepNum].sent++
      if (e.open_count > 0) stepStats[stepNum].opened++
      if (e.replied_at) stepStats[stepNum].replied++
    }
  }

  return NextResponse.json({
    campaign: campaign.data,
    stats: {
      prospects: prospects.count || 0,
      contacts: contacts.count || 0,
      total_emails: allEmails.length,
      sent: sent.length,
      opened: opened.length,
      replied: replied.length,
      bounced: bounced.length,
      open_rate: sent.length > 0 ? Math.round((opened.length / sent.length) * 100) : 0,
      reply_rate: sent.length > 0 ? Math.round((replied.length / sent.length) * 100) : 0,
    },
    step_stats: stepStats,
    tier_breakdown: {
      tier_1: prospects.data?.filter(p => p.tier === 'tier_1').length || 0,
      tier_2: prospects.data?.filter(p => p.tier === 'tier_2').length || 0,
      tier_3: prospects.data?.filter(p => p.tier === 'tier_3').length || 0,
      disqualified: prospects.data?.filter(p => p.tier === 'disqualified').length || 0,
    },
  })
}
