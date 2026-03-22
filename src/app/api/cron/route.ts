import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Verify cron secret
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Call the send processor
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()
  const res = await fetch(`${appUrl}/api/send/process`, { method: 'POST' })
  const data = await res.json()

  // Also check for replies
  try {
    await fetch(`${appUrl}/api/gmail/check-replies`, { method: 'POST' })
  } catch {
    // Reply checking is best-effort
  }

  return NextResponse.json({ trigger: 'cron', send_result: data })
}
