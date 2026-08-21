import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import { onboardingResearchRateLimiter } from "./lib/onboardingResearchRateLimit"
import { recordProviderMetricBuckets } from "./lib/providerMetricBuckets"
import { providerValidator } from "./schema"
const RUN_STALE_MS = 5 * 60_000

type ResearchId = Id<"onboardingResearch">

function providerRunKey(workspaceId: Id<"workspaces">, fingerprint: string) {
  return `tinyfish:onboarding:${String(workspaceId)}:${fingerprint}`
}

export const beginResearch = internalMutation({
  args: {
    inputFingerprint: v.string(),
    manualDescription: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
  },
  returns: v.union(
    v.object({
      researchId: v.id("onboardingResearch"),
      state: v.literal("completed"),
    }),
    v.object({
      researchId: v.id("onboardingResearch"),
      state: v.literal("running"),
    }),
    v.object({ state: v.literal("rate_limited") }),
    v.object({
      researchId: v.id("onboardingResearch"),
      state: v.literal("started"),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    const workspace = await ctx.db.get("workspaces", args.workspaceId)
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      throw new TypeError("Workspace is unavailable for onboarding research")
    }
    const existing = await ctx.db
      .query("onboardingResearch")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()
    if (
      existing?.inputFingerprint === args.inputFingerprint &&
      existing.status === "completed"
    ) {
      return { researchId: existing._id, state: "completed" as const }
    }
    if (
      existing?.status === "running" &&
      existing.startedAt > now - RUN_STALE_MS
    ) {
      return { researchId: existing._id, state: "running" as const }
    }
    const limited = await onboardingResearchRateLimiter.limit(
      ctx,
      "onboardingResearch",
      {
        key: String(args.workspaceId),
      },
    )
    if (!limited.ok) {
      return { state: "rate_limited" as const }
    }

    if (
      existing?.status === "running" &&
      existing.inputFingerprint !== args.inputFingerprint
    ) {
      const abandonedRun = await ctx.db
        .query("providerRuns")
        .withIndex("by_idempotency_key", (q) =>
          q.eq(
            "idempotencyKey",
            providerRunKey(args.workspaceId, existing.inputFingerprint),
          ),
        )
        .unique()
      if (abandonedRun?.status === "running") {
        await ctx.db.patch("providerRuns", abandonedRun._id, {
          durationMs: Math.max(0, now - abandonedRun.startedAt),
          errorCode: "operation_abandoned",
          errorMessage: "Onboarding research exceeded the running timeout",
          finishedAt: now,
          status: "failed",
          updatedAt: now,
        })
        await recordProviderMetricBuckets(
          ctx,
          {
            durationMs: Math.max(0, now - abandonedRun.startedAt),
            failureCount: 1,
            inputItemCount: 1,
            operation: "onboarding.research",
            outputItemCount: 0,
            provider: "tinyfish",
            rateLimitedCount: 0,
            retryCount: 0,
            successCount: 0,
          },
          now,
        )
      }
    }

    let researchId: ResearchId
    const runningResearch = {
      inputFingerprint: args.inputFingerprint,
      startedAt: now,
      status: "running" as const,
      updatedAt: now,
    }
    if (existing) {
      researchId = existing._id
      await ctx.db.patch("onboardingResearch", researchId, {
        ...runningResearch,
        filteringContext: undefined,
        filteringGuidelines: undefined,
        completedAt: undefined,
        errorCode: undefined,
        manualDescription: args.manualDescription,
        suggestionsJson: undefined,
        websiteUrl: args.websiteUrl,
      })
    } else {
      researchId = await ctx.db.insert("onboardingResearch", {
        ...runningResearch,
        createdAt: now,
        ...(args.manualDescription === undefined
          ? {}
          : { manualDescription: args.manualDescription }),
        ...(args.websiteUrl === undefined
          ? {}
          : { websiteUrl: args.websiteUrl }),
        workspaceId: args.workspaceId,
      })
    }
    const idempotencyKey = providerRunKey(
      args.workspaceId,
      args.inputFingerprint,
    )
    const run = await ctx.db
      .query("providerRuns")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", idempotencyKey),
      )
      .unique()
    if (run) {
      await ctx.db.patch("providerRuns", run._id, {
        attempt: run.attempt + 1,
        durationMs: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        finishedAt: undefined,
        outputCount: 0,
        startedAt: now,
        status: "running",
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("providerRuns", {
        attempt: 1,
        createdAt: now,
        idempotencyKey,
        inputCount: 1,
        operation: "onboarding.research",
        outputCount: 0,
        provider: "tinyfish",
        startedAt: now,
        status: "running",
        trigger: "manual",
        updatedAt: now,
        workspaceId: args.workspaceId,
      })
    }
    return { researchId, state: "started" as const }
  },
})

export const loadResearch = internalQuery({
  args: {
    researchId: v.id("onboardingResearch"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("onboardingResearch", args.researchId)
    return row?.workspaceId === args.workspaceId ? row : null
  },
})

export const completeResearch = internalMutation({
  args: {
    filteringContext: v.string(),
    filteringGuidelines: v.string(),
    durationMs: v.number(),
    inputFingerprint: v.string(),
    researchId: v.id("onboardingResearch"),
    suggestionsJson: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("onboardingResearch", args.researchId)
    if (
      !row ||
      row.workspaceId !== args.workspaceId ||
      row.inputFingerprint !== args.inputFingerprint ||
      row.status !== "running"
    ) {
      return { state: "stale" as const }
    }
    const now = Date.now()
    await ctx.db.patch("onboardingResearch", row._id, {
      filteringContext: args.filteringContext,
      filteringGuidelines: args.filteringGuidelines,
      completedAt: now,
      errorCode: undefined,
      status: "completed",
      suggestionsJson: args.suggestionsJson,
      updatedAt: now,
    })
    const run = await ctx.db
      .query("providerRuns")
      .withIndex("by_idempotency_key", (q) =>
        q.eq(
          "idempotencyKey",
          providerRunKey(args.workspaceId, args.inputFingerprint),
        ),
      )
      .unique()
    if (run?.status === "running") {
      await ctx.db.patch("providerRuns", run._id, {
        durationMs: args.durationMs,
        finishedAt: now,
        outputCount: 1,
        status: "succeeded",
        updatedAt: now,
      })
      await recordProviderMetricBuckets(
        ctx,
        {
          durationMs: args.durationMs,
          failureCount: 0,
          inputItemCount: 1,
          operation: "onboarding.research",
          outputItemCount: 1,
          provider: "tinyfish",
          rateLimitedCount: 0,
          retryCount: run.attempt > 1 ? 1 : 0,
          successCount: 1,
        },
        now,
      )
    }
    return { state: "completed" as const }
  },
})

export const failResearch = internalMutation({
  args: {
    durationMs: v.number(),
    errorCode: v.string(),
    inputFingerprint: v.string(),
    provider: v.optional(providerValidator),
    researchId: v.id("onboardingResearch"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("onboardingResearch", args.researchId)
    if (
      !row ||
      row.workspaceId !== args.workspaceId ||
      row.inputFingerprint !== args.inputFingerprint
    ) {
      return { state: "stale" as const }
    }
    const now = Date.now()
    await ctx.db.patch("onboardingResearch", row._id, {
      errorCode: args.errorCode.slice(0, 80),
      status: "failed",
      updatedAt: now,
    })
    const run = await ctx.db
      .query("providerRuns")
      .withIndex("by_idempotency_key", (q) =>
        q.eq(
          "idempotencyKey",
          providerRunKey(args.workspaceId, args.inputFingerprint),
        ),
      )
      .unique()
    const failedProvider = args.provider ?? "tinyfish"
    if (run?.status === "running") {
      await ctx.db.patch("providerRuns", run._id, {
        durationMs: args.durationMs,
        errorCode: args.errorCode.slice(0, 80),
        errorMessage: "Onboarding research provider request failed",
        finishedAt: now,
        provider: failedProvider,
        status: "failed",
        updatedAt: now,
      })
      await recordProviderMetricBuckets(
        ctx,
        {
          durationMs: args.durationMs,
          failureCount: 1,
          inputItemCount: 1,
          operation: "onboarding.research",
          outputItemCount: 0,
          provider: failedProvider,
          rateLimitedCount: args.errorCode === "RATE_LIMIT" ? 1 : 0,
          retryCount: run.attempt > 1 ? 1 : 0,
          successCount: 0,
        },
        now,
      )
    }
    return { state: "failed" as const }
  },
})
