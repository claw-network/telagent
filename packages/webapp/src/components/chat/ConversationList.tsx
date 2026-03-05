import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useConversationStore } from "@/stores/conversation"
import { ConversationItem } from "@/components/chat/ConversationItem"
import { useIsMobile } from "@/hooks/use-mobile"
import { CreateGroupDialog } from "@/components/group/CreateGroupDialog"
import { EmptyState } from "@/components/shared/EmptyState"

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

  const isSearching = searchQuery.trim().length > 0

  const handleSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    if (isMobile) {
      navigate(`/chat/${encodeURIComponent(conversationId)}`)
    }
  }

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
