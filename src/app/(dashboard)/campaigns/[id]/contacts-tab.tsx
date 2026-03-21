"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, Users, Loader2, Search, Trash2, Mail, ExternalLink,
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
import type { Contact } from "@/lib/supabase/types"

const emailStatusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  verified: "default",
  unverified: "secondary",
  bounced: "destructive",
  catch_all: "outline",
  unknown: "outline",
}

interface ContactsTabProps {
  campaignId: string
}

interface ContactWithProspect extends Contact {
  prospects: { company_name: string; domain: string | null; tier: string | null } | null
}

export function ContactsTab({ campaignId }: ContactsTabProps) {
  const [contacts, setContacts] = useState<ContactWithProspect[]>([])
  const [loading, setLoading] = useState(true)
  const [enriching, setEnriching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [filter, setFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Add contact form
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [phone, setPhone] = useState("")
  const [prospectId, setProspectId] = useState("")
  const [prospects, setProspects] = useState<{ id: string; company_name: string }[]>([])
  const [adding, setAdding] = useState(false)

  const fetchContacts = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/contacts`)
    if (res.ok) {
      const data = await res.json()
      setContacts(data)
    } else {
      toast.error("Failed to load contacts")
    }
    setLoading(false)
  }, [campaignId])

  const fetchProspects = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("prospects")
      .select("id, company_name")
      .eq("campaign_id", campaignId)
      .order("company_name")
    setProspects(data || [])
  }, [campaignId])

  useEffect(() => { fetchContacts(); fetchProspects() }, [fetchContacts, fetchProspects])

  const handleAdd = async () => {
    if (!firstName.trim() || !lastName.trim()) { toast.error("Name required"); return }
    if (!prospectId) { toast.error("Select a company"); return }
    setAdding(true)

    const res = await fetch(`/api/prospects/${prospectId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        title: title.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        phone: phone.trim() || null,
      }),
    })

    if (res.ok) {
      toast.success("Contact added")
      setAddOpen(false)
      resetForm()
      fetchContacts()
    } else {
      toast.error("Failed to add contact")
    }
    setAdding(false)
  }

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail("")
    setTitle(""); setLinkedinUrl(""); setPhone(""); setProspectId("")
  }

  const handleBulkEnrich = async () => {
    setEnriching(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts/bulk-enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const total = data.results?.reduce((sum: number, r: { found: number }) => sum + r.found, 0) || 0
      toast.success(`Found ${total} contacts across ${data.results?.length || 0} companies`)
      fetchContacts()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enrichment failed")
    }
    setEnriching(false)
  }

  const handleDelete = async (contactId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("contacts").delete().eq("id", contactId)
    if (error) toast.error("Failed to delete")
    else { toast.success("Contact deleted"); fetchContacts() }
  }

  const filtered = contacts.filter(c => {
    if (filter !== "all" && c.email_status !== filter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.title?.toLowerCase().includes(q)) ||
        (c.prospects?.company_name.toLowerCase().includes(q))
      )
    }
    return true
  })

  if (loading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => { fetchProspects(); setAddOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" /> Add Contact
        </Button>
        <Button variant="outline" onClick={handleBulkEnrich} disabled={enriching}>
          {enriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Enrich via Apollo
        </Button>
        <div className="flex-1" />
        <Input
          placeholder="Search contacts..."
          className="w-[250px]"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No contacts yet</p>
            <p className="text-sm text-muted-foreground">
              Add contacts manually or enrich via Apollo API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Email Status</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">
                    {contact.first_name} {contact.last_name}
                  </TableCell>
                  <TableCell>
                    {contact.email ? (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{contact.email}</span>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.title || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.prospects?.company_name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{contact.source}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={emailStatusColors[contact.email_status]}>
                      {contact.email_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {contact.linkedin_url && (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(contact.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && contacts.length > 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No contacts match your filters.
            </div>
          )}
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Manually add a contact to this campaign.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company *</Label>
              <Select value={prospectId} onValueChange={setProspectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {prospects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="e.g., VP of Sales" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>LinkedIn URL</Label>
                <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? "Adding..." : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
