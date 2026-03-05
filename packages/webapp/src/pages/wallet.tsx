import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { BalanceCard } from "@/components/wallet/BalanceCard"
import { EscrowList } from "@/components/wallet/EscrowList"
import { TransactionHistory } from "@/components/wallet/TransactionHistory"
import { TransferDialog } from "@/components/wallet/TransferDialog"
import { useWalletStore } from "@/stores/wallet"

export function WalletPage() {
  const { t } = useTranslation()
  const refreshAll = useWalletStore((state) => state.refreshAll)
  const error = useWalletStore((state) => state.error)

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("wallet.title")}</h2>
        <TransferDialog onTransferred={refreshAll} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <BalanceCard onRefresh={refreshAll} />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <TransactionHistory />
        <EscrowList />
      </div>
    </div>
  )
}
