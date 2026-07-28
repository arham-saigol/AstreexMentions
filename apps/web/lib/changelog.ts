import "server-only"

import { ConvexHttpClient } from "convex/browser"
import { cache } from "react"
import { z } from "zod"

import { convexQueryReference } from "@/lib/convex"
import { getRuntimeConfiguration } from "@/lib/env"

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000
const timestampSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_DATE_TIMESTAMP)

const publishedEntrySummarySchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(SLUG_PATTERN),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(320),
  publishedAt: timestampSchema,
  updatedAt: timestampSchema.optional(),
})

const publishedEntrySchema = publishedEntrySummarySchema.extend({
  body: z.string().trim().min(1).max(100_000),
})

const publishedEntriesPageSchema = z.object({
  entries: z.array(publishedEntrySummarySchema),
  isDone: z.boolean(),
  nextCursor: z.string().trim().min(1).nullable(),
})

const publishedEntriesQuery = convexQueryReference<
  { cursor?: string },
  unknown
>("changelog:listPublishedEntries")
const publishedEntryQuery = convexQueryReference<{ slug: string }, unknown>(
  "changelog:getPublishedEntry",
)

export type PublishedChangelogSummary = {
  slug: string
  title: string
  summary: string
  publishedAt: number
  updatedAt?: number
}

export type PublishedChangelogEntry = PublishedChangelogSummary & {
  body: string
}

export type ChangelogListResult =
  | {
      state: "ready"
      entries: PublishedChangelogSummary[]
      isDone: boolean
      nextCursor: string | null
    }
  | {
      state: "configuration-required"
    }
  | {
      state: "error"
    }

export type ChangelogEntryResult =
  | {
      state: "ready"
      entry: PublishedChangelogEntry | null
    }
  | {
      state: "configuration-required"
    }
  | {
      state: "error"
    }

function publicSummary(
  entry: z.infer<typeof publishedEntrySummarySchema>,
): PublishedChangelogSummary {
  return {
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    publishedAt: entry.publishedAt,
    ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
  }
}

function publicEntry(
  entry: z.infer<typeof publishedEntrySchema>,
): PublishedChangelogEntry {
  return {
    ...publicSummary(entry),
    body: entry.body,
  }
}

export const getPublishedChangelogEntries = cache(
  async (cursor?: string): Promise<ChangelogListResult> => {
    const configuration = getRuntimeConfiguration()

    if (!configuration.convex.configured || !configuration.convex.url) {
      return { state: "configuration-required" }
    }

    try {
      const client = new ConvexHttpClient(configuration.convex.url, {
        logger: false,
      })
      const response = await client.query(publishedEntriesQuery, {
        ...(cursor === undefined ? {} : { cursor }),
      })
      const parsed = publishedEntriesPageSchema.safeParse(response)
      if (!parsed.success) {
        return { state: "error" }
      }
      if (parsed.data.isDone !== (parsed.data.nextCursor === null)) {
        return { state: "error" }
      }

      const seenSlugs = new Set<string>()
      const entries: PublishedChangelogSummary[] = []
      for (const record of parsed.data.entries) {
        if (seenSlugs.has(record.slug)) {
          return { state: "error" }
        }
        seenSlugs.add(record.slug)
        entries.push(publicSummary(record))
      }

      return {
        state: "ready",
        entries,
        isDone: parsed.data.isDone,
        nextCursor: parsed.data.nextCursor,
      }
    } catch {
      return { state: "error" }
    }
  },
)

export const getPublishedChangelogEntry = cache(
  async (slug: string): Promise<ChangelogEntryResult> => {
    const configuration = getRuntimeConfiguration()

    if (!configuration.convex.configured || !configuration.convex.url) {
      return { state: "configuration-required" }
    }

    try {
      const client = new ConvexHttpClient(configuration.convex.url, {
        logger: false,
      })
      const response = await client.query(publishedEntryQuery, { slug })
      if (response === null) {
        return { state: "ready", entry: null }
      }
      const parsed = publishedEntrySchema.safeParse(response)
      return parsed.success
        ? { state: "ready", entry: publicEntry(parsed.data) }
        : { state: "error" }
    } catch {
      return { state: "error" }
    }
  },
)

export function formatChangelogDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp))
}

export function changelogDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
