import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { TaskList } from "@/components/market/TaskList"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMarketStore } from "@/stores/market"

export function MarketPage() {
  const { t } = useTranslation()
  const refreshTasks = useMarketStore((state) => state.refreshTasks)
  const error = useMarketStore((state) => state.error)

  useEffect(() => {
    void refreshTasks()
  }, [refreshTasks])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("market.title")}</h2>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <TaskList />
        <Card>
          <CardHeader>
            <CardTitle>{t("market.taskDetail")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("market.selectTask")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
