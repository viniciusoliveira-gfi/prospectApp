import { CheckSquare } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function ApprovalQueuePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckSquare className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium">No emails pending approval</p>
          <p className="text-sm text-muted-foreground">
            Generate emails from a sequence to see them here for review.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
