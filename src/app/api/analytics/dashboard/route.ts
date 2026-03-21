import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const [campaigns, prospects, contacts, emails, sentEmails] = await Promise.all([
    supabase.from('campaigns').select('id, name, status', { count: 'exact' }).neq('status', 'archived'),
    supabase.from('prospects').select('id', { count: 'exact', head: true }),
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
    supabase.from('emails').select('id, send_status, open_count, replied_at', { count: 'exact' }),
    supabase.from('emails').select('id, open_count, replied_at').eq('send_status', 'sent'),
  ])

  const totalSent = sentEmails.data?.length || 0
  const totalOpened = sentEmails.data?.filter(e => e.open_count > 0).length || 0
  const totalReplied = sentEmails.data?.filter(e => e.replied_at).length || 0

  return NextResponse.json({
    campaigns: campaigns.count || 0,
    prospects: prospects.count || 0,
    contacts: contacts.count || 0,
    total_emails: emails.count || 0,
    sent: totalSent,
    opened: totalOpened,
    replied: totalReplied,
    open_rate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
    reply_rate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
    campaign_list: campaigns.data || [],
  })
}
