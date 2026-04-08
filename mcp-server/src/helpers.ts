import { SupabaseClient } from "@supabase/supabase-js";

// Helper: run bulk DB updates in parallel batches for speed
export async function batchUpdate(
  supabase: SupabaseClient,
  items: { id: string; updates: Record<string, unknown> }[],
  table: string,
  batchSize = 50
) {
  let processed = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(
      batch.map(item =>
        supabase.from(table).update(item.updates).eq("id", item.id)
      )
    );
    processed += batch.length;
  }
  return processed;
}

// Helper: sync campaign status based on its sequences
export async function syncCampaignStatus(supabase: SupabaseClient, campaignId: string) {
  const { data: sequences } = await supabase
    .from("sequences")
    .select("status")
    .eq("campaign_id", campaignId);

  if (!sequences?.length) return;

  const statuses = sequences.map(s => s.status);
  let campaignStatus: string;
  if (statuses.includes("active")) campaignStatus = "active";
  else if (statuses.every(s => s === "completed")) campaignStatus = "completed";
  else if (statuses.every(s => s === "paused" || s === "completed")) campaignStatus = "paused";
  else campaignStatus = "draft";

  await supabase.from("campaigns").update({ status: campaignStatus }).eq("id", campaignId);
}
