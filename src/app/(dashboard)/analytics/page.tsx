import { BarChart3 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">No data yet</p>
          <p className="text-sm text-muted-foreground">
            Start sending emails to see analytics here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
