import Link from "next/link"
import { Megaphone, Users, Mail, Eye, Plus, CheckSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const stats = [
  { title: "Total Campaigns", value: "—", icon: Megaphone, color: "text-blue-500" },
  { title: "Active Prospects", value: "—", icon: Users, color: "text-green-500" },
  { title: "Emails Sent", value: "—", icon: Mail, color: "text-purple-500" },
  { title: "Avg Open Rate", value: "—", icon: Eye, color: "text-amber-500" },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
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
            <p className="text-sm text-muted-foreground">
              No activity yet. Create a campaign to get started.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild>
              <Link href="/campaigns?new=true">
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/approve">
                <CheckSquare className="mr-2 h-4 w-4" />
                View Approval Queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
