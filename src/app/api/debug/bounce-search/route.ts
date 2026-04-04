import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGmailClient } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const results: string[] = []

  // Check env vars
  results.push(`GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? 'set (' + process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...)' : 'NOT SET'}`)
  results.push(`GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? 'set' : 'NOT SET'}`)
  results.push(`GOOGLE_REDIRECT_URI: ${process.env.GOOGLE_REDIRECT_URI || 'not set (using default)'}`)
  results.push(`APP_URL: ${(process.env.NEXT_PUBLIC_APP_URL || 'not set').trim()}`)

  // Get all Gmail accounts
  const { data: allTokens } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'gmail_tokens%')

  for (const row of (allTokens || [])) {
    const tokens = row.value as { email?: string }
    if (!tokens.email) continue

    results.push(`\nChecking account: ${tokens.email}`)

    try {
      const { gmail } = await getGmailClient(tokens.email)

      // Search with in:anywhere to include Trash/Spam
      const { data: searchResult } = await gmail.users.messages.list({
        userId: 'me',
        q: 'from:mailer-daemon in:anywhere newer_than:14d',
        maxResults: 10,
      })

      results.push(`  Found: ${searchResult.resultSizeEstimate || 0} messages`)

      if (searchResult.messages?.length) {
        for (const msg of searchResult.messages.slice(0, 5)) {
          const { data: message } = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'X-Failed-Recipients', 'To'],
          })

          const subject = message.payload?.headers?.find(h => h.name === 'Subject')?.value
          const failedRecipients = message.payload?.headers?.find(h => h.name === 'X-Failed-Recipients')?.value
          const snippet = message.snippet?.substring(0, 150)

          results.push(`  ---`)
          results.push(`  Subject: ${subject}`)
          results.push(`  X-Failed-Recipients: ${failedRecipients || 'none'}`)
          results.push(`  Snippet: ${snippet}`)
        }
      }
    } catch (err) {
      results.push(`  Error: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ output: results.join('\n') })
}
