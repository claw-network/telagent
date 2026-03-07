import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/shared/ThemeSwitcher"
import { DidAvatar } from "@/components/shared/DidAvatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConnectionStore } from "@/stores/connection"
import { useIdentityStore } from "@/stores/identity"
import { usePermissionStore } from "@/stores/permission"
import { useSessionStore } from "@/stores/session"

export function SettingsPage() {
  const { t } = useTranslation()
  const nodeUrl = useConnectionStore((state) => state.nodeUrl)
  const disconnect = useConnectionStore((state) => state.disconnect)
  const clearPermissions = usePermissionStore((state) => state.clear)
  const clearSession = useSessionStore((state) => state.clear)

  const selfDid = useIdentityStore((state) => state.self?.did ?? "")
  const selfProfile = useIdentityStore((state) => state.selfProfile)
  const loadSelfProfile = useIdentityStore((state) => state.loadSelfProfile)
  const updateSelfProfile = useIdentityStore((state) => state.updateSelfProfile)
  const uploadAvatar = useIdentityStore((state) => state.uploadAvatar)

  const [nickname, setNickname] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadSelfProfile()
  }, [loadSelfProfile])

  useEffect(() => {
    if (selfProfile) {
      setNickname(selfProfile.nickname ?? "")
      setAvatarUrl(selfProfile.avatarUrl ?? "")
    }
  }, [selfProfile])

  const onDisconnect = () => {
    disconnect()
    clearPermissions()
    clearSession()
  }

  const onSaveProfile = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await updateSelfProfile({ nickname: nickname.trim() || undefined, avatarUrl: avatarUrl.trim() || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      // dataUrl is "data:<mimeType>;base64,<data>"
      const [header, base64] = dataUrl.split(",")
      const mimeType = header?.match(/:(.*?);/)?.[1] ?? "image/jpeg"
      try {
        const newUrl = await uploadAvatar(base64, mimeType)
        setAvatarUrl(newUrl)
      } catch {
        // silently handle
      }
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  const resolvedAvatarUrl = avatarUrl?.startsWith("/")
    ? `${nodeUrl?.replace(/\/$/, "")}${avatarUrl}`
    : avatarUrl

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">{t("settings.title")}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <DidAvatar did={selfDid} avatarUrl={resolvedAvatarUrl} className="size-16" />
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("settings.profile.uploadAvatar")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">{t("settings.profile.nickname")}</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("settings.profile.nickname")}
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatarUrl">{t("settings.profile.avatarUrl")}</Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <Button onClick={onSaveProfile} disabled={saving}>
            {saved ? t("settings.profile.saved") : t("settings.profile.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.node")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{nodeUrl || t("common.disconnected")}</p>
          <Button variant="destructive" onClick={onDisconnect}>{t("settings.disconnect")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.theme")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>
    </div>
  )
}
