import { z } from "zod";
export function registerProspectTools(server, supabase) {
    server.tool("list_prospects", "List prospects in a campaign", {
        campaign_id: z.string().describe("Campaign ID"),
    }, async ({ campaign_id }) => {
        const { data, error } = await supabase
            .from("prospects")
            .select("*")
            .eq("campaign_id", campaign_id)
            .order("company_name");
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        if (!data?.length)
            return { content: [{ type: "text", text: "No prospects in this campaign." }] };
        const lines = data.map(p => `- **${p.company_name}** (${p.domain || "no domain"}) | Tier: ${p.tier || "unset"} | Research: ${p.ai_research_status} | ID: ${p.id}`);
        return { content: [{ type: "text", text: `${data.length} prospects:\n${lines.join("\n")}` }] };
    });
    server.tool("push_prospects", "Push a list of prospect companies into a campaign. Use this after you've researched and prepared the list with the user.", {
        campaign_id: z.string().describe("Campaign ID"),
        prospects: z.array(z.object({
            company_name: z.string(),
            domain: z.string().optional(),
            website: z.string().optional(),
            country: z.string().optional(),
            industry: z.string().optional(),
            size: z.string().optional(),
            description: z.string().optional().describe("What the company does"),
            ai_research: z.string().optional().describe("Research notes you've prepared about this company"),
            tier: z.enum(["tier_1", "tier_2", "tier_3", "disqualified"]).optional(),
            qualification_rationale: z.string().optional(),
            tags: z.array(z.string()).optional(),
        })).describe("Companies to add"),
    }, async ({ campaign_id, prospects }) => {
        // Check for companies already in other campaigns with active sequences
        const blocked = [];
        for (const p of prospects) {
            // Find existing prospects with same domain or company name in OTHER campaigns
            let existingQuery = supabase
                .from("prospects")
                .select("id, campaign_id, company_name")
                .neq("campaign_id", campaign_id);
            if (p.domain) {
                existingQuery = existingQuery.eq("domain", p.domain);
            }
            else {
                existingQuery = existingQuery.eq("company_name", p.company_name);
            }
            const { data: existing } = await existingQuery;
            if (existing?.length) {
                // Check if any of those campaigns have active sequences
                for (const ex of existing) {
                    const { count } = await supabase
                        .from("sequences")
                        .select("id", { count: "exact", head: true })
                        .eq("campaign_id", ex.campaign_id)
                        .eq("status", "active");
                    if (count && count > 0) {
                        blocked.push(`${p.company_name} (active sequences in another campaign)`);
                        break;
                    }
                }
            }
        }
        if (blocked.length) {
            return {
                content: [{
                        type: "text",
                        text: `Cannot add these companies — they have contacts in active sequences in other campaigns:\n${blocked.map(b => `- ${b}`).join("\n")}\n\nPause or complete those sequences first, then try again.`,
                    }],
            };
        }
        const records = prospects.map(p => ({
            campaign_id,
            company_name: p.company_name,
            domain: p.domain || null,
            website: p.website || null,
            country: p.country || null,
            industry: p.industry || null,
            size: p.size || null,
            description: p.description || null,
            ai_research: p.ai_research || null,
            ai_research_status: p.ai_research ? "completed" : "pending",
            tier: p.tier || null,
            qualification_rationale: p.qualification_rationale || null,
            tags: p.tags || null,
        }));
        const { data, error } = await supabase.from("prospects").insert(records).select();
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: `Pushed ${data.length} prospects into campaign.` }] };
    });
    server.tool("update_prospect", "Update a prospect's details, tier, research, or tags", {
        prospect_id: z.string(),
        company_name: z.string().optional(),
        domain: z.string().optional(),
        tier: z.enum(["tier_1", "tier_2", "tier_3", "disqualified"]).optional(),
        ai_research: z.string().optional().describe("Updated research notes"),
        qualification_rationale: z.string().optional(),
        tags: z.array(z.string()).optional(),
    }, async ({ prospect_id, ...updates }) => {
        const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
        if (clean.ai_research)
            clean.ai_research_status = "completed";
        const { data, error } = await supabase.from("prospects").update(clean).eq("id", prospect_id).select().single();
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: `Prospect "${data.company_name}" updated.` }] };
    });
    server.tool("delete_prospect", "Remove a prospect and all its contacts from a campaign", {
        prospect_id: z.string(),
    }, async ({ prospect_id }) => {
        const { error } = await supabase.from("prospects").delete().eq("id", prospect_id);
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: "Prospect deleted." }] };
    });
}
