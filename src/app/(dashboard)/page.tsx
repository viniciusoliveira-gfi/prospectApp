import Link from "next/link"
import {
  Megaphone, Users, Mail, Eye, Plus, CheckSquare,
  Send, MessageSquare, AlertCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

const actionIcons: Record<string, { icon: typeof Mail; color: string }> = {
  email_sent: { icon: Send, color: "text-blue-500 bg-blue-50" },
  email_opened: { icon: Eye, color: "text-green-500 bg-green-50" },
  reply_detected: { icon: MessageSquare, color: "text-purple-500 bg-purple-50" },
  email_bounced: { icon: AlertCircle, color: "text-red-500 bg-red-50" },
}

export default async function DashboardPage() {
  const supabase = createClient()

  const [campaignsRes, prospectsRes, emailsRes] = await Promise.all([
    supabase.from("campaigns").select("id", { count: "exact", head: true }).neq("status", "archived"),
    supabase.from("prospects").select("id", { count: "exact", head: true }),
    supabase.from("emails").select("id, open_count", { count: "exact" }).eq("send_status", "sent"),
  ])

  const totalCampaigns = campaignsRes.count || 0
  const totalProspects = prospectsRes.count || 0
  const sentEmails = emailsRes.count || 0
  const openedEmails = emailsRes.data?.filter(e => e.open_count > 0).length || 0
  const openRate = sentEmails > 0 ? Math.round((openedEmails / sentEmails) * 100) : 0

  const stats = [
    { title: "Total Campaigns", value: String(totalCampaigns), icon: Megaphone, color: "text-blue-500" },
    { title: "Active Prospects", value: String(totalProspects), icon: Users, color: "text-green-500" },
    { title: "Emails Sent", value: String(sentEmails), icon: Mail, color: "text-purple-500" },
    { title: "Avg Open Rate", value: sentEmails > 0 ? `${openRate}%` : "—", icon: Eye, color: "text-amber-500" },
  ]

  // Recent activity with related data
  const { data: activities } = await supabase
    .from("activity_log")
    .select("*, contacts(first_name, last_name, email), prospects(company_name), emails(subject)")
    .order("created_at", { ascending: false })
    .limit(10)

  // Get campaign names for activities that have them
  const campaignIds = Array.from(new Set(
    (activities || []).filter(a => a.campaign_id).map(a => a.campaign_id)
  ))
  const { data: campaignNames } = campaignIds.length
    ? await supabase.from("campaigns").select("id, name").in("id", campaignIds)
    : { data: [] }

  const campaignMap = Object.fromEntries(
    (campaignNames || []).map(c => [c.id, c.name])
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activities && activities.length > 0 ? (
              <div className="space-y-1">
                {activities.map((a) => {
                  const contact = a.contacts as unknown as { first_name: string; last_name: string; email: string } | null
                  const prospect = a.prospects as unknown as { company_name: string } | null
                  const email = a.emails as unknown as { subject: string } | null
                  const details = a.details as Record<string, unknown> | null
                  const campaignName = a.campaign_id ? campaignMap[a.campaign_id] : null
                  const actionConfig = actionIcons[a.action] || { icon: Mail, color: "text-gray-500 bg-gray-50" }
                  const ActionIcon = actionConfig.icon

                  return (
                    <div key={a.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${actionConfig.color}`}>
                        <ActionIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                          {contact && (
                            <span className="text-gray-600">
                              {" "}to {contact.first_name} {contact.last_name}
                              {contact.email && <span className="text-gray-400"> ({contact.email})</span>}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {prospect && (
                            <span className="text-xs text-gray-500">{prospect.company_name}</span>
                          )}
                          {prospect && campaignName && <span className="text-xs text-gray-300">|</span>}
                          {campaignName && (
                            <span className="text-xs text-gray-500">{campaignName}</span>
                          )}
                          {email?.subject && (
                            <>
                              <span className="text-xs text-gray-300">|</span>
                              <span className="text-xs text-gray-400 truncate max-w-[200px]">&quot;{email.subject}&quot;</span>
                            </>
                          )}
                          {details?.snippet && (
                            <>
                              <span className="text-xs text-gray-300">|</span>
                              <span className="text-xs text-purple-500 truncate max-w-[200px]">&quot;{String(details.snippet)}&quot;</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(a.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No activity yet. Create a campaign to get started.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild>
              <Link href="/campaigns?new=true">
                <Plus className="mr-2 h-4 w-4" /> New Campaign
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/approve">
                <CheckSquare className="mr-2 h-4 w-4" /> View Approval Queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
