export type ProviderAdapterName =
  "algolia_hacker_news" | "fetchlayer_reddit" | "xquik"

export type ProviderErrorCode =
  "auth" | "invalid_query" | "malformed" | "network" | "rate_limit" | "server"

export class ProviderAdapterError extends Error {
  readonly code: ProviderErrorCode
  readonly provider: ProviderAdapterName
  readonly retryable: boolean
  readonly retryAfterMs?: number
  readonly status?: number
  readonly timedOut: boolean

  constructor(
    provider: ProviderAdapterName,
    code: ProviderErrorCode,
    message: string,
    options: {
      cause?: unknown
      retryable: boolean
      retryAfterMs?: number
      status?: number
      timedOut?: boolean
    },
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "ProviderAdapterError"
    this.provider = provider
    this.code = code
    this.retryable = options.retryable
    this.timedOut = options.timedOut ?? false
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs
    }
    if (options.status !== undefined) {
      this.status = options.status
    }
  }
}

export type ProviderUnconfigured = {
  provider: ProviderAdapterName
  reason: "missing_api_key"
  state: "provider_unconfigured"
}

export type NormalizedProviderMention = {
  authorDisplayName?: string | undefined
  authorHandle?: string | undefined
  body: string
  canonicalUrl: string
  commentCount?: number | undefined
  contentType: "comment" | "post" | "story" | "tweet"
  engagementScore: number
  language?: string | undefined
  likeCount?: number | undefined
  platform: "hacker_news" | "reddit" | "x"
  pointCount?: number | undefined
  providerItemId: string
  publishedAt: number
  quoteCount?: number | undefined
  replyCount?: number | undefined
  repostCount?: number | undefined
  searchText: string
  title?: string | undefined
}

export type ProviderCheckpointObservation = {
  newestProviderItemId?: string | undefined
  newestPublishedAt?: number | undefined
  oldestProviderItemId?: string | undefined
  oldestPublishedAt?: number | undefined
}

export type CursorPaginationObservation = {
  hasMore: boolean
  kind: "cursor"
  nextCursor?: string | undefined
  requestCursor?: string | undefined
}

export type ProviderPagesPaginationObservation = {
  hasMore: boolean
  kind: "provider_pages"
  pagesRequested: number
  pagesScraped?: number | undefined
}

export type PagePaginationObservation = {
  hasMore: boolean
  hitsPerPage: number
  kind: "page"
  nextPage?: number | undefined
  page: number
  totalPages: number
}

export type ProviderPaginationObservation =
  | CursorPaginationObservation
  | PagePaginationObservation
  | ProviderPagesPaginationObservation

export type ProviderSearchResult = {
  checkpoint: ProviderCheckpointObservation
  items: NormalizedProviderMention[]
  pagination: ProviderPaginationObservation
  state: "ok"
}

export type ProviderLogEvent = Readonly<{
  durationMs: number
  errorCode?: ProviderErrorCode | undefined
  event: "provider_request_completed" | "provider_request_failed"
  itemCount?: number | undefined
  operation: string
  outcome: "failure" | "success"
  provider: ProviderAdapterName
  status?: number | undefined
}>

/** Receives a fixed, secret-free event shape: never URLs, headers, queries, or bodies. */
export type ProviderLogger = (event: ProviderLogEvent) => void

function compareObservedMentions(
  left: NormalizedProviderMention,
  right: NormalizedProviderMention,
): number {
  return (
    left.publishedAt - right.publishedAt ||
    left.providerItemId.localeCompare(right.providerItemId, "en")
  )
}

export function observeProviderCheckpoint(
  items: readonly NormalizedProviderMention[],
): ProviderCheckpointObservation {
  if (items.length === 0) {
    return {}
  }

  let newest = items[0]
  let oldest = items[0]
  if (!newest || !oldest) {
    return {}
  }

  for (const item of items.slice(1)) {
    if (compareObservedMentions(item, newest) > 0) {
      newest = item
    }
    if (compareObservedMentions(item, oldest) < 0) {
      oldest = item
    }
  }

  return {
    newestProviderItemId: newest.providerItemId,
    newestPublishedAt: newest.publishedAt,
    oldestProviderItemId: oldest.providerItemId,
    oldestPublishedAt: oldest.publishedAt,
  }
}

export function createSearchText(
  ...parts: readonly (string | null | undefined)[]
): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n")
}
