"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FlaskConical, ChevronRight, Search, Trophy, Clock, Pause,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface ExperimentRow {
  id: string
  name: string
  description: string | null
  status: string
  test_dimension: string
  hypothesis: string
  variants: { variant_id: string; label: string }[]
  primary_metric: string
  winner_variant: string | null
  learnings: string | null
  campaign_id: string | null
  campaigns: { name: string } | null
  created_at: string
}

const statusConfig: Record<string, { icon: typeof FlaskConical; color: string }> = {
  draft: { icon: Clock, color: "text-gray-500 bg-gray-50" },
  active: { icon: FlaskConical, color: "text-blue-600 bg-blue-50" },
  paused: { icon: Pause, color: "text-amber-600 bg-amber-50" },
  completed: { icon: Trophy, color: "text-green-600 bg-green-50" },
  analyzed: { icon: Trophy, color: "text-purple-600 bg-purple-50" },
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  const fetchExperiments = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("experiments")
      .select("*, campaigns(name)")
      .order("created_at", { ascending: false })

    if (error) toast.error("Failed to load experiments")
    else setExperiments((data || []) as unknown as ExperimentRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchExperiments() }, [fetchExperiments])

  const filtered = experiments.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.name.toLowerCase().includes(q) || e.test_dimension.toLowerCase().includes(q) || e.hypothesis.toLowerCase().includes(q)
    }
    return true
  })

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{experiments.length} experiments</p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search..." className="pl-9 w-[250px]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="analyzed">Analyzed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FlaskConical className="mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">No experiments yet</p>
            <p className="text-sm text-gray-500 mt-1">Claude will create experiments to test messaging hypotheses.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(exp => {
            const config = statusConfig[exp.status] || statusConfig.draft
            const StatusIcon = config.icon

            return (
              <Link key={exp.id} href={`/experiments/${exp.id}`}>
                <Card className="hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                          <StatusIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{exp.name}</h3>
                            <Badge variant="outline" className="text-xs">{exp.test_dimension}</Badge>
                            <Badge variant={exp.status === "active" ? "default" : "secondary"} className="text-xs">{exp.status}</Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{exp.hypothesis}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex gap-1.5">
                              {exp.variants.map(v => (
                                <Badge
                                  key={v.variant_id}
                                  variant={v.variant_id === exp.winner_variant ? "default" : "secondary"}
                                  className={`text-xs ${v.variant_id === exp.winner_variant ? "bg-green-100 text-green-700 border-green-200" : ""}`}
                                >
                                  {v.variant_id}: {v.label}
                                  {v.variant_id === exp.winner_variant && " ★"}
                                </Badge>
                              ))}
                            </div>
                            {exp.campaigns?.name && (
                              <span className="text-xs text-gray-400">{exp.campaigns.name}</span>
                            )}
                          </div>
                          {exp.learnings && (
                            <p className="text-xs text-purple-600 mt-2 bg-purple-50 rounded px-2 py-1">
                              {exp.learnings}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300 shrink-0 mt-1" />
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
