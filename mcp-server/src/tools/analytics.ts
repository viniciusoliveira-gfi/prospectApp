import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

export function registerAnalyticsTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "get_stats",
    "Get campaign stats or overall stats. Use this to report to the user on performance.",
    {
      campaign_id: z.string().optional().describe("Campaign ID (omit for overall stats)"),
    },
    async ({ campaign_id }) => {
      if (campaign_id) {
        const [campaign, prospects, contacts, emails] = await Promise.all([
          supabase.from("campaigns").select("*").eq("id", campaign_id).single(),
          supabase.from("prospects").select("id, tier", { count: "exact" }).eq("campaign_id", campaign_id),
          supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campaign_id),
          supabase.from("emails").select("send_status, approval_status, open_count, replied_at, bounced_at")
            .in("prospect_id", (await supabase.from("prospects").select("id").eq("campaign_id", campaign_id)).data?.map(p => p.id) || []),
        ]);

        const sent = emails.data?.filter(e => e.send_status === "sent") || [];
        const opened = sent.filter(e => e.open_count > 0);
        const replied = sent.filter(e => e.replied_at);
        const bounced = sent.filter(e => e.bounced_at);
        const pending = emails.data?.filter(e => e.approval_status === "pending") || [];

        return {
          content: [{
            type: "text",
            text: `**${campaign.data?.name}** (${campaign.data?.status})\n\n` +
              `Prospects: ${prospects.count} | Contacts: ${contacts.count}\n` +
              `Emails pending approval: ${pending.length}\n` +
              `Emails sent: ${sent.length}\n` +
              `Opened: ${opened.length} (${sent.length ? Math.round((opened.length / sent.length) * 100) : 0}%)\n` +
              `Replied: ${replied.length} (${sent.length ? Math.round((replied.length / sent.length) * 100) : 0}%)\n` +
              `Bounced: ${bounced.length}`,
          }],
        };
      }

      const [campaigns, prospects, contacts, emails] = await Promise.all([
        supabase.from("campaigns").select("id", { count: "exact", head: true }).neq("status", "archived"),
        supabase.from("prospects").select("id", { count: "exact", head: true }),
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("emails").select("send_status, open_count, replied_at"),
      ]);

      const sent = emails.data?.filter(e => e.send_status === "sent") || [];
      return {
        content: [{
          type: "text",
          text: `**Overall:**\nCampaigns: ${campaigns.count} | Prospects: ${prospects.count} | Contacts: ${contacts.count}\n` +
            `Sent: ${sent.length} | Opened: ${sent.filter(e => e.open_count > 0).length} | Replied: ${sent.filter(e => e.replied_at).length}`,
        }],
      };
    }
  );

  server.tool(
    "get_activity",
    "Get recent activity log with contact, company, campaign, and email details.",
    {
      limit: z.number().optional().describe("Max entries (default 10)"),
      campaign_id: z.string().optional().describe("Filter by campaign"),
    },
    async ({ limit, campaign_id }) => {
      let query = supabase
        .from("activity_log")
        .select("*, contacts(first_name, last_name, email), prospects(company_name), emails(subject)")
        .order("created_at", { ascending: false })
        .limit(limit || 10);

      if (campaign_id) query = query.eq("campaign_id", campaign_id);

      const { data, error } = await query;

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      if (!data?.length) return { content: [{ type: "text", text: "No activity yet." }] };

      // Get campaign names
      const cIds = Array.from(new Set(data.filter(a => a.campaign_id).map(a => a.campaign_id)));
      const { data: campaigns } = cIds.length
        ? await supabase.from("campaigns").select("id, name").in("id", cIds)
        : { data: [] };
      const cMap = Object.fromEntries((campaigns || []).map(c => [c.id, c.name]));

      const lines = data.map(a => {
        const contact = a.contacts as unknown as { first_name: string; last_name: string; email: string } | null;
        const prospect = a.prospects as unknown as { company_name: string } | null;
        const email = a.emails as unknown as { subject: string } | null;
        const details = a.details as Record<string, unknown> | null;
        const campaign = a.campaign_id ? cMap[a.campaign_id] : null;

        let line = `- **${a.action.replace(/_/g, " ")}**`;
        if (contact) line += ` → ${contact.first_name} ${contact.last_name} (${contact.email})`;
        if (prospect) line += ` at ${prospect.company_name}`;
        if (campaign) line += ` [${campaign}]`;
        if (email?.subject) line += ` — "${email.subject}"`;
        if (details?.snippet) line += `\n  Reply: "${details.snippet}"`;
        line += `\n  ${new Date(a.created_at).toLocaleString()}`;
        return line;
      });
      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    }
  );

  server.tool(
    "get_analytics",
    "Get analytics with optional grouping by metadata dimensions. Claude uses this to self-serve insights.",
    {
      campaign_id: z.string().optional(),
      group_by: z.string().optional().describe("Group by metadata dimension: 'fomo_style', 'tone', 'value_prop', 'subject_style', 'cta_style'"),
      experiment_id: z.string().optional(),
    },
    async ({ campaign_id, group_by, experiment_id }) => {
      let query = supabase
        .from("emails")
        .select("send_status, open_count, replied_at, metadata, experiment_id, variant_id, test_dimensions, prospect_id");

      if (experiment_id) query = query.eq("experiment_id", experiment_id);

      const { data: emails, error } = await query;
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      if (!emails?.length) return { content: [{ type: "text", text: "No email data." }] };

      // Filter by campaign if needed
      let filtered = emails;
      if (campaign_id) {
        const { data: prospects } = await supabase.from("prospects").select("id").eq("campaign_id", campaign_id);
        const pIds = new Set((prospects || []).map(p => p.id));
        filtered = emails.filter(e => e.prospect_id && pIds.has(e.prospect_id));
      }

      if (group_by) {
        // Group by metadata dimension
        const groups: Record<string, { sent: number; opened: number; replied: number }> = {};
        for (const e of filtered) {
          const meta = e.metadata as Record<string, string> | null;
          const dims = e.test_dimensions as Record<string, string> | null;
          const value = meta?.[group_by] || dims?.[group_by] || "unknown";
          if (!groups[value]) groups[value] = { sent: 0, opened: 0, replied: 0 };
          if (e.send_status === "sent") {
            groups[value].sent++;
            if (e.open_count > 0) groups[value].opened++;
            if (e.replied_at) groups[value].replied++;
          }
        }

        const lines = Object.entries(groups).map(([value, stats]) => {
          const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
          const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;
          return `**${group_by}="${value}"**: Sent ${stats.sent} | Open ${openRate}% | Reply ${replyRate}%`;
        });

        return { content: [{ type: "text", text: `Analytics by ${group_by}:\n\n${lines.join("\n")}` }] };
      }

      // Overall stats
      const sent = filtered.filter(e => e.send_status === "sent");
      const opened = sent.filter(e => e.open_count > 0);
      const replied = sent.filter(e => e.replied_at);

      return {
        content: [{
          type: "text",
          text: `**Analytics${campaign_id ? " (campaign)" : " (all)"}:**\n` +
            `Total emails: ${filtered.length}\n` +
            `Sent: ${sent.length}\n` +
            `Opened: ${opened.length} (${sent.length ? Math.round((opened.length / sent.length) * 100) : 0}%)\n` +
            `Replied: ${replied.length} (${sent.length ? Math.round((replied.length / sent.length) * 100) : 0}%)`,
        }],
      };
    }
  );
}
