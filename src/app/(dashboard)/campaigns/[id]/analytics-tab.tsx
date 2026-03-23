"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

interface StepMetrics {
  label: string
  scheduled: number
  sent: number
  opened: number
  openRate: number
  replied: number
  replyRate: number
  bounced: number
  bounceRate: number
  failed: number
  isHeader?: boolean
}

interface AnalyticsTabProps {
  campaignId: string
}

function DonutChart({ value, label, color, isPercent = false }: {
  value: number | string
  label: string
  color: string
  isPercent?: boolean
}) {
  const numericValue = typeof value === "string" ? parseFloat(value) || 0 : value
  const percentage = isPercent ? numericValue : 100
  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference - (circumference * Math.min(percentage, 100)) / 100

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-gray-900">
            {typeof value === "number" && isPercent ? `${value}%` : value}
          </span>
        </div>
      </div>
      <span className={`text-xs font-semibold mt-2 uppercase tracking-wide`} style={{ color }}>{label}</span>
    </div>
  )
}

export function AnalyticsTab({ campaignId }: AnalyticsTabProps) {
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({
    scheduled: 0, sent: 0, opened: 0, replied: 0, bounced: 0, failed: 0,
    openRate: 0, replyRate: 0,
  })
  const [stepMetrics, setStepMetrics] = useState<StepMetrics[]>([])

  const fetchAnalytics = useCallback(async () => {
    const supabase = createClient()

    // Get sequences for this campaign
    const { data: sequences } = await supabase
      .from("sequences")
      .select("id, name")
      .eq("campaign_id", campaignId)

    if (!sequences?.length) { setLoading(false); return }

    // Get steps
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id, sequence_id, step_number")
      .in("sequence_id", sequences.map(s => s.id))
      .order("step_number")

    if (!steps?.length) { setLoading(false); return }

    // Get all emails
    const { data: emails } = await supabase
      .from("emails")
      .select("sequence_step_id, send_status, open_count, replied_at, bounced_at")
      .in("sequence_step_id", steps.map(s => s.id))

    if (!emails?.length) { setLoading(false); return }

    // Calculate totals
    const sent = emails.filter(e => e.send_status === "sent").length
    const scheduled = emails.filter(e => e.send_status === "scheduled").length
    const opened = emails.filter(e => e.send_status === "sent" && e.open_count > 0).length
    const replied = emails.filter(e => e.replied_at).length
    const bounced = emails.filter(e => e.bounced_at).length
    const failed = emails.filter(e => e.send_status === "failed").length

    setTotals({
      scheduled, sent, opened, replied, bounced, failed,
      openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
      replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
    })

    // Calculate per-sequence, per-step metrics
    const metrics: StepMetrics[] = []

    // Overall totals row
    metrics.push({
      label: "All Sequences",
      scheduled, sent, opened,
      openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
      replied,
      replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
      bounced,
      bounceRate: sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0,
      failed,
      isHeader: true,
    })

    // Group steps by sequence
    for (const seq of sequences) {
      const seqSteps = steps.filter(s => s.sequence_id === seq.id).sort((a, b) => a.step_number - b.step_number)
      if (!seqSteps.length) continue

      const seqStepIds = seqSteps.map(s => s.id)
      const seqEmails = emails.filter(e => seqStepIds.includes(e.sequence_step_id))
      const seqSent = seqEmails.filter(e => e.send_status === "sent").length
      const seqScheduled = seqEmails.filter(e => e.send_status === "scheduled").length
      const seqOpened = seqEmails.filter(e => e.send_status === "sent" && e.open_count > 0).length
      const seqReplied = seqEmails.filter(e => e.replied_at).length
      const seqBounced = seqEmails.filter(e => e.bounced_at).length
      const seqFailed = seqEmails.filter(e => e.send_status === "failed").length

      // Sequence header row
      metrics.push({
        label: seq.name,
        scheduled: seqScheduled, sent: seqSent, opened: seqOpened,
        openRate: seqSent > 0 ? Math.round((seqOpened / seqSent) * 1000) / 10 : 0,
        replied: seqReplied,
        replyRate: seqSent > 0 ? Math.round((seqReplied / seqSent) * 1000) / 10 : 0,
        bounced: seqBounced,
        bounceRate: seqSent > 0 ? Math.round((seqBounced / seqSent) * 1000) / 10 : 0,
        failed: seqFailed,
        isHeader: true,
      })

      // Per step within this sequence
      for (const step of seqSteps) {
        const stepEmails = emails.filter(e => e.sequence_step_id === step.id)
        const sSent = stepEmails.filter(e => e.send_status === "sent").length
        const sScheduled = stepEmails.filter(e => e.send_status === "scheduled").length
        const sOpened = stepEmails.filter(e => e.send_status === "sent" && e.open_count > 0).length
        const sReplied = stepEmails.filter(e => e.replied_at).length
        const sBounced = stepEmails.filter(e => e.bounced_at).length
        const sFailed = stepEmails.filter(e => e.send_status === "failed").length

        metrics.push({
          label: step.step_number === 1 ? "  First email" : `  Follow-up ${step.step_number - 1}`,
          scheduled: sScheduled, sent: sSent, opened: sOpened,
          openRate: sSent > 0 ? Math.round((sOpened / sSent) * 1000) / 10 : 0,
          replied: sReplied,
          replyRate: sSent > 0 ? Math.round((sReplied / sSent) * 1000) / 10 : 0,
          bounced: sBounced,
          bounceRate: sSent > 0 ? Math.round((sBounced / sSent) * 1000) / 10 : 0,
          failed: sFailed,
        })
      }
    }

    setStepMetrics(metrics)
    setLoading(false)
  }, [campaignId])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  if (loading) return <Skeleton className="h-96 w-full" />

  if (totals.sent === 0 && totals.scheduled === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-lg font-medium text-gray-700">No email data yet</p>
          <p className="text-sm text-gray-500 mt-1">Start sending emails to see analytics.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Donut charts */}
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-12 flex-wrap">
            <DonutChart
              value={totals.sent}
              label="Sent"
              color="#3b82f6"
              isPercent={false}
            />
            <DonutChart
              value={totals.openRate}
              label="Opened"
              color="#22c55e"
              isPercent={true}
            />
            <DonutChart
              value={totals.replyRate}
              label="Replied"
              color="#a855f7"
              isPercent={true}
            />
            <DonutChart
              value={totals.bounced > 0 ? Math.round((totals.bounced / totals.sent) * 1000) / 10 : 0}
              label="Bounced"
              color="#ef4444"
              isPercent={true}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-step breakdown table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead className="text-center text-xs uppercase text-gray-400">Scheduled</TableHead>
                <TableHead className="text-center text-xs uppercase text-gray-400">Sent</TableHead>
                <TableHead className="text-center text-xs uppercase text-gray-400">Opened</TableHead>
                <TableHead className="text-center text-xs uppercase text-gray-400">Replied</TableHead>
                <TableHead className="text-center text-xs uppercase text-gray-400">Bounced</TableHead>
                <TableHead className="text-center text-xs uppercase text-gray-400">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stepMetrics.map((m, i) => (
                <TableRow key={i} className={m.isHeader ? "font-medium bg-gray-50/50" : ""}>
                  <TableCell className={`text-sm ${m.isHeader ? "font-semibold" : "text-gray-600"}`}>{m.label}</TableCell>
                  <TableCell className="text-center text-sm text-gray-500">{m.scheduled}</TableCell>
                  <TableCell className="text-center text-sm text-blue-600">{m.sent}</TableCell>
                  <TableCell className="text-center text-sm text-green-600">
                    {m.openRate}% ({m.opened})
                  </TableCell>
                  <TableCell className="text-center text-sm text-purple-600">
                    {m.replyRate}% ({m.replied})
                  </TableCell>
                  <TableCell className="text-center text-sm text-red-500">
                    {m.bounceRate}% ({m.bounced})
                  </TableCell>
                  <TableCell className="text-center text-sm text-gray-500">{m.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
