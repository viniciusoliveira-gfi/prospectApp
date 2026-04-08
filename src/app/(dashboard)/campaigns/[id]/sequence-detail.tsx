"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Mail, Eye, MessageSquare, Clock, ChevronUp, ChevronDown,
  Search, ArrowLeft, CheckCircle2, XCircle, ExternalLink, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface SequenceStep {
  id: string
  step_number: number
  delay_days: number
  subject_template: string
  body_template: string
}

interface ContactEmail {
  id: string
  sequence_step_id: string
  contact_id: string
  subject: string
  body: string
  approval_status: string
  send_status: string
  scheduled_for: string | null
  sent_at: string | null
  open_count: number
  opened_at: string | null
  replied_at: string | null
  reply_snippet: string | null
  gmail_message_id: string | null
  sent_from: string | null
  error_message: string | null
}

interface ContactRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  title: string | null
  linkedin_url: string | null
  phone: string | null
  status: string
  prospect: {
    company_name: string
    domain: string | null
    industry: string | null
    country: string | null
    size: string | null
    website: string | null
  } | null
  emails: ContactEmail[]
  overall_status: "pending" | "scheduled" | "sent" | "opened" | "replied" | "failed"
}

interface SequenceDetailProps {
  sequenceId: string
  sequenceName: string
  onBack: () => void
}

function cleanReplySnippet(snippet: string): string {
  // Decode HTML entities
  let clean = snippet
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")

  // Remove the quoted original message ("On ... wrote: ...")
  const onWroteIndex = clean.search(/On\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d).*wrote:/i)
  if (onWroteIndex > 0) {
    clean = clean.substring(0, onWroteIndex).trim()
  }

  // Also try "em ... escreveu:" for Portuguese
  const ptIndex = clean.search(/em\s+\d.*escreveu:/i)
  if (ptIndex > 0) {
    clean = clean.substring(0, ptIndex).trim()
  }

  return clean || snippet
}

function getContactOverallStatus(emails: ContactEmail[]): ContactRow["overall_status"] {
  if (emails.some(e => e.replied_at)) return "replied"
  if (emails.some(e => e.open_count > 0)) return "opened"
  if (emails.some(e => e.send_status === "sent")) return "sent"
  if (emails.some(e => e.send_status === "failed")) return "failed"
  if (emails.some(e => e.send_status === "scheduled")) return "scheduled"
  return "pending"
}

const statusColors: Record<string, string> = {
  replied: "text-purple-600 bg-purple-50",
  opened: "text-green-600 bg-green-50",
  sent: "text-blue-600 bg-blue-50",
  scheduled: "text-gray-600 bg-gray-100",
  pending: "text-gray-400 bg-gray-50",
  failed: "text-red-600 bg-red-50",
}

const statusLabels: Record<string, string> = {
  replied: "Replied",
  opened: "Opened",
  sent: "Sent",
  scheduled: "Scheduled",
  pending: "Pending",
  failed: "Failed",
}

export function SequenceDetail({ sequenceId, sequenceName, onBack }: SequenceDetailProps) {
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    // Fetch steps
    const { data: stepsData } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("step_number")

    const fetchedSteps = (stepsData || []) as SequenceStep[]
    setSteps(fetchedSteps)

    if (!fetchedSteps.length) { setLoading(false); return }

    const stepIds = fetchedSteps.map(s => s.id)

    // Fetch all emails for this sequence
    const { data: emailsData } = await supabase
      .from("emails")
      .select("*")
      .in("sequence_step_id", stepIds)

    const allEmails = (emailsData || []) as ContactEmail[]

    // Get unique contact IDs
    const contactIds = Array.from(new Set(allEmails.map(e => e.contact_id)))

    if (!contactIds.length) { setLoading(false); return }

    // Fetch contacts with prospect info
    const { data: contactsData } = await supabase
      .from("contacts")
      .select("*, prospects(company_name, domain, industry, country, size, website)")
      .in("id", contactIds)
      .order("first_name")

    const contactRows: ContactRow[] = (contactsData || []).map(c => {
      const contactEmails = allEmails
        .filter(e => e.contact_id === c.id)
        .sort((a, b) => {
          const stepA = fetchedSteps.find(s => s.id === a.sequence_step_id)?.step_number || 0
          const stepB = fetchedSteps.find(s => s.id === b.sequence_step_id)?.step_number || 0
          return stepA - stepB
        })

      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        title: c.title,
        linkedin_url: c.linkedin_url,
        phone: c.phone,
        status: c.status,
        prospect: c.prospects as ContactRow["prospect"],
        emails: contactEmails,
        overall_status: getContactOverallStatus(contactEmails),
      }
    })

    setContacts(contactRows)
    if (contactRows.length && !selectedContactId) {
      setSelectedContactId(contactRows[0].id)
    }
    setLoading(false)
  }, [sequenceId, selectedContactId])

  useEffect(() => { fetchData() }, [fetchData])

  const selectedContact = contacts.find(c => c.id === selectedContactId)

  const filteredContacts = contacts.filter(c => {
    if (statusFilter !== "all" && c.overall_status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.prospect?.company_name.toLowerCase().includes(q)
      )
    }
    return true
  })

  const startEditing = (email: ContactEmail) => {
    setEditingEmail(email.id)
    setEditSubject(email.subject)
    setEditBody(email.body)
  }

  const cancelEditing = () => {
    setEditingEmail(null)
    setEditSubject("")
    setEditBody("")
  }

  const saveEmail = async (emailId: string) => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("emails")
      .update({
        subject: editSubject,
        body: editBody,
        approval_status: "edited",
      })
      .eq("id", emailId)

    if (error) toast.error("Failed to save")
    else {
      toast.success("Email updated")
      setEditingEmail(null)
      fetchData()
    }
    setSaving(false)
  }

  const approveEmail = async (emailId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("emails")
      .update({ approval_status: "approved", approved_at: new Date().toISOString() })
      .eq("id", emailId)

    if (error) toast.error("Failed to approve")
    else { toast.success("Approved"); fetchData() }
  }

  const rejectEmail = async (emailId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("emails")
      .update({ approval_status: "rejected" })
      .eq("id", emailId)

    if (error) toast.error("Failed to reject")
    else { toast.success("Rejected"); fetchData() }
  }

  if (loading) return <Skeleton className="h-[600px] w-full" />

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold text-gray-900">{sequenceName}</h3>
        <span className="text-sm text-gray-500">{contacts.length} recipients</span>
      </div>

      {/* 3-column layout */}
      <div className="flex border rounded-lg bg-white overflow-hidden" style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}>
        {/* Left column: contacts list */}
        <div className="w-[280px] border-r flex flex-col shrink-0">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search..."
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="opened">Opened</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map(contact => (
              <button
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={`w-full text-left px-3 py-2.5 border-b transition-colors ${
                  selectedContactId === contact.id
                    ? "bg-blue-50 border-l-2 border-l-blue-600"
                    : "hover:bg-gray-50 border-l-2 border-l-transparent"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {contact.first_name} {contact.last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {contact.title ? `${contact.title} at ` : ""}{contact.prospect?.company_name || ""}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ml-2 ${statusColors[contact.overall_status]}`}>
                    {statusLabels[contact.overall_status]}
                  </span>
                </div>
              </button>
            ))}
            {filteredContacts.length === 0 && (
              <p className="text-sm text-gray-400 p-4 text-center">No contacts match filters</p>
            )}
          </div>
        </div>

        {/* Center column: emails */}
        <div className="flex-1 overflow-y-auto">
          {selectedContact ? (
            <div className="p-4 space-y-4">
              {steps.map(step => {
                const email = selectedContact.emails.find(e => e.sequence_step_id === step.id)
                if (!email) return null

                const isEditing = editingEmail === email.id
                const isSent = email.send_status === "sent"
                const isEditable = !isSent && email.send_status !== "sending"

                return (
                  <div key={step.id} className={`border rounded-lg overflow-hidden ${isSent ? "border-green-200 bg-green-50/30" : ""}`}>
                    {/* Step header */}
                    <div className={`px-4 py-2.5 flex items-center justify-between border-b ${isSent ? "bg-green-50" : "bg-gray-50"}`}>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">
                          {step.step_number === 1 ? "Initial email" : `Follow up ${step.step_number - 1}`}
                        </span>
                        <span className="text-xs text-gray-400">
                          {(() => {
                            if (step.step_number === 1) return ""
                            const prevStep = steps.find(s => s.step_number === step.step_number - 1)
                            const gap = prevStep ? step.delay_days - prevStep.delay_days : step.delay_days
                            return `${gap} days after previous · day ${step.delay_days} from start`
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {email.approval_status === "pending" && !isEditing && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => approveEmail(email.id)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => rejectEmail(email.id)}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Email content */}
                    <div className="p-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Subject</label>
                            <Input
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Body</label>
                            <Textarea
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              rows={10}
                              className="text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveEmail(email.id)} disabled={saving}>
                              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditing}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={isEditable ? "cursor-pointer" : ""}
                          onClick={() => isEditable && startEditing(email)}
                          title={isEditable ? "Click to edit" : ""}
                        >
                          <p className="text-sm text-gray-500 mb-2">
                            <span className="text-gray-400">Subject</span>{" "}
                            <span className="font-medium text-gray-800">{email.subject}</span>
                          </p>
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {email.body}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Email footer with status */}
                    <div className={`px-4 py-2 flex items-center justify-between border-t ${isSent ? "bg-green-50" : "bg-gray-50"}`}>
                      <div className="flex items-center gap-3">
                        <EmailStatusBadge status={email.send_status} approval={email.approval_status} />
                        {email.sent_from && (
                          <span className="text-xs text-gray-500">
                            via {email.sent_from}
                          </span>
                        )}
                        {email.sent_at && (
                          <span className="text-xs text-gray-400">
                            {new Date(email.sent_at).toLocaleString()}
                          </span>
                        )}
                        {!email.sent_at && email.scheduled_for && (
                          <span className="text-xs text-gray-400">
                            <Clock className="inline h-3 w-3 mr-0.5" />
                            Scheduled: {new Date(email.scheduled_for).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {email.open_count > 0 && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {email.open_count} opens
                          </span>
                        )}
                        {email.replied_at && (
                          <span className="text-xs text-purple-600 flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> Replied
                          </span>
                        )}
                        {email.error_message && (
                          <span className="text-xs text-red-500" title={email.error_message}>
                            Error
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reply from contact */}
                    {email.replied_at && email.reply_snippet && (
                      <div className="border-t">
                        <div className="bg-purple-50 px-4 py-2.5 flex items-center gap-2 border-b border-purple-100">
                          <MessageSquare className="h-4 w-4 text-purple-500" />
                          <span className="text-sm font-medium text-purple-700">
                            Reply from {selectedContact?.first_name} {selectedContact?.last_name}
                          </span>
                          <span className="text-xs text-purple-400">
                            {new Date(email.replied_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-4 bg-purple-50/30">
                          <div className="text-sm text-purple-800 leading-relaxed whitespace-pre-wrap">
                            {cleanReplySnippet(email.reply_snippet)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Select a contact to view their emails
            </div>
          )}
        </div>

        {/* Right column: contact profile */}
        <div className="w-[260px] border-l shrink-0 overflow-y-auto">
          {selectedContact ? (
            <div className="p-4 space-y-4">
              {/* Navigation */}
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const idx = filteredContacts.findIndex(c => c.id === selectedContactId)
                    if (idx > 0) setSelectedContactId(filteredContacts[idx - 1].id)
                  }}
                  disabled={filteredContacts.findIndex(c => c.id === selectedContactId) <= 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const idx = filteredContacts.findIndex(c => c.id === selectedContactId)
                    if (idx < filteredContacts.length - 1) setSelectedContactId(filteredContacts[idx + 1].id)
                  }}
                  disabled={filteredContacts.findIndex(c => c.id === selectedContactId) >= filteredContacts.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Contact info */}
              <div>
                <h4 className="font-semibold text-gray-900">
                  {selectedContact.first_name} {selectedContact.last_name}
                </h4>
                {selectedContact.email && (
                  <p className="text-sm text-gray-500">{selectedContact.email}</p>
                )}
                <div className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded ${statusColors[selectedContact.overall_status]}`}>
                  {statusLabels[selectedContact.overall_status]}
                </div>
              </div>

              <Separator />

              {/* Profile details */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Profile</p>
                {selectedContact.title && (
                  <div className="text-sm">
                    <span className="text-gray-400">Job title:</span>{" "}
                    <span className="text-gray-700">{selectedContact.title}</span>
                  </div>
                )}
                {selectedContact.phone && (
                  <div className="text-sm">
                    <span className="text-gray-400">Phone:</span>{" "}
                    <span className="text-gray-700">{selectedContact.phone}</span>
                  </div>
                )}
                {selectedContact.linkedin_url && (
                  <a
                    href={selectedContact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> LinkedIn
                  </a>
                )}
              </div>

              {selectedContact.prospect && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Organization</p>
                    <div className="text-sm">
                      <span className="text-gray-400">Company:</span>{" "}
                      <span className="text-gray-700 font-medium">{selectedContact.prospect.company_name}</span>
                    </div>
                    {selectedContact.prospect.website && (
                      <div className="text-sm">
                        <span className="text-gray-400">Website:</span>{" "}
                        <a
                          href={selectedContact.prospect.website.startsWith("http") ? selectedContact.prospect.website : `https://${selectedContact.prospect.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {selectedContact.prospect.website}
                        </a>
                      </div>
                    )}
                    {selectedContact.prospect.industry && (
                      <div className="text-sm">
                        <span className="text-gray-400">Industry:</span>{" "}
                        <span className="text-gray-700">{selectedContact.prospect.industry}</span>
                      </div>
                    )}
                    {selectedContact.prospect.size && (
                      <div className="text-sm">
                        <span className="text-gray-400">Size:</span>{" "}
                        <span className="text-gray-700">{selectedContact.prospect.size}</span>
                      </div>
                    )}
                    {selectedContact.prospect.country && (
                      <div className="text-sm">
                        <span className="text-gray-400">Country:</span>{" "}
                        <span className="text-gray-700">{selectedContact.prospect.country}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EmailStatusBadge({ status, approval }: { status: string; approval: string }) {
  if (status === "sent") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Sent</Badge>
  if (status === "sending") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">Sending</Badge>
  if (status === "scheduled") return <Badge variant="outline" className="text-xs">Scheduled</Badge>
  if (status === "failed") return <Badge variant="destructive" className="text-xs">Failed</Badge>
  if (status === "skipped") return <Badge variant="secondary" className="text-xs">Skipped</Badge>
  if (approval === "approved" || approval === "edited") return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Approved</Badge>
  if (approval === "rejected") return <Badge variant="destructive" className="text-xs">Rejected</Badge>
  return <Badge variant="outline" className="text-xs">Pending</Badge>
}
