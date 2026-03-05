import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useGuardedAction } from "@/hooks/use-guarded-action"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useContactStore } from "@/stores/contact"
import { useConversationStore } from "@/stores/conversation"
import { useIdentityStore } from "@/stores/identity"

interface AddContactDialogProps {
  compact?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

const DID_PATTERN = /^did:claw:[A-Za-z0-9._:-]+$/

function compactDid(did: string): string {
  if (did.length <= 24) {
    return did
  }
  return `${did.slice(0, 12)}...${did.slice(-6)}`
}

function directConversationIdForDid(did: string): string {
  return `direct:${did}`
}

export function AddContactDialog({
  compact = false,
  open,
  onOpenChange,
  hideTrigger = false,
}: AddContactDialogProps) {
  const { t } = useTranslation()
  const { canExecute } = useGuardedAction("manage_contacts")
  const selfDid = useIdentityStore((state) => state.self?.did)
  const resolveContact = useContactStore((state) => state.resolve)
  const upsertConversation = useConversationStore((state) => state.upsertConversation)
  const setSelectedConversationId = useConversationStore((state) => state.setSelectedConversationId)

  const [internalOpen, setInternalOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [did, setDid] = useState("")
  const [displayName, setDisplayName] = useState("")
  const dialogOpen = typeof open === "boolean" ? open : internalOpen

  const title = useMemo(() => t("contact.add"), [t])

  const reset = () => {
    setDid("")
    setDisplayName("")
  }

  const setDialogOpen = (nextOpen: boolean) => {
    if (typeof open !== "boolean") {
      setInternalOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      reset()
    }
  }

  const onSubmit = async () => {
    const normalizedDid = did.trim()
    if (!DID_PATTERN.test(normalizedDid)) {
      toast.error(t("contact.invalidDid"))
      return
    }

    if (selfDid && normalizedDid === selfDid) {
      toast.error(t("contact.selfNotAllowed"))
      return
    }

    setPending(true)
    try {
      const resolvedIdentity = await resolveContact(normalizedDid)
      const conversationId = directConversationIdForDid(normalizedDid)
      const nameCandidate = displayName.trim() || resolvedIdentity?.did

      upsertConversation({
        conversationId,
        conversationType: "direct",
        peerDid: normalizedDid,
        displayName: nameCandidate || compactDid(normalizedDid),
        lastMessagePreview: null,
        lastMessageAtMs: Date.now(),
        unreadCount: 0,
        private: false,
        avatarUrl: null,
      })
      setSelectedConversationId(conversationId)
      toast.success(t("contact.addSuccess"))
      setDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("contact.addFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {!hideTrigger ? (
        <DialogTrigger asChild>
          {compact ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
              disabled={!canExecute}
              aria-label={title}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" disabled={!canExecute}>
              <PlusIcon className="size-4" />
              {title}
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("contact.addDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-did">{t("contact.did")}</Label>
            <Input
              id="contact-did"
              value={did}
              placeholder="did:claw:..."
              onChange={(event) => setDid(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-display-name">{t("contact.displayName")}</Label>
            <Input
              id="contact-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={pending}>
            {pending ? t("common.loading") : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
