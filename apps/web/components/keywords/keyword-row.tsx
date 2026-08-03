"use client"

import {
  CheckCircleIcon,
  ClockIcon,
  KeyIcon,
  NewspaperIcon,
  NotePencilIcon,
  PauseIcon,
  PlayIcon,
  RedditLogoIcon,
  TrashIcon,
  WarningCircleIcon,
  XLogoIcon,
} from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { cn } from "@astreex/ui/lib/utils"

import type { Platform } from "@/lib/keywords"
import {
  displaySources,
  formatInterval,
  formatTimestamp,
  sourceLabel,
  type DisplayTrackingSource,
  type KeywordItem,
  type TrackingSourceType,
} from "@/lib/keywords"

function PlatformIcon({ platform }: { platform: Platform }) {
  const Icon =
    platform === "x"
      ? XLogoIcon
      : platform === "reddit"
        ? RedditLogoIcon
        : NewspaperIcon
  return <Icon aria-hidden="true" className="size-3.5" />
}

function SourceIcon({ sourceType }: { sourceType: TrackingSourceType }) {
  const Icon =
    sourceType === "x"
      ? XLogoIcon
      : sourceType === "hacker_news"
        ? NewspaperIcon
        : RedditLogoIcon
  return <Icon aria-hidden="true" className="size-4" />
}

function sourceState(source: DisplayTrackingSource, monitoringActive: boolean) {
  if (source.configuredOnly) {
    return monitoringActive
      ? {
          label: "Awaiting setup",
          description:
            "The configured source has not returned schedule details yet.",
          variant: "muted" as const,
        }
      : {
          label: "Draft source",
          description:
            "No checks are scheduled before subscription activation.",
          variant: "muted" as const,
        }
  }

  if (!monitoringActive) {
    return {
      label: "Draft source",
      description:
        "The subscription is inactive, so this source is not represented as collecting.",
      variant: "muted" as const,
    }
  }

  if (source.status === "error") {
    return {
      label: "Error",
      description: "The last provider attempt did not complete successfully.",
      variant: "destructive" as const,
    }
  }
  if (source.status === "deleted") {
    return {
      label: "Removed",
      description: "This source is no longer part of the active configuration.",
      variant: "muted" as const,
    }
  }
  if (source.status === "active") {
    return {
      label: "Active",
      description: "Provider checks are scheduled.",
      variant: "secondary" as const,
    }
  }

  switch (source.pauseReason) {
    case "usage":
      return {
        label: "Usage limit",
        description:
          "Collection is paused until usage becomes available again.",
        variant: "outline" as const,
      }
    case "paid":
      return {
        label: "Subscription",
        description: "Collection waits for an active paid entitlement.",
        variant: "outline" as const,
      }
    case "config":
      return {
        label: "Setup required",
        description: "Provider configuration is incomplete for this source.",
        variant: "outline" as const,
      }
    case "user":
      return {
        label: "Paused",
        description: "This source was paused with the keyword.",
        variant: "muted" as const,
      }
    default:
      return {
        label: "Paused",
        description: "Provider checks are not currently scheduled.",
        variant: "muted" as const,
      }
  }
}

function KeywordStatus({
  keyword,
  monitoringActive,
}: {
  keyword: KeywordItem
  monitoringActive: boolean
}) {
  const sources = displaySources(keyword)
  const usagePaused = sources.some((source) => source.pauseReason === "usage")
  const hasError = sources.some((source) => source.status === "error")

  if (!monitoringActive) {
    return (
      <Badge variant="outline">
        <KeyIcon aria-hidden="true" />
        Draft
      </Badge>
    )
  }
  if (keyword.status === "paused") {
    return (
      <Badge variant="muted">
        <PauseIcon aria-hidden="true" />
        Paused
      </Badge>
    )
  }
  if (usagePaused) {
    return (
      <Badge variant="outline">
        <ClockIcon aria-hidden="true" />
        Usage paused
      </Badge>
    )
  }
  if (hasError) {
    return (
      <Badge variant="destructive">
        <WarningCircleIcon aria-hidden="true" />
        Needs attention
      </Badge>
    )
  }

  return (
    <Badge variant="secondary">
      <CheckCircleIcon aria-hidden="true" />
      Active
    </Badge>
  )
}

export function KeywordRow({
  keyword,
  monitoringActive,
  onDelete,
  onEdit,
  onPause,
  onResume,
}: {
  keyword: KeywordItem
  monitoringActive: boolean
  onDelete: () => void
  onEdit: () => void
  onPause: () => void
  onResume: () => void
}) {
  const sources = displaySources(keyword)

  return (
    <article className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-foreground text-base font-semibold break-words">
              {keyword.phrase}
            </h2>
            <KeywordStatus
              keyword={keyword}
              monitoringActive={monitoringActive}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Platforms">
            {keyword.platforms.map((platform) => (
              <span
                key={platform}
                className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
              >
                <PlatformIcon platform={platform} />
                {platform === "x"
                  ? "X"
                  : platform === "reddit"
                    ? "Reddit"
                    : "Hacker News"}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <NotePencilIcon aria-hidden="true" />
            Edit
          </Button>
          {keyword.status === "paused" ? (
            <Button size="sm" variant="outline" onClick={onResume}>
              <PlayIcon aria-hidden="true" />
              Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onPause}>
              <PauseIcon aria-hidden="true" />
              Pause
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            aria-label={`Delete ${keyword.phrase}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <TrashIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="border-border border-t">
        <div className="bg-muted/25 border-border grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-4 py-2.5 sm:px-5">
          <p className="text-foreground text-xs font-semibold">
            Source schedule
          </p>
          <p className="text-muted-foreground text-xs">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="divide-border divide-y">
          {sources.map((source) => {
            const state = sourceState(source, monitoringActive)
            const cadence = formatInterval(source.intervalMs)
            return (
              <li key={source.id} className="px-4 py-4 sm:px-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">
                        <SourceIcon sourceType={source.sourceType} />
                      </span>
                      <span className="text-foreground text-sm font-medium">
                        {sourceLabel(source.sourceType)}
                      </span>
                      <Badge variant={state.variant}>{state.label}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                      {state.description}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Last checked</dt>
                      <dd className="text-foreground mt-1 font-medium tabular-nums">
                        {formatTimestamp(source.lastCheckedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Next expected</dt>
                      <dd className="text-foreground mt-1 font-medium tabular-nums">
                        {formatTimestamp(source.nextExpectedAt)}
                      </dd>
                    </div>
                  </dl>

                  <div
                    className={cn(
                      "text-xs leading-5",
                      source.lastError
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    <p className="font-medium">
                      {source.lastError ? "Latest error" : "Schedule detail"}
                    </p>
                    <p className="mt-1 break-words">
                      {source.lastError ??
                        cadence ??
                        "Cadence not returned yet."}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </article>
  )
}
