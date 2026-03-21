"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CheckSquare, Check, X, Pencil, SkipForward, Loader2, CheckCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface EmailWithDetails {
  id: string
  subject: string
  body: string
  approval_status: string
  send_status: string
  contacts: { first_name: string; last_name: string; email: string; title: string } | null
  sequence_steps: { step_number: number; delay_days: number } | null
  prospects: { company_name: string } | null
}

export default function ApprovalQueuePage() {
  const [emails, setEmails] = useState<EmailWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("pending")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkApproving, setBulkApproving] = useState(false)

  const fetchEmails = useCallback(async () => {
    const supabase = createClient()

    let query = supabase
      .from("emails")
      .select("*, contacts(first_name, last_name, email, title), sequence_steps(step_number, delay_days), prospects(company_name)")
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") {
      query = query.eq("approval_status", statusFilter)
    }

    const { data, error } = await query
    if (error) toast.error("Failed to load emails")
    else setEmails(data || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const updateEmail = async (id: string, update: Record<string, unknown>) => {
    const res = await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    })
    if (res.ok) {
      fetchEmails()
    } else {
      toast.error("Failed to update email")
    }
  }

  const handleApprove = async (id: string) => {
    await updateEmail(id, { approval_status: "approved" })
    toast.success("Email approved")
  }

  const handleReject = async (id: string) => {
    await updateEmail(id, { approval_status: "rejected" })
    toast.success("Email rejected")
  }

  const handleSkip = async (id: string) => {
    await updateEmail(id, { send_status: "skipped" })
    toast.success("Email skipped")
  }

  const startEdit = (email: EmailWithDetails) => {
    setEditingId(email.id)
    setEditSubject(email.subject)
    setEditBody(email.body)
  }

  const saveEdit = async () => {
    if (!editingId) return
    await updateEmail(editingId, {
      subject: editSubject,
      body: editBody,
      approval_status: "edited",
    })
    setEditingId(null)
    toast.success("Email updated and marked as edited")
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) { toast.error("Select emails first"); return }
    setBulkApproving(true)
    const res = await fetch("/api/emails/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_ids: Array.from(selectedIds) }),
    })
    if (res.ok) {
      const data = await res.json()
      toast.success(`Approved ${data.approved} emails`)
      setSelectedIds(new Set())
      fetchEmails()
    } else {
      toast.error("Bulk approve failed")
    }
    setBulkApproving(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === emails.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(emails.map(e => e.id)))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="edited">Edited</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {selectedIds.size > 0 && (
          <Button onClick={handleBulkApprove} disabled={bulkApproving}>
            {bulkApproving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Approve Selected ({selectedIds.size})
          </Button>
        )}
        {emails.length > 0 && (
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selectedIds.size === emails.length ? "Deselect All" : "Select All"}
          </Button>
        )}
      </div>

      {emails.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckSquare className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No emails pending approval</p>
            <p className="text-sm text-muted-foreground">
              Generate emails from a sequence to see them here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {emails.map((email) => (
            <Card
              key={email.id}
              className={`transition-colors ${selectedIds.has(email.id) ? "border-primary" : ""}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(email.id)}
                    onChange={() => toggleSelect(email.id)}
                    className="mt-1 rounded border-gray-600"
                  />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {email.contacts?.first_name} {email.contacts?.last_name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {email.contacts?.title}
                        </span>
                        <span className="text-sm text-muted-foreground">at</span>
                        <span className="text-sm font-medium">
                          {email.prospects?.company_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Step {email.sequence_steps?.step_number || "?"}
                        </Badge>
                        <Badge
                          variant={
                            email.approval_status === "approved" ? "default" :
                            email.approval_status === "rejected" ? "destructive" :
                            "secondary"
                          }
                        >
                          {email.approval_status}
                        </Badge>
                      </div>
                    </div>

                    {editingId === email.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="font-medium"
                        />
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={8}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit}>
                            <Check className="mr-1 h-3 w-3" /> Save & Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Subject:</p>
                          <p className="font-medium">{email.subject}</p>
                        </div>
                        <Separator />
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {email.body}
                        </div>
                        {email.contacts?.email && (
                          <p className="text-xs text-muted-foreground">
                            To: {email.contacts.email}
                          </p>
                        )}
                      </>
                    )}

                    {editingId !== email.id && email.approval_status === "pending" && (
                      <div className="flex items-center gap-2 pt-2">
                        <Button size="sm" onClick={() => handleApprove(email.id)}>
                          <Check className="mr-1 h-3 w-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => startEdit(email)}>
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(email.id)}>
                          <X className="mr-1 h-3 w-3" /> Reject
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleSkip(email.id)}>
                          <SkipForward className="mr-1 h-3 w-3" /> Skip
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
