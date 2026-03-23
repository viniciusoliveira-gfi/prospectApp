import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Strip .png extension if present
  const trackingId = params.id.replace(/\.png$/, '')

  // Fire and forget — don't block the response
  try {
    const supabase = createAdminClient()
    supabase.rpc('increment_open_count', { email_tracking_id: trackingId }).then(async () => {
      const { data } = await supabase
        .from('emails')
        .select('id, contact_id, prospect_id, experiment_id, open_count')
        .eq('tracking_pixel_id', trackingId)
        .single()

      if (data) {
        await supabase.from('activity_log').insert({
          email_id: data.id,
          contact_id: data.contact_id,
          prospect_id: data.prospect_id,
          action: 'email_opened',
        })

        // Update experiment assignment opens (only on first open)
        if (data.experiment_id && data.open_count <= 1) {
          try {
            await supabase.rpc('increment_experiment_opened', {
              p_experiment_id: data.experiment_id,
              p_contact_id: data.contact_id,
            })
          } catch { /* best-effort */ }
        }
      }
    })
  } catch {
    // Ignore errors — don't break tracking pixel
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-reactivate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
