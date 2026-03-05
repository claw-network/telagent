import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWalletStore } from "@/stores/wallet"

function formatTimestamp(timestampMs?: number): string {
  if (!timestampMs) {
    return "-"
  }
  return new Date(timestampMs).toLocaleString()
}

export function TransactionHistory() {
  const { t } = useTranslation()
  const history = useWalletStore((state) => state.history)
  const historyLimit = useWalletStore((state) => state.historyLimit)
  const historyOffset = useWalletStore((state) => state.historyOffset)
  const setHistoryPage = useWalletStore((state) => state.setHistoryPage)
  const loading = useWalletStore((state) => state.loading)

  const currentPage = Math.floor(historyOffset / historyLimit) + 1
  const hasPrevious = currentPage > 1
  const hasNext = history.length >= historyLimit

  const rows = useMemo(() => {
    return history.map((item) => ({
      ...item,
      amountText: typeof item.amount === "number" ? item.amount.toFixed(4) : "-",
      timestampText: formatTimestamp(item.timestampMs),
    }))
  }, [history])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("wallet.history")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("wallet.time")}</TableHead>
              <TableHead>{t("wallet.type")}</TableHead>
              <TableHead>{t("wallet.amount")}</TableHead>
              <TableHead>{t("wallet.status")}</TableHead>
              <TableHead>{t("wallet.txHash")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  {t("wallet.noHistory")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">{item.timestampText}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.amountText}</TableCell>
                  <TableCell>{item.status ?? "-"}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">{item.txHash ?? "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrevious || loading}
            onClick={() => void setHistoryPage(currentPage - 1)}
          >
            {t("details.prev")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("details.page")} {currentPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext || loading}
            onClick={() => void setHistoryPage(currentPage + 1)}
          >
            {t("details.next")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
