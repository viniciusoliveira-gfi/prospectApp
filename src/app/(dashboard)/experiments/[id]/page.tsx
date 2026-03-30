"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Trophy, Users, Mail,
  Eye, MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface Variant {
  variant_id: string
  label: string
  description: string
}

interface VariantMetrics {
  contacts: number
  emailsSent: number
  emailsOpened: number
  emailsReplied: number
  openRate: number
  replyRate: number
  contactReplyRate: number
  repliedContacts: Set<string>
}

interface Assignment {
  id: string
  variant_id: string
  contact_id: string
  emails_sent: number
  emails_replied: number
  reply_sentiment: string | null
  contacts: { first_name: string; last_name: string; email: string } | null
  prospects: { company_name: string } | null
}

interface SampleEmail {
  variant_id: string
  subject: string
  body: string
  contact_name: string
  company: string
}

interface ExperimentData {
  id: string
  name: string
  description: string | null
  status: string
  test_dimension: string
  hypothesis: string
  variants: Variant[]
  assignment_method: string
  primary_metric: string
  min_sample_per_variant: number
  confidence_threshold: number
  winner_variant: string | null
  learnings: string | null
  campaign_id: string | null
  campaigns: { name: string } | null
  created_at: string
  completed_at: string | null
}

export default function ExperimentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const experimentId = params?.id as string

  const [experiment, setExperiment] = useState<ExperimentData | null>(null)
  const [metrics, setMetrics] = useState<Record<string, VariantMetrics>>({})
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [sampleEmails, setSampleEmails] = useState<SampleEmail[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    // Get experiment
    const { data: exp, error } = await supabase
      .from("experiments")
      .select("*, campaigns(name)")
      .eq("id", experimentId)
      .single()

    if (error || !exp) {
      toast.error("Experiment not found")
      router.push("/experiments")
      return
    }
    setExperiment(exp as unknown as ExperimentData)

    // Get assignments
    const { data: simpleAssignments } = await supabase
      .from("experiment_assignments")
      .select("*")
      .eq("experiment_id", experimentId)

    // Get contact details separately
    const contactIds = (simpleAssignments || []).map(a => a.contact_id)
    const { data: contactsData } = contactIds.length
      ? await supabase.from("contacts").select("id, first_name, last_name, email, prospect_id").in("id", contactIds)
      : { data: [] }

    const prospectIds = (contactsData || []).filter(c => c.prospect_id).map(c => c.prospect_id)
    const { data: prospectsData } = prospectIds.length
      ? await supabase.from("prospects").select("id, company_name").in("id", prospectIds)
      : { data: [] }

    const contactMap = Object.fromEntries((contactsData || []).map(c => [c.id, c]))
    const prospectMap = Object.fromEntries((prospectsData || []).map(p => [p.id, p]))

    const enrichedAssignments: Assignment[] = (simpleAssignments || []).map(a => {
      const contact = contactMap[a.contact_id]
      const prospect = contact?.prospect_id ? prospectMap[contact.prospect_id] : null
      return {
        ...a,
        contacts: contact ? { first_name: contact.first_name, last_name: contact.last_name, email: contact.email } : null,
        prospects: prospect ? { company_name: prospect.company_name } : null,
      }
    })
    setAssignments(enrichedAssignments)

    // Get real metrics from emails
    const { data: emails } = await supabase
      .from("emails")
      .select("variant_id, send_status, open_count, replied_at, contact_id, subject, body")
      .eq("experiment_id", experimentId)

    const variants = (exp.variants as Variant[])
    const variantMetrics: Record<string, VariantMetrics> = {}

    for (const v of variants) {
      const assignmentCount = (simpleAssignments || []).filter(a => a.variant_id === v.variant_id).length
      variantMetrics[v.variant_id] = {
        contacts: assignmentCount,
        emailsSent: 0,
        emailsOpened: 0,
        emailsReplied: 0,
        openRate: 0,
        replyRate: 0,
        contactReplyRate: 0,
        repliedContacts: new Set(),
      }
    }

    for (const e of (emails || [])) {
      if (!e.variant_id || !variantMetrics[e.variant_id]) continue
      const m = variantMetrics[e.variant_id]
      if (e.send_status === "sent") {
        m.emailsSent++
        if (e.open_count > 0) m.emailsOpened++
        if (e.replied_at) {
          m.emailsReplied++
          m.repliedContacts.add(e.contact_id)
        }
      }
    }

    for (const [, m] of Object.entries(variantMetrics)) {
      m.openRate = m.emailsSent > 0 ? Math.round((m.emailsOpened / m.emailsSent) * 100) : 0
      m.replyRate = m.emailsSent > 0 ? Math.round((m.emailsReplied / m.emailsSent) * 100) : 0
      m.contactReplyRate = m.contacts > 0 ? Math.round((m.repliedContacts.size / m.contacts) * 100) : 0
    }

    setMetrics(variantMetrics)

    // Get sample emails (one per variant)
    const samples: SampleEmail[] = []
    for (const v of variants) {
      const email = (emails || []).find(e => e.variant_id === v.variant_id && e.subject)
      if (email) {
        const contact = contactMap[email.contact_id]
        const prospect = contact?.prospect_id ? prospectMap[contact.prospect_id] : null
        samples.push({
          variant_id: v.variant_id,
          subject: email.subject,
          body: email.body,
          contact_name: contact ? `${contact.first_name} ${contact.last_name}` : "Unknown",
          company: prospect?.company_name || "",
        })
      }
    }
    setSampleEmails(samples)

    setLoading(false)
  }, [experimentId, router])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!experiment) return null

  const variants = experiment.variants
  const maxReplyRate = Math.max(...Object.values(metrics).map(m => m.replyRate), 1)
  const maxOpenRate = Math.max(...Object.values(metrics).map(m => m.openRate), 1)

  const variantColors: Record<string, string> = {
    A: "bg-blue-500",
    B: "bg-purple-500",
    C: "bg-amber-500",
    D: "bg-green-500",
  }

  const variantBgColors: Record<string, string> = {
    A: "bg-blue-50 border-blue-200",
    B: "bg-purple-50 border-purple-200",
    C: "bg-amber-50 border-amber-200",
    D: "bg-green-50 border-green-200",
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/experiments"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{experiment.name}</h2>
            <Badge variant={experiment.status === "active" ? "default" : "secondary"}>{experiment.status}</Badge>
            <Badge variant="outline">{experiment.test_dimension}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{experiment.hypothesis}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            {experiment.campaigns?.name && <span>Campaign: {experiment.campaigns.name}</span>}
            <span>Metric: {experiment.primary_metric}</span>
            <span>Min sample: {experiment.min_sample_per_variant} per variant</span>
            <span>Created: {new Date(experiment.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Winner banner */}
      {experiment.winner_variant && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 flex items-start gap-3">
            <Trophy className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800">
                Winner: Variant {experiment.winner_variant} — {variants.find(v => v.variant_id === experiment.winner_variant)?.label}
              </p>
              {experiment.learnings && (
                <p className="text-sm text-green-700 mt-1">{experiment.learnings}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Variant comparison */}
      <div className={`grid gap-4 ${variants.length <= 2 ? "md:grid-cols-2" : variants.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
        {variants.map(v => {
          const m = metrics[v.variant_id]
          const isWinner = experiment.winner_variant === v.variant_id
          const sufficient = m && m.contacts >= experiment.min_sample_per_variant

          return (
            <Card key={v.variant_id} className={`${isWinner ? "border-green-300 ring-2 ring-green-100" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${variantColors[v.variant_id] || "bg-gray-400"}`} />
                    <CardTitle className="text-sm">Variant {v.variant_id}: {v.label}</CardTitle>
                  </div>
                  {isWinner && <Trophy className="h-4 w-4 text-green-600" />}
                </div>
                <p className="text-xs text-gray-500">{v.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {m ? (
                  <>
                    {/* Contacts */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Contacts</span>
                      <span className="font-medium">{m.contacts}</span>
                    </div>

                    {/* Emails sent */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Sent</span>
                      <span className="font-medium">{m.emailsSent}</span>
                    </div>

                    {/* Open rate */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-500 flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Open rate</span>
                        <span className="font-medium">{m.openRate}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${variantColors[v.variant_id] || "bg-gray-400"}`}
                          style={{ width: `${maxOpenRate > 0 ? (m.openRate / maxOpenRate) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Reply rate */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-500 flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Reply rate</span>
                        <span className="font-medium">{m.replyRate}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${variantColors[v.variant_id] || "bg-gray-400"}`}
                          style={{ width: `${maxReplyRate > 0 ? (m.replyRate / maxReplyRate) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Contact reply rate */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Contact reply rate</span>
                      <span className="font-medium">{m.contactReplyRate}%</span>
                    </div>

                    {/* Data sufficiency */}
                    <div className={`text-xs px-2 py-1 rounded text-center ${sufficient ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                      {sufficient ? "Sufficient data" : `Need ${experiment.min_sample_per_variant - m.contacts} more contacts`}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No data yet</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Sample emails per variant */}
      {sampleEmails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sample Emails by Variant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sampleEmails.map(sample => {
                const variant = variants.find(v => v.variant_id === sample.variant_id)
                return (
                  <div key={sample.variant_id} className={`border rounded-lg overflow-hidden ${variantBgColors[sample.variant_id] || ""}`}>
                    <div className="px-4 py-2 border-b flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${variantColors[sample.variant_id] || "bg-gray-400"}`} />
                      <span className="text-sm font-medium">Variant {sample.variant_id}: {variant?.label}</span>
                      <span className="text-xs text-gray-400">— to {sample.contact_name}{sample.company ? ` at ${sample.company}` : ""}</span>
                    </div>
                    <div className="p-4 bg-white">
                      <p className="text-sm mb-2">
                        <span className="text-gray-400">Subject:</span>{" "}
                        <span className="font-medium text-gray-800">{sample.subject}</span>
                      </p>
                      <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                        {sample.body}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact assignments */}
      {assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" />
              Assignments ({assignments.length} contacts)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Emails Sent</TableHead>
                  <TableHead>Replied</TableHead>
                  <TableHead>Sentiment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments
                  .sort((a, b) => a.variant_id.localeCompare(b.variant_id))
                  .map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${variantColors[a.variant_id] || "bg-gray-400"}`} />
                        <span className="text-sm font-medium">{a.variant_id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.contacts ? `${a.contacts.first_name} ${a.contacts.last_name}` : "—"}
                      {a.contacts?.email && (
                        <span className="text-xs text-gray-400 ml-1">({a.contacts.email})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {a.prospects?.company_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{a.emails_sent}</TableCell>
                    <TableCell className="text-sm">
                      {a.emails_replied > 0 ? (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">Replied</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.reply_sentiment ? (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            a.reply_sentiment === "positive" ? "text-green-600 border-green-300" :
                            a.reply_sentiment === "negative" ? "text-red-600 border-red-300" :
                            "text-gray-600"
                          }`}
                        >
                          {a.reply_sentiment}
                        </Badge>
                      ) : "—"}
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
