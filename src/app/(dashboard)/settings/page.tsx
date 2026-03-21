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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  Key, Mail, Send, FileText, CheckCircle, Globe, Clock, Loader2,
} from "lucide-react"

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
]

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

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
  const [timezone, setTimezone] = useState("America/Sao_Paulo")
  const [sendDays, setSendDays] = useState<string[]>(["1", "2", "3", "4", "5"]) // Mon-Fri default
  const [signature, setSignature] = useState("")
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState("")
  const [gmailAliases, setGmailAliases] = useState<string[]>([])
  const [loadingAliases, setLoadingAliases] = useState(false)

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
      const tokens = gmailData.value as { email?: string; timezone?: string; aliases?: string[] }
      setGmailConnected(true)
      setGmailEmail(tokens.email || "")
      if (tokens.timezone) setTimezone(tokens.timezone)
      if (tokens.aliases) setGmailAliases(tokens.aliases)
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
      if (defaults.timezone) setTimezone(defaults.timezone)
      if (defaults.send_days) setSendDays(JSON.parse(defaults.send_days))
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
        timezone,
        send_days: JSON.stringify(sendDays),
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
    setGmailAliases([])
    toast.success("Gmail disconnected")
  }

  const fetchAliases = async () => {
    setLoadingAliases(true)
    try {
      const res = await fetch("/api/gmail/aliases")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGmailAliases(data.aliases || [])
      toast.success(`Found ${data.aliases?.length || 0} aliases`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch aliases")
    }
    setLoadingAliases(false)
  }

  const toggleDay = (day: string) => {
    setSendDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-gray-500" />
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
            <Mail className="h-5 w-5 text-gray-500" />
            <CardTitle>Gmail Connection</CardTitle>
          </div>
          <CardDescription>Connect your Gmail account to send emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {gmailConnected ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Connected as <strong>{gmailEmail}</strong></span>
                  <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">Connected</Badge>
                </div>
                <Button variant="outline" onClick={disconnectGmail}>Disconnect</Button>
              </div>

              {/* Aliases */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Send-As Aliases</Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Different email addresses you can send from. Assign them to campaigns.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchAliases} disabled={loadingAliases}>
                    {loadingAliases ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    Fetch Aliases
                  </Button>
                </div>
                {gmailAliases.length > 0 ? (
                  <div className="space-y-2">
                    {gmailAliases.map(alias => (
                      <div key={alias} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{alias}</span>
                      </div>
                    ))}
                    <p className="text-xs text-gray-400">
                      To use an alias, set it as the sending account in a campaign.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    Click &quot;Fetch Aliases&quot; to load your Gmail send-as addresses.
                  </p>
                )}
              </div>
            </>
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
            <Send className="h-5 w-5 text-gray-500" />
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

          {/* Timezone */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-400" />
              <Label>Timezone</Label>
            </div>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Sending hours are based on this timezone.
            </p>
          </div>

          {/* Sending Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <Label>Start Hour</Label>
              </div>
              <Select value={sendHoursStart} onValueChange={setSendHoursStart}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <Label>End Hour</Label>
              </div>
              <Select value={sendHoursEnd} onValueChange={setSendHoursEnd}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Sending Days */}
          <div className="space-y-2">
            <Label>Sending Days</Label>
            <p className="text-xs text-gray-400">Emails will only be sent on selected days.</p>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    sendDays.includes(day.value)
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={saveSendingDefaults}>Save Sending Defaults</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-500" />
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
