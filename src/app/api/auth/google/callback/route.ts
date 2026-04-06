import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getOAuthClient } from '@/lib/gmail'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', request.url))
  }

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    // Try to get timezone from Google Calendar
    let timezone = 'America/Sao_Paulo' // default fallback
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      const { data: tzSetting } = await calendar.settings.get({ setting: 'timezone' })
      if (tzSetting.value) {
        timezone = tzSetting.value
      }
    } catch {
      // Calendar API not enabled or permission denied — use default
    }

    // Store tokens + timezone in settings (unique key per account for multi-account support)
    const supabase = createAdminClient()
    const email = userInfo.email!
    // Use gmail_tokens for first account (backward compat), gmail_tokens_<email> for additional
    const { data: existing } = await supabase
      .from('settings')
      .select('key, value')
      .like('key', 'gmail_tokens%')

    const existingEmails = new Map<string, string>() // email -> settings key
    for (const row of (existing || [])) {
      const val = row.value as { email?: string }
      if (val.email) {
        existingEmails.set(val.email, row.key)
      }
    }

    // Determine key: reuse existing key if same email, or create new one
    let settingsKey = 'gmail_tokens'
    if (existingEmails.has(email)) {
      settingsKey = existingEmails.get(email)!
    } else if (existing?.length) {
      // New account — use email-based key
      settingsKey = `gmail_tokens_${email.replace(/[@.]/g, '_')}`
    }

    await supabase.from('settings').upsert({
      key: settingsKey,
      value: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        email,
        timezone,
      },
    })

    return NextResponse.redirect(new URL('/settings?gmail=connected', request.url))
  } catch {
    return NextResponse.redirect(new URL('/settings?error=auth_failed', request.url))
  }
}
