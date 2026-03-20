"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus, Upload, Search, Loader2, ChevronDown, ChevronUp,
  Trash2, RefreshCw, Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { Prospect } from "@/lib/supabase/types"

const tierColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tier_1: "default",
  tier_2: "secondary",
  tier_3: "outline",
  disqualified: "destructive",
}

const tierLabels: Record<string, string> = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
  disqualified: "Disqualified",
}

const researchStatusColors: Record<string, string> = {
  pending: "text-gray-400",
  researching: "text-yellow-500",
  completed: "text-green-500",
  failed: "text-red-500",
}

interface ProspectsTabProps {
  campaignId: string
}

export function ProspectsTab({ campaignId }: ProspectsTabProps) {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [researching, setResearching] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add prospect form
  const [companyName, setCompanyName] = useState("")
  const [domain, setDomain] = useState("")
  const [website, setWebsite] = useState("")
  const [country, setCountry] = useState("")
  const [industry, setIndustry] = useState("")
  const [size, setSize] = useState("")
  const [adding, setAdding] = useState(false)

  const fetchProspects = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("prospects")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })

    if (error) toast.error("Failed to load prospects")
    else setProspects(data || [])
    setLoading(false)
  }, [campaignId])

  useEffect(() => { fetchProspects() }, [fetchProspects])

  const handleAdd = async () => {
    if (!companyName.trim()) { toast.error("Company name required"); return }
    setAdding(true)
    const supabase = createClient()
    const { error } = await supabase.from("prospects").insert({
      campaign_id: campaignId,
      company_name: companyName.trim(),
      domain: domain.trim() || null,
      website: website.trim() || null,
      country: country.trim() || null,
      industry: industry.trim() || null,
      size: size.trim() || null,
    })
    if (error) toast.error("Failed to add prospect")
    else {
      toast.success("Prospect added")
      setAddOpen(false)
      resetForm()
      fetchProspects()
    }
    setAdding(false)
  }

  const resetForm = () => {
    setCompanyName(""); setDomain(""); setWebsite("")
    setCountry(""); setIndustry(""); setSize("")
  }

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/prospects/import`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Imported ${data.imported} prospects`)
      fetchProspects()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleResearchAll = async () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined
    setResearching(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/prospects/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_ids: ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Research completed for ${data.results?.length || 0} prospects`)
      fetchProspects()
    } catch {
      toast.error("Research failed")
    }
    setResearching(false)
    setSelectedIds(new Set())
  }

  const handleResearchOne = async (prospectId: string) => {
    const supabase = createClient()
    await supabase.from("prospects").update({ ai_research_status: "researching" }).eq("id", prospectId)
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, ai_research_status: "researching" } : p))

    try {
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId }),
      })
      if (!res.ok) throw new Error()
      toast.success("Research completed")
      fetchProspects()
    } catch {
      toast.error("Research failed")
      fetchProspects()
    }
  }

  const handleTierChange = async (prospectId: string, tier: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("prospects")
      .update({ tier })
      .eq("id", prospectId)

    if (error) toast.error("Failed to update tier")
    else {
      setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, tier: tier as Prospect["tier"] } : p))
    }
  }

  const handleDelete = async (prospectId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("prospects").delete().eq("id", prospectId)
    if (error) toast.error("Failed to delete")
    else {
      toast.success("Prospect deleted")
      fetchProspects()
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === prospects.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(prospects.map(p => p.id)))
  }

  if (loading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Prospect
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Import CSV
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
        <Button
          variant="outline"
          onClick={handleResearchAll}
          disabled={researching || prospects.length === 0}
        >
          {researching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {selectedIds.size > 0 ? `Research Selected (${selectedIds.size})` : "Research All"}
        </Button>
      </div>

      {prospects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No prospects yet</p>
            <p className="text-sm text-muted-foreground">Add companies manually or import a CSV.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === prospects.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-600"
                  />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Research</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospects.map((prospect) => (
                <>
                  <TableRow
                    key={prospect.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === prospect.id ? null : prospect.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(prospect.id)}
                        onChange={() => toggleSelect(prospect.id)}
                        className="rounded border-gray-600"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {prospect.company_name}
                        {expandedId === prospect.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{prospect.domain || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{prospect.industry || "—"}</TableCell>
                    <TableCell>
                      <span className={researchStatusColors[prospect.ai_research_status]}>
                        {prospect.ai_research_status === "researching" && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
                        {prospect.ai_research_status}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={prospect.tier || ""}
                        onValueChange={(v) => handleTierChange(prospect.id, v)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue placeholder="Set tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tier_1">Tier 1</SelectItem>
                          <SelectItem value="tier_2">Tier 2</SelectItem>
                          <SelectItem value="tier_3">Tier 3</SelectItem>
                          <SelectItem value="disqualified">Disqualified</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResearchOne(prospect.id)}
                          disabled={prospect.ai_research_status === "researching"}
                          title="Research"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(prospect.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === prospect.id && (
                    <TableRow key={`${prospect.id}-detail`}>
                      <TableCell colSpan={7} className="bg-muted/30">
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div><span className="text-muted-foreground">Country:</span> {prospect.country || "—"}</div>
                            <div><span className="text-muted-foreground">Size:</span> {prospect.size || "—"}</div>
                            <div><span className="text-muted-foreground">Website:</span> {prospect.website || "—"}</div>
                          </div>
                          {prospect.tier && (
                            <div className="flex items-center gap-2">
                              <Badge variant={tierColors[prospect.tier]}>{tierLabels[prospect.tier]}</Badge>
                              {prospect.qualification_rationale && (
                                <span className="text-sm text-muted-foreground">{prospect.qualification_rationale}</span>
                              )}
                            </div>
                          )}
                          {prospect.ai_research ? (
                            <div className="prose prose-sm prose-invert max-w-none">
                              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                {prospect.ai_research}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              No research yet. Click the refresh icon to research this company.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Prospect</DialogTitle>
            <DialogDescription>Add a company to this campaign.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input placeholder="e.g., Acme Corp" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input placeholder="https://acme.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Country</Label>
                <Input placeholder="US" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input placeholder="SaaS" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Size</Label>
                <Input placeholder="50-200" value={size} onChange={(e) => setSize(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? "Adding..." : "Add Prospect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
