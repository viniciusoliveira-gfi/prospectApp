"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { Campaign } from "@/lib/supabase/types"
import { ProspectsTab } from "./prospects-tab"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

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

  const updateStatus = async (status: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("campaigns")
      .update({ status })
      .eq("id", campaignId)

    if (error) {
      toast.error("Failed to update status")
    } else {
      setCampaign(prev => prev ? { ...prev, status: status as Campaign["status"] } : null)
      toast.success(`Campaign ${status}`)
    }
  }

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h2 className="text-xl font-semibold">{campaign.name}</h2>
          <Badge variant={statusColors[campaign.status] || "secondary"}>
            {campaign.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={campaign.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="prospects">
          <ProspectsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Add prospects first, then enrich contacts via Apollo. (Phase 3)
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sequences">
          <Card>
            <CardHeader><CardTitle>Sequences</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create email sequences for this campaign. (Phase 4)
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails">
          <Card>
            <CardHeader><CardTitle>Emails</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Generated emails will appear here. (Phase 4)
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader><CardTitle>Analytics</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Start sending emails to see analytics. (Phase 6)
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
