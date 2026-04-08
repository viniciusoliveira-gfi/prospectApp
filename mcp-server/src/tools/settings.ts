import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

export function registerSettingsTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_settings",
    "Get app settings (Gmail accounts, sending config, timezone, send days)",
    {},
    async () => {
      const { data } = await supabase.from("settings").select("*");

      // Gmail accounts
      const gmailRows = (data || []).filter(s => s.key.startsWith("gmail_tokens"));
      const gmailAccounts = gmailRows.map(r => {
        const t = r.value as { email?: string; aliases?: string[] };
        return t.email || "unknown";
      });

      const sending = (data || []).find(s => s.key === "sending_defaults")?.value as Record<string, string> | undefined;
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const sendDays = sending?.send_days ? JSON.parse(sending.send_days).map((d: string) => days[parseInt(d)]).join(", ") : "Mon-Fri";

      return {
        content: [{
          type: "text",
          text: `**Gmail accounts:** ${gmailAccounts.length ? gmailAccounts.join(", ") : "None connected"}\n` +
            `**Daily limit per account:** ${sending?.daily_limit_per_account || sending?.daily_limit || "25"}\n` +
            `**Send interval:** ${sending?.send_interval || "60"} min\n` +
            `**Hours:** ${sending?.hours_start || "9"}:00 - ${sending?.hours_end || "18"}:00\n` +
            `**Send days:** ${sendDays}\n` +
            `**Timezone:** ${sending?.timezone || "America/Sao_Paulo"}`,
        }],
      };
    }
  );

  server.tool(
    "update_settings",
    "Update global sending settings (timezone, hours, days, limits)",
    {
      daily_limit_per_account: z.number().optional().describe("Max emails per Gmail account per day (default 25)"),
      send_interval_minutes: z.number().optional(),
      sending_hours_start: z.number().optional().describe("Hour 0-23"),
      sending_hours_end: z.number().optional().describe("Hour 0-23"),
      timezone: z.string().optional().describe("IANA timezone, e.g. America/Sao_Paulo"),
      send_days: z.array(z.string()).optional().describe("Days to send (0=Sun, 1=Mon, ..., 6=Sat)"),
    },
    async (updates) => {
      // Get existing to merge
      const { data: existing } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sending_defaults")
        .single();

      const value: Record<string, string> = (existing?.value as Record<string, string>) || {};
      if (updates.daily_limit_per_account !== undefined) value.daily_limit_per_account = String(updates.daily_limit_per_account);
      if (updates.send_interval_minutes !== undefined) value.send_interval = String(updates.send_interval_minutes);
      if (updates.sending_hours_start !== undefined) value.hours_start = String(updates.sending_hours_start);
      if (updates.sending_hours_end !== undefined) value.hours_end = String(updates.sending_hours_end);
      if (updates.timezone !== undefined) value.timezone = updates.timezone;
      if (updates.send_days !== undefined) value.send_days = JSON.stringify(updates.send_days);

      const { error } = await supabase.from("settings").upsert({ key: "sending_defaults", value });
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: "Settings updated." }] };
    }
  );
}
