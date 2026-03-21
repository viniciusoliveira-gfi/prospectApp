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
server.tool("update_sequence_step", "Update a specific step's subject or body template", {
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
    return { content: [{ type: "text", text: `Step ${step_number} updated.` }] };
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
    // Get emails
    const { data: emails } = await supabase
        .from("emails")
        .select("id, approval_status, sequence_step_id")
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
    // Calculate schedules
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
        await supabase.from("emails").update({
            scheduled_for: scheduled.toISOString(),
            send_status: "scheduled",
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
                text: `Sequence started! ${emails.length} emails scheduled.\n\nSchedule:\n${scheduleLines.join("\n")}`,
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
server.tool("push_emails", "Push personalized emails into the approval queue for a specific sequence step.", {
    sequence_step_id: z.string().describe("Sequence step ID (get this from get_sequence_details)"),
    emails: z.array(z.object({
        contact_id: z.string(),
        prospect_id: z.string().optional(),
        subject: z.string().describe("Final subject line for this contact"),
        body: z.string().describe("Final email body for this contact"),
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
    }));
    const { data, error } = await supabase.from("emails").insert(records).select();
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: `Pushed ${data.length} emails to the approval queue.` }] };
});
server.tool("push_all_emails_for_sequence", "Push personalized emails for ALL contacts and ALL steps in a sequence at once. This is the easiest way to push a full email sequence. Provide emails grouped by step number.", {
    sequence_id: z.string().describe("Sequence ID"),
    emails: z.array(z.object({
        step_number: z.number().describe("Which step this email belongs to (1, 2, 3, etc.)"),
        contact_id: z.string(),
        prospect_id: z.string().optional(),
        subject: z.string(),
        body: z.string(),
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
        return `---\n**To:** ${contact?.first_name} ${contact?.last_name} at ${prospect?.company_name}\n**Subject:** ${e.subject}\n**Status:** ${e.approval_status} / ${e.send_status}\n**Opens:** ${e.open_count} | **Replied:** ${e.replied_at ? "Yes" : "No"}\n**ID:** ${e.id}`;
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
server.tool("get_activity", "Get recent activity log", {
    limit: z.number().optional().describe("Max entries (default 10)"),
}, async ({ limit }) => {
    const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit || 10);
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    if (!data?.length)
        return { content: [{ type: "text", text: "No activity yet." }] };
    const lines = data.map(a => `- ${a.action.replace(/_/g, " ")} — ${new Date(a.created_at).toLocaleString()}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
});
// ============================================================
// SETTINGS
// ============================================================
server.tool("get_settings", "Get app settings (Gmail connection, sending config)", {}, async () => {
    const { data } = await supabase.from("settings").select("*");
    const settings = Object.fromEntries((data || []).map(s => [s.key, s.value]));
    const gmail = settings.gmail_tokens;
    const sending = settings.sending_defaults;
    return {
        content: [{
                type: "text",
                text: `Gmail: ${gmail?.email ? `Connected (${gmail.email})` : "Not connected"}\n` +
                    `Daily limit: ${sending?.daily_limit || "25"}\n` +
                    `Send interval: ${sending?.send_interval || "60"} min\n` +
                    `Hours: ${sending?.hours_start || "9"}:00 - ${sending?.hours_end || "18"}:00`,
            }],
    };
});
server.tool("update_settings", "Update sending settings", {
    daily_send_limit: z.number().optional(),
    send_interval_minutes: z.number().optional(),
    sending_hours_start: z.number().optional(),
    sending_hours_end: z.number().optional(),
}, async (updates) => {
    const value = {};
    if (updates.daily_send_limit !== undefined)
        value.daily_limit = String(updates.daily_send_limit);
    if (updates.send_interval_minutes !== undefined)
        value.send_interval = String(updates.send_interval_minutes);
    if (updates.sending_hours_start !== undefined)
        value.hours_start = String(updates.sending_hours_start);
    if (updates.sending_hours_end !== undefined)
        value.hours_end = String(updates.sending_hours_end);
    const { error } = await supabase.from("settings").upsert({ key: "sending_defaults", value });
    if (error)
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
    return { content: [{ type: "text", text: "Settings updated." }] };
});
// Start
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("ProspectApp MCP server running");
}
main().catch(console.error);
