import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

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
import { randomBytes32Hex } from "@/lib/bytes"
import { useConnectionStore } from "@/stores/connection"
import { useConversationStore } from "@/stores/conversation"
import { useIdentityStore } from "@/stores/identity"

export function CreateGroupDialog() {
  const { t } = useTranslation()
  const { canExecute } = useGuardedAction("manage_groups")
  const sdk = useConnectionStore((state) => state.sdk)
  const selfDid = useIdentityStore((state) => state.self?.did)
  const upsertConversation = useConversationStore((state) => state.upsertConversation)

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [groupId, setGroupId] = useState(() => randomBytes32Hex())
  const [groupDomain, setGroupDomain] = useState("")
  const [domainProofHash, setDomainProofHash] = useState(() => randomBytes32Hex())
  const [initialMlsStateHash, setInitialMlsStateHash] = useState(() => randomBytes32Hex())

  const disabled = !canExecute || !sdk || !selfDid
  const canSubmit = !disabled && groupDomain.trim().length > 0 && !pending

  const title = useMemo(() => t("group.create"), [t])

  if (!canExecute) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <PlusIcon className="size-4" />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("group.createDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("group.groupId")}</Label>
            <Input value={groupId} onChange={(event) => setGroupId(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("group.groupDomain")}</Label>
            <Input
              value={groupDomain}
              placeholder="alpha.telagent.dev"
              onChange={(event) => setGroupDomain(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("group.domainProofHash")}</Label>
            <Input value={domainProofHash} onChange={(event) => setDomainProofHash(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("group.initialMlsStateHash")}</Label>
            <Input
              value={initialMlsStateHash}
              onChange={(event) => setInitialMlsStateHash(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setGroupId(randomBytes32Hex())
              setDomainProofHash(randomBytes32Hex())
              setInitialMlsStateHash(randomBytes32Hex())
            }}
          >
            {t("group.regenerate")}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (!sdk || !selfDid) {
                return
              }
              setPending(true)
              void sdk
                .createGroup({
                  creatorDid: selfDid,
                  groupId: groupId.trim(),
                  groupDomain: groupDomain.trim(),
                  domainProofHash: domainProofHash.trim(),
                  initialMlsStateHash: initialMlsStateHash.trim(),
                })
                .then(() => {
                  upsertConversation({
                    conversationId: `group:${groupId.trim()}`,
                    conversationType: "group",
                    groupId: groupId.trim(),
                    displayName: `Group ${groupId.trim().slice(2, 10)}`,
                    lastMessagePreview: null,
                    lastMessageAtMs: Date.now(),
                    unreadCount: 0,
                    private: false,
                    avatarUrl: null,
                  })
                  toast.success("Group created")
                  setOpen(false)
                })
                .catch((error) => {
                  toast.error(error instanceof Error ? error.message : "Failed to create group")
                })
                .finally(() => {
                  setPending(false)
                })
            }}
          >
            {pending ? t("common.loading") : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
