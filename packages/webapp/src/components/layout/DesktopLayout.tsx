import type { ReactNode } from "react"

import { ConversationList } from "@/components/chat/ConversationList"
import { MemberPresencePanel } from "@/components/layout/MemberPresencePanel"
import { UnlockDialog } from "@/components/session/UnlockDialog"
import { ReconnectBanner } from "@/components/layout/ReconnectBanner"
import { ServerRail } from "@/components/layout/ServerRail"

interface DesktopLayoutProps {
  children: ReactNode
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  return (
    <div className="min-h-svh bg-[#0f1012] p-5 text-[#dbdee1]">
      <div className="mx-auto flex h-[calc(100svh-2.5rem)] max-w-[1500px] overflow-hidden rounded-2xl border border-white/8 shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
        <ServerRail />
        <div className="flex w-[280px] flex-col border-r border-black/30 bg-[#2b2d31]">
          <ConversationList />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-[#313338]">
          <ReconnectBanner />
          <main className="min-h-0 flex-1">{children}</main>
        </div>
        <MemberPresencePanel />
      </div>
      <UnlockDialog />
    </div>
  )
}
