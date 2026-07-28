import type { MetadataRoute } from "next"

import { getAllBlogPosts } from "@/lib/blog"
import {
  getPublishedChangelogEntries,
  type PublishedChangelogSummary,
} from "@/lib/changelog"
import { getSiteUrl } from "@/lib/env"

export const dynamic = "force-dynamic"

async function getAllPublishedChangelogEntries(): Promise<
  PublishedChangelogSummary[] | null
> {
  const entries: PublishedChangelogSummary[] = []
  const seenCursors = new Set<string>()
  const seenSlugs = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const result = await getPublishedChangelogEntries(cursor)
    if (result.state !== "ready") {
      return null
    }
    for (const entry of result.entries) {
      if (seenSlugs.has(entry.slug)) {
        return null
      }
      seenSlugs.add(entry.slug)
      entries.push(entry)
    }
    if (result.isDone) {
      return entries
    }
    if (result.nextCursor === null || seenCursors.has(result.nextCursor)) {
      return null
    }
    seenCursors.add(result.nextCursor)
    cursor = result.nextCursor
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const blogPosts = getAllBlogPosts()
  const changelogEntries = await getAllPublishedChangelogEntries()
  const changelogRoutes: MetadataRoute.Sitemap =
    changelogEntries !== null
      ? [
          {
            url: new URL("/changelog", siteUrl).toString(),
            changeFrequency: "weekly",
            priority: 0.8,
          },
          ...changelogEntries.map((entry) => ({
            url: new URL(`/changelog/${entry.slug}`, siteUrl).toString(),
            lastModified: new Date(entry.updatedAt ?? entry.publishedAt),
            changeFrequency: "monthly" as const,
            priority: 0.7,
          })),
        ]
      : []

  return [
    {
      url: new URL("/", siteUrl).toString(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/blog", siteUrl).toString(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...blogPosts.map((post) => ({
      url: new URL(`/blog/${post.slug}`, siteUrl).toString(),
      lastModified: new Date(
        `${post.updatedAt ?? post.publishedAt}T00:00:00.000Z`,
      ),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...changelogRoutes,
  ]
}
