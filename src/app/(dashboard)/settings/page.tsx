"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Key, Mail, Send, FileText, CheckCircle } from "lucide-react"

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const [claudeKey, setClaudeKey] = useState("")
  const [apolloKey, setApolloKey] = useState("")
  const [dailyLimit, setDailyLimit] = useState("25")
  const [sendInterval, setSendInterval] = useState("60")
  const [sendHoursStart, setSendHoursStart] = useState("9")
  const [sendHoursEnd, setSendHoursEnd] = useState("18")
  const [signature, setSignature] = useState("")
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState("")

  useEffect(() => {
    if (searchParams.get("gmail") === "connected") {
      toast.success("Gmail connected successfully")
    }
    if (searchParams.get("error")) {
      toast.error(`Error: ${searchParams.get("error")}`)
    }
    loadSettings()
  }, [searchParams])

  const loadSettings = async () => {
    const supabase = createClient()

    // Load Gmail status
    const { data: gmailData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "gmail_tokens")
      .single()

    if (gmailData?.value) {
      const tokens = gmailData.value as { email?: string }
      setGmailConnected(true)
      setGmailEmail(tokens.email || "")
    }

    // Load API keys
    const { data: keysData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "api_keys")
      .single()

    if (keysData?.value) {
      const keys = keysData.value as { claude_key?: string; apollo_key?: string }
      if (keys.claude_key) setClaudeKey(keys.claude_key)
      if (keys.apollo_key) setApolloKey(keys.apollo_key)
    }

    // Load sending defaults
    const { data: sendingData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "sending_defaults")
      .single()

    if (sendingData?.value) {
      const defaults = sendingData.value as Record<string, string>
      if (defaults.daily_limit) setDailyLimit(defaults.daily_limit)
      if (defaults.send_interval) setSendInterval(defaults.send_interval)
      if (defaults.hours_start) setSendHoursStart(defaults.hours_start)
      if (defaults.hours_end) setSendHoursEnd(defaults.hours_end)
    }

    // Load signature
    const { data: sigData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "email_signature")
      .single()

    if (sigData?.value) {
      const sig = sigData.value as { html?: string }
      if (sig.html) setSignature(sig.html)
    }
  }

  const saveApiKeys = async () => {
    const supabase = createClient()
    const { error } = await supabase.from("settings").upsert({
      key: "api_keys",
      value: { claude_key: claudeKey, apollo_key: apolloKey },
    })
    if (error) toast.error("Failed to save")
    else toast.success("API keys saved")
  }

  const saveSendingDefaults = async () => {
    const supabase = createClient()
    const { error } = await supabase.from("settings").upsert({
      key: "sending_defaults",
      value: {
        daily_limit: dailyLimit,
        send_interval: sendInterval,
        hours_start: sendHoursStart,
        hours_end: sendHoursEnd,
      },
    })
    if (error) toast.error("Failed to save")
    else toast.success("Sending defaults saved")
  }

  const saveSignature = async () => {
    const supabase = createClient()
    const { error } = await supabase.from("settings").upsert({
      key: "email_signature",
      value: { html: signature },
    })
    if (error) toast.error("Failed to save")
    else toast.success("Email signature saved")
  }

  const connectGmail = () => {
    window.location.href = "/api/auth/google"
  }

  const disconnectGmail = async () => {
    const supabase = createClient()
    await supabase.from("settings").delete().eq("key", "gmail_tokens")
    setGmailConnected(false)
    setGmailEmail("")
    toast.success("Gmail disconnected")
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>API Keys</CardTitle>
          </div>
          <CardDescription>Configure your API keys for AI and enrichment services.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="claude-key">Claude API Key</Label>
            <Input id="claude-key" type="password" placeholder="sk-ant-..." value={claudeKey} onChange={(e) => setClaudeKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apollo-key">Apollo API Key</Label>
            <Input id="apollo-key" type="password" placeholder="Enter your Apollo API key" value={apolloKey} onChange={(e) => setApolloKey(e.target.value)} />
          </div>
          <Button onClick={saveApiKeys}>Save API Keys</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Gmail Connection</CardTitle>
          </div>
          <CardDescription>Connect your Gmail account to send emails.</CardDescription>
        </CardHeader>
        <CardContent>
          {gmailConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>Connected as <strong>{gmailEmail}</strong></span>
                <Badge variant="default">Connected</Badge>
              </div>
              <Button variant="outline" onClick={disconnectGmail}>Disconnect</Button>
            </div>
          ) : (
            <Button variant="outline" onClick={connectGmail}>
              <Mail className="mr-2 h-4 w-4" /> Connect Gmail Account
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            <CardTitle>Sending Defaults</CardTitle>
          </div>
          <CardDescription>Configure default sending limits and schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Daily Send Limit</Label>
              <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Send Interval (minutes)</Label>
              <Input type="number" value={sendInterval} onChange={(e) => setSendInterval(e.target.value)} />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sending Hours Start</Label>
              <Input type="number" min="0" max="23" value={sendHoursStart} onChange={(e) => setSendHoursStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sending Hours End</Label>
              <Input type="number" min="0" max="23" value={sendHoursEnd} onChange={(e) => setSendHoursEnd(e.target.value)} />
            </div>
          </div>
          <Button onClick={saveSendingDefaults}>Save Sending Defaults</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Email Signature</CardTitle>
          </div>
          <CardDescription>Default HTML signature appended to outgoing emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea placeholder="<p>Best regards,<br/>Your Name</p>" rows={6} value={signature} onChange={(e) => setSignature(e.target.value)} />
          <Button onClick={saveSignature}>Save Signature</Button>
        </CardContent>
      </Card>
    </div>
  )
}
