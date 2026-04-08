import { z } from "zod";
export function registerExperimentTools(server, supabase) {
    server.tool("create_experiment", "Create an A/B/C/D experiment to test a hypothesis. Only 1 experiment per campaign is allowed. campaign_id is required.", {
        campaign_id: z.string().describe("Campaign ID — required, 1 experiment per campaign"),
        name: z.string(),
        description: z.string().optional(),
        test_dimension: z.string().describe("e.g., 'fomo_style', 'tone', 'value_prop', 'subject_style', 'email_length', 'cta_style', 'sequence_timing'"),
        hypothesis: z.string().describe("What you expect to happen"),
        variants: z.array(z.object({
            variant_id: z.string().describe("A, B, C, or D"),
            label: z.string(),
            description: z.string(),
        })),
        assignment_method: z.enum(["random", "by_metro", "by_company_size", "by_persona", "manual"]).optional(),
        primary_metric: z.enum(["reply_rate", "open_rate", "positive_reply_rate", "meeting_booked_rate"]).optional(),
        secondary_metrics: z.array(z.string()).optional(),
        min_sample_per_variant: z.number().optional(),
    }, async ({ campaign_id, name, description, test_dimension, hypothesis, variants, assignment_method, primary_metric, secondary_metrics, min_sample_per_variant }) => {
        if (!campaign_id) {
            return { content: [{ type: "text", text: "campaign_id is required. Each campaign must have exactly 1 experiment." }] };
        }
        // Enforce 1 experiment per campaign
        const { count: existing } = await supabase
            .from("experiments")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign_id);
        if (existing && existing > 0) {
            return { content: [{ type: "text", text: "This campaign already has an experiment. Only 1 experiment per campaign is allowed. Use list_experiments to find it." }] };
        }
        const { data, error } = await supabase
            .from("experiments")
            .insert({
            campaign_id: campaign_id || null,
            name,
            description: description || null,
            test_dimension,
            hypothesis,
            variants,
            assignment_method: assignment_method || "random",
            primary_metric: primary_metric || "reply_rate",
            secondary_metrics: secondary_metrics || null,
            min_sample_per_variant: min_sample_per_variant || 10,
        })
            .select()
            .single();
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: `Experiment "${name}" created. ID: ${data.id}\nVariants: ${variants.map(v => `${v.variant_id}: ${v.label}`).join(", ")}` }] };
    });
    server.tool("assign_experiment_variants", "Assign contacts to experiment variants. Claude decides the split.", {
        experiment_id: z.string(),
        assignments: z.array(z.object({
            contact_id: z.string(),
            variant_id: z.string(),
        })),
    }, async ({ experiment_id, assignments }) => {
        const records = assignments.map(a => ({
            experiment_id,
            contact_id: a.contact_id,
            variant_id: a.variant_id,
        }));
        const { data, error } = await supabase.from("experiment_assignments").upsert(records, { onConflict: "experiment_id,contact_id" }).select();
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        // Activate experiment if it was draft
        await supabase.from("experiments").update({ status: "active" }).eq("id", experiment_id).eq("status", "draft");
        return { content: [{ type: "text", text: `Assigned ${data.length} contacts to variants.` }] };
    });
    server.tool("get_experiment_results", "Get experiment results with per-variant metrics pulled from actual email data.", {
        experiment_id: z.string(),
    }, async ({ experiment_id }) => {
        const { data: experiment } = await supabase
            .from("experiments")
            .select("*")
            .eq("id", experiment_id)
            .single();
        if (!experiment)
            return { content: [{ type: "text", text: "Experiment not found." }] };
        // Pull real metrics from emails table
        const { data: emails } = await supabase
            .from("emails")
            .select("variant_id, send_status, open_count, replied_at, contact_id")
            .eq("experiment_id", experiment_id);
        // Also get assignments for contact counts and sentiment
        const { data: assignments } = await supabase
            .from("experiment_assignments")
            .select("variant_id, contact_id, reply_sentiment")
            .eq("experiment_id", experiment_id);
        const variants = experiment.variants;
        const variantStats = {};
        for (const v of variants) {
            const assignmentCount = assignments?.filter(a => a.variant_id === v.variant_id).length || 0;
            variantStats[v.variant_id] = {
                label: v.label,
                contacts: assignmentCount,
                sent: 0, opened: 0, replied: 0, positive: 0,
                uniqueContacts: new Set(),
            };
        }
        // Aggregate from actual emails
        for (const e of (emails || [])) {
            const vid = e.variant_id;
            if (!vid || !variantStats[vid])
                continue;
            if (e.send_status === "sent") {
                variantStats[vid].sent++;
                if (e.open_count > 0)
                    variantStats[vid].opened++;
                if (e.replied_at) {
                    variantStats[vid].replied++;
                    variantStats[vid].uniqueContacts.add(e.contact_id);
                }
            }
        }
        // Count positive replies from assignments
        for (const a of (assignments || [])) {
            if (a.reply_sentiment === "positive" && variantStats[a.variant_id]) {
                variantStats[a.variant_id].positive++;
            }
        }
        let text = `**${experiment.name}** [${experiment.status}]\n`;
        text += `Hypothesis: ${experiment.hypothesis}\n`;
        text += `Dimension: ${experiment.test_dimension} | Metric: ${experiment.primary_metric}\n\n`;
        for (const [vid, stats] of Object.entries(variantStats)) {
            const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
            const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;
            const contactReplyRate = stats.contacts > 0 ? Math.round((stats.uniqueContacts.size / stats.contacts) * 100) : 0;
            const sufficientData = stats.contacts >= experiment.min_sample_per_variant;
            text += `**Variant ${vid}: ${stats.label}**\n`;
            text += `  Contacts: ${stats.contacts}/${experiment.min_sample_per_variant} min | Emails sent: ${stats.sent}\n`;
            text += `  Open rate: ${openRate}% | Reply rate (emails): ${replyRate}% | Reply rate (contacts): ${contactReplyRate}%\n`;
            text += `  Positive replies: ${stats.positive}\n`;
            text += `  Data: ${sufficientData ? "✓ Sufficient" : "✗ Need more"}\n\n`;
        }
        if (experiment.winner_variant)
            text += `**Winner: Variant ${experiment.winner_variant}**\n`;
        if (experiment.learnings)
            text += `**Learnings:** ${experiment.learnings}\n`;
        return { content: [{ type: "text", text }] };
    });
    server.tool("complete_experiment", "Mark an experiment as completed, declare a winner, and record learnings.", {
        experiment_id: z.string(),
        winner_variant: z.string().describe("The winning variant ID (A, B, C, D)"),
        learnings: z.string().describe("What we learned from this experiment"),
        add_to_playbook: z.boolean().optional().describe("Also save as a growth playbook entry"),
        vertical: z.string().optional().describe("Vertical for the playbook entry"),
    }, async ({ experiment_id, winner_variant, learnings, add_to_playbook, vertical }) => {
        const { data: experiment, error } = await supabase
            .from("experiments")
            .update({
            status: "analyzed",
            winner_variant,
            learnings,
            completed_at: new Date().toISOString(),
        })
            .eq("id", experiment_id)
            .select()
            .single();
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        if (add_to_playbook) {
            await supabase.from("growth_playbook").insert({
                dimension: experiment.test_dimension,
                vertical: vertical || null,
                insight: learnings,
                evidence: `Experiment: ${experiment.name} (${experiment_id})`,
                confidence: "tested",
                source_experiment_id: experiment_id,
            });
        }
        return { content: [{ type: "text", text: `Experiment completed. Winner: ${winner_variant}. Learnings recorded.${add_to_playbook ? " Added to growth playbook." : ""}` }] };
    });
    server.tool("list_experiments", "List all experiments, optionally filtered by campaign.", {
        campaign_id: z.string().optional(),
        status: z.enum(["draft", "active", "paused", "completed", "analyzed"]).optional(),
    }, async ({ campaign_id, status }) => {
        let query = supabase.from("experiments").select("*").order("created_at", { ascending: false });
        if (campaign_id)
            query = query.eq("campaign_id", campaign_id);
        if (status)
            query = query.eq("status", status);
        const { data, error } = await query;
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        if (!data?.length)
            return { content: [{ type: "text", text: "No experiments found." }] };
        const lines = data.map(e => {
            const variants = e.variants;
            return `- **${e.name}** [${e.status}] — ${e.test_dimension}\n  Hypothesis: ${e.hypothesis}\n  Variants: ${variants.map(v => v.variant_id + ": " + v.label).join(", ")}${e.winner_variant ? `\n  Winner: ${e.winner_variant}` : ""}\n  ID: ${e.id}`;
        });
        return { content: [{ type: "text", text: lines.join("\n\n") }] };
    });
    server.tool("delete_experiment", "Delete an experiment and all its assignments. Emails tagged with this experiment will have their experiment_id set to null.", {
        experiment_id: z.string(),
    }, async ({ experiment_id }) => {
        const { data: exp } = await supabase.from("experiments").select("name, status").eq("id", experiment_id).single();
        if (!exp)
            return { content: [{ type: "text", text: "Experiment not found." }] };
        const { error } = await supabase.from("experiments").delete().eq("id", experiment_id);
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: `Experiment "${exp.name}" deleted. Assignments removed, email tags cleared.` }] };
    });
}
