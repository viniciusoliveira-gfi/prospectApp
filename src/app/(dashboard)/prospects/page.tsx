"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Building2, Users, Search, Globe, ChevronRight, Loader2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface ProspectRow {
  id: string
  company_name: string
  domain: string | null
  industry: string | null
  country: string | null
  size: string | null
  ai_research_status: string
  campaign_id: string
  campaigns: { name: string } | null
  contact_count: number
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<ProspectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchProspects = useCallback(async () => {
    const supabase = createClient()

    const { data, error } = await supabase
      .from("prospects")
      .select("*, campaigns(name)")
      .order("company_name")

    if (error) { toast.error("Failed to load prospects"); setLoading(false); return }

    // Get contact counts per prospect
    const withCounts: ProspectRow[] = await Promise.all(
      (data || []).map(async (p) => {
        const { count } = await supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("prospect_id", p.id)

        return {
          ...p,
          campaigns: p.campaigns as unknown as { name: string } | null,
          contact_count: count || 0,
        }
      })
    )

    setProspects(withCounts)
    setLoading(false)
  }, [])

  useEffect(() => { fetchProspects() }, [fetchProspects])

  const filtered = prospects.filter(p => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      p.company_name.toLowerCase().includes(q) ||
      p.domain?.toLowerCase().includes(q) ||
      p.industry?.toLowerCase().includes(q) ||
      p.country?.toLowerCase().includes(q)
    )
  })

  // Group by company name to deduplicate across campaigns
  const uniqueCompanies = new Map<string, ProspectRow[]>()
  for (const p of filtered) {
    const key = p.domain || p.company_name
    if (!uniqueCompanies.has(key)) uniqueCompanies.set(key, [])
    uniqueCompanies.get(key)!.push(p)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {prospects.length} companies across all campaigns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search companies..."
              className="pl-9 w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">
              {searchQuery ? "No companies match your search" : "No prospect companies yet"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Add companies from the Campaigns tab to see them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {Array.from(uniqueCompanies.entries()).map(([key, entries]) => {
            const primary = entries[0]
            const totalContacts = entries.reduce((sum, e) => sum + e.contact_count, 0)

            return (
              <Link key={key} href={`/prospects/${primary.id}`}>
                <Card className="hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4 px-5">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{primary.company_name}</h3>
                        <div className="flex items-center gap-3 mt-0.5">
                          {primary.domain && (
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              <Globe className="h-3 w-3" /> {primary.domain}
                            </span>
                          )}
                          {primary.industry && (
                            <span className="text-sm text-gray-500">{primary.industry}</span>
                          )}
                          {primary.country && (
                            <span className="text-sm text-gray-500">{primary.country}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{totalContacts}</span>
                        <span className="text-gray-400">contacts</span>
                      </div>
                      <div className="flex gap-1.5">
                        {entries.map(e => (
                          <Badge key={e.id} variant="secondary" className="text-xs">
                            {e.campaigns?.name || "Campaign"}
                          </Badge>
                        ))}
                      </div>
                      <Badge
                        variant={primary.ai_research_status === "completed" ? "default" : "outline"}
                        className={primary.ai_research_status === "completed" ? "bg-green-100 text-green-700 border-green-200" : ""}
                      >
                        {primary.ai_research_status === "researching" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {primary.ai_research_status}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-gray-300" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
