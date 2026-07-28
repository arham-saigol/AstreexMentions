import { z } from "zod"

import type { Platform } from "@/lib/customer-convex"

const idSchema = z.string().trim().min(1)
const timestampSchema = z.number().finite().nonnegative()

export const keywordPlatformSchema = z.enum(["x", "reddit", "hacker_news"])
export const trackingSourceTypeSchema = z.enum([
  "x",
  "reddit",
  "reddit_posts",
  "reddit_comments",
  "hacker_news",
])
export const trackingSourceStatusSchema = z.enum([
  "active",
  "paused",
  "error",
  "deleted",
])
export const trackingPauseReasonSchema = z.enum([
  "paid",
  "user",
  "usage",
  "config",
])

const rawTrackingSourceSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    trackingSourceId: idSchema.optional(),
    sourceType: trackingSourceTypeSchema.optional(),
    platform: keywordPlatformSchema.optional(),
    status: trackingSourceStatusSchema.optional(),
    pauseReason: trackingPauseReasonSchema.optional().nullable(),
    intervalMs: z.number().finite().positive().optional(),
    lastCheckedAt: timestampSchema.optional().nullable(),
    lastRunAt: timestampSchema.optional().nullable(),
    lastSuccessAt: timestampSchema.optional().nullable(),
    nextExpectedAt: timestampSchema.optional().nullable(),
    nextRunAt: timestampSchema.optional().nullable(),
    lastError: z.string().trim().min(1).optional().nullable(),
  })
  .passthrough()
  .transform((value, context) => {
    const sourceType = value.sourceType ?? value.platform
    if (!sourceType) {
      context.addIssue({
        code: "custom",
        message: "Tracking source data is missing its source type.",
      })
      return z.NEVER
    }

    const id = value.id ?? value._id ?? value.trackingSourceId ?? sourceType
    return {
      id,
      sourceType,
      status: value.status ?? ("paused" as const),
      pauseReason: value.pauseReason ?? null,
      intervalMs: value.intervalMs ?? null,
      lastCheckedAt:
        value.lastCheckedAt ?? value.lastRunAt ?? value.lastSuccessAt ?? null,
      nextExpectedAt: value.nextExpectedAt ?? value.nextRunAt ?? null,
      lastError: value.lastError ?? null,
    }
  })

const rawKeywordSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    keywordId: idSchema.optional(),
    phrase: z.string().trim().min(1).max(160),
    platforms: z.array(keywordPlatformSchema).min(1),
    status: z.enum(["active", "paused", "deleted"]).optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
    pausedAt: timestampSchema.optional().nullable(),
    sources: z.array(rawTrackingSourceSchema).optional(),
    sourceStates: z.array(rawTrackingSourceSchema).optional(),
    trackingSources: z.array(rawTrackingSourceSchema).optional(),
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id ?? value._id ?? value.keywordId
    if (!id) {
      context.addIssue({
        code: "custom",
        message: "Keyword data is missing its id.",
      })
      return z.NEVER
    }

    return {
      id,
      phrase: value.phrase,
      platforms: [...new Set(value.platforms)],
      status: value.status ?? ("active" as const),
      sources:
        value.sources ?? value.sourceStates ?? value.trackingSources ?? [],
      ...(value.createdAt !== undefined ? { createdAt: value.createdAt } : {}),
      ...(value.updatedAt !== undefined ? { updatedAt: value.updatedAt } : {}),
      ...(value.pausedAt !== undefined ? { pausedAt: value.pausedAt } : {}),
    }
  })

const keywordCollectionSchema = z.union([
  z.array(rawKeywordSchema),
  z
    .object({
      items: z.array(rawKeywordSchema).optional(),
      keywords: z.array(rawKeywordSchema).optional(),
    })
    .passthrough()
    .transform((value, context) => {
      const keywords = value.items ?? value.keywords
      if (!keywords) {
        context.addIssue({
          code: "custom",
          message: "Keyword list data does not include items.",
        })
        return z.NEVER
      }
      return keywords
    }),
])

export const keywordListResultSchema = keywordCollectionSchema.transform(
  (items) =>
    [...items]
      .filter((item) => item.status !== "deleted")
      .sort(
        (left, right) =>
          (right.updatedAt ?? right.createdAt ?? 0) -
            (left.updatedAt ?? left.createdAt ?? 0) ||
          left.phrase.localeCompare(right.phrase),
      ),
)

const rawKeywordUsageSchema = z
  .object({
    count: z.number().int().nonnegative().optional(),
    used: z.number().int().nonnegative().optional(),
    keywordCount: z.number().int().nonnegative().optional(),
    totalCount: z.number().int().nonnegative().optional(),
    limit: z.number().int().nonnegative().optional().nullable(),
    keywordLimit: z.number().int().nonnegative().optional().nullable(),
    remaining: z.number().int().nonnegative().optional().nullable(),
    remainingKeywordSlots: z.number().int().nonnegative().optional().nullable(),
    canCreate: z.boolean().optional(),
    canCreateKeyword: z.boolean().optional(),
    limitReached: z.boolean().optional(),
    atLimit: z.boolean().optional(),
    isAtLimit: z.boolean().optional(),
  })
  .passthrough()

export const keywordSummaryResultSchema = z
  .object({
    count: z.number().int().nonnegative().optional(),
    used: z.number().int().nonnegative().optional(),
    keywordCount: z.number().int().nonnegative().optional(),
    totalCount: z.number().int().nonnegative().optional(),
    activeCount: z.number().int().nonnegative().optional(),
    pausedCount: z.number().int().nonnegative().optional(),
    limit: z.number().int().nonnegative().optional().nullable(),
    keywordLimit: z.number().int().nonnegative().optional().nullable(),
    remaining: z.number().int().nonnegative().optional().nullable(),
    remainingKeywordSlots: z.number().int().nonnegative().optional().nullable(),
    canCreate: z.boolean().optional(),
    canCreateKeyword: z.boolean().optional(),
    limitReached: z.boolean().optional(),
    atLimit: z.boolean().optional(),
    isAtLimit: z.boolean().optional(),
    monitoringState: z
      .enum(["active", "paused", "setup_required", "unpaid", "usage_limited"])
      .optional(),
    usage: rawKeywordUsageSchema.optional(),
  })
  .passthrough()
  .transform((value) => {
    const count =
      value.keywordCount ??
      value.totalCount ??
      value.count ??
      value.used ??
      value.usage?.keywordCount ??
      value.usage?.totalCount ??
      value.usage?.count ??
      value.usage?.used ??
      0
    const limit =
      value.keywordLimit ??
      value.limit ??
      value.usage?.keywordLimit ??
      value.usage?.limit ??
      null
    const remaining =
      value.remaining ??
      value.remainingKeywordSlots ??
      value.usage?.remaining ??
      value.usage?.remainingKeywordSlots ??
      (limit === null ? null : Math.max(0, limit - count))
    const limitReached =
      value.limitReached ??
      value.atLimit ??
      value.isAtLimit ??
      value.usage?.limitReached ??
      value.usage?.atLimit ??
      value.usage?.isAtLimit ??
      (limit !== null && count >= limit)

    return {
      count,
      limit,
      remaining,
      limitReached,
      canCreate:
        value.canCreate ??
        value.canCreateKeyword ??
        value.usage?.canCreate ??
        value.usage?.canCreateKeyword ??
        !limitReached,
      activeCount: value.activeCount ?? null,
      pausedCount: value.pausedCount ?? null,
      monitoringState: value.monitoringState ?? null,
    }
  })

export type TrackingSourceType = z.infer<typeof trackingSourceTypeSchema>
export type TrackingSourceStatus = z.infer<typeof trackingSourceStatusSchema>
export type TrackingPauseReason = z.infer<typeof trackingPauseReasonSchema>
export type KeywordTrackingSource = z.infer<typeof rawTrackingSourceSchema>
export type KeywordItem = z.infer<typeof rawKeywordSchema>
export type KeywordSummary = z.infer<typeof keywordSummaryResultSchema>

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
    case "reddit":
      return "Reddit"
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

export type DisplayTrackingSource = KeywordTrackingSource & {
  configuredOnly: boolean
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
