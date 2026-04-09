import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Verify cron secret
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Call the send processor with 4-minute timeout (cron runs every 5 min)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()
  const CRON_SECRET = cronSecret
  const sendController = new AbortController()
  const sendTimeout = setTimeout(() => sendController.abort(), 4 * 60 * 1000)

  let data: Record<string, unknown> = {}
  try {
    const res = await fetch(`${appUrl}/api/send/process?secret=${CRON_SECRET}`, {
      method: 'POST',
      signal: sendController.signal,
    })
    data = await res.json()
  } catch (err) {
    data = { error: err instanceof Error ? err.message : 'Send processor timeout or error' }
  } finally {
    clearTimeout(sendTimeout)
  }

  // Also check for replies with 2-minute timeout
  const replyController = new AbortController()
  const replyTimeout = setTimeout(() => replyController.abort(), 2 * 60 * 1000)
  try {
    await fetch(`${appUrl}/api/gmail/check-replies?secret=${CRON_SECRET}`, {
      method: 'POST',
      signal: replyController.signal,
    })
  } catch {
    // Reply checking is best-effort
  } finally {
    clearTimeout(replyTimeout)
  }

  return NextResponse.json({ trigger: 'cron', send_result: data })
}
