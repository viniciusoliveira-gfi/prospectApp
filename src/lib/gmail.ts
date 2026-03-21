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
    ],
  })
}

export async function getGmailClient() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'gmail_tokens')
    .single()

  if (!data?.value) throw new Error('Gmail not connected')

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
      key: 'gmail_tokens',
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
}: {
  from: string
  to: string
  subject: string
  html: string
}): string {
  const boundary = 'boundary_' + Date.now().toString(36)
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
    `--${boundary}--`,
  ]
  return lines.join('\r\n')
}

export async function sendEmail({
  to,
  subject,
  htmlBody,
  trackingPixelId,
}: {
  to: string
  subject: string
  htmlBody: string
  trackingPixelId: string
}) {
  const { gmail, email: senderEmail } = await getGmailClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Inject tracking pixel
  const trackedBody = htmlBody +
    `<img src="${appUrl}/api/track/${trackingPixelId}.png" width="1" height="1" style="display:none" alt="" />`

  const raw = createMimeMessage({
    from: senderEmail,
    to,
    subject,
    html: trackedBody,
  })

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: Buffer.from(raw).toString('base64url'),
    },
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
