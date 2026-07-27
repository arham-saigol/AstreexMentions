import { z } from "zod"

const optionalNonnegativeInteger = z.number().int().nonnegative().optional()

export const normalizedProviderMentionSchema = z
  .object({
    authorDisplayName: z.string().optional(),
    authorHandle: z.string().optional(),
    body: z.string().min(1),
    canonicalUrl: z.string().url(),
    commentCount: optionalNonnegativeInteger,
    contentType: z.enum(["comment", "post", "story", "tweet"]),
    engagementScore: z.number().finite(),
    language: z.string().optional(),
    likeCount: optionalNonnegativeInteger,
    platform: z.enum(["hacker_news", "reddit", "x"]),
    pointCount: optionalNonnegativeInteger,
    providerItemId: z.string().trim().min(1),
    publishedAt: z.number().int().nonnegative(),
    quoteCount: optionalNonnegativeInteger,
    replyCount: optionalNonnegativeInteger,
    repostCount: optionalNonnegativeInteger,
    searchText: z.string().min(1),
    title: z.string().optional(),
  })
  .strict()

const checkpointSchema = z
  .object({
    newestProviderItemId: z.string().optional(),
    newestPublishedAt: z.number().int().nonnegative().optional(),
    oldestProviderItemId: z.string().optional(),
    oldestPublishedAt: z.number().int().nonnegative().optional(),
  })
  .strict()

const cursorPaginationSchema = z
  .object({
    hasMore: z.boolean(),
    kind: z.literal("cursor"),
    nextCursor: z.string().trim().min(1).optional(),
    requestCursor: z.string().trim().min(1).optional(),
  })
  .strict()

const pagePaginationSchema = z
  .object({
    hasMore: z.boolean(),
    hitsPerPage: z.number().int().nonnegative(),
    kind: z.literal("page"),
    nextPage: z.number().int().nonnegative().optional(),
    page: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict()

const providerPagesPaginationSchema = z
  .object({
    hasMore: z.boolean(),
    kind: z.literal("provider_pages"),
    pagesRequested: z.number().int().positive(),
    pagesScraped: z.number().int().nonnegative().optional(),
  })
  .strict()

export const providerSearchResultSchema = z
  .object({
    checkpoint: checkpointSchema,
    items: z.array(normalizedProviderMentionSchema),
    pagination: z.discriminatedUnion("kind", [
      cursorPaginationSchema,
      pagePaginationSchema,
      providerPagesPaginationSchema,
    ]),
    state: z.literal("ok"),
  })
  .strict()

export type ValidatedProviderSearchResult = z.output<
  typeof providerSearchResultSchema
>

export function parseProviderSearchResultJson(
  resultJson: string,
): ValidatedProviderSearchResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(resultJson) as unknown
  } catch (error) {
    throw new ProviderResultContractError(
      "INVALID_JSON",
      "Provider result serialization is invalid",
      error,
    )
  }

  const result = providerSearchResultSchema.safeParse(parsed)
  if (!result.success) {
    throw new ProviderResultContractError(
      "INVALID_RESULT",
      "Provider result does not match the normalized contract",
      result.error,
    )
  }
  return result.data
}

export class ProviderResultContractError extends Error {
  readonly code: "INVALID_JSON" | "INVALID_RESULT"

  constructor(
    code: ProviderResultContractError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "ProviderResultContractError"
    this.code = code
  }
}
