"use client"

import { api } from "@astreex/backend/api"
import {
  BellIcon,
  CircleNotchIcon,
  FloppyDiskIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import { Label } from "@astreex/ui/components/label"
import { Switch } from "@astreex/ui/components/switch"
import { useMutation, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"

function formatNextRun(timestamp: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toISOString()
  }
}

export function DigestSettings() {
  const value = useQuery(api.settings.getSettings, {})
  const updateDigest = useMutation(api.settings.updateDigestPreferences)
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enabled = enabledDraft ?? value?.digest.enabled ?? true

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setError(
        "Digest preferences are unavailable, so no schedule was changed.",
      )
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateDigest({
        enabled,
        timeZone: value.digest.timeZone,
      })
      setMessage("Daily digest preferences saved.")
    } catch {
      setError("Daily digest preferences could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  if (value === undefined) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading digest preferences…
      </p>
    )
  }

  return (
    <form onSubmit={save} className="space-y-7">
      <div className="flex items-start justify-between gap-5">
        <div>
          <Label htmlFor="digest-enabled" className="text-sm font-semibold">
            Daily digest
          </Label>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Email a concise summary of recent visible mentions each day around
            9:00 AM in your account timezone. Delivery can vary by up to 15
            minutes.
          </p>
        </div>
        <Switch
          id="digest-enabled"
          label="Enable daily digest"
          isLabelHidden
          value={enabled}
          onChange={(checked) => setEnabledDraft(checked)}
        />
      </div>

      {enabled && value.digest.nextRunAt !== undefined && (
        <div className="border-border bg-muted/30 flex items-start gap-3 rounded-md border px-4 py-3">
          <BellIcon
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <p className="text-muted-foreground text-xs leading-5">
            Next scheduled run:{" "}
            {formatNextRun(value.digest.nextRunAt, value.digest.timeZone)}
          </p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite">
          {message && (
            <p className="text-muted-foreground text-xs">{message}</p>
          )}
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <CircleNotchIcon className="animate-spin" />
          ) : (
            <FloppyDiskIcon />
          )}
          Save digest
        </Button>
      </div>
    </form>
  )
}
