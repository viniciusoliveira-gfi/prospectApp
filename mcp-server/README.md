# ProspectApp MCP Server

Connects Claude to ProspectApp so Claude can operate the app as your co-worker.

## What Claude Can Do

**Campaigns:** create, list, update, change status
**Prospects:** push companies, update tiers/research, delete
**Contacts:** push contacts, update, delete
**Sequences:** create email sequences with steps, update steps
**Emails:** push personalized emails, list/filter, approve, reject, edit
**Analytics:** get campaign stats, activity log
**Settings:** view and update sending configuration

## Setup

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "prospectapp": {
      "command": "node",
      "args": ["/Users/GFI/prospectApp/mcp-server/dist/index.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "your-supabase-url",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```
