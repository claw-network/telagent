import type { ReactNode } from "react"
import { XIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { ConversationDetailPanel } from "@/components/chat/ConversationDetailPanel"
import { ReconnectBanner } from "@/components/layout/ReconnectBanner"
import { ConversationList } from "@/components/chat/ConversationList"
import { StatusBar } from "@/components/layout/StatusBar"
import { SessionBadge } from "@/components/session/SessionBadge"
import { UnlockDialog } from "@/components/session/UnlockDialog"
import { ModeBadge } from "@/components/shared/ModeBadge"
import { ThemeSwitcher } from "@/components/shared/ThemeSwitcher"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/stores/ui"

interface DesktopLayoutProps {
  children: ReactNode
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  const detailPanelOpen = useUIStore((state) => state.detailPanelOpen)
  const setDetailPanelOpen = useUIStore((state) => state.setDetailPanelOpen)

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-wide">TelAgent WebApp</h1>
          <ModeBadge />
        </div>
        <div className="flex items-center gap-2">
          <SessionBadge />
          <ThemeSwitcher />
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings">Settings</Link>
          </Button>
        </div>
      </header>

      <ReconnectBanner />

      <div className="flex min-h-0 flex-1">
        <aside className="w-[280px] min-w-[240px] max-w-[420px] resize-x overflow-auto border-r bg-sidebar/80">
          <ConversationList />
        </aside>

        <main className="min-w-0 flex-1">{children}</main>

        {detailPanelOpen ? (
          <aside className="hidden w-[320px] min-w-[280px] max-w-[460px] resize-x overflow-auto border-l bg-card/35 p-4 lg:block">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Details</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setDetailPanelOpen(false)}>
                <XIcon className="size-4" />
              </Button>
            </div>
            <ConversationDetailPanel />
          </aside>
        ) : null}
      </div>

      <StatusBar />
      <UnlockDialog />
    </div>
  )
}
