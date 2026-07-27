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

const publishedEntrySchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(SLUG_PATTERN),
  title: z.string().trim().min(1).max(140),
  summary: z.string().trim().min(1).max(320),
  body: z.string().trim().min(1).max(100_000),
  publishedAt: timestampSchema,
  updatedAt: timestampSchema.optional(),
  status: z.literal("published").optional(),
})

const publishedEntriesResponseSchema = z.union([
  z.array(publishedEntrySchema),
  z.object({
    entries: z.array(publishedEntrySchema),
  }),
])

const publishedEntriesQuery = convexQueryReference<
  Record<string, never>,
  unknown
>("changelog:listPublishedEntries")

export type PublishedChangelogEntry = {
  slug: string
  title: string
  summary: string
  body: string
  publishedAt: number
  updatedAt?: number
}

export type ChangelogResult =
  | {
      state: "ready"
      entries: PublishedChangelogEntry[]
    }
  | {
      state: "configuration-required"
    }
  | {
      state: "error"
    }

function publicEntry(
  entry: z.infer<typeof publishedEntrySchema>,
): PublishedChangelogEntry {
  return {
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    publishedAt: entry.publishedAt,
    ...(entry.updatedAt === undefined ? {} : { updatedAt: entry.updatedAt }),
  }
}

function parsePublishedEntries(
  value: unknown,
): PublishedChangelogEntry[] | null {
  const parsed = publishedEntriesResponseSchema.safeParse(value)

  if (!parsed.success) {
    return null
  }

  const records = Array.isArray(parsed.data) ? parsed.data : parsed.data.entries
  const seenSlugs = new Set<string>()
  const entries: PublishedChangelogEntry[] = []

  for (const record of records) {
    if (seenSlugs.has(record.slug)) {
      return null
    }

    seenSlugs.add(record.slug)
    entries.push(publicEntry(record))
  }

  return entries.sort((left, right) => right.publishedAt - left.publishedAt)
}

export const getPublishedChangelogEntries = cache(
  async (): Promise<ChangelogResult> => {
    const configuration = getRuntimeConfiguration()

    if (!configuration.convex.configured || !configuration.convex.url) {
      return { state: "configuration-required" }
    }

    try {
      const client = new ConvexHttpClient(configuration.convex.url, {
        logger: false,
      })
      const response = await client.query(publishedEntriesQuery, {})
      const entries = parsePublishedEntries(response)

      if (!entries) {
        return { state: "error" }
      }

      return { state: "ready", entries }
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
