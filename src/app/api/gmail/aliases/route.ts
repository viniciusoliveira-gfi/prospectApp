import { NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { gmail } = await getGmailClient()

    // Fetch send-as aliases from Gmail
    const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' })
    const sendAsAddresses = data.sendAs || []

    const aliases = sendAsAddresses
      .filter(a => a.verificationStatus === 'accepted' || a.isPrimary)
      .map(a => a.sendAsEmail!)
      .filter(Boolean)

    // Store aliases in gmail_tokens settings
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gmail_tokens')
      .single()

    if (existing?.value) {
      await supabase.from('settings').upsert({
        key: 'gmail_tokens',
        value: { ...(existing.value as Record<string, unknown>), aliases },
      })
    }

    return NextResponse.json({ aliases })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch aliases' },
      { status: 500 }
    )
  }
}
