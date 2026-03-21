"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, Loader2, Trash2, Wand2, ListOrdered, GripVertical,
  Play, Pause, RotateCcw, CheckCircle2, Clock, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface Step {
  delay_days: number
  subject_template: string
  body_template: string
  step_type: string
}

interface SequenceStepDetail {
  id: string
  step_number: number
  delay_days: number
  subject_template: string
}

interface EmailStats {
  total: number
  approved: number
  sent: number
  scheduled: number
  failed: number
  skipped: number
}

interface Sequence {
  id: string
  name: string
  status: string
  started_at: string | null
  paused_at: string | null
  completed_at: string | null
  sequence_steps: { count: number }[]
}

interface SequenceTabProps {
  campaignId: string
}

export function SequencesTab({ campaignId }: SequenceTabProps) {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmStart, setConfirmStart] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [emailStats, setEmailStats] = useState<Record<string, EmailStats>>({})
  const [stepDetails, setStepDetails] = useState<Record<string, SequenceStepDetail[]>>({})

  // Create form
  const [seqName, setSeqName] = useState("")
  const [steps, setSteps] = useState<Step[]>([
    { delay_days: 0, subject_template: "Pain hook — reference their specific challenge", body_template: "Opening email that hooks with a specific pain point the prospect faces. Be direct and specific.", step_type: "email" },
    { delay_days: 4, subject_template: "Product intro — show how we solve it", body_template: "Follow-up that introduces how we specifically solve the challenge mentioned in email 1.", step_type: "email" },
    { delay_days: 9, subject_template: "Social proof / economics", body_template: "Share a relevant case study or ROI numbers. Make it about results, not features.", step_type: "email" },
    { delay_days: 14, subject_template: "Breakup email", body_template: "Final gentle email. Acknowledge they may not be interested right now. Leave the door open.", step_type: "email" },
  ])
  const [creating, setCreating] = useState(false)

  const fetchSequences = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("sequences")
      .select("*, sequence_steps(count)")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })

    if (error) toast.error("Failed to load sequences")
    else setSequences(data || [])
    setLoading(false)
  }, [campaignId])

  const fetchEmailStats = useCallback(async (sequenceIds: string[]) => {
    if (!sequenceIds.length) return
    const supabase = createClient()

    const newStats: Record<string, EmailStats> = {}
    const newStepDetails: Record<string, SequenceStepDetail[]> = {}

    for (const seqId of sequenceIds) {
      // Get steps
      const { data: stepsData } = await supabase
        .from("sequence_steps")
        .select("id, step_number, delay_days, subject_template")
        .eq("sequence_id", seqId)
        .order("step_number")

      if (stepsData) {
        newStepDetails[seqId] = stepsData
        const stepIds = stepsData.map(s => s.id)

        if (stepIds.length) {
          const { data: emails } = await supabase
            .from("emails")
            .select("approval_status, send_status")
            .in("sequence_step_id", stepIds)

          if (emails) {
            newStats[seqId] = {
              total: emails.length,
              approved: emails.filter(e => e.approval_status === "approved" || e.approval_status === "edited").length,
              sent: emails.filter(e => e.send_status === "sent").length,
              scheduled: emails.filter(e => e.send_status === "scheduled").length,
              failed: emails.filter(e => e.send_status === "failed").length,
              skipped: emails.filter(e => e.send_status === "skipped").length,
            }
          }
        }
      }
    }

    setEmailStats(prev => ({ ...prev, ...newStats }))
    setStepDetails(prev => ({ ...prev, ...newStepDetails }))
  }, [])

  useEffect(() => { fetchSequences() }, [fetchSequences])

  useEffect(() => {
    if (sequences.length) {
      fetchEmailStats(sequences.map(s => s.id))
    }
  }, [sequences, fetchEmailStats])

  const handleCreate = async () => {
    if (!seqName.trim()) { toast.error("Sequence name required"); return }
    if (steps.length === 0) { toast.error("Add at least one step"); return }
    setCreating(true)

    const res = await fetch(`/api/campaigns/${campaignId}/sequences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: seqName.trim(), steps }),
    })

    if (res.ok) {
      toast.success("Sequence created")
      setCreateOpen(false)
      setSeqName("")
      fetchSequences()
    } else {
      toast.error("Failed to create sequence")
    }
    setCreating(false)
  }

  const handleGenerate = async (sequenceId: string) => {
    setGenerating(sequenceId)
    toast.info("Generating personalized emails... This may take a minute.")

    try {
      const res = await fetch(`/api/sequences/${sequenceId}/generate`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Generated ${data.successful} emails (${data.failed} failed)`)
      fetchEmailStats([sequenceId])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    }
    setGenerating(null)
  }

  const handleStart = async (sequenceId: string) => {
    setActionLoading(sequenceId)
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/start`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Sequence started! ${data.emails_scheduled} emails scheduled.`)
      setConfirmStart(null)
      fetchSequences()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start sequence")
    }
    setActionLoading(null)
  }

  const handlePause = async (sequenceId: string) => {
    setActionLoading(sequenceId)
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/pause?action=pause`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Sequence paused")
      fetchSequences()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause")
    }
    setActionLoading(null)
  }

  const handleResume = async (sequenceId: string) => {
    setActionLoading(sequenceId)
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/pause?action=resume`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Sequence resumed. ${data.emails_rescheduled} emails rescheduled.`)
      fetchSequences()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume")
    }
    setActionLoading(null)
  }

  const handleDelete = async (sequenceId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("sequences").delete().eq("id", sequenceId)
    if (error) toast.error("Failed to delete")
    else { toast.success("Sequence deleted"); fetchSequences() }
  }

  const addStep = () => {
    const lastStep = steps[steps.length - 1]
    setSteps([...steps, {
      delay_days: (lastStep?.delay_days || 0) + 4,
      subject_template: "",
      body_template: "",
      step_type: "email",
    }])
  }

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, field: keyof Step, value: string | number) => {
    setSteps(steps.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "active": return "default"
      case "paused": return "outline"
      case "completed": return "secondary"
      default: return "secondary"
    }
  }

  if (loading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Sequence
        </Button>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ListOrdered className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No sequences yet</p>
            <p className="text-sm text-muted-foreground">
              Create an email sequence to start crafting outreach.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => {
            const stats = emailStats[seq.id]
            const seqSteps = stepDetails[seq.id] || []
            const isReady = stats && stats.total > 0 && stats.approved === stats.total
            const isLoading = actionLoading === seq.id

            return (
              <Card key={seq.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{seq.name}</CardTitle>
                    <Badge variant={statusBadgeVariant(seq.status)}>
                      {seq.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {seq.sequence_steps?.[0]?.count || 0} steps
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Start button — only for draft sequences with all emails approved */}
                    {seq.status === "draft" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setConfirmStart(seq.id)}
                        disabled={!isReady || isLoading}
                        title={!isReady ? "Approve all emails first" : "Start sequence"}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </Button>
                    )}

                    {/* Pause button — only for active sequences */}
                    {seq.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePause(seq.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
                        Pause
                      </Button>
                    )}

                    {/* Resume button — only for paused sequences */}
                    {seq.status === "paused" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleResume(seq.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        Resume
                      </Button>
                    )}

                    {seq.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerate(seq.id)}
                        disabled={generating === seq.id}
                      >
                        {generating === seq.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="mr-2 h-4 w-4" />
                        )}
                        Generate Emails
                      </Button>
                    )}

                    {seq.status === "draft" && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(seq.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Readiness indicator */}
                  {stats && stats.total > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 text-sm">
                        {isReady ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className={isReady ? "text-green-600" : "text-yellow-600"}>
                          {stats.approved}/{stats.total} emails approved
                          {isReady ? " — Ready to start" : ""}
                        </span>
                      </div>
                      {(seq.status === "active" || seq.status === "paused" || seq.status === "completed") && (
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{stats.sent} sent</span>
                          <span>{stats.scheduled} scheduled</span>
                          {stats.failed > 0 && <span className="text-red-500">{stats.failed} failed</span>}
                          {stats.skipped > 0 && <span>{stats.skipped} skipped</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step progress for active/paused/completed sequences */}
                  {seqSteps.length > 0 && (seq.status === "active" || seq.status === "paused" || seq.status === "completed") && (
                    <div className="space-y-2">
                      {seqSteps.map(step => (
                        <div key={step.id} className="flex items-center gap-3 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground w-16">
                            Day {step.delay_days}
                          </span>
                          <span className="truncate flex-1">
                            Step {step.step_number}: {step.subject_template}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timing info */}
                  {seq.started_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Started: {new Date(seq.started_at).toLocaleString()}
                      {seq.completed_at && ` | Completed: ${new Date(seq.completed_at).toLocaleString()}`}
                      {seq.paused_at && ` | Paused: ${new Date(seq.paused_at).toLocaleString()}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Start Confirmation Dialog */}
      <Dialog open={!!confirmStart} onOpenChange={() => setConfirmStart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Sequence?</DialogTitle>
            <DialogDescription>
              This will schedule all approved emails for delivery based on each step&apos;s delay.
              Emails will be sent automatically during sending hours (9am-6pm).
              You can pause the sequence at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStart(null)}>Cancel</Button>
            <Button
              onClick={() => confirmStart && handleStart(confirmStart)}
              disabled={actionLoading === confirmStart}
            >
              {actionLoading === confirmStart ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Sequence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sequence</DialogTitle>
            <DialogDescription>
              Define the steps of your email sequence. Claude will personalize each email per contact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sequence Name</Label>
              <Input
                placeholder="e.g., 4-Step Cold Outreach"
                value={seqName}
                onChange={(e) => setSeqName(e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-4">
              {steps.map((step, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-1 pt-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span className="text-sm font-medium">Step {i + 1}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-4">
                        <div className="space-y-1 flex-1">
                          <Label className="text-xs">Subject / Purpose</Label>
                          <Input
                            placeholder="Subject template or step purpose"
                            value={step.subject_template}
                            onChange={(e) => updateStep(i, "subject_template", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 w-[100px]">
                          <Label className="text-xs">Delay (days)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={step.delay_days}
                            onChange={(e) => updateStep(i, "delay_days", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Instructions for AI</Label>
                        <Textarea
                          placeholder="Describe what this email should accomplish..."
                          rows={2}
                          value={step.body_template}
                          onChange={(e) => updateStep(i, "body_template", e.target.value)}
                        />
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeStep(i)} className="mt-2">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
            <Button variant="outline" onClick={addStep} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add Step
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Sequence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
