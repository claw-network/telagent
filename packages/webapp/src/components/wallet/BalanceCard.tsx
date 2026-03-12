import { ArrowDownLeftIcon, ArrowUpRightIcon, EyeIcon, EyeOffIcon, RefreshCwIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useWalletStore } from "@/stores/wallet"

interface BalanceCardProps {
  onRefresh: () => Promise<void>
}

export function BalanceCard({ onRefresh }: BalanceCardProps) {
  const { t } = useTranslation()
  const balance = useWalletStore((state) => state.balance)
  const history = useWalletStore((state) => state.history)
  const loading = useWalletStore((state) => state.loading)
  const [visible, setVisible] = useState(true)

  const { totalSent, totalReceived } = useMemo(() => {
    let sent = 0
    let received = 0
    for (const item of history) {
      const amount = item.amount ?? 0
      const type = item.type.toLowerCase()
      if (type === "sent" || type === "transfer_sent" || type === "transfer-sent") {
        sent += amount
      } else if (type === "received" || type === "transfer_received" || type === "transfer-received") {
        received += amount
      }
    }
    return { totalSent: sent, totalReceived: received }
  }, [history])

  const mask = "••••••"

  return (
    <div className="space-y-3 pb-2 pt-1">
      {/* Balance hero */}
      <div className="rounded-2xl border bg-card/60 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{t("wallet.totalBalance")}</p>
          <Button variant="ghost" size="icon-sm" onClick={() => void onRefresh()} disabled={loading}>
            <RefreshCwIcon className="size-3.5" />
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-3xl font-bold tracking-tight">
            {visible ? (balance?.token ?? "0") : mask}
          </p>
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            className="text-muted-foreground transition hover:text-foreground"
          >
            {visible ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("wallet.native")}: {visible ? (balance?.native ?? "0") : mask}
        </p>
      </div>

      {/* Sent / Received summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border bg-card/40 px-3 py-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
            <ArrowDownLeftIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{t("wallet.received")}</p>
            <p className="truncate text-sm font-semibold text-emerald-500">
              {visible ? `+${totalReceived}` : mask}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border bg-card/40 px-3 py-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-red-500/15 text-red-500">
            <ArrowUpRightIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{t("wallet.sent")}</p>
            <p className="truncate text-sm font-semibold text-red-500">
              {visible ? `-${totalSent}` : mask}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
