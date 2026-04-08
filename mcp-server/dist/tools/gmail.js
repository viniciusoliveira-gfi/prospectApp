export function registerGmailTools(server, supabase) {
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
}
