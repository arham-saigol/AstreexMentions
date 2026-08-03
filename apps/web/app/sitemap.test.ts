import { beforeEach, describe, expect, it, vi } from "vitest"

import { getAllBlogPosts } from "@/lib/blog"
import { getPublishedChangelogEntries } from "@/lib/changelog"
import { getSiteUrl } from "@/lib/env"

import sitemap from "./sitemap"

vi.mock("@/lib/blog", () => ({
  getAllBlogPosts: vi.fn(),
}))
vi.mock("@/lib/changelog", () => ({
  getPublishedChangelogEntries: vi.fn(),
}))
vi.mock("@/lib/env", () => ({
  getSiteUrl: vi.fn(),
}))

const getAllBlogPostsMock = vi.mocked(getAllBlogPosts)
const getPublishedChangelogEntriesMock = vi.mocked(getPublishedChangelogEntries)
const getSiteUrlMock = vi.mocked(getSiteUrl)

beforeEach(() => {
  getAllBlogPostsMock.mockReset()
  getAllBlogPostsMock.mockReturnValue([])
  getPublishedChangelogEntriesMock.mockReset()
  getSiteUrlMock.mockReset()
  getSiteUrlMock.mockReturnValue(new URL("https://astreex.example"))
})

describe("sitemap", () => {
  it("follows every published changelog cursor", async () => {
    getPublishedChangelogEntriesMock
      .mockResolvedValueOnce({
        entries: [
          {
            publishedAt: 1_000,
            slug: "new-entry",
            summary: "Newest release",
            title: "New entry",
            updatedAt: 1_100,
          },
        ],
        isDone: false,
        nextCursor: "older-page",
        state: "ready",
      })
      .mockResolvedValueOnce({
        entries: [
          {
            publishedAt: 500,
            slug: "old-entry",
            summary: "Older release",
            title: "Old entry",
            updatedAt: 600,
          },
        ],
        isDone: true,
        nextCursor: null,
        state: "ready",
      })

    const routes = await sitemap()

    expect(getPublishedChangelogEntriesMock).toHaveBeenNthCalledWith(
      1,
      undefined,
    )
    expect(getPublishedChangelogEntriesMock).toHaveBeenNthCalledWith(
      2,
      "older-page",
    )
    expect(routes.map(({ url }) => url)).toEqual([
      "https://astreex.example/",
      "https://astreex.example/blog",
      "https://astreex.example/changelog",
      "https://astreex.example/changelog/new-entry",
      "https://astreex.example/changelog/old-entry",
    ])
  })
})
