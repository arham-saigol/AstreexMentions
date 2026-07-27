import {
  ingestionChunkSchema,
  MAX_INGESTION_CHUNK_SIZE,
  type IngestionCandidate,
  type IngestionChunk,
} from "../ingestion/contracts"
import {
  observeProviderCheckpoint,
  type ProviderSearchResult,
} from "../integrations/providers"
import type { ValidatedProviderSearchResult } from "./contracts"

function candidateFromProviderItem(
  item: ValidatedProviderSearchResult["items"][number],
): IngestionCandidate {
  return {
    body: item.body,
    canonicalUrl: item.canonicalUrl,
    contentType: item.contentType,
    engagementScore: item.engagementScore,
    platform: item.platform,
    providerItemId: item.providerItemId,
    publishedAt: item.publishedAt,
    searchText: item.searchText,
    ...(item.authorDisplayName === undefined
      ? {}
      : { authorDisplayName: item.authorDisplayName }),
    ...(item.authorHandle === undefined
      ? {}
      : { authorHandle: item.authorHandle }),
    ...(item.commentCount === undefined
      ? {}
      : { commentCount: item.commentCount }),
    ...(item.language === undefined ? {} : { language: item.language }),
    ...(item.likeCount === undefined ? {} : { likeCount: item.likeCount }),
    ...(item.pointCount === undefined ? {} : { pointCount: item.pointCount }),
    ...(item.quoteCount === undefined ? {} : { quoteCount: item.quoteCount }),
    ...(item.replyCount === undefined ? {} : { replyCount: item.replyCount }),
    ...(item.repostCount === undefined
      ? {}
      : { repostCount: item.repostCount }),
    ...(item.title === undefined ? {} : { title: item.title }),
  }
}

export function boundCursorResultToWindow(
  result: ProviderSearchResult,
  window: { endAt: number; startAt: number },
): ProviderSearchResult {
  if (
    !Number.isSafeInteger(window.startAt) ||
    !Number.isSafeInteger(window.endAt) ||
    window.startAt < 0 ||
    window.endAt < window.startAt
  ) {
    throw new RangeError("Provider result window is invalid")
  }
  if (result.pagination.kind !== "cursor") {
    return result
  }
  const crossedWindowStart = result.items.some(
    ({ publishedAt }) => publishedAt <= window.startAt,
  )
  const items = result.items.filter(
    ({ publishedAt }) =>
      publishedAt >= window.startAt && publishedAt <= window.endAt,
  )
  return {
    checkpoint: observeProviderCheckpoint(items),
    items,
    pagination: crossedWindowStart
      ? {
          hasMore: false,
          kind: "cursor",
          ...(result.pagination.requestCursor === undefined
            ? {}
            : { requestCursor: result.pagination.requestCursor }),
        }
      : result.pagination,
    state: "ok",
  }
}

/**
 * Converts one validated provider page into deterministic atomic-ingestion
 * chunks. startPosition fences a partially consumed provider page after quota
 * exhaustion; provider items before it are never counted again.
 */
export function createProviderIngestionChunks(input: {
  items: ValidatedProviderSearchResult["items"]
  keywordId: string
  startPosition?: number | undefined
  trackingSourceId: string
  workspaceId: string
}): IngestionChunk[] {
  const startPosition = input.startPosition ?? 0
  if (
    !Number.isSafeInteger(startPosition) ||
    startPosition < 0 ||
    startPosition > input.items.length
  ) {
    throw new RangeError("Provider ingestion startPosition is invalid")
  }

  const chunks: IngestionChunk[] = []
  for (
    let position = startPosition;
    position < input.items.length;
    position += MAX_INGESTION_CHUNK_SIZE
  ) {
    chunks.push(
      ingestionChunkSchema.parse({
        candidates: input.items
          .slice(position, position + MAX_INGESTION_CHUNK_SIZE)
          .map(candidateFromProviderItem),
        keywordId: input.keywordId,
        startPosition: position,
        trackingSourceId: input.trackingSourceId,
        workspaceId: input.workspaceId,
      }),
    )
  }
  return chunks
}

export function createProviderApplyBatches(
  result: ProviderSearchResult,
): Array<{ finalize: boolean; result: ProviderSearchResult }> {
  if (result.items.length === 0) {
    return [{ finalize: true, result }]
  }

  const batches: Array<{
    finalize: boolean
    result: ProviderSearchResult
  }> = []
  for (
    let position = 0;
    position < result.items.length;
    position += MAX_INGESTION_CHUNK_SIZE
  ) {
    const items = result.items.slice(
      position,
      position + MAX_INGESTION_CHUNK_SIZE,
    )
    batches.push({
      finalize: position + items.length === result.items.length,
      result: { ...result, items },
    })
  }
  return batches
}
