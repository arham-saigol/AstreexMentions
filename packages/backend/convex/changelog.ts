import { v } from "convex/values"

import { publicQuery } from "./lib/authorization"
import { indexEquals, indexGreaterThanOrEqual } from "./server"

const PUBLIC_CHANGELOG_PAGE_SIZE = 24
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const publishedEntrySummaryValidator = v.object({
  publishedAt: v.number(),
  slug: v.string(),
  summary: v.string(),
  title: v.string(),
  updatedAt: v.number(),
})

const publishedEntryValidator = v.object({
  body: v.string(),
  publishedAt: v.number(),
  slug: v.string(),
  summary: v.string(),
  title: v.string(),
  updatedAt: v.number(),
})

function publishedEntry(row: Record<string, unknown>) {
  const publishedAt = row.publishedAt
  if (row.status !== "published" || typeof publishedAt !== "number") {
    return null
  }

  return {
    body: row.body as string,
    publishedAt,
    slug: row.slug as string,
    summary: row.summary as string,
    title: row.title as string,
    updatedAt: row.updatedAt as number,
  }
}

export const listPublishedEntries = publicQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    entries: v.array(publishedEntrySummaryValidator),
    isDone: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("changelogEntries")
      .withIndex("by_status_and_published_at", (q) =>
        indexGreaterThanOrEqual(
          indexEquals(q, ["status", "published"]),
          "publishedAt",
          0,
        ),
      )
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: PUBLIC_CHANGELOG_PAGE_SIZE,
      })

    return {
      entries: page.page.flatMap((row) => {
        const entry = publishedEntry(row)
        if (!entry) {
          return []
        }
        return [
          {
            publishedAt: entry.publishedAt,
            slug: entry.slug,
            summary: entry.summary,
            title: entry.title,
            updatedAt: entry.updatedAt,
          },
        ]
      }),
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    }
  },
})

export const getPublishedEntry = publicQuery({
  args: { slug: v.string() },
  returns: v.union(publishedEntryValidator, v.null()),
  handler: async (ctx, args) => {
    if (args.slug.length > 120 || !SLUG_PATTERN.test(args.slug)) {
      return null
    }
    const row = await ctx.db
      .query("changelogEntries")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()
    return row ? publishedEntry(row) : null
  },
})
