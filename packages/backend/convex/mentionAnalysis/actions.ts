"use node"

import { internal } from "../_generated/api"

import { v } from "convex/values"

import {
  createGeminiJsonRequester,
  GeminiIntegrationError,
  readGeminiRuntimeConfiguration,
} from "../integrations/gemini"
import {
  buildMentionAnalysisGenerationRequest,
  MentionAnalysisValidationError,
} from "../lib/mentionAnalysis"
import { env, internalAction } from "../_generated/server"
import {
  MentionAnalysisOrchestrationError,
  validateMentionAnalysisApplication,
} from "./model"

type SafeMentionAnalysisFailure = {
  code: string
  message: string
  retryAfterMs?: number | undefined
  retryable: boolean
}

function safeFailure(error: unknown): SafeMentionAnalysisFailure {
  if (error instanceof GeminiIntegrationError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterMs: error.retryAfterMs,
      retryable: error.retryable,
    }
  }
  if (
    error instanceof MentionAnalysisValidationError &&
    error.code !== "INVALID_OUTPUT"
  ) {
    return {
      code: "invalid_analysis_request",
      message: "Vertex Gemini mention analysis request could not be built",
      retryable: false,
    }
  }
  if (
    error instanceof MentionAnalysisValidationError ||
    error instanceof MentionAnalysisOrchestrationError
  ) {
    return {
      code: "invalid_model_output",
      message:
        "Vertex Gemini mention analysis output failed total batch validation",
      retryable: true,
    }
  }
  return {
    code: "mention_analysis_execution_failed",
    message: "Vertex Gemini mention analysis execution failed",
    retryable: true,
  }
}

export const executeMentionAnalysisBatch = internalAction({
  args: {
    analysisSnapshotJson: v.string(),
    jobIds: v.array(v.id("mentionAnalysisJobs")),
    leaseToken: v.string(),
    mentionContextJson: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.mentionAnalysis.internal.loadMentionAnalysisBatchContext,
      args,
    )
    if (context.state === "stale_lease") {
      return context
    }
    if (context.state === "invalid_batch") {
      return await ctx.runMutation(
        internal.mentionAnalysis.internal.failMentionAnalysisBatch,
        {
          ...args,
          durationMs: 0,
          errorCode: context.errorCode,
          errorMessage: "Mention analysis batch context is invalid",
          retryable: context.retryable,
        },
      )
    }

    const configuration = readGeminiRuntimeConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      await ctx.runMutation(
        internal.mentionAnalysis.internal
          .releaseMentionAnalysisBlockedConfiguration,
        args,
      )
      return {
        invalid: configuration.invalid,
        missing: configuration.missing,
        state: "blocked_config" as const,
      }
    }

    let request: ReturnType<typeof buildMentionAnalysisGenerationRequest>
    let requester: ReturnType<typeof createGeminiJsonRequester>
    try {
      request = buildMentionAnalysisGenerationRequest(
        context.mentions,
        context.categories,
        context.context,
      )
      requester = createGeminiJsonRequester({ configuration })
    } catch (error) {
      const failure = safeFailure(error)
      return await ctx.runMutation(
        internal.mentionAnalysis.internal.failMentionAnalysisBatch,
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
      internal.mentionAnalysis.internal.startMentionAnalysisProviderRun,
      args,
    )) as {
      state: "duplicate" | "snapshot_changed" | "stale_lease" | "started"
    }
    if (start.state === "snapshot_changed") {
      return await ctx.runMutation(
        internal.mentionAnalysis.internal.failMentionAnalysisBatch,
        {
          ...args,
          durationMs: 0,
          errorCode: "analysis_snapshot_changed",
          errorMessage: "Enabled analysis snapshot changed before execution",
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
      const results = validateMentionAnalysisApplication({
        categories: context.categories,
        mentions: context.mentions,
        results: rawOutput,
      })
      return await ctx.runMutation(
        internal.mentionAnalysis.internal.applyMentionAnalysisBatch,
        {
          ...args,
          durationMs: Math.max(0, Date.now() - startedAt),
          resultsJson: JSON.stringify({ results }),
        },
      )
    } catch (error) {
      const failure = safeFailure(error)
      return await ctx.runMutation(
        internal.mentionAnalysis.internal.failMentionAnalysisBatch,
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
