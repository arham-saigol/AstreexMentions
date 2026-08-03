import { readFileSync } from "node:fs"

import { engagementScore } from "@astreex/domain"
import { createAlgoliaHackerNewsAdapter } from "../convex/integrations/providers/algoliaHackerNews"
import { createFetchLayerRedditAdapter } from "../convex/integrations/providers/fetchLayer"
import { parseRetryAfterMs } from "../convex/integrations/providers/http"
import {
  ProviderAdapterError,
  type ProviderErrorCode,
  type ProviderLogEvent,
} from "../convex/integrations/providers/types"
import { createXquikAdapter } from "../convex/integrations/providers/xquik"
import { describe, expect, it, vi } from "vitest"

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/providers/${name}`, import.meta.url),
      "utf8",
    ),
  ) as unknown
}

function jsonResponse(
  payload: unknown,
  options: { headers?: HeadersInit; status?: number } = {},
): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", ...options.headers },
    status: options.status ?? 200,
  })
}

async function expectProviderError(
  promise: Promise<unknown>,
  expected: {
    code: ProviderErrorCode
    retryAfterMs?: number
    status?: number
    timedOut?: boolean
  },
): Promise<ProviderAdapterError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderAdapterError)
    const providerError = error as ProviderAdapterError
    expect(providerError.code).toBe(expected.code)
    if (expected.status !== undefined) {
      expect(providerError.status).toBe(expected.status)
    }
    if (expected.retryAfterMs !== undefined) {
      expect(providerError.retryAfterMs).toBe(expected.retryAfterMs)
    }
    if (expected.timedOut !== undefined) {
      expect(providerError.timedOut).toBe(expected.timedOut)
    }
    return providerError
  }
  throw new Error("Expected a ProviderAdapterError")
}

describe("provider adapter configuration", () => {
  it("reports honest provider_unconfigured states when API keys are absent", () => {
    expect(createXquikAdapter({ apiKey: "  " })).toEqual({
      provider: "xquik",
      reason: "missing_api_key",
      state: "provider_unconfigured",
    })
    expect(createFetchLayerRedditAdapter({})).toEqual({
      provider: "fetchlayer_reddit",
      reason: "missing_api_key",
      state: "provider_unconfigured",
    })
  })
})

describe("Xquik adapter", () => {
  it("uses the documented request contract and normalizes tweets", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = []
    const logs: ProviderLogEvent[] = []
    const fetchMock: typeof fetch = async (input, init = {}) => {
      calls.push({ init, url: String(input) })
      return jsonResponse(fixture("xquik-search.json"))
    }
    const adapter = createXquikAdapter({
      apiKey: "xq_super_secret",
      fetch: fetchMock,
      logger: (event) => logs.push(event),
      now: () => 1_000,
    })
    if (adapter.state !== "ready") {
      throw new Error("Expected Xquik to be configured")
    }

    const result = await adapter.search({
      cursor: "cursor-page-1",
      limit: 2,
      q: "private customer phrase",
      queryType: "Top",
    })

    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) {
      throw new Error("Expected one Xquik request")
    }
    const url = new URL(call.url)
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://xquik.com/api/v1/x/tweets/search",
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      cursor: "cursor-page-1",
      limit: "2",
      q: "private customer phrase",
      queryType: "Top",
    })
    expect(new Headers(call.init.headers).get("x-api-key")).toBe(
      "xq_super_secret",
    )
    expect(call.init.method).toBe("GET")

    expect(result.pagination).toEqual({
      hasMore: true,
      kind: "cursor",
      nextCursor: "cursor-page-2",
      requestCursor: "cursor-page-1",
    })
    expect(result.checkpoint).toEqual({
      newestProviderItemId: "1900000000000000002",
      newestPublishedAt: Date.parse("2026-07-26T12:30:00Z"),
      oldestProviderItemId: "1900000000000000001",
      oldestPublishedAt: Date.parse("2026-07-26T11:00:00Z"),
    })
    expect(result.items[0]).toEqual({
      authorDisplayName: "Astreex User",
      authorHandle: "astreex_user",
      body: "Astreex catches customer questions quickly.",
      canonicalUrl: "https://x.com/astreex_user/status/1900000000000000002",
      contentType: "tweet",
      engagementScore: engagementScore({
        likes: 12,
        quotes: 2,
        replies: 3,
        reposts: 4,
        source: "x",
      }),
      likeCount: 12,
      platform: "x",
      providerItemId: "1900000000000000002",
      publishedAt: Date.parse("2026-07-26T12:30:00Z"),
      quoteCount: 2,
      replyCount: 3,
      repostCount: 4,
      searchText:
        "Astreex catches customer questions quickly.\nAstreex User\nastreex_user",
    })

    const serializedLogs = JSON.stringify(logs)
    expect(logs).toEqual([
      {
        durationMs: 0,
        event: "provider_request_completed",
        itemCount: 2,
        operation: "tweets.search",
        outcome: "success",
        provider: "xquik",
      },
    ])
    expect(serializedLogs).not.toContain("xq_super_secret")
    expect(serializedLogs).not.toContain("private customer phrase")
    expect(serializedLogs).not.toContain("cursor-page-1")
  })

  it("rejects a non-advancing provider cursor as malformed", async () => {
    const adapter = createXquikAdapter({
      apiKey: "configured",
      fetch: async () =>
        jsonResponse({
          has_next_page: true,
          next_cursor: "same-cursor",
          tweets: [],
        }),
    })
    if (adapter.state !== "ready") {
      throw new Error("Expected Xquik to be configured")
    }

    await expectProviderError(
      adapter.search({ cursor: "same-cursor", q: "astreex" }),
      { code: "malformed" },
    )
  })
})

describe("FetchLayer Reddit adapter", () => {
  it("normalizes Reddit posts and observes provider-managed pages without a cursor", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = []
    const adapter = createFetchLayerRedditAdapter({
      apiKey: "sk_fetchlayer_secret",
      fetch: async (input, init = {}) => {
        calls.push({ init, url: String(input) })
        return jsonResponse(fixture("fetchlayer-posts.json"))
      },
    })
    if (adapter.state !== "ready") {
      throw new Error("Expected FetchLayer to be configured")
    }

    const result = await adapter.searchPosts({
      limit: 10,
      pages: 2,
      query: "astreex",
      sort: "new",
      subreddit: "SaaS",
      time: "week",
    })

    const call = calls[0]
    if (!call) {
      throw new Error("Expected one FetchLayer request")
    }
    expect(call.url).toBe("https://fetchlayer.dev/api/reddit/search")
    expect(call.init.method).toBe("POST")
    expect(new Headers(call.init.headers).get("Authorization")).toBe(
      "Bearer sk_fetchlayer_secret",
    )
    expect(JSON.parse(String(call.init.body))).toEqual({
      limit: 10,
      pages: 2,
      query: "astreex",
      sort: "new",
      subreddit: "SaaS",
      time: "week",
    })

    expect(result.pagination).toEqual({
      hasMore: true,
      kind: "provider_pages",
      pagesRequested: 2,
      pagesScraped: 2,
    })
    expect(JSON.stringify(result.pagination)).not.toMatch(/cursor/iu)
    expect(result.items.map(({ contentType }) => contentType)).toEqual([
      "post",
      "post",
    ])
    expect(result.items[0]).toMatchObject({
      authorHandle: "founder_one",
      body: "We need a reliable way to catch customer questions.",
      canonicalUrl:
        "https://www.reddit.com/r/SaaS/comments/1abcde/how_do_you_monitor_brand_mentions/",
      commentCount: 21,
      contentType: "post",
      engagementScore: engagementScore({
        comments: 21,
        score: 84,
        source: "reddit",
      }),
      platform: "reddit",
      providerItemId: "1abcde",
      title: "How do you monitor brand mentions?",
    })
    expect(result.items[1]?.canonicalUrl).toBe(
      "https://www.reddit.com/r/startups/comments/1abcd0/astreex_feedback/",
    )
  })

  it("keeps Reddit comments distinct from posts", async () => {
    const adapter = createFetchLayerRedditAdapter({
      apiKey: "configured",
      fetch: async (input) => {
        expect(String(input)).toBe(
          "https://fetchlayer.dev/api/reddit/search-comments",
        )
        return jsonResponse(fixture("fetchlayer-comments.json"))
      },
    })
    if (adapter.state !== "ready") {
      throw new Error("Expected FetchLayer to be configured")
    }

    const result = await adapter.searchComments({ query: "astreex" })

    expect(result.pagination).toEqual({
      hasMore: false,
      kind: "provider_pages",
      pagesRequested: 1,
      pagesScraped: 1,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      authorHandle: "customer_voice",
      body: "Astreex looks useful, but does it support Reddit comments?",
      canonicalUrl:
        "https://www.reddit.com/r/SaaS/comments/1abcde/how_do_you_monitor_brand_mentions/mno123/",
      contentType: "comment",
      engagementScore: engagementScore({
        comments: 3,
        score: 15,
        source: "reddit",
      }),
      platform: "reddit",
      providerItemId: "mno123",
      replyCount: 3,
      title: "How do you monitor brand mentions?",
    })
  })
})

describe("Algolia Hacker News adapter", () => {
  it("uses search_by_date parameters and normalizes stories and comments", async () => {
    const calls: string[] = []
    const adapter = createAlgoliaHackerNewsAdapter({
      fetch: async (input) => {
        calls.push(String(input))
        return jsonResponse(fixture("algolia-hn-search.json"))
      },
    })

    const result = await adapter.search({
      hitsPerPage: 2,
      numericFilters: "created_at_i>1785000000",
      page: 0,
      query: "astreex",
      tags: "(story,comment)",
    })

    const url = new URL(calls[0] ?? "")
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://hn.algolia.com/api/v1/search_by_date",
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      hitsPerPage: "2",
      numericFilters: "created_at_i>1785000000",
      page: "0",
      query: "astreex",
      tags: "(story,comment)",
    })
    expect(result.pagination).toEqual({
      hasMore: true,
      hitsPerPage: 2,
      kind: "page",
      nextPage: 1,
      page: 0,
      totalPages: 2,
    })
    expect(result.items.map(({ contentType }) => contentType)).toEqual([
      "story",
      "comment",
    ])
    expect(result.items[0]).toMatchObject({
      authorHandle: "alice",
      body: "Astreex finds questions.\nIt also tracks praise & complaints.",
      canonicalUrl: "https://news.ycombinator.com/item?id=49000002",
      commentCount: 8,
      contentType: "story",
      engagementScore: engagementScore({
        comments: 8,
        points: 31,
        source: "hacker_news",
      }),
      platform: "hacker_news",
      pointCount: 31,
      providerItemId: "49000002",
      publishedAt: 1_785_061_800_000,
      title: "Show HN: Astreex mention monitoring",
    })
    expect(result.items[1]).toMatchObject({
      authorHandle: "bob",
      body: "I would use this for support.\nDoes it handle Reddit?",
      canonicalUrl: "https://news.ycombinator.com/item?id=49000001",
      contentType: "comment",
      platform: "hacker_news",
      providerItemId: "49000001",
      publishedAt: 1_785_056_400_000,
      title: "Tools for customer research",
    })
    expect(result.checkpoint).toEqual({
      newestProviderItemId: "49000002",
      newestPublishedAt: 1_785_061_800_000,
      oldestProviderItemId: "49000001",
      oldestPublishedAt: 1_785_056_400_000,
    })
  })

  it("preserves out-of-range numeric HTML entities without failing the page", async () => {
    const adapter = createAlgoliaHackerNewsAdapter({
      fetch: async () =>
        jsonResponse({
          hits: [
            {
              _tags: ["story"],
              created_at_i: 1_785_061_800,
              objectID: "49000003",
              story_text:
                "Valid &#x41;; invalid &#x110000; and &#1114112; entities.",
              title: "Numeric HTML entities",
            },
          ],
          hitsPerPage: 1,
          nbHits: 1,
          nbPages: 1,
          page: 0,
          processingTimeMS: 1,
          query: "astreex",
        }),
    })

    const result = await adapter.search({ query: "astreex" })

    expect(result.items[0]?.body).toBe(
      "Valid A; invalid &#x110000; and &#1114112; entities.",
    )
  })
})

describe("typed provider failures", () => {
  it.each([
    { code: "auth" as const, status: 401 },
    { code: "invalid_query" as const, status: 400 },
    { code: "server" as const, status: 503 },
  ])("maps HTTP $status to $code", async ({ code, status }) => {
    const adapter = createAlgoliaHackerNewsAdapter({
      fetch: async () => jsonResponse({ error: "sensitive body" }, { status }),
    })

    const error = await expectProviderError(
      adapter.search({ query: "secret customer query" }),
      { code, status },
    )
    expect(error.message).not.toContain("secret customer query")
    expect(error.message).not.toContain("sensitive body")
  })

  it("parses Retry-After without exposing response data", async () => {
    const adapter = createAlgoliaHackerNewsAdapter({
      fetch: async () =>
        jsonResponse(
          { error: "account details must stay private" },
          { headers: { "Retry-After": "2.5" }, status: 429 },
        ),
    })

    const error = await expectProviderError(
      adapter.search({ query: "private keyword" }),
      { code: "rate_limit", retryAfterMs: 2_500, status: 429 },
    )
    expect(error.message).not.toContain("account details")
    expect(
      parseRetryAfterMs("Sun, 26 Jul 2026 12:00:05 GMT", 1_785_067_200_000),
    ).toBe(5_000)
  })

  it("rejects invalid external input before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const adapter = createAlgoliaHackerNewsAdapter({ fetch: fetchMock })

    await expectProviderError(adapter.search({ query: "" }), {
      code: "invalid_query",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("classifies thrown fetch failures as network errors", async () => {
    const adapter = createAlgoliaHackerNewsAdapter({
      fetch: async () => {
        throw new TypeError("socket failed")
      },
    })

    await expectProviderError(adapter.search({ query: "astreex" }), {
      code: "network",
      timedOut: false,
    })
  })

  it("aborts requests at the configured timeout", async () => {
    const fetchUntilAbort: typeof fetch = async (_input, init = {}) =>
      await new Promise<Response>((_resolve, reject) => {
        const rejectForAbort = () =>
          reject(new DOMException("The operation was aborted", "AbortError"))
        if (init.signal?.aborted) {
          rejectForAbort()
          return
        }
        init.signal?.addEventListener("abort", rejectForAbort, { once: true })
      })
    const adapter = createAlgoliaHackerNewsAdapter({
      fetch: fetchUntilAbort,
      timeoutMs: 5,
    })

    await expectProviderError(adapter.search({ query: "astreex" }), {
      code: "network",
      timedOut: true,
    })
  })

  it("classifies invalid JSON and invalid response shapes as malformed", async () => {
    const invalidJsonAdapter = createAlgoliaHackerNewsAdapter({
      fetch: async () =>
        new Response("not-json", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    })
    await expectProviderError(invalidJsonAdapter.search({ query: "astreex" }), {
      code: "malformed",
    })

    const invalidShapeAdapter = createAlgoliaHackerNewsAdapter({
      fetch: async () => jsonResponse({ hits: [] }),
    })
    await expectProviderError(
      invalidShapeAdapter.search({ query: "astreex" }),
      { code: "malformed" },
    )
  })
})
