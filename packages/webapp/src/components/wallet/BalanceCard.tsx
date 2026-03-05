import { RefreshCwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWalletStore } from "@/stores/wallet"

interface BalanceCardProps {
  onRefresh: () => Promise<void>
}

export function BalanceCard({ onRefresh }: BalanceCardProps) {
  const { t } = useTranslation()
  const balance = useWalletStore((state) => state.balance)
  const nonce = useWalletStore((state) => state.nonce)
  const loading = useWalletStore((state) => state.loading)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{t("wallet.balance")}</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={() => void onRefresh()} disabled={loading}>
          <RefreshCwIcon className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-card/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">{t("wallet.native")}</p>
            <p className="mt-1 text-lg font-semibold">{balance?.native ?? "0"}</p>
          </div>
          <div className="rounded-md border bg-card/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">{t("wallet.token")}</p>
            <p className="mt-1 text-lg font-semibold">{balance?.token ?? "0"}</p>
          </div>
          <div className="rounded-md border bg-card/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">{t("wallet.nonce")}</p>
            <p className="mt-1 text-lg font-semibold">{nonce?.nonce ?? 0}</p>
          </div>
        </div>

        {balance?.address ? (
          <p className="text-xs text-muted-foreground">
            {t("wallet.address")}: {balance.address}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
