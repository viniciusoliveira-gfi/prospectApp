import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'

export function getOAuthClient() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google/callback`

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )
}

export function getAuthUrl() {
  const oauth2Client = getOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.settings.readonly',
    ],
  })
}

export async function getGmailClient(forEmail?: string) {
  const supabase = createAdminClient()

  let data: { key: string; value: unknown } | null = null

  if (forEmail) {
    // Find the account matching this email
    const { data: allTokens } = await supabase
      .from('settings')
      .select('key, value')
      .like('key', 'gmail_tokens%')

    for (const row of (allTokens || [])) {
      const val = row.value as { email?: string }
      if (val.email === forEmail) {
        data = row
        break
      }
      // Also check aliases
      const aliases = (row.value as { aliases?: string[] }).aliases || []
      if (aliases.includes(forEmail)) {
        data = row
        break
      }
    }
  }

  if (!data) {
    // Fall back to primary account
    const { data: primary } = await supabase
      .from('settings')
      .select('key, value')
      .eq('key', 'gmail_tokens')
      .single()
    data = primary
  }

  if (!data?.value) throw new Error('Gmail not connected')

  const settingsKey = data.key
  const tokens = data.value as {
    access_token: string
    refresh_token: string
    expiry_date: number
    email: string
  }

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })

  // Handle token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    const updated = { ...tokens }
    if (newTokens.access_token) updated.access_token = newTokens.access_token
    if (newTokens.expiry_date) updated.expiry_date = newTokens.expiry_date
    if (newTokens.refresh_token) updated.refresh_token = newTokens.refresh_token

    await supabase.from('settings').upsert({
      key: settingsKey,
      value: updated,
    })
  })

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    email: tokens.email,
  }
}

export function createMimeMessage({
  from,
  to,
  subject,
  html,
  messageId,
}: {
  from: string
  to: string
  subject: string
  html: string
  messageId?: string
}): string {
  const boundary = 'boundary_' + Date.now().toString(36)
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]

  // Add threading headers for follow-up emails
  if (messageId) {
    lines.push(`In-Reply-To: ${messageId}`)
    lines.push(`References: ${messageId}`)
  }

  lines.push(
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
    `--${boundary}--`,
  )
  return lines.join('\r\n')
}

export async function sendEmail({
  to,
  subject,
  htmlBody,
  trackingPixelId,
  threadId,
  fromAlias,
}: {
  to: string
  subject: string
  htmlBody: string
  trackingPixelId?: string
  threadId?: string
  fromAlias?: string
}) {
  const { gmail, email: senderEmail } = await getGmailClient(fromAlias)
  const sendFrom = fromAlias || senderEmail
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Inject tracking pixel (if tracking enabled)
  const trackedBody = trackingPixelId
    ? htmlBody + `<img src="${appUrl}/api/track/${trackingPixelId}.png" width="1" height="1" style="display:none" alt="" />`
    : htmlBody

  const raw = createMimeMessage({
    from: sendFrom,
    to,
    subject,
    html: trackedBody,
  })

  const requestBody: { raw: string; threadId?: string } = {
    raw: Buffer.from(raw).toString('base64url'),
  }

  // If threading, include threadId so Gmail groups the messages
  if (threadId) {
    requestBody.threadId = threadId
  }

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody,
  })

  return {
    messageId: response.data.id,
    threadId: response.data.threadId,
  }
}

const GMAIL_LIMITS = {
  maxPerDay: 25,
  maxPerHour: 10,
  minIntervalMs: 180000, // 3 minutes
  sendingHoursStart: 9,
  sendingHoursEnd: 18,
}

export { GMAIL_LIMITS }
