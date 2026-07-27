import { v } from "convex/values"

import { publicQuery } from "./lib/authorization"

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
  args: {},
  returns: v.array(publishedEntryValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("changelogEntries")
      .withIndex("by_status_and_published_at", (q) =>
        q.eq("status", "published"),
      )
      .order("desc")
      .collect()

    return rows.flatMap((row) => {
      const entry = publishedEntry(row)
      return entry ? [entry] : []
    })
  },
})
