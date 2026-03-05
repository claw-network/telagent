import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { formatApiError } from "@/lib/api-error"

const DEDUPE_WINDOW_MS = 4_000

export function useGlobalErrorToast() {
  const { t } = useTranslation()
  const latestKeyRef = useRef<string>("")
  const latestAtRef = useRef<number>(0)

  useEffect(() => {
    const emit = (error: unknown) => {
      const message = formatApiError(error, t("common.requestFailed"))
      const now = Date.now()
      if (latestKeyRef.current === message && now - latestAtRef.current < DEDUPE_WINDOW_MS) {
        return
      }
      latestKeyRef.current = message
      latestAtRef.current = now
      toast.error(message)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      emit(event.reason)
    }

    const onError = (event: ErrorEvent) => {
      emit(event.error ?? event.message)
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection)
    window.addEventListener("error", onError)

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
      window.removeEventListener("error", onError)
    }
  }, [t])
}
