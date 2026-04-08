export function registerActionTools(server, supabase) {
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
}
