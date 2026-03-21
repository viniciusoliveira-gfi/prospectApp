"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Building2, Globe, MapPin, Users, Factory,
  ExternalLink, Mail, Phone, Loader2, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { Prospect, Contact } from "@/lib/supabase/types"

interface ContactWithMeta extends Contact {
  campaigns: { name: string } | null
}

export default function ProspectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const prospectId = params.id as string
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [contacts, setContacts] = useState<ContactWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [researching, setResearching] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const { data: prospectData, error } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single()

    if (error || !prospectData) {
      toast.error("Prospect not found")
      router.push("/prospects")
      return
    }

    setProspect(prospectData)

    // Get all contacts for this prospect (across all campaigns)
    const { data: contactsData } = await supabase
      .from("contacts")
      .select("*, campaigns(name)")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false })

    setContacts((contactsData || []) as unknown as ContactWithMeta[])
    setLoading(false)
  }, [prospectId, router])

  useEffect(() => { fetchData() }, [fetchData])

  const handleResearch = async () => {
    setResearching(true)
    try {
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId }),
      })
      if (!res.ok) throw new Error()
      toast.success("Research completed")
      fetchData()
    } catch {
      toast.error("Research failed")
    }
    setResearching(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!prospect) return null

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/prospects"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{prospect.company_name}</h2>
          {prospect.domain && (
            <p className="text-sm text-gray-500">{prospect.domain}</p>
          )}
        </div>
      </div>

      {/* Company Info Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Company Information</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResearch}
            disabled={researching}
          >
            {researching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {prospect.ai_research ? "Re-research" : "Research"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {prospect.industry && (
              <div className="flex items-start gap-2">
                <Factory className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Industry</p>
                  <p className="text-sm">{prospect.industry}</p>
                </div>
              </div>
            )}
            {prospect.country && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Country</p>
                  <p className="text-sm">{prospect.country}</p>
                </div>
              </div>
            )}
            {prospect.size && (
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Company Size</p>
                  <p className="text-sm">{prospect.size}</p>
                </div>
              </div>
            )}
            {prospect.website && (
              <div className="flex items-start gap-2">
                <Globe className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Website</p>
                  <a
                    href={prospect.website.startsWith("http") ? prospect.website : `https://${prospect.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {prospect.website}
                  </a>
                </div>
              </div>
            )}
          </div>

          {prospect.description && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">Description</p>
                <p className="text-sm text-gray-700">{prospect.description}</p>
              </div>
            </>
          )}

          {prospect.ai_research && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">AI Research</p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {prospect.ai_research}
                  </div>
                </div>
              </div>
            </>
          )}

          {prospect.tags && prospect.tags.length > 0 && (
            <>
              <Separator />
              <div className="flex gap-2 flex-wrap">
                {prospect.tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" />
            Contacts ({contacts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No contacts found for this company. Add contacts from a campaign.
            </p>
          ) : (
            <div className="space-y-3">
              {contacts.map(contact => (
                <div key={contact.id} className="flex items-start justify-between p-4 rounded-lg border bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">
                        {contact.first_name} {contact.last_name}
                      </h4>
                      {contact.campaigns?.name && (
                        <Badge variant="secondary" className="text-xs">
                          {contact.campaigns.name}
                        </Badge>
                      )}
                      <Badge
                        variant={contact.status === "active" ? "outline" : contact.status === "replied" ? "default" : "secondary"}
                        className={contact.status === "replied" ? "bg-green-100 text-green-700 border-green-200" : ""}
                      >
                        {contact.status}
                      </Badge>
                    </div>
                    {contact.title && (
                      <p className="text-sm text-gray-500 mt-0.5">{contact.title}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      {contact.email && (
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <Mail className="h-3.5 w-3.5 text-gray-400" />
                          {contact.email}
                        </span>
                      )}
                      {contact.phone && (
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <Phone className="h-3.5 w-3.5 text-gray-400" />
                          {contact.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {contact.linkedin_url && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
