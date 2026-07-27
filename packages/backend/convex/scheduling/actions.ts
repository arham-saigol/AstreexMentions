import { v } from "convex/values"

import { MAX_INGESTION_CHUNK_SIZE } from "../ingestion/contracts"
import {
  createAlgoliaHackerNewsAdapter,
  createFetchLayerRedditAdapter,
  createXquikAdapter,
  ProviderAdapterError,
  type ProviderSearchResult,
} from "../integrations/providers"
import { env, internalAction } from "../server"
import { readProviderRuntimeConfiguration } from "./config"
import { ProviderResultContractError } from "./contracts"
import {
  boundCursorResultToWindow,
  boundProviderPagesResultToWindow,
  createProviderApplyBatches,
} from "./ingestion"
import { MAX_FETCHLAYER_CUMULATIVE_PAGES } from "./model"
import {
  applyNextTrackingProviderPageReference,
  commitTrackingProviderPagesReference,
  failTrackingProviderRunReference,
  loadTrackingExecutionContextReference,
  releaseIneligibleTrackingLeaseReference,
  stageTrackingProviderPageReference,
  startTrackingProviderRunReference,
  type TrackingExecutionContext,
} from "./internal"

function safeFailure(error: unknown): {
  code: string
  message: string
  retryAfterMs?: number | undefined
  retryable: boolean
} {
  if (error instanceof ProviderAdapterError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterMs: error.retryAfterMs,
      retryable: error.retryable,
    }
  }
  if (error instanceof ProviderResultContractError) {
    return {
      code: "invalid_normalized_result",
      message: "Normalized provider result failed validation",
      retryable: true,
    }
  }
  return {
    code: "provider_execution_failed",
    message: "Provider execution failed",
    retryable: true,
  }
}

async function searchProvider(
  context: Extract<TrackingExecutionContext, { state: "ready" }>,
  configuration: Extract<
    ReturnType<typeof readProviderRuntimeConfiguration>,
    { state: "configured" }
  >,
): Promise<ProviderSearchResult> {
  switch (context.sourceType) {
    case "x": {
      const adapter = createXquikAdapter({
        apiKey: configuration.apiKey,
        timeoutMs: configuration.timeoutMs,
      })
      if (adapter.state === "provider_unconfigured") {
        throw new TypeError("Xquik configuration changed before execution")
      }
      const result = await adapter.search({
        cursor: context.cursor,
        limit: MAX_INGESTION_CHUNK_SIZE,
        q: context.providerQuery,
        queryType: "Latest",
      })
      return boundCursorResultToWindow(result, {
        endAt: context.windowEndAt,
        startAt: context.windowStartAt,
      })
    }
    case "reddit_posts":
    case "reddit_comments": {
      const adapter = createFetchLayerRedditAdapter({
        apiKey: configuration.apiKey,
        timeoutMs: configuration.timeoutMs,
      })
      if (adapter.state === "provider_unconfigured") {
        throw new TypeError("FetchLayer configuration changed before execution")
      }
      const input = {
        limit: MAX_INGESTION_CHUNK_SIZE,
        pages: Math.min(context.page ?? 1, MAX_FETCHLAYER_CUMULATIVE_PAGES),
        query: context.providerQuery,
        sort: "new" as const,
      }
      const result =
        context.sourceType === "reddit_posts"
          ? await adapter.searchPosts(input)
          : await adapter.searchComments(input)
      return boundProviderPagesResultToWindow(result, {
        endAt: context.windowEndAt,
        startAt: context.windowStartAt,
      })
    }
    case "hacker_news": {
      const adapter = createAlgoliaHackerNewsAdapter({
        timeoutMs: configuration.timeoutMs,
      })
      const startSeconds = Math.ceil(context.windowStartAt / 1_000)
      const endSeconds = Math.floor(context.windowEndAt / 1_000)
      return await adapter.search({
        hitsPerPage: MAX_INGESTION_CHUNK_SIZE,
        numericFilters: `created_at_i>=${startSeconds},created_at_i<=${endSeconds}`,
        page: context.page ?? 0,
        query: context.providerQuery,
        tags: "(story,comment)",
      })
    }
  }
}

export const executeTrackingSource = internalAction({
  args: {
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      loadTrackingExecutionContextReference,
      args,
    )
    if (context.state === "stale_lease") {
      return { state: "stale_lease" as const }
    }
    if (context.state !== "ready") {
      await ctx.runMutation(releaseIneligibleTrackingLeaseReference, {
        ...args,
        reason: context.state,
        ...(context.state === "workspace_deleting"
          ? { deletionPausedAt: context.deletionPausedAt }
          : {}),
      })
      return { state: context.state }
    }

    let configuration:
      | Extract<
          ReturnType<typeof readProviderRuntimeConfiguration>,
          { state: "configured" }
        >
      | undefined
    if (!context.hasPendingProviderPages) {
      const providerConfiguration = readProviderRuntimeConfiguration(
        env,
        context.sourceType,
      )
      if (providerConfiguration.state === "provider_unconfigured") {
        await ctx.runMutation(releaseIneligibleTrackingLeaseReference, {
          ...args,
          reason: "provider_unconfigured",
        })
        return providerConfiguration
      }
      configuration = providerConfiguration
    }

    const start = (await ctx.runMutation(
      startTrackingProviderRunReference,
      args,
    )) as { state: "duplicate" | "stale_lease" | "started" }
    if (start.state !== "started") {
      return start
    }

    const startedAt = Date.now()
    let providerDurationMs = 0
    try {
      if (!context.hasPendingProviderPages) {
        if (!configuration) {
          throw new TypeError("Provider configuration was not loaded")
        }

        const result = await searchProvider(context, configuration)
        providerDurationMs = Math.max(0, Date.now() - startedAt)
        const batches = createProviderApplyBatches(result)
        for (const [batchIndex, batch] of batches.entries()) {
          const staged = await ctx.runMutation(
            stageTrackingProviderPageReference,
            {
              ...args,
              batchIndex,
              durationMs: providerDurationMs,
              finalize: batch.finalize,
              providerOutputCount: result.items.length,
              resultJson: JSON.stringify(batch.result),
            },
          )
          if (staged.state !== "staged") {
            return staged
          }
        }
        const committed = await ctx.runMutation(
          commitTrackingProviderPagesReference,
          {
            ...args,
            batchCount: batches.length,
          },
        )
        if (committed.state !== "committed") {
          return committed
        }
      }

      let outcome: { state: string } = { state: "stale_run" }
      for (
        let batchIndex = 0;
        batchIndex < MAX_FETCHLAYER_CUMULATIVE_PAGES;
        batchIndex += 1
      ) {
        outcome = await ctx.runMutation(
          applyNextTrackingProviderPageReference,
          args,
        )
        if (outcome.state !== "batch_applied") {
          return outcome
        }
      }
      throw new RangeError("Pending provider page count exceeds the maximum")
    } catch (error) {
      providerDurationMs = Math.max(0, Date.now() - startedAt)
      const failure = safeFailure(error)
      return await ctx.runMutation(failTrackingProviderRunReference, {
        ...args,
        durationMs: providerDurationMs,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable: failure.retryable,
        ...(failure.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: failure.retryAfterMs }),
      })
    }
  },
})
