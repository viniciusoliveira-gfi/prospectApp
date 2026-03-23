import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Auto-sync campaign status based on its sequences:
 * - Any sequence active → campaign "active"
 * - All sequences paused → campaign "paused"
 * - All sequences completed → campaign "completed"
 * - No sequences or all draft → campaign "draft"
 */
export async function syncCampaignStatus(campaignId: string) {
  const supabase = createAdminClient()

  const { data: sequences } = await supabase
    .from('sequences')
    .select('status')
    .eq('campaign_id', campaignId)

  if (!sequences?.length) return

  const statuses = sequences.map(s => s.status)

  let campaignStatus: string
  if (statuses.includes('active')) {
    campaignStatus = 'active'
  } else if (statuses.every(s => s === 'completed')) {
    campaignStatus = 'completed'
  } else if (statuses.every(s => s === 'paused' || s === 'completed')) {
    campaignStatus = 'paused'
  } else {
    campaignStatus = 'draft'
  }

  await supabase
    .from('campaigns')
    .update({ status: campaignStatus })
    .eq('id', campaignId)
}
