import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

export function registerContactTools(server: McpServer, supabase: SupabaseClient) {
  server.tool(
    "list_contacts",
    "List contacts in a campaign",
    {
      campaign_id: z.string(),
    },
    async ({ campaign_id }) => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, prospects(company_name)")
        .eq("campaign_id", campaign_id)
        .order("created_at", { ascending: false });

      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      if (!data?.length) return { content: [{ type: "text", text: "No contacts." }] };

      const lines = data.map(c => {
        const company = (c.prospects as unknown as { company_name: string })?.company_name || "Unknown";
        return `- **${c.first_name} ${c.last_name}** | ${c.title || "No title"} | ${company} | ${c.email || "no email"} [${c.email_status}] | ID: ${c.id}`;
      });
      return { content: [{ type: "text", text: `${data.length} contacts:\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "push_contacts",
    "Push contacts into a campaign for a specific prospect. Use this after you've found and prepared the contact list with the user.",
    {
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
    },
    async ({ prospect_id, contacts }) => {
      const { data: prospect } = await supabase.from("prospects").select("campaign_id").eq("id", prospect_id).single();
      if (!prospect) return { content: [{ type: "text", text: "Prospect not found." }] };

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
        source: "manual" as const,
      }));

      const { data, error } = await supabase.from("contacts").insert(records).select();
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `Pushed ${data.length} contacts.` }] };
    }
  );

  server.tool(
    "update_contact",
    "Update a contact's details",
    {
      contact_id: z.string(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      title: z.string().optional(),
      status: z.enum(["active", "opted_out", "bounced", "replied", "converted"]).optional(),
    },
    async ({ contact_id, ...updates }) => {
      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const { data, error } = await supabase.from("contacts").update(clean).eq("id", contact_id).select().single();
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: `Contact "${data.first_name} ${data.last_name}" updated.` }] };
    }
  );

  server.tool(
    "delete_contact",
    "Remove a contact",
    { contact_id: z.string() },
    async ({ contact_id }) => {
      const { error } = await supabase.from("contacts").delete().eq("id", contact_id);
      if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      return { content: [{ type: "text", text: "Contact deleted." }] };
    }
  );
}
