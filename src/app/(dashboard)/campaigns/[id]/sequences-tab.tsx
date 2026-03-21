"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, Loader2, Trash2, Wand2, ListOrdered, GripVertical,
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

interface Sequence {
  id: string
  name: string
  status: string
  sequence_steps: { count: number }[]
}

interface SequenceTabProps {
  campaignId: string
}

export function SequencesTab({ campaignId }: SequenceTabProps) {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)

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

  useEffect(() => { fetchSequences() }, [fetchSequences])

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    }
    setGenerating(null)
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
          {sequences.map((seq) => (
            <Card key={seq.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{seq.name}</CardTitle>
                  <Badge variant={seq.status === "active" ? "default" : "secondary"}>
                    {seq.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {seq.sequence_steps?.[0]?.count || 0} steps
                  </span>
                </div>
                <div className="flex items-center gap-2">
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
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(seq.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

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
