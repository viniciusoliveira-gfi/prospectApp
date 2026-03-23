"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Megaphone, MoreHorizontal, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import type { Campaign } from "@/lib/supabase/types"

const statusColors: Record<string, string> = {
  draft: "secondary",
  active: "default",
  paused: "outline",
  completed: "default",
  archived: "destructive",
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  const fetchCampaigns = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Failed to load campaigns")
    } else {
      setCampaigns(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Campaign name is required"); return }
    setCreating(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ name: name.trim(), description: description.trim() || null })
      .select()
      .single()

    if (error) {
      toast.error("Failed to create campaign")
    } else {
      toast.success("Campaign created")
      setOpen(false)
      setName("")
      setDescription("")
      router.push(`/campaigns/${data.id}`)
    }
    setCreating(false)
  }

  const handleArchive = async (id: string) => {
    const supabase = createClient()

    // Check for active sequences
    const { count } = await supabase
      .from("sequences")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "active")

    if (count && count > 0) {
      toast.error("Cannot delete: campaign has active sequences. Pause them first.")
      return
    }

    const { error } = await supabase
      .from("campaigns")
      .update({ status: "archived" })
      .eq("id", id)

    if (error) {
      toast.error("Failed to archive campaign")
    } else {
      toast.success("Campaign archived")
      fetchCampaigns()
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 ml-auto" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first campaign to start prospecting.
            </p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="cursor-pointer" onClick={() => router.push(`/campaigns/${campaign.id}`)}>
                  <TableCell className="font-medium">{campaign.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[campaign.status] as "default" | "secondary" | "destructive" | "outline"}>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] truncate">
                    {campaign.description || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleArchive(campaign.id) }}>
                          <Archive className="mr-2 h-4 w-4" /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>Set up a new outreach campaign.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input id="name" placeholder="e.g., Q1 Enterprise Outreach" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea id="desc" placeholder="Brief description..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
