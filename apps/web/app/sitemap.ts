import type { MetadataRoute } from "next"

import { getAllBlogPosts } from "@/lib/blog"
import { getPublishedChangelogEntries } from "@/lib/changelog"
import { getSiteUrl } from "@/lib/env"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const blogPosts = getAllBlogPosts()
  const changelogResult = await getPublishedChangelogEntries()
  const changelogRoutes: MetadataRoute.Sitemap =
    changelogResult.state === "ready"
      ? [
          {
            url: new URL("/changelog", siteUrl).toString(),
            changeFrequency: "weekly",
            priority: 0.8,
          },
          ...changelogResult.entries.map((entry) => ({
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
