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

    // Store tokens in settings
    const supabase = createAdminClient()
    await supabase.from('settings').upsert({
      key: 'gmail_tokens',
      value: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        email: userInfo.email,
      },
    })

    return NextResponse.redirect(new URL('/settings?gmail=connected', request.url))
  } catch {
    return NextResponse.redirect(new URL('/settings?error=auth_failed', request.url))
  }
}
