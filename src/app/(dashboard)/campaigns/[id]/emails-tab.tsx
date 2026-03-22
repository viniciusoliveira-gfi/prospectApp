"use client"

import { useState, useEffect, useCallback } from "react"
import { Mail, CheckCircle2, XCircle, Clock, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface EmailRow {
  id: string
  subject: string
  approval_status: string
  send_status: string
  scheduled_for: string | null
  sent_at: string | null
  sent_from: string | null
  open_count: number
  replied_at: string | null
  contacts: { first_name: string; last_name: string; email: string } | null
  prospects: { company_name: string } | null
  sequence_steps: { step_number: number; sequence_id: string } | null
}

interface EmailsTabProps {
  campaignId: string
}

export function EmailsTab({ campaignId }: EmailsTabProps) {
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterApproval, setFilterApproval] = useState<string>("all")
  const [filterSend, setFilterSend] = useState<string>("all")
  const [filterStep, setFilterStep] = useState<string>("all")
  const [filterSequence, setFilterSequence] = useState<string>("all")
  const [filterDate, setFilterDate] = useState<string>("all")
  const [sequenceOptions, setSequenceOptions] = useState<{ id: string; name: string }[]>([])
  const [approving, setApproving] = useState<string | null>(null)

  const fetchEmails = useCallback(async () => {
    const supabase = createClient()

    // Get all sequences for this campaign
    const { data: sequences } = await supabase
      .from("sequences")
      .select("id, name")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })

    if (!sequences?.length) { setLoading(false); return }
    setSequenceOptions(sequences)

    // Filter by sequence if selected
    const seqIds = filterSequence !== "all"
      ? [filterSequence]
      : sequences.map(s => s.id)

    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id")
      .in("sequence_id", seqIds)

    if (!steps?.length) { setLoading(false); setEmails([]); return }

    let query = supabase
      .from("emails")
      .select("*, contacts(first_name, last_name, email), prospects(company_name), sequence_steps(step_number, sequence_id)")
      .in("sequence_step_id", steps.map(s => s.id))
      .order("created_at", { ascending: false })
      .limit(1000)

    if (filterApproval !== "all") query = query.eq("approval_status", filterApproval)
    if (filterSend !== "all") query = query.eq("send_status", filterSend)

    const { data, error } = await query

    if (error) toast.error("Failed to load emails")
    else {
      let filtered = data || []
      if (filterStep !== "all") {
        filtered = filtered.filter(e =>
          (e.sequence_steps as unknown as { step_number: number })?.step_number === parseInt(filterStep)
        )
      }
      if (filterDate !== "all") {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        let startDate: Date | null = null
        let endDate: Date | null = null

        if (filterDate === "today") {
          startDate = today
          endDate = new Date(today.getTime() + 86400000)
        } else if (filterDate === "yesterday") {
          startDate = new Date(today.getTime() - 86400000)
          endDate = today
        } else if (filterDate === "last7") {
          startDate = new Date(today.getTime() - 7 * 86400000)
          endDate = new Date(today.getTime() + 86400000)
        } else if (filterDate === "last30") {
          startDate = new Date(today.getTime() - 30 * 86400000)
          endDate = new Date(today.getTime() + 86400000)
        } else if (filterDate === "tomorrow") {
          startDate = new Date(today.getTime() + 86400000)
          endDate = new Date(today.getTime() + 2 * 86400000)
        } else if (filterDate === "next7") {
          startDate = today
          endDate = new Date(today.getTime() + 7 * 86400000)
        }

        if (startDate && endDate) {
          filtered = filtered.filter(e => {
            const d = e.sent_at || e.scheduled_for
            if (!d) return false
            const date = new Date(d)
            return date >= startDate! && date < endDate!
          })
        }
      }
      setEmails(filtered as unknown as EmailRow[])
    }
    setLoading(false)
  }, [campaignId, filterApproval, filterSend, filterStep, filterSequence, filterDate])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const handleApprove = async (emailId: string) => {
    setApproving(emailId)
    const supabase = createClient()
    const { error } = await supabase
      .from("emails")
      .update({ approval_status: "approved", approved_at: new Date().toISOString() })
      .eq("id", emailId)

    if (error) toast.error("Failed to approve")
    else {
      toast.success("Email approved")
      fetchEmails()
    }
    setApproving(null)
  }

  const handleReject = async (emailId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("emails")
      .update({ approval_status: "rejected" })
      .eq("id", emailId)

    if (error) toast.error("Failed to reject")
    else { toast.success("Email rejected"); fetchEmails() }
  }

  const handleApproveAll = async () => {
    const supabase = createClient()
    const pendingIds = emails
      .filter(e => e.approval_status === "pending")
      .map(e => e.id)

    if (!pendingIds.length) { toast.info("No pending emails"); return }

    const { error } = await supabase
      .from("emails")
      .update({ approval_status: "approved", approved_at: new Date().toISOString() })
      .in("id", pendingIds)

    if (error) toast.error("Failed to approve all")
    else { toast.success(`${pendingIds.length} emails approved`); fetchEmails() }
  }

  const approvalBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge variant="default" className="bg-green-600">Approved</Badge>
      case "edited": return <Badge variant="default" className="bg-blue-600">Edited</Badge>
      case "rejected": return <Badge variant="destructive">Rejected</Badge>
      default: return <Badge variant="outline">Pending</Badge>
    }
  }

  const sendBadge = (status: string) => {
    switch (status) {
      case "sent": return <Badge variant="default">Sent</Badge>
      case "scheduled": return <Badge variant="outline">Scheduled</Badge>
      case "sending": return <Badge variant="secondary">Sending</Badge>
      case "failed": return <Badge variant="destructive">Failed</Badge>
      case "skipped": return <Badge variant="secondary">Skipped</Badge>
      default: return <Badge variant="outline">Queued</Badge>
    }
  }

  if (loading) return <Skeleton className="h-96 w-full" />

  const pendingCount = emails.filter(e => e.approval_status === "pending").length

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterApproval} onValueChange={setFilterApproval}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Approval" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Approval</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="edited">Edited</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSend} onValueChange={setFilterSend}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Send Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Send</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStep} onValueChange={setFilterStep}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Step" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Steps</SelectItem>
            <SelectItem value="1">Step 1</SelectItem>
            <SelectItem value="2">Step 2</SelectItem>
            <SelectItem value="3">Step 3</SelectItem>
            <SelectItem value="4">Step 4</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDate} onValueChange={setFilterDate}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="last7">Last 7 days</SelectItem>
            <SelectItem value="last30">Last 30 days</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="next7">Next 7 days</SelectItem>
          </SelectContent>
        </Select>
        {sequenceOptions.length > 1 && (
          <Select value={filterSequence} onValueChange={setFilterSequence}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sequence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sequences</SelectItem>
              {sequenceOptions.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {pendingCount > 0 && (
          <Button size="sm" onClick={handleApproveAll}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve All Pending ({pendingCount})
          </Button>
        )}
      </div>

      {emails.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No emails yet</p>
            <p className="text-sm text-muted-foreground">
              Generate emails from the Sequences tab first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{emails.length} emails</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Send</TableHead>
                  <TableHead>Opens</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map(email => (
                  <TableRow key={email.id}>
                    <TableCell className="text-sm">
                      {(email.sequence_steps as unknown as { step_number: number })?.step_number || "?"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{email.contacts?.first_name} {email.contacts?.last_name}</div>
                      <div className="text-xs text-muted-foreground">{email.prospects?.company_name}</div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {email.subject}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {email.sent_from || "—"}
                    </TableCell>
                    <TableCell>{approvalBadge(email.approval_status)}</TableCell>
                    <TableCell>
                      {sendBadge(email.send_status)}
                      {email.scheduled_for && email.send_status === "scheduled" && (
                        <div className="text-xs text-muted-foreground mt-1">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {new Date(email.scheduled_for).toLocaleDateString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {email.open_count > 0 && <span>{email.open_count}</span>}
                      {email.replied_at && (
                        <Badge variant="default" className="ml-1 bg-green-600 text-xs">Replied</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {email.approval_status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleApprove(email.id)}
                            disabled={approving === email.id}
                            title="Approve"
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleReject(email.id)}
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
