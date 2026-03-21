"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/campaigns": "Campaigns",
  "/prospects": "Prospects",
  "/approve": "Approval Queue",
  "/analytics": "Analytics",
  "/settings": "Settings",
}

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  if (pathname.startsWith("/campaigns/")) return "Campaign Detail"
  if (pathname.startsWith("/prospects/")) return "Prospect Detail"
  return "ProspectApp"
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const title = getPageTitle(pathname)

  const handleSignOut = async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error("Failed to sign out")
    } else {
      router.push("/login")
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <User className="h-4 w-4" />
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-gray-500 hover:text-gray-700">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
