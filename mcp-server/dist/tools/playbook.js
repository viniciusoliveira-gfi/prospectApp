import { z } from "zod";
export function registerPlaybookTools(server, supabase) {
    server.tool("add_to_playbook", "Add an insight to the growth playbook. This is how Claude stores what it learns for future campaigns.", {
        dimension: z.string().describe("e.g., 'fomo_style', 'tone', 'value_prop'"),
        insight: z.string().describe("What we learned"),
        vertical: z.string().optional().describe("e.g., 'real_estate', 'saas', 'consulting'"),
        evidence: z.string().optional().describe("Supporting evidence or experiment reference"),
        confidence: z.enum(["hypothesis", "tested", "validated", "proven"]).optional(),
        applies_to: z.record(z.string(), z.unknown()).optional().describe("Where this insight applies"),
        source_experiment_id: z.string().optional(),
    }, async ({ dimension, insight, vertical, evidence, confidence, applies_to, source_experiment_id }) => {
        const { data, error } = await supabase.from("growth_playbook").insert({
            dimension,
            insight,
            vertical: vertical || null,
            evidence: evidence || null,
            confidence: confidence || "hypothesis",
            applies_to: applies_to || null,
            source_experiment_id: source_experiment_id || null,
        }).select().single();
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: `Playbook entry added. ID: ${data.id}` }] };
    });
    server.tool("get_playbook", "Get growth playbook entries. Claude should read this before writing copy for any campaign to apply past learnings.", {
        dimension: z.string().optional().describe("Filter by dimension"),
        vertical: z.string().optional().describe("Filter by vertical"),
    }, async ({ dimension, vertical }) => {
        let query = supabase.from("growth_playbook").select("*").order("confidence").order("created_at", { ascending: false });
        if (dimension)
            query = query.eq("dimension", dimension);
        if (vertical)
            query = query.eq("vertical", vertical);
        const { data, error } = await query;
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        if (!data?.length)
            return { content: [{ type: "text", text: "No playbook entries yet. Run experiments and record learnings!" }] };
        const lines = data.map(e => `- [${e.confidence.toUpperCase()}] **${e.dimension}**${e.vertical ? ` (${e.vertical})` : ""}: ${e.insight}${e.evidence ? `\n  Evidence: ${e.evidence}` : ""}`);
        return { content: [{ type: "text", text: `**Growth Playbook** (${data.length} entries):\n\n${lines.join("\n\n")}` }] };
    });
    server.tool("update_playbook_entry", "Update a playbook entry's confidence level or content.", {
        entry_id: z.string(),
        insight: z.string().optional(),
        confidence: z.enum(["hypothesis", "tested", "validated", "proven"]).optional(),
        evidence: z.string().optional(),
    }, async ({ entry_id, ...updates }) => {
        const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
        const { error } = await supabase.from("growth_playbook").update(clean).eq("id", entry_id);
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: "Playbook entry updated." }] };
    });
}
