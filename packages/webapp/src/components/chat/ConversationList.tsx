import { HashIcon, SearchIcon, UserRoundPlusIcon } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { DidAvatar } from "@/components/shared/DidAvatar"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useConversationStore } from "@/stores/conversation"
import { ConversationItem } from "@/components/chat/ConversationItem"
import { useIsMobile } from "@/hooks/use-mobile"
import { CreateGroupDialog } from "@/components/group/CreateGroupDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"

export function ConversationList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const conversations = useConversationStore((state) => state.conversations)
  const selectedConversationId = useConversationStore((state) => state.selectedConversationId)
  const searchQuery = useConversationStore((state) => state.searchQuery)
  const setSearchQuery = useConversationStore((state) => state.setSearchQuery)
  const setSelectedConversationId = useConversationStore((state) => state.setSelectedConversationId)

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return conversations
    }
    return conversations.filter((conversation) => {
      return (
        conversation.displayName.toLowerCase().includes(query)
        || conversation.conversationId.toLowerCase().includes(query)
      )
    })
  }, [conversations, searchQuery])
  const contactConversations = useMemo(
    () => filtered.filter((conversation) => conversation.conversationType === "direct"),
    [filtered],
  )
  const groupConversations = useMemo(
    () => filtered.filter((conversation) => conversation.conversationType === "group"),
    [filtered],
  )

  const isSearching = searchQuery.trim().length > 0

  const handleSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    if (isMobile) {
      navigate(`/chat/${encodeURIComponent(conversationId)}`)
    }
  }

  if (isMobile) {
    return (
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("chat.title")}</h2>
          <CreateGroupDialog />
        </div>
        <Input
          value={searchQuery}
          placeholder={t("chat.search")}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <ScrollArea className="h-full rounded-lg border bg-card/50">
          <div className="space-y-1 p-2">
            {filtered.length === 0 ? (
              <EmptyState
                title={isSearching ? t("chat.noSearchResults") : t("chat.noConversations")}
                description={isSearching ? t("chat.noSearchResultsHint") : t("chat.emptyDescription")}
              />
            ) : (
              filtered.map((conversation) => (
                <ConversationItem
                  key={conversation.conversationId}
                  conversation={conversation}
                  selected={conversation.conversationId === selectedConversationId}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col text-[#b5bac1]">
      <div className="border-b border-black/25 px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.25)]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#949ba4]" strokeWidth={1.8} />
          <Input
            value={searchQuery}
            placeholder={t("chat.search")}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 border-none bg-[#1e1f22] pl-9 text-sm text-[#dcddde] placeholder:text-[#72767d] focus-visible:ring-0"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pt-3">
        <div className="pb-4">
          <div className="mb-1 px-2 text-xs font-semibold tracking-wide text-[#949ba4]">
            <span>联系人</span>
          </div>

          {contactConversations.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[#7d828a]">
              {isSearching ? "没有匹配的联系人" : "暂无联系人"}
            </p>
          ) : (
            contactConversations.map((conversation) => (
              <button
                type="button"
                key={conversation.conversationId}
                onClick={() => handleSelect(conversation.conversationId)}
                className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                  conversation.conversationId === selectedConversationId
                    ? "bg-[#404249] text-[#f2f3f5]"
                    : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                }`}
              >
                <DidAvatar did={conversation.peerDid ?? conversation.conversationId} avatarUrl={conversation.avatarUrl ?? undefined} className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[#f2f3f5]">{conversation.displayName}</span>
                    {conversation.lastMessageAtMs ? (
                      <span className="shrink-0 text-[11px] text-[#949ba4]">
                        {new Date(conversation.lastMessageAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-[#949ba4]">
                    {conversation.private ? "••••••" : conversation.lastMessagePreview ?? ""}
                  </p>
                </div>
              </button>
            ))
          )}

          <div className="mt-4 mb-1 px-2 text-xs font-semibold tracking-wide text-[#949ba4]">
            <span>群组</span>
          </div>

          {groupConversations.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[#7d828a]">
              {isSearching ? "没有匹配的群组" : "暂无群组"}
            </p>
          ) : (
            groupConversations.map((conversation) => (
              <div
                key={conversation.conversationId}
                className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[17px] transition-colors ${
                  conversation.conversationId === selectedConversationId
                    ? "bg-[#404249] text-[#f2f3f5]"
                    : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(conversation.conversationId)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <HashIcon className="size-4 shrink-0" />
                  <span className="truncate text-base">{conversation.displayName.replace(/^Group\s/, "")}</span>
                </button>
                {conversation.conversationId === selectedConversationId ? (
                  <div className="flex items-center gap-1 text-[#b5bac1]">
                    <UserRoundPlusIcon className="size-3.5" />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
