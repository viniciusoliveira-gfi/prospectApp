import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

export function registerResearchTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "push_prospect_research",
    "Push structured research dossier for a prospect. This is the main way to upload detailed company intelligence.",
    {
      prospect_id: z.string(),
      campaign_id: z.string().optional(),
      company_overview: z.string().optional(),
      market_position: z.string().optional(),
      tech_stack: z.record(z.string(), z.unknown()).optional(),
      recent_news: z.string().optional(),
      pain_points: z.array(z.object({
        pain: z.string(),
        severity: z.enum(["high", "medium", "low"]),
        evidence: z.string(),
      })).optional(),
      opportunities: z.array(z.object({
        opportunity: z.string(),
        fit_score: z.number().min(1).max(10),
        rationale: z.string(),
      })).optional(),
      personas: z.array(z.object({
        name: z.string(),
        title: z.string(),
        contact_id: z.string().optional(),
        role_in_deal: z.string(),
        pain_points: z.array(z.string()),
        messaging_angle: z.string(),
        tone: z.string(),
      })).optional(),
      local_competitors: z.array(z.object({
        company_name: z.string(),
        relationship: z.string(),
        fomo_usable: z.boolean(),
      })).optional(),
      fomo_strategy: z.string().optional(),
      competitor_naming_strategy: z.enum(["named", "unnamed", "mixed"]).optional(),
      core_value_prop: z.string().optional(),
      messaging_hypotheses: z.array(z.object({
        hypothesis: z.string(),
        test_dimension: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
      })).optional(),
      positioning_angle: z.string().optional(),
      objection_map: z.array(z.object({
        objection: z.string(),
        response: z.string(),
      })).optional(),
      research_depth: z.enum(["shallow", "standard", "deep"]).optional(),
    },
    async ({ prospect_id, campaign_id, ...research }) => {
      // Check if research exists for this prospect
      const { data: existing } = await supabase
        .from("prospect_research")
        .select("id")
        .eq("prospect_id", prospect_id)
        .single();

      const record = {
        prospect_id,
        campaign_id: campaign_id || null,
        ...Object.fromEntries(Object.entries(research).filter(([, v]) => v !== undefined)),
        researched_at: new Date().toISOString(),
        researched_by: "claude",
      };

      if (existing) {
        const { error } = await supabase.from("prospect_research").update(record).eq("id", existing.id);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: "Research dossier updated." }] };
      } else {
        const { error } = await supabase.from("prospect_research").insert(record);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: "Research dossier created." }] };
      }
    }
  );

  server.tool(
    "get_prospect_research",
    "Get the structured research dossier for a prospect.",
    {
      prospect_id: z.string(),
    },
    async ({ prospect_id }) => {
      const { data, error } = await supabase
        .from("prospect_research")
        .select("*")
        .eq("prospect_id", prospect_id)
        .single();

      if (error || !data) return { content: [{ type: "text", text: "No research dossier found for this prospect." }] };

      const pains = (data.pain_points as { pain: string; severity: string; evidence: string }[] || []);
      const personas = (data.personas as { name: string; title: string; messaging_angle: string }[] || []);
      const competitors = (data.local_competitors as { company_name: string; fomo_usable: boolean }[] || []);
      const hypotheses = (data.messaging_hypotheses as { hypothesis: string; confidence: string }[] || []);
      const objections = (data.objection_map as { objection: string; response: string }[] || []);

      let text = `**Research Dossier** (${data.research_depth} depth, by ${data.researched_by})\n\n`;
      if (data.company_overview) text += `**Overview:** ${data.company_overview}\n\n`;
      if (data.market_position) text += `**Market Position:** ${data.market_position}\n\n`;
      if (data.recent_news) text += `**Recent News:** ${data.recent_news}\n\n`;
      if (data.core_value_prop) text += `**Core Value Prop:** ${data.core_value_prop}\n\n`;
      if (data.positioning_angle) text += `**Positioning:** ${data.positioning_angle}\n\n`;

      if (pains.length) {
        text += `**Pain Points:**\n${pains.map(p => `- [${p.severity.toUpperCase()}] ${p.pain} — ${p.evidence}`).join("\n")}\n\n`;
      }
      if (personas.length) {
        text += `**Personas:**\n${personas.map(p => `- ${p.name} (${p.title}) — Angle: ${p.messaging_angle}`).join("\n")}\n\n`;
      }
      if (competitors.length) {
        text += `**Local Competitors:**\n${competitors.map(c => `- ${c.company_name} (FOMO usable: ${c.fomo_usable ? "yes" : "no"})`).join("\n")}\n\n`;
      }
      if (data.fomo_strategy) text += `**FOMO Strategy:** ${data.fomo_strategy}\n\n`;
      if (hypotheses.length) {
        text += `**Messaging Hypotheses:**\n${hypotheses.map(h => `- [${h.confidence}] ${h.hypothesis}`).join("\n")}\n\n`;
      }
      if (objections.length) {
        text += `**Objection Map:**\n${objections.map(o => `- "${o.objection}" → ${o.response}`).join("\n")}\n\n`;
      }

      return { content: [{ type: "text", text }] };
    }
  );
}
