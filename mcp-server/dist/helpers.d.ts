import { SupabaseClient } from "@supabase/supabase-js";
export declare function batchUpdate(supabase: SupabaseClient, items: {
    id: string;
    updates: Record<string, unknown>;
}[], table: string, batchSize?: number): Promise<number>;
export declare function syncCampaignStatus(supabase: SupabaseClient, campaignId: string): Promise<void>;
