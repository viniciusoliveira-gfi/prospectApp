import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

// Minimum seconds after sent_at before counting as a real open
// Gmail's image proxy pre-fetches images immediately on send
const MIN_OPEN_DELAY_SECONDS = 120

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Strip .png extension if present
  const trackingId = params.id.replace(/\.png$/, '')

  // Fire and forget — don't block the response
  try {
    const supabase = createAdminClient()

    // Get the email first to check timing
    const { data: email } = await supabase
      .from('emails')
      .select('id, contact_id, prospect_id, experiment_id, open_count, sent_at')
      .eq('tracking_pixel_id', trackingId)
      .single()

    if (email && email.sent_at) {
      const sentAt = new Date(email.sent_at)
      const secondsSinceSent = (Date.now() - sentAt.getTime()) / 1000

      // Ignore opens too soon after sending — likely Gmail's image proxy
      if (secondsSinceSent < MIN_OPEN_DELAY_SECONDS) {
        // Still return the pixel but don't count the open
        return new NextResponse(PIXEL, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
      }

      // Real open — increment counter
      await supabase.rpc('increment_open_count', { email_tracking_id: trackingId })

      // Log activity (only on first real open)
      if (email.open_count === 0) {
        await supabase.from('activity_log').insert({
          email_id: email.id,
          contact_id: email.contact_id,
          prospect_id: email.prospect_id,
          action: 'email_opened',
        })

        // Update experiment assignment opens
        if (email.experiment_id) {
          try {
            await supabase.rpc('increment_experiment_opened', {
              p_experiment_id: email.experiment_id,
              p_contact_id: email.contact_id,
            })
          } catch { /* best-effort */ }
        }
      }
    }
  } catch {
    // Ignore errors — don't break tracking pixel
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
