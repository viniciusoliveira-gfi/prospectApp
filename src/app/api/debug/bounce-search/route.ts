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

  // Direct DB check — what does the app ACTUALLY see?
  results.push(`\nSUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30)}...`)

  const { data: directCheck } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'gmail_tokens%')

  results.push(`\nDirect DB read (${directCheck?.length || 0} rows):`)
  for (const row of (directCheck || [])) {
    const v = row.value as { email?: string; refresh_token?: string }
    results.push(`  ${row.key}: email=${v.email}, token=${v.refresh_token?.substring(0, 15)}...`)
  }

  // Get all Gmail accounts
  const { data: allTokens } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'gmail_tokens%')

  for (const row of (allTokens || [])) {
    const tokens = row.value as { email?: string }
    if (!tokens.email) continue

    results.push(`\nChecking account: ${tokens.email}`)
    results.push(`  Token key: ${row.key}`)
    results.push(`  Has refresh_token: ${!!(tokens as { refresh_token?: string }).refresh_token}`)
    results.push(`  Refresh token starts with: ${((tokens as { refresh_token?: string }).refresh_token || '').substring(0, 10)}...`)

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
      const errObj = err as { response?: { data?: unknown }; message?: string; code?: string }
      results.push(`  Error: ${errObj.message || 'unknown'}`)
      if (errObj.response?.data) results.push(`  Details: ${JSON.stringify(errObj.response.data)}`)
      if (errObj.code) results.push(`  Code: ${errObj.code}`)
    }
  }

  return NextResponse.json({ output: results.join('\n') })
}
