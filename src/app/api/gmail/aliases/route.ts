import { NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Get all Gmail accounts
    const { data: allTokens } = await supabase
      .from('settings')
      .select('key, value')
      .like('key', 'gmail_tokens%')

    const allAliases: string[] = []

    for (const row of (allTokens || [])) {
      const tokens = row.value as { email?: string }
      if (!tokens.email) continue

      try {
        const { gmail } = await getGmailClient(tokens.email)

        const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' })
        const sendAsAddresses = data.sendAs || []

        // Include all verified/accepted aliases and the primary address
        // Workspace accounts may use 'accepted' or other statuses
        const aliases = sendAsAddresses
          .filter(a => a.isPrimary || a.verificationStatus === 'accepted' || a.verificationStatus === 'verified' || !a.verificationStatus)
          .map(a => a.sendAsEmail!)
          .filter(Boolean)

        allAliases.push(...aliases)

        // Store aliases on this account's settings
        await supabase.from('settings').upsert({
          key: row.key,
          value: { ...(row.value as Record<string, unknown>), aliases },
        })
      } catch {
        // Skip accounts that fail (e.g., token expired)
        continue
      }
    }

    return NextResponse.json({ aliases: allAliases })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch aliases' },
      { status: 500 }
    )
  }
}
