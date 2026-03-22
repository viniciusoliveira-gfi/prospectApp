"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus, Upload, Loader2, ChevronDown, ChevronUp,
  Trash2, Building2, Users, Globe, MapPin, Factory,
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
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { Prospect } from "@/lib/supabase/types"

const researchStatusColors: Record<string, string> = {
  pending: "text-gray-400",
  researching: "text-amber-500",
  completed: "text-green-600",
  failed: "text-red-500",
}

interface ProspectWithCounts extends Prospect {
  campaign_contacts: number
  total_contacts: number
}

interface ProspectsTabProps {
  campaignId: string
}

export function ProspectsTab({ campaignId }: ProspectsTabProps) {
  const [prospects, setProspects] = useState<ProspectWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

    if (error) { toast.error("Failed to load prospects"); setLoading(false); return }

    // Get contact counts: campaign contacts and total contacts per prospect
    const withCounts: ProspectWithCounts[] = await Promise.all(
      (data || []).map(async (p) => {
        const { count: campaignContacts } = await supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("prospect_id", p.id)
          .eq("campaign_id", campaignId)

        const { count: totalContacts } = await supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("prospect_id", p.id)

        return {
          ...p,
          campaign_contacts: campaignContacts || 0,
          total_contacts: totalContacts || 0,
        }
      })
    )

    setProspects(withCounts)
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

  const handleDelete = async (prospectId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("prospects").delete().eq("id", prospectId)
    if (error) toast.error("Failed to delete")
    else {
      toast.success("Prospect deleted")
      fetchProspects()
    }
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
      </div>

      {prospects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">No prospects yet</p>
            <p className="text-sm text-gray-500">Add companies manually or import a CSV.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Research</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospects.map((prospect) => (
                <>
                  <TableRow
                    key={prospect.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(expandedId === prospect.id ? null : prospect.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {prospect.company_name}
                        {expandedId === prospect.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500">{prospect.domain || "—"}</TableCell>
                    <TableCell className="text-gray-500">{prospect.industry || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm font-medium">{prospect.campaign_contacts}</span>
                        {prospect.total_contacts > prospect.campaign_contacts && (
                          <span className="text-xs text-gray-400">
                            / {prospect.total_contacts} in DB
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={researchStatusColors[prospect.ai_research_status]}>
                        {prospect.ai_research_status === "researching" && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
                        {prospect.ai_research_status}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
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
                      <TableCell colSpan={6} className="bg-gray-50/50">
                        <div className="p-4 space-y-4">
                          {/* Company details grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {prospect.country && (
                              <div className="flex items-center gap-2 text-sm">
                                <MapPin className="h-4 w-4 text-gray-400" />
                                <div>
                                  <p className="text-xs text-gray-400">Country</p>
                                  <p className="font-medium">{prospect.country}</p>
                                </div>
                              </div>
                            )}
                            {prospect.size && (
                              <div className="flex items-center gap-2 text-sm">
                                <Users className="h-4 w-4 text-gray-400" />
                                <div>
                                  <p className="text-xs text-gray-400">Size</p>
                                  <p className="font-medium">{prospect.size}</p>
                                </div>
                              </div>
                            )}
                            {prospect.industry && (
                              <div className="flex items-center gap-2 text-sm">
                                <Factory className="h-4 w-4 text-gray-400" />
                                <div>
                                  <p className="text-xs text-gray-400">Industry</p>
                                  <p className="font-medium">{prospect.industry}</p>
                                </div>
                              </div>
                            )}
                            {prospect.website && (
                              <div className="flex items-center gap-2 text-sm">
                                <Globe className="h-4 w-4 text-gray-400" />
                                <div>
                                  <p className="text-xs text-gray-400">Website</p>
                                  <a
                                    href={prospect.website.startsWith("http") ? prospect.website : `https://${prospect.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-blue-600 hover:underline"
                                  >
                                    {prospect.website}
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>

                          {prospect.description && (
                            <div>
                              <p className="text-xs font-medium text-gray-400 mb-1">Description</p>
                              <p className="text-sm text-gray-700">{prospect.description}</p>
                            </div>
                          )}

                          {/* AI Research */}
                          {prospect.ai_research ? (
                            <div>
                              <p className="text-xs font-medium text-gray-400 mb-1">AI Research</p>
                              <div className="bg-white rounded-lg border p-4">
                                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                                  {prospect.ai_research}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 italic">
                              No research yet. Click the refresh icon to research this company.
                            </p>
                          )}

                          {prospect.tags && prospect.tags.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {prospect.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
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
