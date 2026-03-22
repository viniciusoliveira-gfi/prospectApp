"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertTriangle, Target, Users, Swords, MessageSquare,
  Shield, Lightbulb, ChevronDown, ChevronUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import type { ProspectResearch, PainPoint, PersonaMapping, LocalCompetitor, MessagingHypothesis } from "@/lib/supabase/types"

interface ResearchDossierProps {
  prospectId: string
}

const severityColors = {
  high: "bg-red-50 border-red-200 text-red-800",
  medium: "bg-amber-50 border-amber-200 text-amber-800",
  low: "bg-green-50 border-green-200 text-green-800",
}

export function ResearchDossier({ prospectId }: ResearchDossierProps) {
  const [research, setResearch] = useState<ProspectResearch | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedObjections, setExpandedObjections] = useState(false)

  const fetchResearch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("prospect_research")
      .select("*")
      .eq("prospect_id", prospectId)
      .single()

    setResearch(data as ProspectResearch | null)
    setLoading(false)
  }, [prospectId])

  useEffect(() => { fetchResearch() }, [fetchResearch])

  if (loading) return <Skeleton className="h-64 w-full" />

  if (!research) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          <Lightbulb className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No structured research dossier yet.</p>
          <p className="text-xs text-gray-400 mt-1">Claude will create one when researching this prospect via MCP.</p>
        </CardContent>
      </Card>
    )
  }

  const painPoints = (research.pain_points || []) as PainPoint[]
  const personas = (research.personas || []) as PersonaMapping[]
  const competitors = (research.local_competitors || []) as LocalCompetitor[]
  const hypotheses = (research.messaging_hypotheses || []) as MessagingHypothesis[]
  const objections = (research.objection_map || []) as { objection: string; response: string }[]
  const opportunities = (research.opportunities || []) as { opportunity: string; fit_score: number; rationale: string }[]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>Depth: {research.research_depth}</span>
        <span>|</span>
        <span>By: {research.researched_by}</span>
        <span>|</span>
        <span>{new Date(research.researched_at).toLocaleDateString()}</span>
      </div>

      {/* Company Overview & Positioning */}
      {(research.company_overview || research.market_position) && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            {research.company_overview && (
              <p className="text-sm text-gray-700">{research.company_overview}</p>
            )}
            {research.market_position && (
              <p className="text-sm text-gray-600 italic">{research.market_position}</p>
            )}
            {research.recent_news && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                <span className="font-medium">Recent:</span> {research.recent_news}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Value Prop & Positioning */}
      {(research.core_value_prop || research.positioning_angle) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              Messaging Framework
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {research.core_value_prop && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-500 mb-1">Core Value Prop</p>
                <p className="text-sm font-medium text-blue-800">{research.core_value_prop}</p>
              </div>
            )}
            {research.positioning_angle && (
              <div>
                <p className="text-xs text-gray-400">Positioning Angle</p>
                <p className="text-sm text-gray-700">{research.positioning_angle}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pain Points */}
      {painPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Pain Points ({painPoints.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {painPoints.map((p, i) => (
                <div key={i} className={`rounded-lg border p-3 ${severityColors[p.severity]}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs uppercase">{p.severity}</Badge>
                    <span className="text-sm font-medium">{p.pain}</span>
                  </div>
                  <p className="text-xs opacity-75">{p.evidence}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-green-500" />
              Opportunities ({opportunities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {opportunities.map((o, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center text-sm font-bold text-green-600 shrink-0">
                    {o.fit_score}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{o.opportunity}</p>
                    <p className="text-xs text-gray-500">{o.rationale}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Persona Cards */}
      {personas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Personas ({personas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {personas.map((p, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.title}</p>
                    <p className="text-xs text-gray-400">Role: {p.role_in_deal}</p>
                  </div>
                  <div className="bg-purple-50 rounded p-2">
                    <p className="text-xs font-medium text-purple-600">Messaging Angle</p>
                    <p className="text-xs text-purple-800">{p.messaging_angle}</p>
                  </div>
                  {p.pain_points?.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {p.pain_points.map((pp, j) => (
                        <Badge key={j} variant="secondary" className="text-xs">{pp}</Badge>
                      ))}
                    </div>
                  )}
                  <Badge variant="outline" className="text-xs">Tone: {p.tone}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FOMO & Competitors */}
      {(competitors.length > 0 || research.fomo_strategy) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Swords className="h-4 w-4 text-orange-500" />
              Competitive & FOMO Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {competitors.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.company_name}</p>
                  <p className="text-xs text-gray-500">{c.relationship}</p>
                </div>
                <Badge variant={c.fomo_usable ? "default" : "secondary"} className={c.fomo_usable ? "bg-orange-100 text-orange-700 border-orange-200" : ""}>
                  {c.fomo_usable ? "FOMO usable" : "Not usable"}
                </Badge>
              </div>
            ))}
            {research.fomo_strategy && (
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-xs font-medium text-orange-600 mb-1">FOMO Strategy</p>
                <p className="text-sm text-orange-800">{research.fomo_strategy}</p>
              </div>
            )}
            {research.competitor_naming_strategy && (
              <p className="text-xs text-gray-500">Naming strategy: <strong>{research.competitor_naming_strategy}</strong></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Messaging Hypotheses */}
      {hypotheses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              Messaging Hypotheses ({hypotheses.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hypotheses.map((h, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${h.confidence === "high" ? "text-green-600 border-green-300" : h.confidence === "medium" ? "text-amber-600 border-amber-300" : "text-gray-500"}`}
                  >
                    {h.confidence}
                  </Badge>
                  <div>
                    <p className="text-sm">{h.hypothesis}</p>
                    <p className="text-xs text-gray-400">Dimension: {h.test_dimension}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Objection Map */}
      {objections.length > 0 && (
        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedObjections(!expandedObjections)}>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-500" />
              Objection Handling ({objections.length})
              {expandedObjections ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
            </CardTitle>
          </CardHeader>
          {expandedObjections && (
            <CardContent>
              <div className="space-y-3">
                {objections.map((o, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <p className="text-sm font-medium text-red-700">&ldquo;{o.objection}&rdquo;</p>
                    <p className="text-sm text-gray-600 mt-1">{o.response}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
