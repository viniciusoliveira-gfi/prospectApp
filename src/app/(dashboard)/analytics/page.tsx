"use client"

import { useState, useEffect } from "react"
import { BarChart3, Mail, Eye, MessageSquare, Users, Building2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface DashboardStats {
  campaigns: number
  prospects: number
  contacts: number
  total_emails: number
  sent: number
  opened: number
  replied: number
  open_rate: number
  reply_rate: number
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/analytics/dashboard")
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    )
  }

  if (!stats || stats.sent === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">No data yet</p>
          <p className="text-sm text-muted-foreground">Start sending emails to see analytics here.</p>
        </CardContent>
      </Card>
    )
  }

  const metrics = [
    { label: "Prospects", value: stats.prospects, icon: Building2, color: "text-blue-500" },
    { label: "Contacts", value: stats.contacts, icon: Users, color: "text-green-500" },
    { label: "Emails Sent", value: stats.sent, icon: Mail, color: "text-purple-500" },
    { label: "Opened", value: stats.opened, icon: Eye, color: "text-amber-500" },
    { label: "Replied", value: stats.replied, icon: MessageSquare, color: "text-emerald-500" },
    { label: "Open Rate", value: `${stats.open_rate}%`, icon: BarChart3, color: "text-rose-500" },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium">{m.label}</CardTitle>
                <Icon className={`h-4 w-4 ${m.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{m.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Sent", value: stats.sent, pct: 100 },
                { label: "Opened", value: stats.opened, pct: stats.open_rate },
                { label: "Replied", value: stats.replied, pct: stats.reply_rate },
              ].map((step) => (
                <div key={step.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{step.label}</span>
                    <span className="text-muted-foreground">{step.value} ({step.pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${step.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Campaigns</span>
                <span className="font-medium">{stats.campaigns}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Emails Generated</span>
                <span className="font-medium">{stats.total_emails}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Emails Sent</span>
                <span className="font-medium">{stats.sent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open Rate</span>
                <span className="font-medium">{stats.open_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reply Rate</span>
                <span className="font-medium">{stats.reply_rate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
