import type { api } from "@astreex/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

export type Platform = FunctionArgs<
  typeof api.keywords.createKeyword
>["platforms"][number]
export type KeywordItem = FunctionReturnType<
  typeof api.keywords.listKeywords
>[number]
export type KeywordSummary = FunctionReturnType<
  typeof api.keywords.getKeywordSummary
>
export type KeywordTrackingSource = KeywordItem["sources"][number]
export type TrackingSourceType = KeywordTrackingSource["sourceType"]
export type TrackingSourceStatus = KeywordTrackingSource["status"]
export type TrackingPauseReason = KeywordTrackingSource["pauseReason"]

export const PLATFORM_OPTIONS = [
  {
    value: "x",
    label: "X",
    description: "Public posts and replies",
  },
  {
    value: "reddit",
    label: "Reddit",
    description: "Posts and comments",
  },
  {
    value: "hacker_news",
    label: "Hacker News",
    description: "Stories and comments",
  },
] as const satisfies readonly {
  value: Platform
  label: string
  description: string
}[]

export function sourceLabel(sourceType: TrackingSourceType): string {
  switch (sourceType) {
    case "x":
      return "X"
    case "reddit_posts":
      return "Reddit posts"
    case "reddit_comments":
      return "Reddit comments"
    case "hacker_news":
      return "Hacker News"
  }
}

export function sourceTypesForPlatform(
  platform: Platform,
): TrackingSourceType[] {
  switch (platform) {
    case "x":
      return ["x"]
    case "reddit":
      return ["reddit_posts", "reddit_comments"]
    case "hacker_news":
      return ["hacker_news"]
  }
}

export type DisplayTrackingSource = Omit<
  KeywordTrackingSource,
  "id" | "intervalMs"
> & {
  configuredOnly: boolean
  id: string
  intervalMs: number | null
}

export function displaySources(keyword: KeywordItem): DisplayTrackingSource[] {
  const byType = new Map(
    keyword.sources.map((source) => [source.sourceType, source] as const),
  )
  const expected = keyword.platforms.flatMap(sourceTypesForPlatform)
  const orderedTypes = [...new Set([...expected, ...byType.keys()])]

  return orderedTypes.map((sourceType) => {
    const source = byType.get(sourceType)
    if (source) {
      return { ...source, configuredOnly: false }
    }

    return {
      id: `${keyword.id}-${sourceType}`,
      sourceType,
      status: "paused" as const,
      pauseReason: null,
      intervalMs: null,
      lastCheckedAt: null,
      nextExpectedAt: null,
      lastError: null,
      configuredOnly: true,
    }
  })
}

export function formatTimestamp(value: number | null): string {
  if (value === null) {
    return "Not yet"
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function formatInterval(value: number | null): string | null {
  if (value === null) {
    return null
  }

  const minutes = Math.round(value / 60_000)
  if (minutes < 60) {
    return `${minutes} min cadence`
  }

  const hours = Math.round(minutes / 60)
  return `${hours} hr cadence`
}

export function backendErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message?: unknown }).message
      if (typeof message === "string" && message.trim()) {
        return message.trim()
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    const convexMessage = error.message.match(
      /ConvexError:\s*(?:\{[^}]*"message":"([^"]+)"[^}]*\}|(.+))$/s,
    )
    const message = convexMessage?.[1] ?? convexMessage?.[2]
    if (message?.trim()) {
      return message.trim()
    }
  }

  return fallback
}
