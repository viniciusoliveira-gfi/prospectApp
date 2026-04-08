import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

export function registerCampaignTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "list_campaigns",
    "List all campaigns with status",
    {},
    async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .neq("status", "archived")
        .order("created_at", { ascending: false });

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      if (!data?.length) return { content: [{ type: "text", text: "No campaigns yet." }] };

      const lines = data.map(c =>
        `- **${c.name}** [${c.status}] (ID: ${c.id}) — Created ${new Date(c.created_at).toLocaleDateString()}`
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "create_campaign",
    "Create a new campaign",
    {
      name: z.string().describe("Campaign name"),
      description: z.string().optional().describe("Campaign description"),
      daily_send_limit: z.number().optional().describe("Max emails per day (default 25)"),
      send_interval_minutes: z.number().optional().describe("Minutes between sends (default 60)"),
    },
    async ({ name, description, daily_send_limit, send_interval_minutes }) => {
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          name,
          description: description || null,
          daily_send_limit: daily_send_limit || 25,
          send_interval_minutes: send_interval_minutes || 60,
        })
        .select()
        .single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `Campaign "${data.name}" created. ID: ${data.id}` }] };
    }
  );

  server.tool(
    "update_campaign",
    "Update campaign status, name, description, or sending settings",
    {
      campaign_id: z.string().describe("Campaign ID"),
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
      daily_send_limit: z.number().optional(),
      send_interval_minutes: z.number().optional(),
    },
    async ({ campaign_id, ...updates }) => {
      // If archiving/deleting, check for active sequences
      if (updates.status === "archived") {
        const { count } = await supabase
          .from("sequences")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign_id)
          .eq("status", "active");

        if (count && count > 0) {
          return { content: [{ type: "text", text: "Cannot archive: campaign has active sequences. Pause them first." }] };
        }
      }

      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const { data, error } = await supabase.from("campaigns").update(clean).eq("id", campaign_id).select().single();
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `Campaign "${data.name}" updated. Status: ${data.status}` }] };
    }
  );

  server.tool(
    "get_campaign_settings",
    "Get a campaign's send settings: sender accounts, tracking, sending window, timezone.",
    {
      campaign_id: z.string(),
    },
    async ({ campaign_id }) => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("name, send_settings, sending_account, daily_send_limit")
        .eq("id", campaign_id)
        .single();

      if (error || !data) return { content: [{ type: "text", text: "Campaign not found." }] };

      const ss = data.send_settings as {
        sender_accounts?: string[];
        track_opens?: boolean;
        send_days?: string[];
        send_hours_start?: number;
        send_hours_end?: number;
        timezone?: string;
      } | null;

      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const sendDayNames = (ss?.send_days || ["1","2","3","4","5"]).map(d => days[parseInt(d)]).join(", ");

      return {
        content: [{
          type: "text",
          text: `**${data.name}** settings:\n` +
            `Sender accounts: ${ss?.sender_accounts?.length ? ss.sender_accounts.join(", ") : data.sending_account || "default"}\n` +
            `Track opens: ${ss?.track_opens !== false ? "Yes" : "No"}\n` +
            `Send days: ${sendDayNames}\n` +
            `Send hours: ${ss?.send_hours_start ?? 9}:00 - ${ss?.send_hours_end ?? 18}:00\n` +
            `Timezone: ${ss?.timezone || "America/Sao_Paulo"}\n` +
            `Daily limit per account: ${(ss as unknown as Record<string,number>)?.daily_limit_per_account || data.daily_send_limit || 25}`,
        }],
      };
    }
  );

  server.tool(
    "update_campaign_settings",
    "Update a campaign's send settings: sender accounts, tracking, sending window.",
    {
      campaign_id: z.string(),
      sender_accounts: z.array(z.string()).optional().describe("Email addresses to send from (distribute evenly)"),
      track_opens: z.boolean().optional().describe("Track email opens with pixel"),
      send_days: z.array(z.string()).optional().describe("Days to send (0=Sun, 1=Mon, ..., 6=Sat). Default: ['1','2','3','4','5']"),
      send_hours_start: z.number().optional().describe("Start hour (0-23, default 9)"),
      send_hours_end: z.number().optional().describe("End hour (0-23, default 18)"),
      timezone: z.string().optional().describe("IANA timezone (e.g., America/Sao_Paulo)"),
      daily_limit_per_account: z.number().optional().describe("Max emails per account per day (default 25)"),
    },
    async ({ campaign_id, ...updates }) => {
      // Get existing settings
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("send_settings")
        .eq("id", campaign_id)
        .single();

      if (!campaign) return { content: [{ type: "text", text: "Campaign not found." }] };

      const existing = (campaign.send_settings || {}) as Record<string, unknown>;
      const newSettings = { ...existing };

      if (updates.sender_accounts !== undefined) newSettings.sender_accounts = updates.sender_accounts;
      if (updates.track_opens !== undefined) newSettings.track_opens = updates.track_opens;
      if (updates.send_days !== undefined) newSettings.send_days = updates.send_days;
      if (updates.send_hours_start !== undefined) newSettings.send_hours_start = updates.send_hours_start;
      if (updates.send_hours_end !== undefined) newSettings.send_hours_end = updates.send_hours_end;
      if (updates.timezone !== undefined) newSettings.timezone = updates.timezone;

      const { error } = await supabase
        .from("campaigns")
        .update({ send_settings: newSettings })
        .eq("id", campaign_id);

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: "Campaign settings updated." }] };
    }
  );

  server.tool(
    "delete_campaign",
    "Permanently delete a campaign and all its data (sequences, steps, emails, prospects, contacts, experiments, activity log). Auto-pauses active sequences first. Cannot be undone.",
    {
      campaign_id: z.string(),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ campaign_id, confirm }) => {
      if (!confirm) {
        return { content: [{ type: "text", text: "Deletion not confirmed. Set confirm: true to proceed." }] };
      }

      // Get campaign info
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("name")
        .eq("id", campaign_id)
        .single();

      if (!campaign) return { content: [{ type: "text", text: "Campaign not found." }] };

      // Auto-pause any active sequences
      const { data: activeSeqs } = await supabase
        .from("sequences")
        .select("id, name")
        .eq("campaign_id", campaign_id)
        .eq("status", "active");

      if (activeSeqs?.length) {
        await supabase
          .from("sequences")
          .update({ status: "paused", paused_at: new Date().toISOString() })
          .eq("campaign_id", campaign_id)
          .eq("status", "active");
      }

      // Count what will be deleted for the report
      const { count: seqCount } = await supabase
        .from("sequences").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id);
      const { count: prospectCount } = await supabase
        .from("prospects").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id);
      const { count: contactCount } = await supabase
        .from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id);

      // Delete the campaign — cascades handle everything
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", campaign_id);

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      return {
        content: [{
          type: "text",
          text: `Campaign "${campaign.name}" deleted.\n` +
            `Cleaned up: ${seqCount || 0} sequences, ${prospectCount || 0} prospects, ${contactCount || 0} contacts` +
            (activeSeqs?.length ? `\n${activeSeqs.length} active sequences were paused before deletion.` : ""),
        }],
      };
    }
  );
}
