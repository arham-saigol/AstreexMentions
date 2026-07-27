import { engagementScore } from "../../lib/engagementRanking"
import { z } from "zod"

import {
  malformedProviderResponse,
  parseProviderInput,
  parseProviderResponse,
  requestProviderJson,
  runProviderOperation,
  type ProviderHttpDependencies,
} from "./http"
import {
  createSearchText,
  observeProviderCheckpoint,
  type NormalizedProviderMention,
  type ProviderSearchResult,
  type ProviderUnconfigured,
} from "./types"

const XQUIK_PROVIDER = "xquik" as const
export const XQUIK_TWEET_SEARCH_ENDPOINT =
  "https://xquik.com/api/v1/x/tweets/search"

export const xquikSearchInputSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(20),
  q: z.string().trim().min(1),
  queryType: z.enum(["Latest", "Top"]).default("Latest"),
})

const optionalCountSchema = z.number().int().nonnegative().optional()
const xquikTweetSchema = z.object({
  author: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    username: z.string().trim().min(1),
    verified: z.boolean(),
  }),
  bookmarkCount: optionalCountSchema,
  createdAt: z.string().trim().min(1),
  id: z.string().trim().min(1),
  likeCount: optionalCountSchema,
  quoteCount: optionalCountSchema,
  replyCount: optionalCountSchema,
  retweetCount: optionalCountSchema,
  text: z.string().trim().min(1),
  viewCount: optionalCountSchema,
})

export const xquikSearchResponseSchema = z.object({
  has_next_page: z.boolean(),
  next_cursor: z.string().trim().min(1).nullable().optional(),
  tweets: z.array(xquikTweetSchema),
})

export type XquikSearchInput = z.input<typeof xquikSearchInputSchema>

export type XquikAdapter = {
  provider: typeof XQUIK_PROVIDER
  search(
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderSearchResult>
  state: "ready"
}

function parsePublishedAt(value: string): number {
  const publishedAt = Date.parse(value)
  if (!Number.isFinite(publishedAt)) {
    throw malformedProviderResponse(
      XQUIK_PROVIDER,
      "Xquik returned an invalid tweet timestamp",
    )
  }
  return publishedAt
}

function normalizeTweet(
  tweet: z.output<typeof xquikTweetSchema>,
): NormalizedProviderMention {
  const likes = tweet.likeCount ?? 0
  const quotes = tweet.quoteCount ?? 0
  const replies = tweet.replyCount ?? 0
  const reposts = tweet.retweetCount ?? 0

  return {
    authorDisplayName: tweet.author.name,
    authorHandle: tweet.author.username,
    body: tweet.text,
    canonicalUrl: `https://x.com/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`,
    contentType: "tweet",
    engagementScore: engagementScore({
      likes,
      quotes,
      replies,
      reposts,
      source: "x",
    }),
    ...(tweet.likeCount === undefined ? {} : { likeCount: tweet.likeCount }),
    platform: "x",
    providerItemId: tweet.id,
    publishedAt: parsePublishedAt(tweet.createdAt),
    ...(tweet.quoteCount === undefined ? {} : { quoteCount: tweet.quoteCount }),
    ...(tweet.replyCount === undefined ? {} : { replyCount: tweet.replyCount }),
    ...(tweet.retweetCount === undefined
      ? {}
      : { repostCount: tweet.retweetCount }),
    searchText: createSearchText(
      tweet.text,
      tweet.author.name,
      tweet.author.username,
    ),
  }
}

export function createXquikAdapter(
  options: ProviderHttpDependencies & {
    apiKey?: string | undefined
    endpoint?: string | undefined
  },
): ProviderUnconfigured | XquikAdapter {
  const apiKey = options.apiKey?.trim()
  if (!apiKey) {
    return {
      provider: XQUIK_PROVIDER,
      reason: "missing_api_key",
      state: "provider_unconfigured",
    }
  }

  const endpoint = options.endpoint ?? XQUIK_TWEET_SEARCH_ENDPOINT

  return {
    provider: XQUIK_PROVIDER,
    state: "ready",
    search: async (rawInput, requestOptions = {}) => {
      const input = parseProviderInput(
        xquikSearchInputSchema,
        rawInput,
        XQUIK_PROVIDER,
      )

      return await runProviderOperation({
        logger: options.logger,
        now: options.now,
        operation: "tweets.search",
        provider: XQUIK_PROVIDER,
        successItemCount: (result) => result.items.length,
        run: async () => {
          const url = new URL(endpoint)
          url.searchParams.set("q", input.q)
          url.searchParams.set("queryType", input.queryType)
          url.searchParams.set("limit", String(input.limit))
          if (input.cursor !== undefined) {
            url.searchParams.set("cursor", input.cursor)
          }

          const payload = await requestProviderJson({
            fetch: options.fetch,
            init: {
              headers: { "x-api-key": apiKey },
              method: "GET",
              ...(requestOptions.signal === undefined
                ? {}
                : { signal: requestOptions.signal }),
            },
            now: options.now,
            provider: XQUIK_PROVIDER,
            timeoutMs: options.timeoutMs,
            url: url.toString(),
          })
          const response = parseProviderResponse(
            xquikSearchResponseSchema,
            payload,
            XQUIK_PROVIDER,
          )
          const nextCursor = response.next_cursor ?? undefined
          if (
            response.has_next_page &&
            (nextCursor === undefined || nextCursor === input.cursor)
          ) {
            throw malformedProviderResponse(
              XQUIK_PROVIDER,
              "Xquik pagination did not advance",
            )
          }

          const items = response.tweets.map(normalizeTweet)
          return {
            checkpoint: observeProviderCheckpoint(items),
            items,
            pagination: {
              hasMore: response.has_next_page,
              kind: "cursor",
              ...(nextCursor === undefined ? {} : { nextCursor }),
              ...(input.cursor === undefined
                ? {}
                : { requestCursor: input.cursor }),
            },
            state: "ok",
          }
        },
      })
    },
  }
}
