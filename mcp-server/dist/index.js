#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const server = new McpServer({
    name: "prospectapp",
    version: "1.0.0",
});
// ============================================================
// CAMPAIGNS
// ============================================================
server.tool("list_campaigns", "List all campaigns with status", {}, async () => {
    const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .neq("status", "archived")
        .order("created_at", { ascending: false });
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length)
        return { content: [{ type: "text", text: "No campaigns yet." }] };
    const lines = data.map(c => `- **${c.name}** [${c.status}] (ID: ${c.id}) — Created ${new Date(c.created_at).toLocaleDateString()}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
});
server.tool("create_campaign", "Create a new campaign", {
    name: z.string().describe("Campaign name"),
    description: z.string().optional().describe("Campaign description"),
    daily_send_limit: z.number().optional().describe("Max emails per day (default 25)"),
    send_interval_minutes: z.number().optional().describe("Minutes between sends (default 60)"),
}, async ({ name, description, daily_send_limit, send_interval_minutes }) => {
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
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Campaign "${data.name}" created. ID: ${data.id}` }] };
});
server.tool("update_campaign", "Update campaign status, name, description, or sending settings", {
    campaign_id: z.string().describe("Campaign ID"),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
    daily_send_limit: z.number().optional(),
    send_interval_minutes: z.number().optional(),
}, async ({ campaign_id, ...updates }) => {
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const { data, error } = await supabase.from("campaigns").update(clean).eq("id", campaign_id).select().single();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Campaign "${data.name}" updated. Status: ${data.status}` }] };
});
// ============================================================
// PROSPECTS — push company data into the app
// ============================================================
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
// ============================================================
// CONTACTS — push contact data into the app
// ============================================================
server.tool("list_contacts", "List contacts in a campaign", {
    campaign_id: z.string(),
}, async ({ campaign_id }) => {
    const { data, error } = await supabase
        .from("contacts")
        .select("*, prospects(company_name)")
        .eq("campaign_id", campaign_id)
        .order("created_at", { ascending: false });
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length)
        return { content: [{ type: "text", text: "No contacts." }] };
    const lines = data.map(c => {
        const company = c.prospects?.company_name || "Unknown";
        return `- **${c.first_name} ${c.last_name}** | ${c.title || "No title"} | ${company} | ${c.email || "no email"} [${c.email_status}] | ID: ${c.id}`;
    });
    return { content: [{ type: "text", text: `${data.length} contacts:\n${lines.join("\n")}` }] };
});
server.tool("push_contacts", "Push contacts into a campaign for a specific prospect. Use this after you've found and prepared the contact list with the user.", {
    prospect_id: z.string().describe("Prospect ID (the company these contacts belong to)"),
    contacts: z.array(z.object({
        first_name: z.string(),
        last_name: z.string(),
        email: z.string().optional(),
        email_status: z.enum(["unknown", "verified", "unverified", "bounced", "catch_all"]).optional(),
        title: z.string().optional(),
        linkedin_url: z.string().optional(),
        phone: z.string().optional(),
    })).describe("Contacts to add"),
}, async ({ prospect_id, contacts }) => {
    const { data: prospect } = await supabase.from("prospects").select("campaign_id").eq("id", prospect_id).single();
    if (!prospect)
        return { content: [{ type: "text", text: "Prospect not found." }] };
    const records = contacts.map(c => ({
        prospect_id,
        campaign_id: prospect.campaign_id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email || null,
        email_status: c.email_status || "unknown",
        title: c.title || null,
        linkedin_url: c.linkedin_url || null,
        phone: c.phone || null,
        source: "manual",
    }));
    const { data, error } = await supabase.from("contacts").insert(records).select();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Pushed ${data.length} contacts.` }] };
});
server.tool("update_contact", "Update a contact's details", {
    contact_id: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    title: z.string().optional(),
    status: z.enum(["active", "opted_out", "bounced", "replied", "converted"]).optional(),
}, async ({ contact_id, ...updates }) => {
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const { data, error } = await supabase.from("contacts").update(clean).eq("id", contact_id).select().single();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Contact "${data.first_name} ${data.last_name}" updated.` }] };
});
server.tool("delete_contact", "Remove a contact", { contact_id: z.string() }, async ({ contact_id }) => {
    const { error } = await supabase.from("contacts").delete().eq("id", contact_id);
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "Contact deleted." }] };
});
// ============================================================
// SEQUENCES & EMAILS — push copies and manage sequences
// ============================================================
server.tool("list_sequences", "List sequences in a campaign with their steps", {
    campaign_id: z.string(),
}, async ({ campaign_id }) => {
    const { data, error } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("campaign_id", campaign_id)
        .order("created_at", { ascending: false });
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length)
        return { content: [{ type: "text", text: "No sequences in this campaign." }] };
    const lines = data.map(seq => {
        const steps = (seq.sequence_steps || [])
            .sort((a, b) => a.step_number - b.step_number);
        const stepLines = steps.map(s => `    Step ${s.step_number} (day ${s.delay_days}): "${s.subject_template}" — ID: ${s.id}`);
        return `- **${seq.name}** [${seq.status}] (ID: ${seq.id})\n${stepLines.join("\n")}`;
    });
    return { content: [{ type: "text", text: lines.join("\n\n") }] };
});
server.tool("get_sequence_details", "Get full details of a sequence including all step IDs. Use this to get step IDs before pushing emails.", {
    sequence_id: z.string(),
}, async ({ sequence_id }) => {
    const { data, error } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    const steps = (data.sequence_steps || [])
        .sort((a, b) => a.step_number - b.step_number);
    const stepLines = steps.map(s => `Step ${s.step_number} (day ${s.delay_days}):\n  Subject: "${s.subject_template}"\n  Body: "${s.body_template}"\n  Step ID: ${s.id}`);
    return {
        content: [{
                type: "text",
                text: `**${data.name}** [${data.status}]\nSequence ID: ${data.id}\n\n${stepLines.join("\n\n")}`,
            }],
    };
});
server.tool("create_sequence", "Create an email sequence with steps. Push the email templates/copies you've written with the user.", {
    campaign_id: z.string(),
    name: z.string().describe("Sequence name"),
    steps: z.array(z.object({
        delay_days: z.number().describe("Days after previous step (0 for first)"),
        subject_template: z.string().describe("Subject line template (supports {{first_name}}, {{company_name}}, etc.)"),
        body_template: z.string().describe("Email body template"),
    })),
}, async ({ campaign_id, name, steps }) => {
    const { data: sequence, error } = await supabase
        .from("sequences")
        .insert({ campaign_id, name })
        .select()
        .single();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    const stepRecords = steps.map((s, i) => ({
        sequence_id: sequence.id,
        step_number: i + 1,
        delay_days: s.delay_days,
        subject_template: s.subject_template,
        body_template: s.body_template,
        step_type: "email",
    }));
    await supabase.from("sequence_steps").insert(stepRecords);
    return { content: [{ type: "text", text: `Sequence "${name}" created with ${steps.length} steps. ID: ${sequence.id}` }] };
});
server.tool("update_sequence_step", "Update a specific step's subject, body template, or delay_days. If delay_days changes, all unsent emails are automatically rescheduled.", {
    sequence_id: z.string(),
    step_number: z.number().describe("Which step to update (1, 2, 3, etc.)"),
    subject_template: z.string().optional(),
    body_template: z.string().optional(),
    delay_days: z.number().optional(),
}, async ({ sequence_id, step_number, ...updates }) => {
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const { data, error } = await supabase
        .from("sequence_steps")
        .update(clean)
        .eq("sequence_id", sequence_id)
        .eq("step_number", step_number)
        .select()
        .single();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    // If delay_days changed, recalculate all unsent email schedules
    let recalcResult = "";
    if (updates.delay_days !== undefined) {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
        try {
            const res = await fetch(`${appUrl}/api/sequences/${sequence_id}/recalculate`, { method: "POST" });
            const rData = await res.json();
            recalcResult = ` ${rData.rescheduled || 0} emails rescheduled.`;
        }
        catch {
            recalcResult = " (schedule recalculation failed — run recalculate_sequence_schedule manually)";
        }
    }
    return { content: [{ type: "text", text: `Step ${step_number} updated.${recalcResult}` }] };
});
// ============================================================
// SEQUENCE ACTIVATION — start, pause, resume, status
// ============================================================
server.tool("start_sequence", "Start a sequence — schedules all approved emails for delivery. All emails must be approved first.", {
    sequence_id: z.string().describe("Sequence ID to start"),
}, async ({ sequence_id }) => {
    // Get sequence with steps
    const { data: sequence, error: seqErr } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();
    if (seqErr || !sequence)
        return { content: [{ type: "text", text: "Sequence not found." }] };
    if (sequence.status !== "draft") {
        return { content: [{ type: "text", text: `Cannot start: sequence is "${sequence.status}", must be "draft".` }] };
    }
    const steps = (sequence.sequence_steps || [])
        .sort((a, b) => a.step_number - b.step_number);
    const stepIds = steps.map(s => s.id);
    // Get emails with prospect info for sender assignment
    const { data: emails } = await supabase
        .from("emails")
        .select("id, approval_status, sequence_step_id, prospect_id, contact_id")
        .in("sequence_step_id", stepIds);
    if (!emails?.length) {
        return { content: [{ type: "text", text: "No emails found. Generate emails first." }] };
    }
    // Check readiness
    const approved = emails.filter(e => e.approval_status === "approved" || e.approval_status === "edited").length;
    if (approved < emails.length) {
        return {
            content: [{
                    type: "text",
                    text: `Not ready: ${approved}/${emails.length} emails approved. Approve all emails before starting.`,
                }],
        };
    }
    // Get campaign send settings for sender assignment
    const { data: campaign } = await supabase
        .from("campaigns")
        .select("send_settings, sending_account")
        .eq("id", sequence.campaign_id)
        .single();
    const ss = campaign?.send_settings;
    let senderAccounts = ss?.sender_accounts || [];
    if (!senderAccounts.length && campaign?.sending_account)
        senderAccounts = [campaign.sending_account];
    if (!senderAccounts.length) {
        const { data: gmail } = await supabase.from("settings").select("value").eq("key", "gmail_tokens").single();
        if (gmail?.value) {
            const t = gmail.value;
            if (t.email)
                senderAccounts = [t.email];
        }
    }
    // Assign senders: same per prospect, distributed evenly
    const prospectSenderMap = {};
    const senderCounts = {};
    // Calculate schedules and assign senders
    const now = new Date();
    const stepDelayMap = Object.fromEntries(steps.map(s => [s.id, s.delay_days]));
    for (const email of emails) {
        const delayDays = stepDelayMap[email.sequence_step_id];
        const scheduled = new Date(now);
        if (delayDays === 0) {
            const hour = scheduled.getHours();
            if (hour < 9 || hour >= 18) {
                scheduled.setDate(scheduled.getDate() + 1);
                scheduled.setHours(9, 0, 0, 0);
            }
        }
        else {
            scheduled.setDate(scheduled.getDate() + delayDays);
            scheduled.setHours(9, 0, 0, 0);
        }
        // Assign sender
        let sender = null;
        if (senderAccounts.length) {
            const key = email.prospect_id || email.contact_id;
            if (prospectSenderMap[key]) {
                sender = prospectSenderMap[key];
            }
            else {
                const sorted = [...senderAccounts].sort((a, b) => (senderCounts[a] || 0) - (senderCounts[b] || 0));
                sender = sorted[0];
                prospectSenderMap[key] = sender;
            }
            senderCounts[sender] = (senderCounts[sender] || 0) + 1;
        }
        await supabase.from("emails").update({
            scheduled_for: scheduled.toISOString(),
            send_status: "scheduled",
            sent_from: sender,
        }).eq("id", email.id);
    }
    await supabase.from("sequences").update({
        status: "active",
        started_at: now.toISOString(),
    }).eq("id", sequence_id);
    const scheduleLines = steps.map(s => {
        const d = new Date(now);
        if (s.delay_days === 0) {
            if (d.getHours() < 9 || d.getHours() >= 18) {
                d.setDate(d.getDate() + 1);
                d.setHours(9, 0, 0, 0);
            }
        }
        else {
            d.setDate(d.getDate() + s.delay_days);
            d.setHours(9, 0, 0, 0);
        }
        return `  Step ${s.step_number} (day ${s.delay_days}): ${d.toLocaleString()}`;
    });
    return {
        content: [{
                type: "text",
                text: `Sequence started! ${emails.length} emails scheduled.\nSender accounts: ${senderAccounts.join(", ") || "default"}\n\nSchedule:\n${scheduleLines.join("\n")}`,
            }],
    };
});
server.tool("pause_sequence", "Pause an active sequence. Scheduled emails will not be sent until resumed.", {
    sequence_id: z.string(),
}, async ({ sequence_id }) => {
    const { data: sequence } = await supabase.from("sequences").select("status").eq("id", sequence_id).single();
    if (!sequence)
        return { content: [{ type: "text", text: "Sequence not found." }] };
    if (sequence.status !== "active") {
        return { content: [{ type: "text", text: `Cannot pause: sequence is "${sequence.status}", must be "active".` }] };
    }
    await supabase.from("sequences").update({
        status: "paused",
        paused_at: new Date().toISOString(),
    }).eq("id", sequence_id);
    return { content: [{ type: "text", text: "Sequence paused. No further emails will be sent until resumed." }] };
});
server.tool("resume_sequence", "Resume a paused sequence. Schedules are shifted forward by the pause duration.", {
    sequence_id: z.string(),
}, async ({ sequence_id }) => {
    const { data: sequence } = await supabase.from("sequences").select("*").eq("id", sequence_id).single();
    if (!sequence)
        return { content: [{ type: "text", text: "Sequence not found." }] };
    if (sequence.status !== "paused") {
        return { content: [{ type: "text", text: `Cannot resume: sequence is "${sequence.status}", must be "paused".` }] };
    }
    const pausedAt = new Date(sequence.paused_at);
    const now = new Date();
    const pauseDurationMs = now.getTime() - pausedAt.getTime();
    // Get unsent scheduled emails
    const { data: steps } = await supabase.from("sequence_steps").select("id").eq("sequence_id", sequence_id);
    const stepIds = (steps || []).map(s => s.id);
    const { data: emails } = await supabase
        .from("emails")
        .select("id, scheduled_for")
        .in("sequence_step_id", stepIds)
        .eq("send_status", "scheduled");
    let rescheduled = 0;
    if (emails?.length) {
        for (const email of emails) {
            if (email.scheduled_for) {
                const shifted = new Date(new Date(email.scheduled_for).getTime() + pauseDurationMs);
                await supabase.from("emails").update({ scheduled_for: shifted.toISOString() }).eq("id", email.id);
                rescheduled++;
            }
        }
    }
    await supabase.from("sequences").update({
        status: "active",
        paused_at: null,
    }).eq("id", sequence_id);
    return {
        content: [{
                type: "text",
                text: `Sequence resumed. ${rescheduled} emails rescheduled (shifted forward by ${Math.round(pauseDurationMs / 3600000)} hours).`,
            }],
    };
});
server.tool("get_sequence_status", "Get detailed status of a sequence including per-step progress and scheduling info.", {
    sequence_id: z.string(),
}, async ({ sequence_id }) => {
    const { data: sequence, error } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();
    if (error || !sequence)
        return { content: [{ type: "text", text: "Sequence not found." }] };
    const steps = (sequence.sequence_steps || [])
        .sort((a, b) => a.step_number - b.step_number);
    const stepLines = [];
    let totalSent = 0, totalScheduled = 0, totalFailed = 0, totalSkipped = 0;
    for (const step of steps) {
        const { data: emails } = await supabase
            .from("emails")
            .select("send_status, scheduled_for, open_count, replied_at")
            .eq("sequence_step_id", step.id);
        const sent = emails?.filter(e => e.send_status === "sent").length || 0;
        const scheduled = emails?.filter(e => e.send_status === "scheduled").length || 0;
        const failed = emails?.filter(e => e.send_status === "failed").length || 0;
        const skipped = emails?.filter(e => e.send_status === "skipped").length || 0;
        const opens = emails?.filter(e => e.open_count > 0).length || 0;
        const replies = emails?.filter(e => e.replied_at).length || 0;
        const nextScheduled = emails
            ?.filter(e => e.send_status === "scheduled" && e.scheduled_for)
            .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0];
        totalSent += sent;
        totalScheduled += scheduled;
        totalFailed += failed;
        totalSkipped += skipped;
        stepLines.push(`**Step ${step.step_number}** (day ${step.delay_days}): "${step.subject_template}"` +
            `\n  Sent: ${sent} | Scheduled: ${scheduled} | Failed: ${failed} | Skipped: ${skipped}` +
            `\n  Opens: ${opens} | Replies: ${replies}` +
            (nextScheduled ? `\n  Next send: ${new Date(nextScheduled.scheduled_for).toLocaleString()}` : ""));
    }
    const header = `**${sequence.name}** [${sequence.status}]` +
        (sequence.started_at ? `\nStarted: ${new Date(sequence.started_at).toLocaleString()}` : "") +
        (sequence.paused_at ? `\nPaused: ${new Date(sequence.paused_at).toLocaleString()}` : "") +
        (sequence.completed_at ? `\nCompleted: ${new Date(sequence.completed_at).toLocaleString()}` : "") +
        `\n\nTotal: ${totalSent} sent, ${totalScheduled} scheduled, ${totalFailed} failed, ${totalSkipped} skipped`;
    return {
        content: [{
                type: "text",
                text: `${header}\n\n${stepLines.join("\n\n")}`,
            }],
    };
});
server.tool("push_emails", "Push personalized emails into the approval queue for a specific sequence step. Include metadata for strategy tracking and experiment tags.", {
    sequence_step_id: z.string().describe("Sequence step ID (get this from get_sequence_details)"),
    emails: z.array(z.object({
        contact_id: z.string(),
        prospect_id: z.string().optional(),
        subject: z.string().describe("Final subject line for this contact"),
        body: z.string().describe("Final email body for this contact"),
        experiment_id: z.string().optional(),
        variant_id: z.string().optional(),
        test_dimensions: z.record(z.string(), z.string()).optional().describe("e.g., {fomo_style: 'named', tone: 'provocative'}"),
        metadata: z.record(z.string(), z.unknown()).optional().describe("Strategy metadata: fomo_style, tone, value_prop, subject_style, cta_style, strategy_notes, etc."),
    })),
}, async ({ sequence_step_id, emails }) => {
    const records = emails.map(e => ({
        sequence_step_id,
        contact_id: e.contact_id,
        prospect_id: e.prospect_id || null,
        subject: e.subject,
        body: e.body,
        approval_status: "pending",
        send_status: "queued",
        experiment_id: e.experiment_id || null,
        variant_id: e.variant_id || null,
        test_dimensions: e.test_dimensions || null,
        metadata: e.metadata || null,
    }));
    const { data, error } = await supabase.from("emails").insert(records).select();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Pushed ${data.length} emails to the approval queue.` }] };
});
server.tool("push_all_emails_for_sequence", "Push personalized emails for ALL contacts and ALL steps in a sequence at once. Include metadata for strategy tracking and experiment tags.", {
    sequence_id: z.string().describe("Sequence ID"),
    emails: z.array(z.object({
        step_number: z.number().describe("Which step this email belongs to (1, 2, 3, etc.)"),
        contact_id: z.string(),
        prospect_id: z.string().optional(),
        subject: z.string(),
        body: z.string(),
        experiment_id: z.string().optional(),
        variant_id: z.string().optional(),
        test_dimensions: z.record(z.string(), z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })).describe("All emails for all steps and contacts"),
}, async ({ sequence_id, emails }) => {
    // Get step IDs for this sequence
    const { data: steps, error: stepsError } = await supabase
        .from("sequence_steps")
        .select("id, step_number")
        .eq("sequence_id", sequence_id)
        .order("step_number");
    if (stepsError || !steps?.length) {
        return { content: [{ type: "text", text: `Error: Could not find steps for sequence. ${stepsError?.message || ""}` }] };
    }
    const stepMap = Object.fromEntries(steps.map(s => [s.step_number, s.id]));
    const records = emails.map(e => {
        const stepId = stepMap[e.step_number];
        if (!stepId)
            return null;
        return {
            sequence_step_id: stepId,
            contact_id: e.contact_id,
            prospect_id: e.prospect_id || null,
            subject: e.subject,
            body: e.body,
            approval_status: "pending",
            send_status: "queued",
            experiment_id: e.experiment_id || null,
            variant_id: e.variant_id || null,
            test_dimensions: e.test_dimensions || null,
            metadata: e.metadata || null,
        };
    }).filter(Boolean);
    if (!records.length) {
        return { content: [{ type: "text", text: "No valid emails to push. Check step numbers match the sequence." }] };
    }
    const { data, error } = await supabase.from("emails").insert(records).select();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Pushed ${data.length} emails across ${steps.length} steps to the approval queue.` }] };
});
server.tool("list_emails", "List emails with their approval and send status", {
    campaign_id: z.string().optional(),
    approval_status: z.enum(["pending", "approved", "rejected", "edited"]).optional(),
    send_status: z.enum(["queued", "scheduled", "sending", "sent", "failed", "skipped"]).optional(),
    limit: z.number().optional().describe("Max results (default 20)"),
}, async ({ campaign_id, approval_status, send_status, limit }) => {
    let query = supabase
        .from("emails")
        .select("*, contacts(first_name, last_name, email), prospects(company_name)")
        .order("created_at", { ascending: false })
        .limit(limit || 20);
    if (approval_status)
        query = query.eq("approval_status", approval_status);
    if (send_status)
        query = query.eq("send_status", send_status);
    const { data, error } = await query;
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length)
        return { content: [{ type: "text", text: "No emails found matching filters." }] };
    const lines = data.map(e => {
        const contact = e.contacts;
        const prospect = e.prospects;
        return `---\n**To:** ${contact?.first_name} ${contact?.last_name} at ${prospect?.company_name}\n**Subject:** ${e.subject}\n**Status:** ${e.approval_status} / ${e.send_status}${e.sent_from ? ` | **From:** ${e.sent_from}` : ""}\n**Opens:** ${e.open_count} | **Replied:** ${e.replied_at ? "Yes" : "No"}\n**ID:** ${e.id}`;
    });
    return { content: [{ type: "text", text: `${data.length} emails:\n${lines.join("\n\n")}` }] };
});
server.tool("update_email", "Edit an email's subject, body, or status", {
    email_id: z.string(),
    subject: z.string().optional(),
    body: z.string().optional(),
    approval_status: z.enum(["pending", "approved", "rejected", "edited"]).optional(),
}, async ({ email_id, ...updates }) => {
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (clean.approval_status === "approved")
        clean.approved_at = new Date().toISOString();
    const { error } = await supabase.from("emails").update(clean).eq("id", email_id);
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "Email updated." }] };
});
server.tool("approve_emails", "Approve emails for sending. Pass specific IDs or approve all pending.", {
    email_ids: z.array(z.string()).optional().describe("Specific email IDs to approve (omit to approve all pending)"),
}, async ({ email_ids }) => {
    let query = supabase
        .from("emails")
        .update({ approval_status: "approved", approved_at: new Date().toISOString() });
    if (email_ids?.length) {
        query = query.in("id", email_ids);
    }
    else {
        query = query.eq("approval_status", "pending");
    }
    const { data, error } = await query.select();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `${data.length} emails approved and ready to send.` }] };
});
server.tool("reject_emails", "Reject emails", {
    email_ids: z.array(z.string()),
}, async ({ email_ids }) => {
    const { data, error } = await supabase
        .from("emails")
        .update({ approval_status: "rejected" })
        .in("id", email_ids)
        .select();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `${data.length} emails rejected.` }] };
});
// ============================================================
// CAMPAIGN SEND SETTINGS
// ============================================================
server.tool("get_campaign_settings", "Get a campaign's send settings: sender accounts, tracking, sending window, timezone.", {
    campaign_id: z.string(),
}, async ({ campaign_id }) => {
    const { data, error } = await supabase
        .from("campaigns")
        .select("name, send_settings, sending_account, daily_send_limit")
        .eq("id", campaign_id)
        .single();
    if (error || !data)
        return { content: [{ type: "text", text: "Campaign not found." }] };
    const ss = data.send_settings;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const sendDayNames = (ss?.send_days || ["1", "2", "3", "4", "5"]).map(d => days[parseInt(d)]).join(", ");
    return {
        content: [{
                type: "text",
                text: `**${data.name}** settings:\n` +
                    `Sender accounts: ${ss?.sender_accounts?.length ? ss.sender_accounts.join(", ") : data.sending_account || "default"}\n` +
                    `Track opens: ${ss?.track_opens !== false ? "Yes" : "No"}\n` +
                    `Send days: ${sendDayNames}\n` +
                    `Send hours: ${ss?.send_hours_start ?? 9}:00 - ${ss?.send_hours_end ?? 18}:00\n` +
                    `Timezone: ${ss?.timezone || "America/Sao_Paulo"}\n` +
                    `Daily limit per account: ${ss?.daily_limit_per_account || data.daily_send_limit || 25}`,
            }],
    };
});
server.tool("update_campaign_settings", "Update a campaign's send settings: sender accounts, tracking, sending window.", {
    campaign_id: z.string(),
    sender_accounts: z.array(z.string()).optional().describe("Email addresses to send from (distribute evenly)"),
    track_opens: z.boolean().optional().describe("Track email opens with pixel"),
    send_days: z.array(z.string()).optional().describe("Days to send (0=Sun, 1=Mon, ..., 6=Sat). Default: ['1','2','3','4','5']"),
    send_hours_start: z.number().optional().describe("Start hour (0-23, default 9)"),
    send_hours_end: z.number().optional().describe("End hour (0-23, default 18)"),
    timezone: z.string().optional().describe("IANA timezone (e.g., America/Sao_Paulo)"),
    daily_limit_per_account: z.number().optional().describe("Max emails per account per day (default 25)"),
}, async ({ campaign_id, ...updates }) => {
    // Get existing settings
    const { data: campaign } = await supabase
        .from("campaigns")
        .select("send_settings")
        .eq("id", campaign_id)
        .single();
    if (!campaign)
        return { content: [{ type: "text", text: "Campaign not found." }] };
    const existing = (campaign.send_settings || {});
    const newSettings = { ...existing };
    if (updates.sender_accounts !== undefined)
        newSettings.sender_accounts = updates.sender_accounts;
    if (updates.track_opens !== undefined)
        newSettings.track_opens = updates.track_opens;
    if (updates.send_days !== undefined)
        newSettings.send_days = updates.send_days;
    if (updates.send_hours_start !== undefined)
        newSettings.send_hours_start = updates.send_hours_start;
    if (updates.send_hours_end !== undefined)
        newSettings.send_hours_end = updates.send_hours_end;
    if (updates.timezone !== undefined)
        newSettings.timezone = updates.timezone;
    const { error } = await supabase
        .from("campaigns")
        .update({ send_settings: newSettings })
        .eq("id", campaign_id);
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "Campaign settings updated." }] };
});
// ============================================================
// GMAIL ACCOUNTS
// ============================================================
server.tool("list_gmail_accounts", "List all connected Gmail accounts with their aliases. Use this to see available sender addresses.", {}, async () => {
    const { data } = await supabase
        .from("settings")
        .select("key, value")
        .like("key", "gmail_tokens%");
    if (!data?.length)
        return { content: [{ type: "text", text: "No Gmail accounts connected." }] };
    const lines = data.map(row => {
        const tokens = row.value;
        const aliases = (tokens.aliases || []).filter(a => a !== tokens.email);
        return `- **${tokens.email}** (${tokens.timezone || "no timezone"})\n` +
            (aliases.length ? `  Aliases: ${aliases.join(", ")}` : "  No aliases");
    });
    return { content: [{ type: "text", text: `${data.length} Gmail account(s):\n${lines.join("\n")}` }] };
});
// ============================================================
// SEND & REPLY TRIGGERS
// ============================================================
server.tool("trigger_send", "Manually trigger the email send processor. This sends any scheduled emails that are due now.", {}, async () => {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
    try {
        const res = await fetch(`${appUrl}/api/send/process`, { method: "POST" });
        const data = await res.json();
        return { content: [{ type: "text", text: `Send processor result: ${JSON.stringify(data)}` }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Failed to trigger send: ${err instanceof Error ? err.message : "Unknown error"}` }] };
    }
});
server.tool("trigger_reply_check", "Manually check Gmail for replies to sent emails. Updates contact status and skips remaining steps.", {}, async () => {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
    try {
        const res = await fetch(`${appUrl}/api/gmail/check-replies`, { method: "POST" });
        const data = await res.json();
        return { content: [{ type: "text", text: `Reply check result: ${JSON.stringify(data)}` }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Failed to check replies: ${err instanceof Error ? err.message : "Unknown error"}` }] };
    }
});
// ============================================================
// EMAIL DETAIL
// ============================================================
server.tool("get_email_detail", "Get full details of a specific email including body, status, tracking, and reply info.", {
    email_id: z.string(),
}, async ({ email_id }) => {
    const { data, error } = await supabase
        .from("emails")
        .select("*, contacts(first_name, last_name, email), prospects(company_name)")
        .eq("id", email_id)
        .single();
    if (error || !data)
        return { content: [{ type: "text", text: "Email not found." }] };
    const contact = data.contacts;
    const prospect = data.prospects;
    return {
        content: [{
                type: "text",
                text: `**To:** ${contact?.first_name} ${contact?.last_name} (${contact?.email}) at ${prospect?.company_name}\n` +
                    `**Subject:** ${data.subject}\n` +
                    `**Approval:** ${data.approval_status} | **Send:** ${data.send_status}\n` +
                    `**Sent from:** ${data.sent_from || "not yet sent"}\n` +
                    `**Scheduled:** ${data.scheduled_for ? new Date(data.scheduled_for).toLocaleString() : "—"}\n` +
                    `**Sent at:** ${data.sent_at ? new Date(data.sent_at).toLocaleString() : "—"}\n` +
                    `**Opens:** ${data.open_count} | **Replied:** ${data.replied_at ? new Date(data.replied_at).toLocaleString() : "No"}\n` +
                    `${data.reply_snippet ? `**Reply:** ${data.reply_snippet}\n` : ""}` +
                    `${data.error_message ? `**Error:** ${data.error_message}\n` : ""}` +
                    `\n---\n${data.body}`,
            }],
    };
});
// ============================================================
// DELETE SEQUENCE
// ============================================================
server.tool("delete_sequence", "Delete a sequence and all its steps and emails. Only works for draft sequences.", {
    sequence_id: z.string(),
}, async ({ sequence_id }) => {
    const { data: seq } = await supabase.from("sequences").select("status, name").eq("id", sequence_id).single();
    if (!seq)
        return { content: [{ type: "text", text: "Sequence not found." }] };
    if (seq.status !== "draft") {
        return { content: [{ type: "text", text: `Cannot delete: sequence is "${seq.status}". Only draft sequences can be deleted.` }] };
    }
    const { error } = await supabase.from("sequences").delete().eq("id", sequence_id);
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Sequence "${seq.name}" deleted.` }] };
});
// ============================================================
// ANALYTICS & REPORTING
// ============================================================
server.tool("get_stats", "Get campaign stats or overall stats. Use this to report to the user on performance.", {
    campaign_id: z.string().optional().describe("Campaign ID (omit for overall stats)"),
}, async ({ campaign_id }) => {
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
});
server.tool("get_activity", "Get recent activity log with contact, company, campaign, and email details.", {
    limit: z.number().optional().describe("Max entries (default 10)"),
    campaign_id: z.string().optional().describe("Filter by campaign"),
}, async ({ limit, campaign_id }) => {
    let query = supabase
        .from("activity_log")
        .select("*, contacts(first_name, last_name, email), prospects(company_name), emails(subject)")
        .order("created_at", { ascending: false })
        .limit(limit || 10);
    if (campaign_id)
        query = query.eq("campaign_id", campaign_id);
    const { data, error } = await query;
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length)
        return { content: [{ type: "text", text: "No activity yet." }] };
    // Get campaign names
    const cIds = Array.from(new Set(data.filter(a => a.campaign_id).map(a => a.campaign_id)));
    const { data: campaigns } = cIds.length
        ? await supabase.from("campaigns").select("id, name").in("id", cIds)
        : { data: [] };
    const cMap = Object.fromEntries((campaigns || []).map(c => [c.id, c.name]));
    const lines = data.map(a => {
        const contact = a.contacts;
        const prospect = a.prospects;
        const email = a.emails;
        const details = a.details;
        const campaign = a.campaign_id ? cMap[a.campaign_id] : null;
        let line = `- **${a.action.replace(/_/g, " ")}**`;
        if (contact)
            line += ` → ${contact.first_name} ${contact.last_name} (${contact.email})`;
        if (prospect)
            line += ` at ${prospect.company_name}`;
        if (campaign)
            line += ` [${campaign}]`;
        if (email?.subject)
            line += ` — "${email.subject}"`;
        if (details?.snippet)
            line += `\n  Reply: "${details.snippet}"`;
        line += `\n  ${new Date(a.created_at).toLocaleString()}`;
        return line;
    });
    return { content: [{ type: "text", text: lines.join("\n\n") }] };
});
// ============================================================
// SETTINGS
// ============================================================
server.tool("get_settings", "Get app settings (Gmail accounts, sending config, timezone, send days)", {}, async () => {
    const { data } = await supabase.from("settings").select("*");
    // Gmail accounts
    const gmailRows = (data || []).filter(s => s.key.startsWith("gmail_tokens"));
    const gmailAccounts = gmailRows.map(r => {
        const t = r.value;
        return t.email || "unknown";
    });
    const sending = (data || []).find(s => s.key === "sending_defaults")?.value;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const sendDays = sending?.send_days ? JSON.parse(sending.send_days).map((d) => days[parseInt(d)]).join(", ") : "Mon-Fri";
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
});
server.tool("update_settings", "Update global sending settings (timezone, hours, days, limits)", {
    daily_limit_per_account: z.number().optional().describe("Max emails per Gmail account per day (default 25)"),
    send_interval_minutes: z.number().optional(),
    sending_hours_start: z.number().optional().describe("Hour 0-23"),
    sending_hours_end: z.number().optional().describe("Hour 0-23"),
    timezone: z.string().optional().describe("IANA timezone, e.g. America/Sao_Paulo"),
    send_days: z.array(z.string()).optional().describe("Days to send (0=Sun, 1=Mon, ..., 6=Sat)"),
}, async (updates) => {
    // Get existing to merge
    const { data: existing } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sending_defaults")
        .single();
    const value = existing?.value || {};
    if (updates.daily_limit_per_account !== undefined)
        value.daily_limit_per_account = String(updates.daily_limit_per_account);
    if (updates.send_interval_minutes !== undefined)
        value.send_interval = String(updates.send_interval_minutes);
    if (updates.sending_hours_start !== undefined)
        value.hours_start = String(updates.sending_hours_start);
    if (updates.sending_hours_end !== undefined)
        value.hours_end = String(updates.sending_hours_end);
    if (updates.timezone !== undefined)
        value.timezone = updates.timezone;
    if (updates.send_days !== undefined)
        value.send_days = JSON.stringify(updates.send_days);
    const { error } = await supabase.from("settings").upsert({ key: "sending_defaults", value });
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "Settings updated." }] };
});
server.tool("recalculate_sequence_schedule", "Recalculate email schedules for a sequence based on current settings (sender accounts, daily limits, send days). Use after changing campaign or global settings.", {
    sequence_id: z.string(),
}, async ({ sequence_id }) => {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
    try {
        const res = await fetch(`${appUrl}/api/sequences/${sequence_id}/recalculate`, { method: "POST" });
        const data = await res.json();
        if (!res.ok)
            return { content: [{ type: "text", text: `Error: ${data.error || "Recalculation failed"}` }] };
        return {
            content: [{
                    type: "text",
                    text: `Schedule recalculated: ${data.rescheduled} emails rescheduled.\nDaily capacity: ${data.daily_capacity} (${data.accounts} accounts × ${data.limit_per_account}/day)\n${data.schedule?.map((s) => `Step ${s.step}: ${s.count} emails, last day: ${s.day}`).join("\n") || ""}`,
                }],
        };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` }] };
    }
});
// ============================================================
// PROSPECT RESEARCH DOSSIERS
// ============================================================
server.tool("push_prospect_research", "Push structured research dossier for a prospect. This is the main way to upload detailed company intelligence.", {
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
}, async ({ prospect_id, campaign_id, ...research }) => {
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
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: "Research dossier updated." }] };
    }
    else {
        const { error } = await supabase.from("prospect_research").insert(record);
        if (error)
            return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: "Research dossier created." }] };
    }
});
server.tool("get_prospect_research", "Get the structured research dossier for a prospect.", {
    prospect_id: z.string(),
}, async ({ prospect_id }) => {
    const { data, error } = await supabase
        .from("prospect_research")
        .select("*")
        .eq("prospect_id", prospect_id)
        .single();
    if (error || !data)
        return { content: [{ type: "text", text: "No research dossier found for this prospect." }] };
    const pains = (data.pain_points || []);
    const personas = (data.personas || []);
    const competitors = (data.local_competitors || []);
    const hypotheses = (data.messaging_hypotheses || []);
    const objections = (data.objection_map || []);
    let text = `**Research Dossier** (${data.research_depth} depth, by ${data.researched_by})\n\n`;
    if (data.company_overview)
        text += `**Overview:** ${data.company_overview}\n\n`;
    if (data.market_position)
        text += `**Market Position:** ${data.market_position}\n\n`;
    if (data.recent_news)
        text += `**Recent News:** ${data.recent_news}\n\n`;
    if (data.core_value_prop)
        text += `**Core Value Prop:** ${data.core_value_prop}\n\n`;
    if (data.positioning_angle)
        text += `**Positioning:** ${data.positioning_angle}\n\n`;
    if (pains.length) {
        text += `**Pain Points:**\n${pains.map(p => `- [${p.severity.toUpperCase()}] ${p.pain} — ${p.evidence}`).join("\n")}\n\n`;
    }
    if (personas.length) {
        text += `**Personas:**\n${personas.map(p => `- ${p.name} (${p.title}) — Angle: ${p.messaging_angle}`).join("\n")}\n\n`;
    }
    if (competitors.length) {
        text += `**Local Competitors:**\n${competitors.map(c => `- ${c.company_name} (FOMO usable: ${c.fomo_usable ? "yes" : "no"})`).join("\n")}\n\n`;
    }
    if (data.fomo_strategy)
        text += `**FOMO Strategy:** ${data.fomo_strategy}\n\n`;
    if (hypotheses.length) {
        text += `**Messaging Hypotheses:**\n${hypotheses.map(h => `- [${h.confidence}] ${h.hypothesis}`).join("\n")}\n\n`;
    }
    if (objections.length) {
        text += `**Objection Map:**\n${objections.map(o => `- "${o.objection}" → ${o.response}`).join("\n")}\n\n`;
    }
    return { content: [{ type: "text", text }] };
});
// ============================================================
// EXPERIMENT ENGINE
// ============================================================
server.tool("create_experiment", "Create an A/B/C/D experiment to test a hypothesis. Claude should create experiments to systematically test what works.", {
    campaign_id: z.string().optional(),
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
// ============================================================
// GROWTH PLAYBOOK
// ============================================================
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
// ============================================================
// ANALYTICS
// ============================================================
server.tool("get_analytics", "Get analytics with optional grouping by metadata dimensions. Claude uses this to self-serve insights.", {
    campaign_id: z.string().optional(),
    group_by: z.string().optional().describe("Group by metadata dimension: 'fomo_style', 'tone', 'value_prop', 'subject_style', 'cta_style'"),
    experiment_id: z.string().optional(),
}, async ({ campaign_id, group_by, experiment_id }) => {
    let query = supabase
        .from("emails")
        .select("send_status, open_count, replied_at, metadata, experiment_id, variant_id, test_dimensions, prospect_id");
    if (experiment_id)
        query = query.eq("experiment_id", experiment_id);
    const { data: emails, error } = await query;
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!emails?.length)
        return { content: [{ type: "text", text: "No email data." }] };
    // Filter by campaign if needed
    let filtered = emails;
    if (campaign_id) {
        const { data: prospects } = await supabase.from("prospects").select("id").eq("campaign_id", campaign_id);
        const pIds = new Set((prospects || []).map(p => p.id));
        filtered = emails.filter(e => e.prospect_id && pIds.has(e.prospect_id));
    }
    if (group_by) {
        // Group by metadata dimension
        const groups = {};
        for (const e of filtered) {
            const meta = e.metadata;
            const dims = e.test_dimensions;
            const value = meta?.[group_by] || dims?.[group_by] || "unknown";
            if (!groups[value])
                groups[value] = { sent: 0, opened: 0, replied: 0 };
            if (e.send_status === "sent") {
                groups[value].sent++;
                if (e.open_count > 0)
                    groups[value].opened++;
                if (e.replied_at)
                    groups[value].replied++;
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
});
// Start
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("ProspectApp MCP server running");
}
main().catch(console.error);
