import { CompassIcon, PlusIcon, Settings2Icon, UserRoundPlusIcon, UsersIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { AddContactDialog } from "@/components/contact/AddContactDialog"
import { CreateGroupDialog } from "@/components/group/CreateGroupDialog"
import { DidAvatar } from "@/components/shared/DidAvatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGuardedAction } from "@/hooks/use-guarded-action"
import { useConversationStore } from "@/stores/conversation"

export function ServerRail() {
  const { t } = useTranslation()
  const { canExecute: canManageContacts } = useGuardedAction("manage_contacts")
  const { canExecute: canManageGroups } = useGuardedAction("manage_groups")
  const conversations = useConversationStore((state) => state.conversations)
  const selectedConversationId = useConversationStore((state) => state.selectedConversationId)
  const setSelectedConversationId = useConversationStore((state) => state.setSelectedConversationId)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)

  const servers = useMemo(() => conversations.slice(0, 9), [conversations])

  return (
    <aside className="flex w-[74px] flex-col items-center gap-3 border-r border-black/25 bg-[#202225] py-3">
      <Button
        size="icon"
        className="size-12 rounded-2xl bg-[#5865f2] text-white hover:rounded-xl hover:bg-[#5e6af4]"
      >
        <CompassIcon className="size-5" />
      </Button>

      <div className="h-px w-8 bg-white/10" />

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-1">
        {servers.map((conversation) => {
          const active = selectedConversationId === conversation.conversationId
          return (
            <button
              key={conversation.conversationId}
              type="button"
              onClick={() => setSelectedConversationId(conversation.conversationId)}
              className={`group relative rounded-2xl transition-all ${active ? "rounded-xl" : "hover:rounded-xl"}`}
            >
              <span
                className={`absolute -left-2 top-1/2 -translate-y-1/2 rounded-r-full bg-white transition-all ${
                  active
                    ? "h-8 w-1 opacity-100"
                    : "h-0 w-0 opacity-0 group-hover:h-5 group-hover:w-1 group-hover:opacity-100"
                }`}
              />
              <DidAvatar
                did={conversation.peerDid ?? conversation.groupId ?? conversation.conversationId}
                className={`size-12 border ${active ? "border-[#5865f2]" : "border-transparent"}`}
              />
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="size-12 rounded-2xl bg-[#2b2d31] text-[#8ea1e1] hover:rounded-xl"
              aria-label={t("group.create")}
            >
              <PlusIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="center" className="w-48">
            <DropdownMenuItem
              disabled={!canManageContacts}
              onSelect={() => {
                setAddContactOpen(true)
              }}
            >
              <UserRoundPlusIcon className="size-4" />
              {t("contact.add")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canManageGroups}
              onSelect={() => {
                setCreateGroupOpen(true)
              }}
            >
              <UsersIcon className="size-4" />
              {t("group.create")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild size="icon" variant="secondary" className="size-12 rounded-2xl bg-[#2b2d31] text-[#b5bac1] hover:rounded-xl">
          <Link to="/settings">
            <Settings2Icon className="size-5" />
          </Link>
        </Button>
      </div>
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} hideTrigger />
      <CreateGroupDialog open={createGroupOpen} onOpenChange={setCreateGroupOpen} hideTrigger />
    </aside>
  )
}
