import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";
import { batchUpdate } from "../helpers.js";

export function registerEmailTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "push_emails",
    "Push personalized emails into the approval queue for a specific sequence step. Include metadata for strategy tracking and experiment tags.",
    {
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
    },
    async ({ sequence_step_id, emails }) => {
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
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      // If the sequence is active, auto-schedule the new emails
      let scheduleNote = "";
      const { data: stepData } = await supabase
        .from("sequence_steps")
        .select("sequence_id, delay_days")
        .eq("id", sequence_step_id)
        .single();

      if (stepData) {
        const { data: seq } = await supabase.from("sequences").select("status, started_at, campaign_id").eq("id", stepData.sequence_id).single();
        if (seq?.status === "active" && seq.started_at) {
          // Find what date other emails in this step are scheduled for
          const { data: existingScheduled } = await supabase
            .from("emails")
            .select("scheduled_for")
            .eq("sequence_step_id", sequence_step_id)
            .eq("send_status", "scheduled")
            .not("scheduled_for", "is", null)
            .limit(1);

          if (existingScheduled?.length && existingScheduled[0].scheduled_for) {
            // Use the same date as other emails in this step
            const schedDate = existingScheduled[0].scheduled_for;
            for (const email of data) {
              await supabase.from("emails").update({
                send_status: "scheduled",
                scheduled_for: schedDate,
              }).eq("id", email.id);
            }
            scheduleNote = ` Auto-scheduled for ${new Date(schedDate).toLocaleDateString()}.`;
          }
        }
      }

      return { content: [{ type: "text", text: `Pushed ${data.length} emails to the approval queue.${scheduleNote}` }] };
    }
  );

  server.tool(
    "push_all_emails_for_sequence",
    "Push personalized emails for ALL contacts and ALL steps in a sequence at once. Include metadata for strategy tracking and experiment tags.",
    {
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
    },
    async ({ sequence_id, emails }) => {
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
        if (!stepId) return null;
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
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      // If the sequence is active, auto-schedule new emails by matching existing step dates
      let scheduleNote = "";
      const { data: seq } = await supabase.from("sequences").select("status, started_at").eq("id", sequence_id).single();
      if (seq?.status === "active" && seq.started_at) {
        let scheduled = 0;
        for (const step of steps) {
          const { data: existingScheduled } = await supabase
            .from("emails")
            .select("scheduled_for")
            .eq("sequence_step_id", step.id)
            .eq("send_status", "scheduled")
            .not("scheduled_for", "is", null)
            .limit(1);

          if (existingScheduled?.length && existingScheduled[0].scheduled_for) {
            const stepEmails = data.filter((e: { sequence_step_id: string }) => e.sequence_step_id === step.id);
            for (const email of stepEmails) {
              await supabase.from("emails").update({
                send_status: "scheduled",
                scheduled_for: existingScheduled[0].scheduled_for,
              }).eq("id", email.id);
              scheduled++;
            }
          }
        }
        if (scheduled > 0) scheduleNote = ` Auto-scheduled ${scheduled} emails to match existing step dates.`;
      }

      return { content: [{ type: "text", text: `Pushed ${data.length} emails across ${steps.length} steps to the approval queue.${scheduleNote}` }] };
    }
  );

  server.tool(
    "list_emails",
    "List emails with their approval and send status",
    {
      campaign_id: z.string().optional(),
      approval_status: z.enum(["pending", "approved", "rejected", "edited"]).optional(),
      send_status: z.enum(["queued", "scheduled", "sending", "sent", "failed", "skipped"]).optional(),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ campaign_id, approval_status, send_status, limit }) => {
      let query = supabase
        .from("emails")
        .select("*, contacts(first_name, last_name, email), prospects(company_name)")
        .order("created_at", { ascending: false })
        .limit(limit || 20);

      if (approval_status) query = query.eq("approval_status", approval_status);
      if (send_status) query = query.eq("send_status", send_status);

      const { data, error } = await query;
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      if (!data?.length) return { content: [{ type: "text", text: "No emails found matching filters." }] };

      const lines = data.map(e => {
        const contact = e.contacts as unknown as { first_name: string; last_name: string; email: string };
        const prospect = e.prospects as unknown as { company_name: string };
        return `---\n**To:** ${contact?.first_name} ${contact?.last_name} at ${prospect?.company_name}\n**Subject:** ${e.subject}\n**Status:** ${e.approval_status} / ${e.send_status}${e.sent_from ? ` | **From:** ${e.sent_from}` : ""}\n**Opens:** ${e.open_count} | **Replied:** ${e.replied_at ? "Yes" : "No"}\n**ID:** ${e.id}`;
      });
      return { content: [{ type: "text", text: `${data.length} emails:\n${lines.join("\n\n")}` }] };
    }
  );

  server.tool(
    "get_email_detail",
    "Get full details of a specific email including body, status, tracking, and reply info.",
    {
      email_id: z.string(),
    },
    async ({ email_id }) => {
      const { data, error } = await supabase
        .from("emails")
        .select("*, contacts(first_name, last_name, email), prospects(company_name)")
        .eq("id", email_id)
        .single();

      if (error || !data) return { content: [{ type: "text", text: "Email not found." }] };

      const contact = data.contacts as unknown as { first_name: string; last_name: string; email: string };
      const prospect = data.prospects as unknown as { company_name: string };

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
    }
  );

  server.tool(
    "update_email",
    "Edit an email's subject, body, status, or reply state. Set replied=false to clear false reply detection.",
    {
      email_id: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
      approval_status: z.enum(["pending", "approved", "rejected", "edited"]).optional(),
      send_status: z.enum(["queued", "scheduled", "sent", "failed", "skipped"]).optional().describe("Manually correct send status"),
      replied: z.boolean().optional().describe("true = mark as replied (sets replied_at to NOW), false = clear reply (resets replied_at, reply_snippet)"),
    },
    async ({ email_id, replied, ...updates }) => {
      const clean: Record<string, unknown> = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      if (clean.approval_status === "approved") clean.approved_at = new Date().toISOString();

      // Handle replied flag
      if (replied === false) {
        clean.replied_at = null;
        clean.reply_snippet = null;
      } else if (replied === true) {
        // Only set if not already replied
        const { data: existing } = await supabase.from("emails").select("replied_at, contact_id").eq("id", email_id).single();
        if (existing && !existing.replied_at) {
          clean.replied_at = new Date().toISOString();
        }
      }

      const { error } = await supabase.from("emails").update(clean).eq("id", email_id);
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      // If clearing reply, also reset contact status if no other replied emails
      if (replied === false) {
        const { data: email } = await supabase.from("emails").select("contact_id").eq("id", email_id).single();
        if (email) {
          const { count } = await supabase
            .from("emails")
            .select("id", { count: "exact", head: true })
            .eq("contact_id", email.contact_id)
            .not("replied_at", "is", null);

          if (count === 0) {
            await supabase.from("contacts").update({ status: "active" }).eq("id", email.contact_id);
          }
        }
      }

      return { content: [{ type: "text", text: `Email updated.${replied === false ? " Reply cleared, contact status checked." : replied === true ? " Marked as replied." : ""}` }] };
    }
  );

  server.tool(
    "approve_emails",
    "Approve emails for sending. Pass specific IDs or approve all pending.",
    {
      email_ids: z.array(z.string()).optional().describe("Specific email IDs to approve (omit to approve all pending)"),
    },
    async ({ email_ids }) => {
      let query = supabase
        .from("emails")
        .update({ approval_status: "approved", approved_at: new Date().toISOString() });

      if (email_ids?.length) {
        query = query.in("id", email_ids);
      } else {
        query = query.eq("approval_status", "pending");
      }

      const { data, error } = await query.select();
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `${data.length} emails approved and ready to send.` }] };
    }
  );

  server.tool(
    "reject_emails",
    "Reject emails",
    {
      email_ids: z.array(z.string()),
    },
    async ({ email_ids }) => {
      const { data, error } = await supabase
        .from("emails")
        .update({ approval_status: "rejected" })
        .in("id", email_ids)
        .select();

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `${data.length} emails rejected.` }] };
    }
  );

  server.tool(
    "delete_emails",
    "Permanently delete emails from the database. Only emails with send_status queued/scheduled/skipped can be deleted — sent emails are protected. Optionally pass campaign_id with no email_ids to delete all rejected emails in that campaign.",
    {
      email_ids: z.array(z.string()).optional().describe("Specific email IDs to delete"),
      campaign_id: z.string().optional().describe("If provided with no email_ids, deletes all rejected emails in this campaign"),
    },
    async ({ email_ids, campaign_id }) => {
      if (!email_ids?.length && !campaign_id) {
        return { content: [{ type: "text", text: "Provide email_ids or campaign_id." }] };
      }

      // Campaign cleanup mode: delete all rejected emails
      if (!email_ids?.length && campaign_id) {
        const { data: seqs } = await supabase.from("sequences").select("id").eq("campaign_id", campaign_id);
        if (!seqs?.length) return { content: [{ type: "text", text: "No sequences in this campaign." }] };

        const { data: steps } = await supabase.from("sequence_steps").select("id").in("sequence_id", seqs.map(s => s.id));
        if (!steps?.length) return { content: [{ type: "text", text: "No steps found." }] };

        const { data: rejected } = await supabase
          .from("emails")
          .select("id")
          .in("sequence_step_id", steps.map(s => s.id))
          .eq("approval_status", "rejected")
          .in("send_status", ["queued", "scheduled", "skipped"]);

        if (!rejected?.length) return { content: [{ type: "text", text: "No rejected emails to clean up." }] };

        const { error } = await supabase.from("emails").delete().in("id", rejected.map(e => e.id));
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        return { content: [{ type: "text", text: `Deleted ${rejected.length} rejected emails from campaign.` }] };
      }

      // Specific email deletion
      // First check which ones are safe to delete
      const { data: emails } = await supabase
        .from("emails")
        .select("id, send_status")
        .in("id", email_ids!);

      if (!emails?.length) return { content: [{ type: "text", text: "No emails found with those IDs." }] };

      const deletable = emails.filter(e => ["queued", "scheduled", "skipped"].includes(e.send_status));
      const protected_ = emails.filter(e => e.send_status === "sent");
      const failed = email_ids!.filter(id => !emails.find(e => e.id === id));

      if (!deletable.length) {
        return { content: [{ type: "text", text: `Cannot delete: ${protected_.length} sent (protected), ${failed.length} not found.` }] };
      }

      const { error } = await supabase.from("emails").delete().in("id", deletable.map(e => e.id));
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };

      let result = `Deleted ${deletable.length} emails.`;
      if (protected_.length) result += ` ${protected_.length} sent emails protected (not deleted).`;
      if (failed.length) result += ` ${failed.length} IDs not found.`;
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "retry_failed_emails",
    "Reset failed (and optionally skipped) emails back to scheduled so they can be retried. Call recalculate_campaign_schedule after to assign new send dates.",
    {
      campaign_id: z.string(),
      include_skipped: z.boolean().optional().describe("Also retry skipped emails (default true)"),
      email_ids: z.array(z.string()).optional().describe("Retry specific emails only"),
    },
    async ({ campaign_id, include_skipped = true, email_ids }) => {
      // Get sequences + steps for this campaign
      const { data: seqs } = await supabase.from("sequences").select("id").eq("campaign_id", campaign_id);
      if (!seqs?.length) return { content: [{ type: "text", text: "No sequences in this campaign." }] };

      const { data: steps } = await supabase.from("sequence_steps").select("id").in("sequence_id", seqs.map(s => s.id));
      if (!steps?.length) return { content: [{ type: "text", text: "No steps found." }] };

      const stepIds = steps.map(s => s.id);

      // Build status filter
      const statuses = ["failed"];
      if (include_skipped) statuses.push("skipped");

      // Get eligible emails
      let query = supabase
        .from("emails")
        .select("id, contact_id, send_status")
        .in("sequence_step_id", stepIds)
        .in("send_status", statuses);

      if (email_ids?.length) {
        query = query.in("id", email_ids);
      }

      const { data: emails } = await query;
      if (!emails?.length) return { content: [{ type: "text", text: "No failed/skipped emails found." }] };

      // Get active contacts in this campaign to filter out orphans
      const { data: activeContacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("campaign_id", campaign_id);

      const activeContactIds = new Set((activeContacts || []).map(c => c.id));

      // Filter: only retry emails whose contact still exists
      const retryable = emails.filter(e => activeContactIds.has(e.contact_id));
      const orphaned = emails.length - retryable.length;

      if (!retryable.length) {
        return { content: [{ type: "text", text: `No retryable emails. ${orphaned} orphaned (contact deleted).` }] };
      }

      // Count by status before resetting
      const failedCount = retryable.filter(e => e.send_status === "failed").length;
      const skippedCount = retryable.filter(e => e.send_status === "skipped").length;

      // Reset to scheduled, clear error metadata
      const retryIds = retryable.map(e => e.id);
      await supabase
        .from("emails")
        .update({
          send_status: "scheduled",
          error_message: null,
          scheduled_for: null,
        })
        .in("id", retryIds);

      return {
        content: [{
          type: "text",
          text: `Reset ${retryable.length} emails to scheduled:\n` +
            `  Failed: ${failedCount}\n` +
            `  Skipped: ${skippedCount}\n` +
            `  Orphaned (not retried): ${orphaned}\n\n` +
            `Run recalculate_campaign_schedule to assign new send dates.`,
        }],
      };
    }
  );

  server.tool(
    "bulk_strip_signature",
    "Strip matching text from all unsent email bodies in a campaign using a regex pattern. Use this to remove old signatures, footers, or unwanted text in bulk.",
    {
      campaign_id: z.string(),
      pattern: z.string().describe("Regex pattern to match and remove. Example: '\\n\\n--\\n[\\s\\S]*$' to strip everything after \\n\\n--\\n"),
      replacement: z.string().optional().describe("Replace matched text with this (default: empty string)"),
      include_sent: z.boolean().optional().describe("Also strip from sent emails (default: false, only unsent)"),
    },
    async ({ campaign_id, pattern, replacement, include_sent }) => {
      // Get all sequences + steps for this campaign
      const { data: seqs } = await supabase.from("sequences").select("id").eq("campaign_id", campaign_id);
      if (!seqs?.length) return { content: [{ type: "text", text: "No sequences in this campaign." }] };

      const { data: steps } = await supabase.from("sequence_steps").select("id").in("sequence_id", seqs.map(s => s.id));
      if (!steps?.length) return { content: [{ type: "text", text: "No steps found." }] };

      // Get emails
      const statusFilter = include_sent
        ? ["queued", "scheduled", "sent"]
        : ["queued", "scheduled"];

      const { data: emails } = await supabase
        .from("emails")
        .select("id, body")
        .in("sequence_step_id", steps.map(s => s.id))
        .in("send_status", statusFilter);

      if (!emails?.length) return { content: [{ type: "text", text: "No emails found matching criteria." }] };

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch (err) {
        return { content: [{ type: "text", text: `Invalid regex: ${err instanceof Error ? err.message : "parse error"}` }] };
      }

      const replaceWith = replacement || "";
      const toUpdate: { id: string; updates: Record<string, unknown> }[] = [];
      let skipped = 0;

      for (const email of emails) {
        const newBody = email.body.replace(regex, replaceWith).trimEnd();
        if (newBody !== email.body) {
          toUpdate.push({ id: email.id, updates: { body: newBody } });
        } else {
          skipped++;
        }
      }

      const updated = await batchUpdate(supabase, toUpdate, "emails");

      return {
        content: [{
          type: "text",
          text: `Stripped pattern from ${updated} emails. ${skipped} emails had no match (unchanged). Total scanned: ${emails.length}.`,
        }],
      };
    }
  );

  server.tool(
    "get_campaign_email_audit",
    "Audit all emails in a campaign to surface data quality issues: missing steps, duplicates, orphans, mismatches. Use this instead of list_emails for large campaigns.",
    {
      campaign_id: z.string(),
    },
    async ({ campaign_id }) => {
      // Get sequences and steps
      const { data: sequences } = await supabase
        .from("sequences")
        .select("id, name")
        .eq("campaign_id", campaign_id);

      if (!sequences?.length) return { content: [{ type: "text", text: "No sequences in this campaign." }] };

      const { data: allSteps } = await supabase
        .from("sequence_steps")
        .select("id, sequence_id, step_number")
        .in("sequence_id", sequences.map(s => s.id))
        .order("step_number");

      if (!allSteps?.length) return { content: [{ type: "text", text: "No steps found." }] };

      // Get all emails
      const stepIds = allSteps.map(s => s.id);
      const { data: emails } = await supabase
        .from("emails")
        .select("id, sequence_step_id, contact_id, approval_status, send_status")
        .in("sequence_step_id", stepIds);

      // Get active contacts in this campaign
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, prospect_id")
        .eq("campaign_id", campaign_id)
        .eq("status", "active");

      const contactMap = Object.fromEntries((contacts || []).map(c => [c.id, c]));
      const activeContactIds = new Set((contacts || []).map(c => c.id));
      const seqMap = Object.fromEntries(sequences.map(s => [s.id, s.name]));
      const stepSeqMap = Object.fromEntries(allSteps.map(s => [s.id, s.sequence_id]));
      const stepNumMap = Object.fromEntries(allSteps.map(s => [s.id, s.step_number]));

      // 1. Per-sequence summary
      const seqSummaries: string[] = [];
      for (const seq of sequences) {
        const seqSteps = allSteps.filter(s => s.sequence_id === seq.id);
        const seqStepIds = seqSteps.map(s => s.id);
        const seqEmails = (emails || []).filter(e => seqStepIds.includes(e.sequence_step_id));

        // Count unique contacts
        const seqContactIds = new Set(seqEmails.map(e => e.contact_id));
        const emailsPerStep: Record<number, number> = {};
        for (const step of seqSteps) {
          emailsPerStep[step.step_number] = seqEmails.filter(e => e.sequence_step_id === step.id).length;
        }

        const stepCounts = Object.values(emailsPerStep);
        const allEqual = stepCounts.every(c => c === stepCounts[0]);
        const status = allEqual && stepCounts[0] === seqContactIds.size ? "OK" : "MISMATCH";

        const stepLine = Object.entries(emailsPerStep).map(([s, c]) => `Step ${s}: ${c}`).join(", ");
        seqSummaries.push(`**${seq.name}** [${status}]\n  Contacts: ${seqContactIds.size} | ${stepLine}`);
      }

      // 2. Per-contact issues
      const contactIssues: string[] = [];
      for (const contact of (contacts || [])) {
        const contactEmails = (emails || []).filter(e => e.contact_id === contact.id);

        for (const seq of sequences) {
          const seqSteps = allSteps.filter(s => s.sequence_id === seq.id);
          const seqStepIds = seqSteps.map(s => s.id);
          const contactSeqEmails = contactEmails.filter(e => seqStepIds.includes(e.sequence_step_id));

          if (contactSeqEmails.length === 0) continue; // not in this sequence

          const expectedSteps = seqSteps.length;
          const actualSteps = contactSeqEmails.length;

          // Check for missing steps
          const presentSteps = new Set(contactSeqEmails.map(e => stepNumMap[e.sequence_step_id]));
          const missingSteps = seqSteps.filter(s => !presentSteps.has(s.step_number)).map(s => s.step_number);

          // Check for duplicates
          const stepCounts: Record<number, number> = {};
          for (const e of contactSeqEmails) {
            const sn = stepNumMap[e.sequence_step_id];
            stepCounts[sn] = (stepCounts[sn] || 0) + 1;
          }
          const duplicateSteps = Object.entries(stepCounts).filter(([, c]) => c > 1).map(([s]) => parseInt(s));

          if (missingSteps.length || duplicateSteps.length) {
            contactIssues.push(
              `**${contact.first_name} ${contact.last_name}** (${contact.email}) — ${seqMap[seq.id]}\n` +
              `  Expected: ${expectedSteps} steps, Got: ${actualSteps}` +
              (missingSteps.length ? ` | Missing: ${missingSteps.join(", ")}` : "") +
              (duplicateSteps.length ? ` | Duplicates: ${duplicateSteps.join(", ")}` : "")
            );
          }
        }
      }

      // 3. Orphan emails (contact not in active contacts for this campaign)
      const orphanEmails = (emails || []).filter(e => !activeContactIds.has(e.contact_id));
      const orphanByContact: Record<string, { name: string; count: number; ids: string[] }> = {};
      for (const e of orphanEmails) {
        if (!orphanByContact[e.contact_id]) {
          const c = contactMap[e.contact_id];
          orphanByContact[e.contact_id] = {
            name: c ? `${c.first_name} ${c.last_name}` : e.contact_id,
            count: 0,
            ids: [],
          };
        }
        orphanByContact[e.contact_id].count++;
        orphanByContact[e.contact_id].ids.push(e.id);
      }

      // 4. Duplicate detection across all contacts
      const duplicates: string[] = [];
      for (const contact of (contacts || [])) {
        const contactEmails = (emails || []).filter(e => e.contact_id === contact.id);
        const byStep: Record<string, string[]> = {};
        for (const e of contactEmails) {
          const key = `${e.sequence_step_id}`;
          if (!byStep[key]) byStep[key] = [];
          byStep[key].push(e.id);
        }
        for (const [stepId, ids] of Object.entries(byStep)) {
          if (ids.length > 1) {
            duplicates.push(
              `${contact.first_name} ${contact.last_name} — Step ${stepNumMap[stepId]}: ${ids.length} copies (keep: ${ids[0]}, delete: ${ids.slice(1).join(", ")})`
            );
          }
        }
      }

      // 5. Totals
      const totalEmails = (emails || []).length;
      const totalContacts = (contacts || []).length;
      const approved = (emails || []).filter(e => e.approval_status === "approved" || e.approval_status === "edited").length;
      const rejected = (emails || []).filter(e => e.approval_status === "rejected").length;

      // Calculate expected based on contacts × steps per sequence
      let expectedTotal = 0;
      for (const seq of sequences) {
        const seqSteps = allSteps.filter(s => s.sequence_id === seq.id);
        const seqEmails = (emails || []).filter(e => seqSteps.map(s => s.id).includes(e.sequence_step_id));
        const seqContacts = new Set(seqEmails.filter(e => activeContactIds.has(e.contact_id)).map(e => e.contact_id));
        expectedTotal += seqContacts.size * seqSteps.length;
      }

      const hasIssues = contactIssues.length > 0 || orphanEmails.length > 0 || duplicates.length > 0 || totalEmails !== expectedTotal;
      const overallStatus = hasIssues ? "ISSUES_FOUND" : "CLEAN";

      // Build report
      let report = `**Campaign Email Audit** [${overallStatus}]\n\n`;
      report += `**Totals:** ${totalEmails} emails | ${totalContacts} active contacts | Expected: ${expectedTotal} | Approved: ${approved} | Rejected: ${rejected}\n`;
      report += `Orphaned: ${orphanEmails.length} | Duplicated: ${duplicates.length} | Contact issues: ${contactIssues.length}\n\n`;

      report += `**Sequences:**\n${seqSummaries.join("\n")}\n\n`;

      if (contactIssues.length) {
        report += `**Contact Issues (${contactIssues.length}):**\n${contactIssues.slice(0, 20).join("\n")}\n`;
        if (contactIssues.length > 20) report += `  ... and ${contactIssues.length - 20} more\n`;
        report += "\n";
      }

      if (orphanEmails.length) {
        const orphanLines = Object.values(orphanByContact).map(o => `  ${o.name}: ${o.count} emails`);
        report += `**Orphan Emails (${orphanEmails.length}):**\n${orphanLines.slice(0, 15).join("\n")}\n`;
        if (orphanLines.length > 15) report += `  ... and ${orphanLines.length - 15} more contacts\n`;
        report += "\n";
      }

      if (duplicates.length) {
        report += `**Duplicates (${duplicates.length}):**\n${duplicates.slice(0, 10).join("\n")}\n`;
        if (duplicates.length > 10) report += `  ... and ${duplicates.length - 10} more\n`;
        report += "\n";
      }

      if (!hasIssues) {
        report += "All emails accounted for. No issues found.";
      }

      return { content: [{ type: "text", text: report }] };
    }
  );
}
