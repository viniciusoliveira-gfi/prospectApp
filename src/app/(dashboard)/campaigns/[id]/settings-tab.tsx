"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Mail, Clock, Eye, CheckCircle, Globe, Loader2, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { CampaignSendSettings } from "@/lib/supabase/types"

const DAYS_OF_WEEK = [
  { value: "1", label: "Monday", short: "Mon" },
  { value: "2", label: "Tuesday", short: "Tue" },
  { value: "3", label: "Wednesday", short: "Wed" },
  { value: "4", label: "Thursday", short: "Thu" },
  { value: "5", label: "Friday", short: "Fri" },
  { value: "6", label: "Saturday", short: "Sat" },
  { value: "0", label: "Sunday", short: "Sun" },
]

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
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
]

interface SettingsTabProps {
  campaignId: string
}

export function SettingsTab({ campaignId }: SettingsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Available accounts from Gmail settings
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([])

  // Campaign send settings
  const [senderAccounts, setSenderAccounts] = useState<string[]>([])
  const [trackOpens, setTrackOpens] = useState(true)
  const [sendDays, setSendDays] = useState<string[]>(["1", "2", "3", "4", "5"])
  const [sendHoursStart, setSendHoursStart] = useState(9)
  const [sendHoursEnd, setSendHoursEnd] = useState(18)
  const [timezone, setTimezone] = useState("America/Sao_Paulo")

  // Stats per sender
  const [senderStats, setSenderStats] = useState<Record<string, { sentToday: number; allocated: number; pending: number }>>({})

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    // Load Gmail accounts (primary + aliases)
    const { data: gmailData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "gmail_tokens")
      .single()

    if (gmailData?.value) {
      const tokens = gmailData.value as { email?: string; aliases?: string[] }
      const accounts: string[] = []
      if (tokens.email) accounts.push(tokens.email)
      if (tokens.aliases) {
        for (const alias of tokens.aliases) {
          if (!accounts.includes(alias)) accounts.push(alias)
        }
      }
      setAvailableAccounts(accounts)
    }

    // Load campaign send_settings
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("send_settings")
      .eq("id", campaignId)
      .single()

    if (campaign?.send_settings) {
      const s = campaign.send_settings as CampaignSendSettings
      if (s.sender_accounts?.length) setSenderAccounts(s.sender_accounts)
      if (typeof s.track_opens === "boolean") setTrackOpens(s.track_opens)
      if (s.send_days?.length) setSendDays(s.send_days)
      if (s.send_hours_start !== undefined) setSendHoursStart(s.send_hours_start)
      if (s.send_hours_end !== undefined) setSendHoursEnd(s.send_hours_end)
      if (s.timezone) setTimezone(s.timezone)
    } else {
      // Load global defaults as fallback
      const { data: sendingData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sending_defaults")
        .single()

      if (sendingData?.value) {
        const d = sendingData.value as Record<string, string>
        if (d.timezone) setTimezone(d.timezone)
        if (d.hours_start) setSendHoursStart(parseInt(d.hours_start))
        if (d.hours_end) setSendHoursEnd(parseInt(d.hours_end))
        if (d.send_days) setSendDays(JSON.parse(d.send_days))
      }
    }

    // Get sender stats for this campaign
    await loadSenderStats(supabase)

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const loadSenderStats = async (supabase: ReturnType<typeof createClient>) => {
    // Get all sequences for this campaign
    const { data: sequences } = await supabase
      .from("sequences")
      .select("id")
      .eq("campaign_id", campaignId)

    if (!sequences?.length) return

    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id")
      .in("sequence_id", sequences.map(s => s.id))

    if (!steps?.length) return

    const stepIds = steps.map(s => s.id)

    // Get email stats
    const { data: emails } = await supabase
      .from("emails")
      .select("send_status, gmail_message_id")
      .in("sequence_step_id", stepIds)

    if (!emails) return

    const totalEmails = emails.length
    const sentEmails = emails.filter(e => e.send_status === "sent").length
    const pendingEmails = emails.filter(e => e.send_status === "scheduled" || e.send_status === "queued").length

    // For now, distribute stats evenly across selected senders
    const stats: Record<string, { sentToday: number; allocated: number; pending: number }> = {}
    const numSenders = senderAccounts.length || 1

    for (const account of (senderAccounts.length ? senderAccounts : availableAccounts.slice(0, 1))) {
      stats[account] = {
        sentToday: Math.floor(sentEmails / numSenders),
        allocated: Math.floor(totalEmails / numSenders),
        pending: Math.floor(pendingEmails / numSenders),
      }
    }
    setSenderStats(stats)
  }

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSenderAccount = (email: string) => {
    setSenderAccounts(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    )
  }

  const toggleDay = (day: string) => {
    setSendDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const saveSettings = async () => {
    setSaving(true)
    const supabase = createClient()

    const settings: CampaignSendSettings = {
      sender_accounts: senderAccounts,
      track_opens: trackOpens,
      send_days: sendDays,
      send_hours_start: sendHoursStart,
      send_hours_end: sendHoursEnd,
      timezone,
    }

    const { error } = await supabase
      .from("campaigns")
      .update({ send_settings: settings })
      .eq("id", campaignId)

    if (error) toast.error("Failed to save settings")
    else toast.success("Campaign settings saved")
    setSaving(false)
  }

  // Compute next send time
  const getNextSendTime = () => {
    const now = new Date()
    const tzNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }))
    const currentDay = String(tzNow.getDay())
    const currentHour = tzNow.getHours()

    // Check if we can send today
    if (sendDays.includes(currentDay) && currentHour < sendHoursEnd) {
      if (currentHour >= sendHoursStart) return "Now (within sending window)"
      return `Today at ${String(sendHoursStart).padStart(2, "0")}:00`
    }

    // Find next valid day
    for (let i = 1; i <= 7; i++) {
      const nextDay = String((tzNow.getDay() + i) % 7)
      if (sendDays.includes(nextDay)) {
        const nextDate = new Date(tzNow)
        nextDate.setDate(nextDate.getDate() + i)
        nextDate.setHours(sendHoursStart, 0, 0, 0)
        return nextDate.toLocaleString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
        })
      }
    }
    return "No sending days selected"
  }

  if (loading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Sender Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500" />
            <CardTitle className="text-base">Sender accounts</CardTitle>
          </div>
          <CardDescription>
            Select the email account(s) to send this sequence. If multiple accounts are chosen, emails will be distributed evenly among them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableAccounts.length === 0 ? (
            <p className="text-sm text-gray-500">
              No Gmail account connected. Go to Settings to connect one.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Account table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_100px_100px_80px] gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b">
                  <span></span>
                  <span>Account</span>
                  <span>Status</span>
                  <span>Allocated</span>
                  <span>Pending</span>
                </div>
                {availableAccounts.map((account, i) => {
                  const isSelected = senderAccounts.includes(account)
                  const stats = senderStats[account]
                  return (
                    <div
                      key={account}
                      className={`grid grid-cols-[auto_1fr_100px_100px_80px] gap-2 px-4 py-3 items-center text-sm ${
                        i < availableAccounts.length - 1 ? "border-b" : ""
                      } ${isSelected ? "bg-blue-50/50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSenderAccount(account)}
                        className="rounded"
                      />
                      <span className="font-medium text-gray-900">{account}</span>
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="h-3.5 w-3.5" /> Connected
                      </span>
                      <span className="text-gray-600">
                        {stats ? `${stats.allocated} emails` : "—"}
                      </span>
                      <span className="text-gray-600">
                        {stats ? stats.pending : "—"}
                      </span>
                    </div>
                  )
                })}
              </div>

              {senderAccounts.length > 1 && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Emails will be distributed evenly across {senderAccounts.length} accounts.
                    Each company will always receive emails from the same sender.
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tracking */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-gray-500" />
            <CardTitle className="text-base">Tracking</CardTitle>
          </div>
          <CardDescription>
            Choose if you want to track email opens. This is only available for HTML emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={trackOpens}
                onCheckedChange={setTrackOpens}
              />
              <Label>Track email opens</Label>
            </div>
            {trackOpens && (
              <Badge variant="secondary" className="text-xs">Tracking pixel enabled</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sending Window */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <CardTitle className="text-base">Sending window for this sequence</CardTitle>
          </div>
          <CardDescription>
            With your current settings, your sequence will next send on {getNextSendTime()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Your emails and follow-ups will only be sent on the days you select, in respect of the daily sending limit you have set.
            </span>
          </div>

          {/* Days */}
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  sendDays.includes(day.value)
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-sm ${sendDays.includes(day.value) ? "bg-blue-500" : "bg-gray-300"}`} />
                {day.label}
              </button>
            ))}
          </div>

          {/* Time range + Timezone */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={String(sendHoursStart)} onValueChange={(v) => setSendHoursStart(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {String(i).padStart(2, "0")}:00 {i < 12 ? "am" : "pm"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-gray-500">to</span>
            <Select value={String(sendHoursEnd)} onValueChange={(v) => setSendHoursEnd(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {String(i).padStart(2, "0")}:00 {i < 12 ? "am" : "pm"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Globe className="h-4 w-4" />
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <Button onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
