"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { Campaign } from "@/lib/supabase/types"
import { ProspectsTab } from "./prospects-tab"
import { ContactsTab } from "./contacts-tab"
import { SequencesTab } from "./sequences-tab"
import { EmailsTab } from "./emails-tab"
import { SettingsTab } from "./settings-tab"
import { AnalyticsTab } from "./analytics-tab"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  active: "default",
  paused: "outline",
  completed: "default",
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCampaign = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single()

    if (error) {
      toast.error("Campaign not found")
      router.push("/campaigns")
    } else {
      setCampaign(data)
    }
    setLoading(false)
  }, [campaignId, router])

  useEffect(() => { fetchCampaign() }, [fetchCampaign])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!campaign) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h2 className="text-xl font-semibold">{campaign.name}</h2>
        <Badge variant={statusColors[campaign.status] || "secondary"}>
          {campaign.status}
        </Badge>
      </div>

      {campaign.description && (
        <p className="text-sm text-muted-foreground">{campaign.description}</p>
      )}

      <Tabs defaultValue="prospects" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prospects">Prospects</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="prospects">
          <ProspectsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="sequences">
          <SequencesTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="emails">
          <EmailsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsTab campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
