#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
// Import tool registrations
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerProspectTools } from "./tools/prospects.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerSequenceTools } from "./tools/sequences.js";
import { registerEmailTools } from "./tools/emails.js";
import { registerExperimentTools } from "./tools/experiments.js";
import { registerPlaybookTools } from "./tools/playbook.js";
import { registerGmailTools } from "./tools/gmail.js";
import { registerActionTools } from "./tools/actions.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerSettingsTools } from "./tools/settings.js";
import { registerResearchTools } from "./tools/research.js";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const server = new McpServer({
    name: "prospectapp",
    version: "1.0.0",
});
// Register all tools
registerCampaignTools(server, supabase);
registerProspectTools(server, supabase);
registerContactTools(server, supabase);
registerSequenceTools(server, supabase);
registerEmailTools(server, supabase);
registerExperimentTools(server, supabase);
registerPlaybookTools(server, supabase);
registerGmailTools(server, supabase);
registerActionTools(server, supabase);
registerAnalyticsTools(server, supabase);
registerSettingsTools(server, supabase);
registerResearchTools(server, supabase);
// Start
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("ProspectApp MCP server running");
}
main().catch(console.error);
