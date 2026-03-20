"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Key, Mail, Send, FileText } from "lucide-react"

export default function SettingsPage() {
  const [claudeKey, setClaudeKey] = useState("")
  const [apolloKey, setApolloKey] = useState("")
  const [dailyLimit, setDailyLimit] = useState("25")
  const [sendInterval, setSendInterval] = useState("60")
  const [sendHoursStart, setSendHoursStart] = useState("9")
  const [sendHoursEnd, setSendHoursEnd] = useState("18")
  const [signature, setSignature] = useState("")

  const saveApiKeys = () => {
    toast.success("API keys saved")
  }

  const saveSendingDefaults = () => {
    toast.success("Sending defaults saved")
  }

  const saveSignature = () => {
    toast.success("Email signature saved")
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>API Keys</CardTitle>
          </div>
          <CardDescription>
            Configure your API keys for AI and enrichment services.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="claude-key">Claude API Key</Label>
            <Input
              id="claude-key"
              type="password"
              placeholder="sk-ant-..."
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apollo-key">Apollo API Key</Label>
            <Input
              id="apollo-key"
              type="password"
              placeholder="Enter your Apollo API key"
              value={apolloKey}
              onChange={(e) => setApolloKey(e.target.value)}
            />
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
          <CardDescription>
            Connect your Gmail account to send emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline">
            <Mail className="mr-2 h-4 w-4" />
            Connect Gmail Account
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            <CardTitle>Sending Defaults</CardTitle>
          </div>
          <CardDescription>
            Configure default sending limits and schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily-limit">Daily Send Limit</Label>
              <Input
                id="daily-limit"
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-interval">Send Interval (minutes)</Label>
              <Input
                id="send-interval"
                type="number"
                value={sendInterval}
                onChange={(e) => setSendInterval(e.target.value)}
              />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours-start">Sending Hours Start</Label>
              <Input
                id="hours-start"
                type="number"
                min="0"
                max="23"
                value={sendHoursStart}
                onChange={(e) => setSendHoursStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours-end">Sending Hours End</Label>
              <Input
                id="hours-end"
                type="number"
                min="0"
                max="23"
                value={sendHoursEnd}
                onChange={(e) => setSendHoursEnd(e.target.value)}
              />
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
          <CardDescription>
            Default HTML signature appended to outgoing emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="<p>Best regards,<br/>Your Name</p>"
            rows={6}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
          <Button onClick={saveSignature}>Save Signature</Button>
        </CardContent>
      </Card>
    </div>
  )
}
