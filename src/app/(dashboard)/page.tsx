import Link from "next/link"
import { Megaphone, Users, Mail, Eye, Plus, CheckSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

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

  // Recent activity
  const { data: activities } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)

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
              <div className="space-y-3">
                {activities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span>{a.action.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
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
