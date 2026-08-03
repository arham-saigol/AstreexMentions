"use node"

import { internal } from "../_generated/api"

import { v } from "convex/values"

import {
  createDeepSeekCategorizationRequester,
  DeepSeekIntegrationError,
  readDeepSeekRuntimeConfiguration,
} from "../integrations/deepseek"
import {
  buildDeepSeekCategorizationRequest,
  CategorizationValidationError,
} from "../lib/deepseekCategorization"
import { env, internalAction } from "../_generated/server"
import {
  CategorizationOrchestrationError,
  validateCategorizationApplication,
} from "./model"

type SafeCategorizationFailure = {
  code: string
  message: string
  retryAfterMs?: number | undefined
  retryable: boolean
}

function safeFailure(error: unknown): SafeCategorizationFailure {
  if (error instanceof DeepSeekIntegrationError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterMs: error.retryAfterMs,
      retryable: error.retryable,
    }
  }
  if (
    error instanceof CategorizationValidationError ||
    error instanceof CategorizationOrchestrationError
  ) {
    return {
      code: "invalid_model_output",
      message: "DeepSeek categorization output failed total batch validation",
      retryable: true,
    }
  }
  return {
    code: "categorization_execution_failed",
    message: "DeepSeek categorization execution failed",
    retryable: true,
  }
}

export const executeCategorizationBatch = internalAction({
  args: {
    categorySnapshotJson: v.string(),
    jobIds: v.array(v.id("categorizationJobs")),
    leaseToken: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.categorization.internal.loadCategorizationBatchContext,
      args,
    )
    if (context.state === "stale_lease") {
      return context
    }
    if (context.state === "invalid_batch") {
      return await ctx.runMutation(
        internal.categorization.internal.failCategorizationBatch,
        {
          ...args,
          durationMs: 0,
          errorCode: context.errorCode,
          errorMessage: "Categorization batch context is invalid",
          retryable: context.retryable,
        },
      )
    }

    const configuration = readDeepSeekRuntimeConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      await ctx.runMutation(
        internal.categorization.internal
          .releaseCategorizationBlockedConfiguration,
        args,
      )
      return {
        invalid: configuration.invalid,
        missing: configuration.missing,
        state: "blocked_config" as const,
      }
    }

    let request: ReturnType<typeof buildDeepSeekCategorizationRequest>
    let requester: ReturnType<typeof createDeepSeekCategorizationRequester>
    try {
      request = buildDeepSeekCategorizationRequest(
        context.mentions,
        context.categories,
      )
      requester = createDeepSeekCategorizationRequester({
        apiKey: configuration.apiKey,
        timeoutMs: configuration.timeoutMs,
      })
    } catch (error) {
      const failure = safeFailure(error)
      return await ctx.runMutation(
        internal.categorization.internal.failCategorizationBatch,
        {
          ...args,
          durationMs: 0,
          errorCode: failure.code,
          errorMessage: failure.message,
          retryable: failure.retryable,
          ...(failure.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: failure.retryAfterMs }),
        },
      )
    }

    const start = (await ctx.runMutation(
      internal.categorization.internal.startCategorizationProviderRun,
      args,
    )) as {
      state: "duplicate" | "snapshot_changed" | "stale_lease" | "started"
    }
    if (start.state === "snapshot_changed") {
      return await ctx.runMutation(
        internal.categorization.internal.failCategorizationBatch,
        {
          ...args,
          durationMs: 0,
          errorCode: "category_snapshot_changed",
          errorMessage: "Enabled category snapshot changed before execution",
          retryable: true,
        },
      )
    }
    if (start.state !== "started") {
      return start
    }

    const startedAt = Date.now()
    try {
      const rawOutput = await requester(request, new AbortController().signal)
      const results = validateCategorizationApplication({
        categories: context.categories,
        mentions: context.mentions,
        results: rawOutput,
      })
      return await ctx.runMutation(
        internal.categorization.internal.applyCategorizationBatch,
        {
          ...args,
          durationMs: Math.max(0, Date.now() - startedAt),
          resultsJson: JSON.stringify({ results }),
        },
      )
    } catch (error) {
      const failure = safeFailure(error)
      return await ctx.runMutation(
        internal.categorization.internal.failCategorizationBatch,
        {
          ...args,
          durationMs: Math.max(0, Date.now() - startedAt),
          errorCode: failure.code,
          errorMessage: failure.message,
          retryable: failure.retryable,
          ...(failure.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: failure.retryAfterMs }),
        },
      )
    }
  },
})
