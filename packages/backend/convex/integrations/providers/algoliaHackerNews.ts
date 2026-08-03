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
  type NormalizedProviderMention,
  type ProviderSearchResult,
} from "./types"

const ALGOLIA_HN_PROVIDER = "algolia_hacker_news" as const
export const ALGOLIA_HN_SEARCH_BY_DATE_ENDPOINT =
  "https://hn.algolia.com/api/v1/search_by_date"

export const algoliaHackerNewsSearchInputSchema = z.object({
  hitsPerPage: z.number().int().min(1).max(1_000).default(100),
  numericFilters: z.string().trim().min(1).optional(),
  page: z.number().int().nonnegative().default(0),
  query: z.string().trim().min(1),
  tags: z.string().trim().min(1).optional(),
})

const optionalNullableStringSchema = z.string().nullable().optional()
const optionalNullableIntegerSchema = z.number().int().nullable().optional()

export const algoliaHackerNewsHitSchema = z.object({
  _tags: z.array(z.string()),
  author: optionalNullableStringSchema,
  comment_text: optionalNullableStringSchema,
  created_at: z.string().optional(),
  created_at_i: z.number().int().nonnegative(),
  num_comments: optionalNullableIntegerSchema,
  objectID: z.string().trim().min(1),
  parent_id: optionalNullableIntegerSchema,
  points: optionalNullableIntegerSchema,
  story_id: optionalNullableIntegerSchema,
  story_text: optionalNullableStringSchema,
  story_title: optionalNullableStringSchema,
  story_url: optionalNullableStringSchema,
  title: optionalNullableStringSchema,
  url: optionalNullableStringSchema,
})

export const algoliaHackerNewsSearchResponseSchema = z.object({
  hits: z.array(algoliaHackerNewsHitSchema),
  hitsPerPage: z.number().int().nonnegative(),
  nbHits: z.number().int().nonnegative(),
  nbPages: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  processingTimeMS: z.number().nonnegative(),
  query: z.string(),
})

export type AlgoliaHackerNewsSearchInput = z.input<
  typeof algoliaHackerNewsSearchInputSchema
>

export type AlgoliaHackerNewsAdapter = {
  provider: typeof ALGOLIA_HN_PROVIDER
  search(
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderSearchResult>
  state: "ready"
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
}

function decodeNumericHtmlEntity(
  entity: string,
  digits: string,
  radix: 10 | 16,
): string {
  const validDigits =
    radix === 16 ? /^[0-9a-f]+$/iu.test(digits) : /^[0-9]+$/u.test(digits)
  const value = validDigits ? Number.parseInt(digits, radix) : Number.NaN
  const isUnicodeScalar =
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0x10_ffff &&
    (value < 0xd800 || value > 0xdfff)
  return isUnicodeScalar ? String.fromCodePoint(value) : `&${entity};`
}

function decodeHtmlEntity(entity: string): string {
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    return decodeNumericHtmlEntity(entity, entity.slice(2), 16)
  }
  if (entity.startsWith("#")) {
    return decodeNumericHtmlEntity(entity, entity.slice(1), 10)
  }
  return HTML_ENTITIES[entity] ?? `&${entity};`
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/giu, "\n")
    .replace(/<\s*\/?\s*p\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/&([#a-zA-Z0-9]+);/gu, (_, entity: string) =>
      decodeHtmlEntity(entity),
    )
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
}

function normalizedOptionalString(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeHackerNewsHit(
  hit: z.output<typeof algoliaHackerNewsHitSchema>,
): NormalizedProviderMention {
  const isComment = hit._tags.includes("comment")
  const isStory = hit._tags.includes("story")
  if (!isComment && !isStory) {
    throw malformedProviderResponse(
      ALGOLIA_HN_PROVIDER,
      "Algolia Hacker News hit has an unsupported content type",
    )
  }

  const author = normalizedOptionalString(hit.author)
  const points = hit.points ?? 0
  const comments = hit.num_comments ?? 0
  const canonicalUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`
  const publishedAt = hit.created_at_i * 1_000

  if (isComment) {
    const commentText = normalizedOptionalString(hit.comment_text)
    if (!commentText) {
      throw malformedProviderResponse(
        ALGOLIA_HN_PROVIDER,
        "Algolia Hacker News comment is missing comment_text",
      )
    }
    const body = htmlToPlainText(commentText)
    if (!body) {
      throw malformedProviderResponse(
        ALGOLIA_HN_PROVIDER,
        "Algolia Hacker News comment text is empty",
      )
    }
    const title = normalizedOptionalString(hit.story_title)

    return {
      ...(author === undefined ? {} : { authorHandle: author }),
      body,
      canonicalUrl,
      ...(hit.num_comments === null || hit.num_comments === undefined
        ? {}
        : { commentCount: hit.num_comments }),
      contentType: "comment",
      engagementScore: engagementScore({
        comments,
        points,
        source: "hacker_news",
      }),
      platform: "hacker_news",
      ...(hit.points === null || hit.points === undefined
        ? {}
        : { pointCount: hit.points }),
      providerItemId: hit.objectID,
      publishedAt,
      searchText: createSearchText(title, body, author),
      ...(title === undefined ? {} : { title }),
    }
  }

  const title = normalizedOptionalString(hit.title)
  const storyText = normalizedOptionalString(hit.story_text)
  if (!title && !storyText) {
    throw malformedProviderResponse(
      ALGOLIA_HN_PROVIDER,
      "Algolia Hacker News story is missing content",
    )
  }
  const body = storyText ? htmlToPlainText(storyText) : (title ?? "")

  return {
    ...(author === undefined ? {} : { authorHandle: author }),
    body,
    canonicalUrl,
    ...(hit.num_comments === null || hit.num_comments === undefined
      ? {}
      : { commentCount: hit.num_comments }),
    contentType: "story",
    engagementScore: engagementScore({
      comments,
      points,
      source: "hacker_news",
    }),
    platform: "hacker_news",
    ...(hit.points === null || hit.points === undefined
      ? {}
      : { pointCount: hit.points }),
    providerItemId: hit.objectID,
    publishedAt,
    searchText: createSearchText(title, body, author),
    ...(title === undefined ? {} : { title }),
  }
}

export function createAlgoliaHackerNewsAdapter(
  options: ProviderHttpDependencies & {
    endpoint?: string | undefined
  } = {},
): AlgoliaHackerNewsAdapter {
  const endpoint = options.endpoint ?? ALGOLIA_HN_SEARCH_BY_DATE_ENDPOINT

  return {
    provider: ALGOLIA_HN_PROVIDER,
    state: "ready",
    search: async (rawInput, requestOptions = {}) => {
      const input = parseProviderInput(
        algoliaHackerNewsSearchInputSchema,
        rawInput,
        ALGOLIA_HN_PROVIDER,
      )

      return await runProviderOperation({
        logger: options.logger,
        now: options.now,
        operation: "search_by_date",
        provider: ALGOLIA_HN_PROVIDER,
        successItemCount: (result) => result.items.length,
        run: async () => {
          const url = new URL(endpoint)
          url.searchParams.set("query", input.query)
          if (input.tags !== undefined) {
            url.searchParams.set("tags", input.tags)
          }
          if (input.numericFilters !== undefined) {
            url.searchParams.set("numericFilters", input.numericFilters)
          }
          url.searchParams.set("page", String(input.page))
          url.searchParams.set("hitsPerPage", String(input.hitsPerPage))

          const payload = await requestProviderJson({
            fetch: options.fetch,
            init: {
              method: "GET",
              ...(requestOptions.signal === undefined
                ? {}
                : { signal: requestOptions.signal }),
            },
            now: options.now,
            provider: ALGOLIA_HN_PROVIDER,
            timeoutMs: options.timeoutMs,
            url: url.toString(),
          })
          const response = parseProviderResponse(
            algoliaHackerNewsSearchResponseSchema,
            payload,
            ALGOLIA_HN_PROVIDER,
          )
          const items = response.hits.map(normalizeHackerNewsHit)
          const hasMore = response.page + 1 < response.nbPages

          return {
            checkpoint: observeProviderCheckpoint(items),
            items,
            pagination: {
              hasMore,
              hitsPerPage: response.hitsPerPage,
              kind: "page",
              ...(hasMore ? { nextPage: response.page + 1 } : {}),
              page: response.page,
              totalPages: response.nbPages,
            },
            state: "ok",
          }
        },
      })
    },
  }
}
