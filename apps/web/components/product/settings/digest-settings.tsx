"use client"

import { api } from "@astreex/backend/api"
import {
  BellIcon,
  CircleNotchIcon,
  FloppyDiskIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { Switch } from "@astreex/ui/components/switch"
import { useMutation, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"

function detectedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function timeZones(current: string): string[] {
  const basic = [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ]
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[]
  }

  try {
    return Array.from(
      new Set([
        current,
        detectedTimeZone(),
        "UTC",
        ...(intl.supportedValuesOf?.("timeZone") ?? basic),
      ]),
    ).sort((left, right) => left.localeCompare(right))
  } catch {
    return Array.from(new Set([current, detectedTimeZone(), ...basic])).sort(
      (left, right) => left.localeCompare(right),
    )
  }
}

function toTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }
  return { hour, minute }
}

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
  const [localTimeDraft, setLocalTimeDraft] = useState<string | null>(null)
  const [timeZoneDraft, setTimeZoneDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enabled = enabledDraft ?? value?.digest.enabled ?? true
  const localTime =
    localTimeDraft ??
    (value ? toTime(value.digest.hour, value.digest.minute) : "09:00")
  const timeZone = timeZoneDraft ?? value?.digest.timeZone ?? detectedTimeZone()

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setError(
        "Digest preferences are unavailable, so no schedule was changed.",
      )
      return
    }
    const time = parseTime(localTime)
    if (!time) {
      setError("Enter a valid local time.")
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateDigest({
        enabled,
        hour: time.hour,
        mentionLimit: value.digest.mentionLimit,
        minute: time.minute,
        timeZone,
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
            Email a concise summary of recent categorized mentions once each
            day.
          </p>
        </div>
        <Switch
          id="digest-enabled"
          checked={enabled}
          onCheckedChange={setEnabledDraft}
          aria-label="Enable daily digest"
        />
      </div>

      <div className="border-border grid gap-5 border-t pt-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="digest-time">Local delivery time</Label>
          <Input
            id="digest-time"
            type="time"
            value={localTime}
            onChange={(event) => setLocalTimeDraft(event.target.value)}
            disabled={!enabled}
          />
          <p className="text-muted-foreground text-xs leading-5">
            New accounts default to 09:00 local time.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="digest-timezone">Timezone</Label>
          <Select
            value={timeZone}
            onValueChange={setTimeZoneDraft}
            disabled={!enabled}
          >
            <SelectTrigger id="digest-timezone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {timeZones(timeZone).map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {enabled && value.digest.nextRunAt !== undefined && (
        <div className="border-border bg-muted/30 flex items-start gap-3 rounded-md border px-4 py-3">
          <BellIcon
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <p className="text-muted-foreground text-xs leading-5">
            Next scheduled run:{" "}
            {formatNextRun(value.digest.nextRunAt, timeZone)}
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
