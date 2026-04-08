import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";
import { syncCampaignStatus, batchUpdate } from "../helpers.js";

export function registerSequenceTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "list_sequences",
    "List sequences in a campaign with their steps",
    {
      campaign_id: z.string(),
    },
    async ({ campaign_id }) => {
      const { data, error } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("campaign_id", campaign_id)
        .order("created_at", { ascending: false });

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      if (!data?.length) return { content: [{ type: "text", text: "No sequences in this campaign." }] };

      const lines = data.map(seq => {
        const steps = ((seq.sequence_steps || []) as { step_number: number; subject_template: string; delay_days: number; id: string }[])
          .sort((a, b) => a.step_number - b.step_number);
        const stepLines = steps.map(s =>
          `    Step ${s.step_number} (day ${s.delay_days}): "${s.subject_template}" — ID: ${s.id}`
        );
        return `- **${seq.name}** [${seq.status}] (ID: ${seq.id})\n${stepLines.join("\n")}`;
      });
      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    }
  );

  server.tool(
    "get_sequence_details",
    "Get full details of a sequence including all step IDs. Use this to get step IDs before pushing emails.",
    {
      sequence_id: z.string(),
    },
    async ({ sequence_id }) => {
      const { data, error } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      const steps = ((data.sequence_steps || []) as { id: string; step_number: number; delay_days: number; subject_template: string; body_template: string }[])
        .sort((a, b) => a.step_number - b.step_number);

      const stepLines = steps.map(s =>
        `Step ${s.step_number} (day ${s.delay_days}):\n  Subject: "${s.subject_template}"\n  Body: "${s.body_template}"\n  Step ID: ${s.id}`
      );

      return {
        content: [{
          type: "text",
          text: `**${data.name}** [${data.status}]\nSequence ID: ${data.id}\n\n${stepLines.join("\n\n")}`,
        }],
      };
    }
  );

  server.tool(
    "create_sequence",
    "Create an email sequence with steps. Push the email templates/copies you've written with the user.",
    {
      campaign_id: z.string(),
      name: z.string().describe("Sequence name"),
      steps: z.array(z.object({
        delay_days: z.number().describe("Days after previous step (0 for first)"),
        subject_template: z.string().describe("Subject line template (supports {{first_name}}, {{company_name}}, etc.)"),
        body_template: z.string().describe("Email body template"),
      })),
    },
    async ({ campaign_id, name, steps }) => {
      const { data: sequence, error } = await supabase
        .from("sequences")
        .insert({ campaign_id, name })
        .select()
        .single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

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
    }
  );

  server.tool(
    "update_sequence_step",
    "Update a specific step's subject, body template, or delay_days. If delay_days changes, all unsent emails are automatically rescheduled.",
    {
      sequence_id: z.string(),
      step_number: z.number().describe("Which step to update (1, 2, 3, etc.)"),
      subject_template: z.string().optional(),
      body_template: z.string().optional(),
      delay_days: z.number().optional(),
    },
    async ({ sequence_id, step_number, ...updates }) => {
      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const { data, error } = await supabase
        .from("sequence_steps")
        .update(clean)
        .eq("sequence_id", sequence_id)
        .eq("step_number", step_number)
        .select()
        .single();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      // If delay_days changed, tell user to recalculate
      let recalcNote = "";
      if (updates.delay_days !== undefined) {
        recalcNote = " delay_days changed — run recalculate_sequence_schedule to update email schedules.";
      }

      return { content: [{ type: "text", text: `Step ${step_number} updated.${recalcNote}` }] };
    }
  );

  server.tool(
    "delete_sequence",
    "Delete a sequence and all its steps and emails. Cannot delete active sequences — pause or stop them first.",
    {
      sequence_id: z.string(),
    },
    async ({ sequence_id }) => {
      const { data: seq } = await supabase.from("sequences").select("status, name").eq("id", sequence_id).single();
      if (!seq) return { content: [{ type: "text", text: "Sequence not found." }] };
      if (seq.status === "active") {
        return { content: [{ type: "text", text: `Cannot delete: sequence is active. Pause it first, then delete.` }] };
      }

      const { error } = await supabase.from("sequences").delete().eq("id", sequence_id);
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `Sequence "${seq.name}" deleted.` }] };
    }
  );

  server.tool(
    "start_sequence",
    "Start a sequence — schedules all approved emails for delivery. All emails must be approved first.",
    {
      sequence_id: z.string().describe("Sequence ID to start"),
    },
    async ({ sequence_id }) => {
      // Get sequence with steps
      const { data: sequence, error: seqErr } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();

      if (seqErr || !sequence) return { content: [{ type: "text", text: "Sequence not found." }] };
      if (sequence.status !== "draft") {
        return { content: [{ type: "text", text: `Cannot start: sequence is "${sequence.status}", must be "draft".` }] };
      }

      const steps = ((sequence.sequence_steps || []) as { id: string; step_number: number; delay_days: number }[])
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

      // Get campaign send settings
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("send_settings, sending_account, daily_send_limit")
        .eq("id", sequence.campaign_id)
        .single();

      const ss = (campaign?.send_settings || {}) as {
        sender_accounts?: string[];
        send_days?: string[];
        send_hours_start?: number;
        daily_limit_per_account?: number;
        timezone?: string;
      };

      // Get global settings as fallback
      const { data: globalSettings } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sending_defaults")
        .single();

      const g = (globalSettings?.value || {}) as Record<string, string>;

      let senderAccounts = ss.sender_accounts?.length
        ? ss.sender_accounts
        : campaign?.sending_account ? [campaign.sending_account] : [];

      if (!senderAccounts.length) {
        const { data: gmail } = await supabase.from("settings").select("value").eq("key", "gmail_tokens").single();
        if (gmail?.value) {
          const t = gmail.value as { email?: string };
          if (t.email) senderAccounts = [t.email];
        }
      }
      if (!senderAccounts.length) senderAccounts = ["_default"];

      const dailyLimitPerAccount = ss.daily_limit_per_account
        || parseInt(g.daily_limit_per_account || g.daily_limit || "25");

      const sendDays = ss.send_days?.length
        ? ss.send_days
        : g.send_days ? JSON.parse(g.send_days) : ["1", "2", "3", "4", "5"];

      const hoursStart = ss.send_hours_start ?? parseInt(g.hours_start || "9");
      const timezone = ss.timezone || g.timezone || "America/Sao_Paulo";
      const dailyCapacity = senderAccounts.length * dailyLimitPerAccount;

      // Assign senders: same per prospect, distributed evenly
      const prospectSenderMap: Record<string, string> = {};
      const senderCounts: Record<string, number> = {};

      for (const email of emails) {
        let sender: string | null = null;
        if (senderAccounts.length) {
          const key = email.prospect_id || email.contact_id;
          if (prospectSenderMap[key]) {
            sender = prospectSenderMap[key];
          } else {
            const sorted = [...senderAccounts].sort((a, b) => (senderCounts[a] || 0) - (senderCounts[b] || 0));
            sender = sorted[0];
            prospectSenderMap[key] = sender!;
          }
          senderCounts[sender!] = (senderCounts[sender!] || 0) + 1;
        }

        // Set emails to scheduled with sender, but no date yet — recalculate below
        await supabase.from("emails").update({
          send_status: "scheduled",
          scheduled_for: null,
          sent_from: sender,
        }).eq("id", email.id);
      }

      const now = new Date();

      // Set sequence to active
      await supabase.from("sequences").update({
        status: "active",
        started_at: now.toISOString(),
      }).eq("id", sequence_id);

      // Now use proper scheduling logic (same as recalculate_sequence_schedule)
      const tzBase = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

      function nextSendDay(from: Date, addDays: number): Date {
        const target = new Date(from);
        target.setDate(target.getDate() + addDays);
        target.setHours(hoursStart, 0, 0, 0);
        let safety = 0;
        while (!sendDays.includes(String(target.getDay())) && safety < 7) {
          target.setDate(target.getDate() + 1);
          safety++;
        }
        return target;
      }

      // Group emails by step for scheduling
      const emailsByStep: Record<string, typeof emails> = {};
      for (const step of steps) {
        emailsByStep[step.id] = emails.filter(e => e.sequence_step_id === step.id);
      }

      const scheduleLines: string[] = [];
      const toSchedule: { id: string; updates: Record<string, unknown> }[] = [];

      for (const step of steps) {
        const stepEmails = emailsByStep[step.id] || [];
        if (!stepEmails.length) continue;

        let currentDate = nextSendDay(tzBase, step.delay_days);
        let assignedToday = 0;

        for (const email of stepEmails) {
          if (assignedToday >= dailyCapacity) {
            currentDate = nextSendDay(currentDate, 1);
            assignedToday = 0;
          }

          toSchedule.push({
            id: email.id,
            updates: { scheduled_for: currentDate.toISOString(), send_status: "scheduled" },
          });

          assignedToday++;
        }

        scheduleLines.push(`  Step ${step.step_number} (day ${step.delay_days}): ${stepEmails.length} emails, starts ${currentDate.toLocaleDateString()}`);
      }

      // Apply schedules in batch
      await batchUpdate(supabase, toSchedule, "emails");

      await syncCampaignStatus(supabase, sequence.campaign_id);

      return {
        content: [{
          type: "text",
          text: `Sequence started! ${emails.length} emails scheduled.\nSender accounts: ${senderAccounts.filter(a => a !== "_default").join(", ") || "default"}\nDaily capacity: ${dailyCapacity} (${senderAccounts.length} accounts × ${dailyLimitPerAccount}/day)\nSend days: ${sendDays.join(", ")} | Start hour: ${hoursStart}h (${timezone})\n\nSchedule:\n${scheduleLines.join("\n")}`,
        }],
      };
    }
  );

  server.tool(
    "pause_sequence",
    "Pause an active sequence. Scheduled emails will not be sent until resumed.",
    {
      sequence_id: z.string(),
    },
    async ({ sequence_id }) => {
      const { data: sequence } = await supabase.from("sequences").select("status, campaign_id").eq("id", sequence_id).single();
      if (!sequence) return { content: [{ type: "text", text: "Sequence not found." }] };
      if (sequence.status !== "active") {
        return { content: [{ type: "text", text: `Cannot pause: sequence is "${sequence.status}", must be "active".` }] };
      }

      await supabase.from("sequences").update({
        status: "paused",
        paused_at: new Date().toISOString(),
      }).eq("id", sequence_id);

      await syncCampaignStatus(supabase, sequence.campaign_id);

      return { content: [{ type: "text", text: "Sequence paused. No further emails will be sent until resumed." }] };
    }
  );

  server.tool(
    "resume_sequence",
    "Resume a paused sequence. Schedules are shifted forward by the pause duration.",
    {
      sequence_id: z.string(),
    },
    async ({ sequence_id }) => {
      const { data: sequence } = await supabase.from("sequences").select("*").eq("id", sequence_id).single();
      if (!sequence) return { content: [{ type: "text", text: "Sequence not found." }] };
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

      await syncCampaignStatus(supabase, sequence.campaign_id);

      return {
        content: [{
          type: "text",
          text: `Sequence resumed. ${rescheduled} emails rescheduled (shifted forward by ${Math.round(pauseDurationMs / 3600000)} hours).`,
        }],
      };
    }
  );

  server.tool(
    "get_sequence_status",
    "Get detailed status of a sequence including per-step progress and scheduling info.",
    {
      sequence_id: z.string(),
    },
    async ({ sequence_id }) => {
      const { data: sequence, error } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();

      if (error || !sequence) return { content: [{ type: "text", text: "Sequence not found." }] };

      const steps = ((sequence.sequence_steps || []) as { id: string; step_number: number; delay_days: number; subject_template: string }[])
        .sort((a, b) => a.step_number - b.step_number);

      const stepLines: string[] = [];
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
          .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())[0];

        totalSent += sent;
        totalScheduled += scheduled;
        totalFailed += failed;
        totalSkipped += skipped;

        stepLines.push(
          `**Step ${step.step_number}** (day ${step.delay_days}): "${step.subject_template}"` +
          `\n  Sent: ${sent} | Scheduled: ${scheduled} | Failed: ${failed} | Skipped: ${skipped}` +
          `\n  Opens: ${opens} | Replies: ${replies}` +
          (nextScheduled ? `\n  Next send: ${new Date(nextScheduled.scheduled_for!).toLocaleString()}` : "")
        );
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
    }
  );

  server.tool(
    "recalculate_sequence_schedule",
    "Recalculate email schedules for a sequence based on current settings (sender accounts, daily limits, send days). Use after changing campaign or global settings, or after updating step delay_days.",
    {
      sequence_id: z.string(),
    },
    async ({ sequence_id }) => {
      // Get sequence with steps
      const { data: sequence, error: seqErr } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("id", sequence_id)
        .single();

      if (seqErr || !sequence) return { content: [{ type: "text", text: "Sequence not found." }] };

      // Get campaign settings
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("send_settings, sending_account, daily_send_limit")
        .eq("id", sequence.campaign_id)
        .single();

      const ss = (campaign?.send_settings || {}) as {
        sender_accounts?: string[];
        send_days?: string[];
        send_hours_start?: number;
        daily_limit_per_account?: number;
        timezone?: string;
      };

      // Get global settings as fallback
      const { data: globalSettings } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sending_defaults")
        .single();

      const g = (globalSettings?.value || {}) as Record<string, string>;

      const senderAccounts = ss.sender_accounts?.length
        ? ss.sender_accounts
        : campaign?.sending_account ? [campaign.sending_account] : ["_default"];

      const dailyLimitPerAccount = ss.daily_limit_per_account
        || parseInt(g.daily_limit_per_account || g.daily_limit || "25");

      const sendDays = ss.send_days?.length
        ? ss.send_days
        : g.send_days ? JSON.parse(g.send_days) : ["1", "2", "3", "4", "5"];

      const hoursStart = ss.send_hours_start ?? parseInt(g.hours_start || "9");
      const timezone = ss.timezone || g.timezone || "America/Sao_Paulo";
      const dailyCapacity = senderAccounts.length * dailyLimitPerAccount;

      // Get steps sorted
      const steps = ((sequence.sequence_steps || []) as { id: string; step_number: number; delay_days: number }[])
        .sort((a, b) => a.step_number - b.step_number);

      if (!steps.length) return { content: [{ type: "text", text: "No steps found." }] };

      // Get unsent emails
      const stepIds = steps.map(s => s.id);
      const { data: emails } = await supabase
        .from("emails")
        .select("id, sequence_step_id")
        .in("sequence_step_id", stepIds)
        .in("send_status", ["queued", "scheduled"]);

      if (!emails?.length) return { content: [{ type: "text", text: "No unsent emails to schedule." }] };

      // Base date: use sequence started_at or now
      const baseDate = sequence.started_at ? new Date(sequence.started_at) : new Date();
      const tzBase = new Date(baseDate.toLocaleString("en-US", { timeZone: timezone }));

      // Helper: find next valid send day
      function nextSendDay(from: Date, addDays: number): Date {
        const target = new Date(from);
        target.setDate(target.getDate() + addDays);
        target.setHours(hoursStart, 0, 0, 0);
        let safety = 0;
        while (!sendDays.includes(String(target.getDay())) && safety < 7) {
          target.setDate(target.getDate() + 1);
          safety++;
        }
        return target;
      }

      // Group emails by step
      const emailsByStep: Record<string, typeof emails> = {};
      for (const step of steps) {
        emailsByStep[step.id] = emails.filter(e => e.sequence_step_id === step.id);
      }

      let totalRescheduled = 0;
      const scheduleLines: string[] = [];

      const toSchedule: { id: string; updates: Record<string, unknown> }[] = [];

      for (const step of steps) {
        const stepEmails = emailsByStep[step.id] || [];
        if (!stepEmails.length) continue;

        let currentDate = nextSendDay(tzBase, step.delay_days);
        let assignedToday = 0;

        for (const email of stepEmails) {
          if (assignedToday >= dailyCapacity) {
            currentDate = nextSendDay(currentDate, 1);
            assignedToday = 0;
          }

          toSchedule.push({
            id: email.id,
            updates: { scheduled_for: currentDate.toISOString(), send_status: "scheduled" },
          });

          assignedToday++;
          totalRescheduled++;
        }

        scheduleLines.push(`Step ${step.step_number} (day ${step.delay_days}): ${stepEmails.length} emails, sends ${currentDate.toLocaleDateString()}`);
      }

      await batchUpdate(supabase, toSchedule, "emails");

      return {
        content: [{
          type: "text",
          text: `Schedule recalculated: ${totalRescheduled} emails rescheduled.\nDaily capacity: ${dailyCapacity} (${senderAccounts.length} accounts × ${dailyLimitPerAccount}/day)\n\n${scheduleLines.join("\n")}`,
        }],
      };
    }
  );

  server.tool(
    "recalculate_campaign_schedule",
    "Recalculate schedules for ALL sequences in a campaign, distributing emails across days so no day exceeds total daily capacity. Respects send days, per-account limits, and step ordering.",
    {
      campaign_id: z.string(),
    },
    async ({ campaign_id }) => {
      // 1. Get campaign settings
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("name, send_settings, sending_account, daily_send_limit")
        .eq("id", campaign_id)
        .single();

      if (!campaign) return { content: [{ type: "text", text: "Campaign not found." }] };

      const ss = (campaign.send_settings || {}) as {
        sender_accounts?: string[];
        send_days?: string[];
        send_hours_start?: number;
        daily_limit_per_account?: number;
        timezone?: string;
      };

      const { data: globalSettings } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sending_defaults")
        .single();

      const g = (globalSettings?.value || {}) as Record<string, string>;

      const senderAccounts = ss.sender_accounts?.length
        ? ss.sender_accounts
        : campaign.sending_account ? [campaign.sending_account] : ["_default"];

      const dailyLimitPerAccount = ss.daily_limit_per_account
        || parseInt(g.daily_limit_per_account || g.daily_limit || "25");

      const sendDays = ss.send_days?.length
        ? ss.send_days
        : g.send_days ? JSON.parse(g.send_days) : ["1", "2", "3", "4", "5"];

      const hoursStart = ss.send_hours_start ?? parseInt(g.hours_start || "9");
      const timezone = ss.timezone || g.timezone || "America/Sao_Paulo";
      const totalDailyCapacity = senderAccounts.length * dailyLimitPerAccount;

      // 2. Get all sequences in this campaign
      const { data: sequences } = await supabase
        .from("sequences")
        .select("*, sequence_steps(*)")
        .eq("campaign_id", campaign_id)
        .in("status", ["active", "draft"]);

      if (!sequences?.length) return { content: [{ type: "text", text: "No active/draft sequences in this campaign." }] };

      // 3. Gather ALL unsent emails across all sequences with step info
      interface EmailToSchedule {
        id: string;
        sequence_id: string;
        step_id: string;
        step_number: number;
        delay_days: number;
        contact_id: string;
      }

      const allEmails: EmailToSchedule[] = [];
      const sequenceInfo: { id: string; name: string; started_at: string | null }[] = [];

      for (const seq of sequences) {
        const steps = ((seq.sequence_steps || []) as { id: string; step_number: number; delay_days: number }[])
          .sort((a, b) => a.step_number - b.step_number);

        if (!steps.length) continue;

        sequenceInfo.push({ id: seq.id, name: seq.name, started_at: seq.started_at });

        const stepIds = steps.map(s => s.id);
        const { data: emails } = await supabase
          .from("emails")
          .select("id, sequence_step_id, contact_id, scheduled_for")
          .in("sequence_step_id", stepIds)
          .in("send_status", ["queued", "scheduled"]);

        for (const email of (emails || [])) {
          const step = steps.find(s => s.id === email.sequence_step_id);
          if (!step) continue;
          allEmails.push({
            id: email.id,
            sequence_id: seq.id,
            step_id: step.id,
            step_number: step.step_number,
            delay_days: step.delay_days,
            contact_id: email.contact_id,
          });
        }
      }

      if (!allEmails.length) return { content: [{ type: "text", text: "No unsent emails to schedule." }] };

      // 4. Helper functions
      // Use tomorrow as base for step 1 (today's sends are already handled by the send processor)
      const now = new Date();
      const tzNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const tzTomorrow = new Date(tzNow);
      tzTomorrow.setDate(tzTomorrow.getDate() + 1);
      tzTomorrow.setHours(hoursStart, 0, 0, 0);
      const tzBase = new Date(tzTomorrow);

      // Clamp any date to tomorrow if it's in the past
      function clampToFuture(d: Date): Date {
        return d < tzTomorrow ? new Date(tzTomorrow) : d;
      }

      function nextSendDay(from: Date, addDays: number): Date {
        const target = new Date(from);
        target.setDate(target.getDate() + addDays);
        target.setHours(hoursStart, 0, 0, 0);
        let safety = 0;
        while (!sendDays.includes(String(target.getDay())) && safety < 7) {
          target.setDate(target.getDate() + 1);
          safety++;
        }
        return target;
      }

      function dateKey(d: Date): string {
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }

      // 5. Schedule Step 1 first, then cascade later steps per contact

      // Group emails by contact_id, then sort steps within each contact
      const emailsByContact = new Map<string, EmailToSchedule[]>();
      for (const email of allEmails) {
        if (!emailsByContact.has(email.contact_id)) emailsByContact.set(email.contact_id, []);
        emailsByContact.get(email.contact_id)!.push(email);
      }
      // Sort each contact's emails by step_number
      for (const [, contactEmails] of Array.from(emailsByContact)) {
        contactEmails.sort((a, b) => a.step_number - b.step_number);
      }

      // Separate step 1 emails from later steps
      const step1Emails: EmailToSchedule[] = [];
      const laterEmails = new Map<string, EmailToSchedule[]>(); // contact_id -> [step 2, 3, 4...]
      for (const [contactId, contactEmails] of Array.from(emailsByContact)) {
        for (const email of contactEmails) {
          if (email.step_number === 1) {
            step1Emails.push(email);
          } else {
            if (!laterEmails.has(contactId)) laterEmails.set(contactId, []);
            laterEmails.get(contactId)!.push(email);
          }
        }
      }

      // Track capacity per day (key = dateKey)
      const dayCapacity = new Map<string, number>();
      function getAvailableDay(startFrom: Date): Date {
        let candidate = new Date(startFrom);
        candidate.setHours(hoursStart, 0, 0, 0);
        // Ensure it's a send day
        let safety = 0;
        while (!sendDays.includes(String(candidate.getDay())) && safety < 7) {
          candidate.setDate(candidate.getDate() + 1);
          safety++;
        }
        // Find a day with capacity
        safety = 0;
        while ((dayCapacity.get(dateKey(candidate)) || 0) >= totalDailyCapacity && safety < 365) {
          candidate.setDate(candidate.getDate() + 1);
          // Skip non-send days
          while (!sendDays.includes(String(candidate.getDay()))) {
            candidate.setDate(candidate.getDate() + 1);
          }
          safety++;
        }
        return candidate;
      }

      function assignToDay(d: Date) {
        const key = dateKey(d);
        dayCapacity.set(key, (dayCapacity.get(key) || 0) + 1);
      }

      // Track per-contact step dates for cadence enforcement
      const contactStepDates = new Map<string, Map<number, Date>>(); // contact_id -> step_number -> date

      const campaignToSchedule: { id: string; updates: Record<string, unknown> }[] = [];
      let totalRescheduled = 0;

      // 6. Schedule all Step 1 emails, filling days up to capacity
      const step1Start = clampToFuture(nextSendDay(tzBase, 0));
      for (const email of step1Emails) {
        const sendDate = getAvailableDay(step1Start);
        assignToDay(sendDate);

        campaignToSchedule.push({
          id: email.id,
          updates: { scheduled_for: sendDate.toISOString(), send_status: "scheduled" },
        });

        if (!contactStepDates.has(email.contact_id)) contactStepDates.set(email.contact_id, new Map());
        contactStepDates.get(email.contact_id)!.set(email.step_number, new Date(sendDate));
        totalRescheduled++;
      }

      // 7. Schedule later steps per contact, respecting cadence + capacity
      // Get all unique step configs across sequences for delay gap calculation
      const stepConfigs: { step_number: number; delay_days: number }[] = [];
      for (const seq of sequences) {
        const steps = ((seq.sequence_steps || []) as { id: string; step_number: number; delay_days: number }[]);
        for (const s of steps) {
          if (!stepConfigs.find(sc => sc.step_number === s.step_number)) {
            stepConfigs.push(s);
          }
        }
      }
      stepConfigs.sort((a, b) => a.step_number - b.step_number);

      // For contacts whose step 1 was already sent, look up their sent dates
      for (const [contactId] of Array.from(laterEmails)) {
        if (contactStepDates.has(contactId)) continue; // already scheduled step 1 above

        // Find sent emails for this contact to get their step dates
        const allStepIds: string[] = [];
        for (const seq of sequences) {
          const steps = ((seq.sequence_steps || []) as { id: string }[]);
          allStepIds.push(...steps.map(s => s.id));
        }

        const { data: sentForContact } = await supabase
          .from("emails")
          .select("sequence_step_id, sent_at, scheduled_for")
          .eq("contact_id", contactId)
          .eq("send_status", "sent")
          .in("sequence_step_id", allStepIds);

        if (sentForContact?.length) {
          const stepMap = new Map<number, Date>();
          for (const sent of sentForContact) {
            // Find step number for this step ID
            for (const seq of sequences) {
              const steps = ((seq.sequence_steps || []) as { id: string; step_number: number }[]);
              const step = steps.find(s => s.id === sent.sequence_step_id);
              if (step) {
                const date = sent.sent_at ? new Date(sent.sent_at) : sent.scheduled_for ? new Date(sent.scheduled_for) : null;
                if (date) stepMap.set(step.step_number, date);
              }
            }
          }
          if (stepMap.size) contactStepDates.set(contactId, stepMap);
        }
      }

      for (const [contactId, contactLaterEmails] of Array.from(laterEmails)) {
        const stepDates = contactStepDates.get(contactId);
        if (!stepDates) {
          // No step history at all — schedule from base date
          let fallbackDate = getAvailableDay(tzBase);
          for (const email of contactLaterEmails) {
            assignToDay(fallbackDate);
            campaignToSchedule.push({
              id: email.id,
              updates: { scheduled_for: fallbackDate.toISOString(), send_status: "scheduled" },
            });
            totalRescheduled++;
            fallbackDate = getAvailableDay(new Date(fallbackDate.getTime() + 86400000));
          }
          continue;
        }

        for (const email of contactLaterEmails) {
          // Find the previous step's date for this contact
          const prevStepDate = stepDates.get(email.step_number - 1);
          if (!prevStepDate) continue;

          // Calculate gap: this step's delay_days - previous step's delay_days
          const thisStepConfig = stepConfigs.find(s => s.step_number === email.step_number);
          const prevStepConfig = stepConfigs.find(s => s.step_number === email.step_number - 1);
          const gap = (thisStepConfig?.delay_days || 0) - (prevStepConfig?.delay_days || 0);

          // Earliest date = previous step date + gap days, clamped to future
          const earliestDate = clampToFuture(nextSendDay(prevStepDate, gap));
          const sendDate = getAvailableDay(earliestDate);
          assignToDay(sendDate);

          campaignToSchedule.push({
            id: email.id,
            updates: { scheduled_for: sendDate.toISOString(), send_status: "scheduled" },
          });

          stepDates.set(email.step_number, new Date(sendDate));
          totalRescheduled++;
        }
      }

      await batchUpdate(supabase, campaignToSchedule, "emails");

      // 8. Build day-by-day report
      const warnings: string[] = [];
      const sortedDays = Array.from(dayCapacity.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      const totalEmails = allEmails.length;
      if (totalEmails > totalDailyCapacity * 5) {
        warnings.push(`High volume: ${totalEmails} emails across ${sortedDays.length} send days`);
      }

      let report = `**${campaign.name}** — Campaign Schedule Recalculated\n\n`;
      report += `**Capacity:** ${totalDailyCapacity}/day (${senderAccounts.length} accounts × ${dailyLimitPerAccount}/day)\n`;
      report += `**Emails:** ${totalRescheduled} rescheduled across ${sequenceInfo.length} sequence(s)\n`;
      report += `**Contacts:** ${emailsByContact.size}\n`;
      report += `**Send days:** ${sendDays.map((d: string) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][parseInt(d)]).join(", ")}\n`;
      report += `**Timezone:** ${timezone}\n`;
      report += `**Total send days needed:** ${sortedDays.length}\n\n`;

      report += `**Day-by-day plan:**\n`;
      for (const [key, count] of sortedDays) {
        const parts = key.split("-").map(Number);
        const d = new Date(parts[0], parts[1], parts[2]);
        report += `  ${d.toLocaleDateString()}: ${count} emails\n`;
      }

      if (warnings.length) {
        report += `\n**Warnings:**\n${warnings.map(w => `  ⚠ ${w}`).join("\n")}`;
      }

      return { content: [{ type: "text", text: report }] };
    }
  );
}
