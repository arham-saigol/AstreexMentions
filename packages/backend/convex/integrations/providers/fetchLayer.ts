import { z } from "zod"

import { engagementScore } from "@astreex/domain"
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
  ProviderAdapterError,
  type NormalizedProviderMention,
  type ProviderPagesPaginationObservation,
  type ProviderSearchResult,
  type ProviderUnconfigured,
} from "./types"

const FETCHLAYER_PROVIDER = "fetchlayer_reddit" as const
export const FETCHLAYER_REDDIT_BASE_URL = "https://fetchlayer.dev/api/reddit"

const redditSearchSortSchema = z.enum([
  "relevance",
  "hot",
  "new",
  "top",
  "comments",
])
const redditTimeFilterSchema = z.enum([
  "all",
  "year",
  "month",
  "week",
  "day",
  "hour",
])

/** FetchLayer's documented keyword-search fields; intentionally no cursor. */
export const fetchLayerSearchInputSchema = z.object({
  limit: z.number().int().positive().optional(),
  pages: z.number().int().positive().optional(),
  query: z.string().trim().min(1),
  sort: redditSearchSortSchema.optional(),
  subreddit: z.string().trim().min(1).optional(),
  time: redditTimeFilterSchema.optional(),
})

const nullableStringSchema = z.string().nullable().optional()
const optionalStringSchema = z.string().optional()
const optionalIntegerSchema = z.number().int().optional()
const optionalNonnegativeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .optional()

export const fetchLayerPostItemSchema = z.object({
  author: optionalStringSchema,
  commentCount: optionalNonnegativeIntegerSchema,
  createdAt: optionalStringSchema,
  fullname: optionalStringSchema,
  id: optionalStringSchema,
  permalink: optionalStringSchema,
  previewText: optionalStringSchema,
  score: optionalIntegerSchema,
  subreddit: optionalStringSchema,
  subredditPrefixed: optionalStringSchema,
  title: optionalStringSchema,
  url: optionalStringSchema,
})

export const fetchLayerCommentItemSchema = z.object({
  author: optionalStringSchema,
  bodyText: optionalStringSchema,
  contextUrl: optionalStringSchema,
  createdAt: optionalStringSchema,
  fullCommentsUrl: optionalStringSchema,
  fullname: optionalStringSchema,
  id: optionalStringSchema,
  parentPostAuthor: optionalStringSchema,
  parentPostTitle: optionalStringSchema,
  parentPostUrl: optionalStringSchema,
  permalink: optionalStringSchema,
  replyCount: optionalNonnegativeIntegerSchema,
  score: optionalIntegerSchema,
  subreddit: optionalStringSchema,
  subredditPrefixed: optionalStringSchema,
})

function listingResponseSchema<Item extends z.ZodType>(itemSchema: Item) {
  return z.object({
    blocked: z.boolean().optional(),
    blockReason: optionalStringSchema,
    itemCount: optionalNonnegativeIntegerSchema,
    items: z.array(itemSchema).optional(),
    nextPageUrl: nullableStringSchema,
    pagesRequested: optionalNonnegativeIntegerSchema,
    pagesScraped: optionalNonnegativeIntegerSchema,
    responseStatus: optionalIntegerSchema,
    scrapedAt: optionalStringSchema,
  })
}

export const fetchLayerPostSearchResponseSchema = listingResponseSchema(
  fetchLayerPostItemSchema,
)
export const fetchLayerCommentSearchResponseSchema = listingResponseSchema(
  fetchLayerCommentItemSchema,
)

export type FetchLayerSearchInput = z.input<typeof fetchLayerSearchInputSchema>

export type FetchLayerRedditAdapter = {
  provider: typeof FETCHLAYER_PROVIDER
  searchComments(
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderSearchResult>
  searchPosts(
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderSearchResult>
  state: "ready"
}

function requireItemString(value: string | undefined, field: string): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw malformedProviderResponse(
      FETCHLAYER_PROVIDER,
      `FetchLayer Reddit item is missing ${field}`,
    )
  }
  return normalized
}

function providerItemId(item: {
  fullname?: string | undefined
  id?: string | undefined
}): string {
  return requireItemString(item.id ?? item.fullname, "a stable id")
}

function publishedAt(value: string | undefined): number {
  const raw = requireItemString(value, "createdAt")
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) {
    throw malformedProviderResponse(
      FETCHLAYER_PROVIDER,
      "FetchLayer Reddit item has an invalid createdAt timestamp",
    )
  }
  return parsed
}

function canonicalRedditUrl(permalink: string | undefined): string {
  const raw = requireItemString(permalink, "permalink")
  let parsed: URL
  try {
    parsed = new URL(raw, "https://www.reddit.com")
  } catch (error) {
    throw malformedProviderResponse(
      FETCHLAYER_PROVIDER,
      "FetchLayer Reddit item has an invalid permalink",
      error,
    )
  }

  const hostname = parsed.hostname.toLocaleLowerCase("en")
  if (hostname !== "reddit.com" && !hostname.endsWith(".reddit.com")) {
    throw malformedProviderResponse(
      FETCHLAYER_PROVIDER,
      "FetchLayer Reddit permalink is not a Reddit URL",
    )
  }
  return `https://www.reddit.com${parsed.pathname}${parsed.search}`
}

function normalizePost(
  post: z.output<typeof fetchLayerPostItemSchema>,
): NormalizedProviderMention {
  const title = requireItemString(post.title, "title")
  const body = post.previewText?.trim() || title
  const score = post.score ?? 0
  const comments = post.commentCount ?? 0

  return {
    ...(post.author?.trim() ? { authorHandle: post.author.trim() } : {}),
    body,
    canonicalUrl: canonicalRedditUrl(post.permalink),
    ...(post.commentCount === undefined
      ? {}
      : { commentCount: post.commentCount }),
    contentType: "post",
    engagementScore: engagementScore({
      comments,
      score,
      source: "reddit",
    }),
    platform: "reddit",
    providerItemId: providerItemId(post),
    publishedAt: publishedAt(post.createdAt),
    searchText: createSearchText(
      title,
      body,
      post.author,
      post.subredditPrefixed,
      post.subreddit,
    ),
    title,
  }
}

function normalizeComment(
  comment: z.output<typeof fetchLayerCommentItemSchema>,
): NormalizedProviderMention {
  const body = requireItemString(comment.bodyText, "bodyText")
  const score = comment.score ?? 0
  const replies = comment.replyCount ?? 0
  const title = comment.parentPostTitle?.trim() || undefined

  return {
    ...(comment.author?.trim() ? { authorHandle: comment.author.trim() } : {}),
    body,
    canonicalUrl: canonicalRedditUrl(comment.permalink),
    contentType: "comment",
    engagementScore: engagementScore({
      comments: replies,
      score,
      source: "reddit",
    }),
    platform: "reddit",
    providerItemId: providerItemId(comment),
    publishedAt: publishedAt(comment.createdAt),
    ...(comment.replyCount === undefined
      ? {}
      : { replyCount: comment.replyCount }),
    searchText: createSearchText(
      title,
      body,
      comment.author,
      comment.subredditPrefixed,
      comment.subreddit,
    ),
    ...(title === undefined ? {} : { title }),
  }
}

function paginationObservation(
  input: z.output<typeof fetchLayerSearchInputSchema>,
  response: {
    nextPageUrl?: string | null | undefined
    pagesRequested?: number | undefined
    pagesScraped?: number | undefined
  },
): ProviderPagesPaginationObservation {
  return {
    hasMore: Boolean(response.nextPageUrl?.trim()),
    kind: "provider_pages",
    pagesRequested: input.pages ?? 1,
    ...(response.pagesScraped === undefined
      ? {}
      : { pagesScraped: response.pagesScraped }),
  }
}

function assertListingAvailable(response: {
  blocked?: boolean | undefined
  items?: readonly unknown[] | undefined
  responseStatus?: number | undefined
}): asserts response is { items: readonly unknown[] } & typeof response {
  if (response.blocked) {
    throw new ProviderAdapterError(
      FETCHLAYER_PROVIDER,
      "server",
      "FetchLayer could not retrieve Reddit data",
      {
        retryable: true,
        ...(response.responseStatus === undefined
          ? {}
          : { status: response.responseStatus }),
      },
    )
  }
  if (response.items === undefined) {
    throw malformedProviderResponse(
      FETCHLAYER_PROVIDER,
      "FetchLayer Reddit response is missing items",
    )
  }
}

export function createFetchLayerRedditAdapter(
  options: ProviderHttpDependencies & {
    apiKey?: string | undefined
    baseUrl?: string | undefined
  },
): FetchLayerRedditAdapter | ProviderUnconfigured {
  const apiKey = options.apiKey?.trim()
  if (!apiKey) {
    return {
      provider: FETCHLAYER_PROVIDER,
      reason: "missing_api_key",
      state: "provider_unconfigured",
    }
  }
  const baseUrl = (options.baseUrl ?? FETCHLAYER_REDDIT_BASE_URL).replace(
    /\/+$/u,
    "",
  )

  const search = async <ItemSchema extends z.ZodType>(config: {
    input: unknown
    itemSchema: ItemSchema
    normalize: (item: z.output<ItemSchema>) => NormalizedProviderMention
    operation: "comments.search" | "posts.search"
    path: "search" | "search-comments"
    responseSchema: ReturnType<typeof listingResponseSchema<ItemSchema>>
    signal?: AbortSignal | undefined
  }): Promise<ProviderSearchResult> => {
    const input = parseProviderInput(
      fetchLayerSearchInputSchema,
      config.input,
      FETCHLAYER_PROVIDER,
    )

    return await runProviderOperation({
      logger: options.logger,
      now: options.now,
      operation: config.operation,
      provider: FETCHLAYER_PROVIDER,
      successItemCount: (result) => result.items.length,
      run: async () => {
        const payload = await requestProviderJson({
          fetch: options.fetch,
          init: {
            body: JSON.stringify(input),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            ...(config.signal === undefined ? {} : { signal: config.signal }),
          },
          now: options.now,
          provider: FETCHLAYER_PROVIDER,
          timeoutMs: options.timeoutMs,
          url: `${baseUrl}/${config.path}`,
        })
        const response = parseProviderResponse(
          config.responseSchema,
          payload,
          FETCHLAYER_PROVIDER,
        )
        assertListingAvailable(response)
        const items = response.items.map(config.normalize)

        return {
          checkpoint: observeProviderCheckpoint(items),
          items,
          pagination: paginationObservation(input, response),
          state: "ok",
        }
      },
    })
  }

  return {
    provider: FETCHLAYER_PROVIDER,
    state: "ready",
    searchComments: async (input, requestOptions = {}) =>
      await search({
        input,
        itemSchema: fetchLayerCommentItemSchema,
        normalize: normalizeComment,
        operation: "comments.search",
        path: "search-comments",
        responseSchema: fetchLayerCommentSearchResponseSchema,
        signal: requestOptions.signal,
      }),
    searchPosts: async (input, requestOptions = {}) =>
      await search({
        input,
        itemSchema: fetchLayerPostItemSchema,
        normalize: normalizePost,
        operation: "posts.search",
        path: "search",
        responseSchema: fetchLayerPostSearchResponseSchema,
        signal: requestOptions.signal,
      }),
  }
}
