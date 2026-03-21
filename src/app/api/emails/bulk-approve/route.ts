import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { email_ids } = await request.json()

  if (!email_ids?.length) {
    return NextResponse.json({ error: 'No email IDs provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('emails')
    .update({
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .in('id', email_ids)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ approved: data.length })
}
