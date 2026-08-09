import { internal } from "../_generated/api"
import { type Value, v } from "convex/values"

import { readEmailSenderConfiguration } from "../email/config"
import {
  applyIngestionChunkAtomically,
  type IngestionChunkResult,
} from "../ingestion/service"
import { MAX_INGESTION_CHUNK_SIZE } from "../ingestion/contracts"
import { resolveWorkspaceAllowance } from "../lib/workspaceAccess"
import {
  env,
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { readSchedulingDispatchConfiguration } from "./config"
import {
  canClaimTrackingSource,
  createTrackingLease,
  initialCheckpointWindow,
  planCheckpointTransition,
  providerDispatchState,
  trackingDispatchDelayMs,
  trackingIntervalMs,
  trackingRetryDelayMs,
  type PlanId,
  type ProviderCircuitRun,
  type TrackingLease,
  type TrackingProvider,
  type TrackingSourceSchedule,
  type TrackingSourceType,
} from "./model"
import { parseProviderSearchResultJson } from "./contracts"
import { createProviderIngestionChunks } from "./ingestion"
import {
  findTrackingProviderRun,
  finishTrackingProviderRun,
  trackingProviderRunIdempotencyKey,
} from "./providerRuns"

const releaseReasonValidator = v.union(
  v.literal("keyword_inactive"),
  v.literal("paid_inactive"),
  v.literal("provider_unconfigured"),
  v.literal("usage_exhausted"),
  v.literal("workspace_deleting"),
)

const HOUR_MS = 3_600_000
const MAX_DUE_SCAN = 256
const MAX_PENDING_PROVIDER_BATCHES = 4
const MAX_PENDING_PROVIDER_PAGE_JSON_BYTES = 700_000

type TrackingSourceId = Id<"trackingSources">
type TrackingProviderPageId = Id<"trackingProviderPages">
type KeywordId = Id<"keywords">
type WorkspaceId = Id<"workspaces">
type LeaseArguments = {
  leaseExpiresAt: number
  leaseToken: string
  leaseVersion: number
  trackingSourceId: TrackingSourceId
}

function sourceTypeFromRow(row: Doc<"trackingSources">): TrackingSourceType {
  const sourceType = row.sourceType
  if (
    sourceType !== "x" &&
    sourceType !== "reddit_posts" &&
    sourceType !== "reddit_comments" &&
    sourceType !== "hacker_news"
  ) {
    throw new TypeError("Tracking source has an invalid sourceType")
  }
  return sourceType
}

function scheduleFromRow(row: Doc<"trackingSources">): TrackingSourceSchedule {
  return {
    backoffUntil: row.backoffUntil as number | undefined,
    inProgressCursor: row.inProgressCursor as string | undefined,
    inProgressPage: row.inProgressPage as number | undefined,
    inProgressWindowEndAt: row.inProgressWindowEndAt as number | undefined,
    inProgressWindowStartAt: row.inProgressWindowStartAt as number | undefined,
    intervalMs: row.intervalMs as number,
    leaseExpiresAt: row.leaseExpiresAt as number | undefined,
    leaseToken: row.leaseToken as string | undefined,
    leaseVersion: row.leaseVersion as number,
    nextRunAt: row.nextRunAt as number,
    settledWatermarkAt: row.settledWatermarkAt as number | undefined,
    sourceType: sourceTypeFromRow(row),
    status: row.status as TrackingSourceSchedule["status"],
  }
}

function leaseFromArguments(args: LeaseArguments): TrackingLease {
  return {
    expiresAt: args.leaseExpiresAt,
    token: args.leaseToken,
    version: args.leaseVersion,
  }
}

function currentLeaseMatches(
  source: Doc<"trackingSources"> | null,
  expected: TrackingLease,
  now: number,
): source is Doc<"trackingSources"> {
  return Boolean(
    source &&
    source.leaseVersion === expected.version &&
    source.leaseToken === expected.token &&
    source.leaseExpiresAt === expected.expiresAt &&
    expected.expiresAt > now,
  )
}

function platformForSourceType(
  sourceType: TrackingSourceType,
): "hacker_news" | "reddit" | "x" {
  switch (sourceType) {
    case "x":
      return "x"
    case "reddit_posts":
    case "reddit_comments":
      return "reddit"
    case "hacker_news":
      return "hacker_news"
  }
}

function persistedProvidersFor(
  provider: TrackingProvider,
): readonly TrackingSourceType[] {
  switch (provider) {
    case "xquik":
      return ["x"]
    case "fetchlayer_reddit":
      return ["reddit_posts", "reddit_comments"]
    case "algolia_hacker_news":
      return ["hacker_news"]
  }
}

function operationForSourceType(sourceType: TrackingSourceType): string {
  switch (sourceType) {
    case "x":
      return "tweets.search"
    case "reddit_posts":
      return "posts.search"
    case "reddit_comments":
      return "comments.search"
    case "hacker_news":
      return "search_by_date"
  }
}

type TrackingEligibility =
  | { state: "keyword_inactive" }
  | { state: "paid_inactive" }
  | { state: "stale_lease" }
  | { state: "usage_exhausted" }
  | { deletionPausedAt: number; state: "workspace_deleting" }
  | {
      cursor?: string | undefined
      intervalMs: number
      hasPendingProviderPages: boolean
      keywordId: KeywordId
      page?: number | undefined
      planId: PlanId
      providerQuery: string
      sourceType: TrackingSourceType
      state: "ready"
      windowEndAt: number
      windowStartAt: number
      workspaceId: WorkspaceId
    }

async function readTrackingEligibility(
  db: DatabaseReader,
  args: LeaseArguments,
  now: number,
): Promise<TrackingEligibility> {
  const source = await db.get("trackingSources", args.trackingSourceId)
  const expectedLease = leaseFromArguments(args)
  if (!currentLeaseMatches(source, expectedLease, now)) {
    return { state: "stale_lease" }
  }
  if (source.status !== "active") {
    return { state: "keyword_inactive" }
  }

  const workspaceId = source.workspaceId as WorkspaceId
  const keywordId = source.keywordId as KeywordId
  const [workspace, keyword, allowance] = await Promise.all([
    db.get("workspaces", workspaceId),
    db.get("keywords", keywordId),
    resolveWorkspaceAllowance({ db }, workspaceId, now),
  ])
  const sourceType = sourceTypeFromRow(source)
  const platform = platformForSourceType(sourceType)

  if (workspace && typeof workspace.deletionPendingAt === "number") {
    return {
      deletionPausedAt: workspace.deletionPendingAt,
      state: "workspace_deleting",
    }
  }
  if (
    !workspace ||
    workspace.deletedAt !== undefined ||
    !keyword ||
    keyword.workspaceId !== workspaceId ||
    keyword.status !== "active" ||
    keyword.deletedAt !== undefined ||
    !(keyword.platforms as unknown[]).includes(platform)
  ) {
    return { state: "keyword_inactive" }
  }

  if (allowance.kind === "none") {
    return {
      state:
        allowance.pauseReason === "usage" ? "usage_exhausted" : "paid_inactive",
    }
  }
  if (allowance.exhausted) {
    return { state: "usage_exhausted" }
  }

  const schedule = scheduleFromRow(source)
  const window = initialCheckpointWindow({ now, source: schedule })
  const planId = allowance.planId
  const pendingProviderPage = await db
    .query("trackingProviderPages")
    .withIndex("by_source_ready_and_batch", (q) =>
      q.eq("trackingSourceId", args.trackingSourceId).eq("ready", true),
    )
    .first()

  return {
    cursor: source.inProgressCursor as string | undefined,
    hasPendingProviderPages:
      pendingProviderPage?.providerQuery === source.providerQuery,
    intervalMs: trackingIntervalMs(sourceType, planId),
    keywordId,
    page: source.inProgressPage as number | undefined,
    planId,
    providerQuery: source.providerQuery as string,
    sourceType,
    state: "ready",
    windowEndAt: window.endAt,
    windowStartAt: window.startAt,
    workspaceId,
  }
}

async function hourlyRequestsForProvider(
  ctx: MutationCtx,
  provider: TrackingProvider,
  bucketStartAt: number,
): Promise<number> {
  let requests = 0
  for (const persistedProvider of persistedProvidersFor(provider)) {
    const buckets = await ctx.db
      .query("providerMetricBuckets")
      .withIndex("by_provider_granularity_and_bucket", (q) =>
        q
          .eq("provider", persistedProvider)
          .eq("granularity", "hour")
          .eq("bucketStartAt", bucketStartAt),
      )
      .collect()
    requests += buckets.reduce(
      (sum, bucket) => sum + (bucket.requestCount as number),
      0,
    )
  }
  return requests
}

async function recentProviderRuns(
  ctx: MutationCtx,
  provider: TrackingProvider,
  limit: number,
): Promise<ProviderCircuitRun[]> {
  const runs: ProviderCircuitRun[] = []
  for (const persistedProvider of persistedProvidersFor(provider)) {
    for (const status of ["failed", "succeeded"] as const) {
      const rows = await ctx.db
        .query("providerRuns")
        .withIndex("by_provider_status_and_started_at", (q) =>
          q.eq("provider", persistedProvider).eq("status", status),
        )
        .order("desc")
        .take(limit)
      runs.push(
        ...rows.map((row) => ({
          startedAt: row.startedAt as number,
          status,
        })),
      )
    }
  }
  return runs
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, limit)
}

async function dueSourcesForType(
  ctx: MutationCtx,
  sourceType: TrackingSourceType,
  now: number,
): Promise<Doc<"trackingSources">[]> {
  return await ctx.db
    .query("trackingSources")
    .withIndex("by_source_type_status_and_next_run_at", (q) =>
      q
        .eq("sourceType", sourceType)
        .eq("status", "active")
        .lte("nextRunAt", now),
    )
    .take(MAX_DUE_SCAN)
}

async function claimProviderSources(
  ctx: MutationCtx,
  provider: TrackingProvider,
  availableClaims: number,
  now: number,
): Promise<number> {
  if (availableClaims <= 0) {
    return 0
  }

  const sourceTypes = persistedProvidersFor(provider)
  const sourceRows = (
    await Promise.all(
      sourceTypes.map(
        async (sourceType) => await dueSourcesForType(ctx, sourceType, now),
      ),
    )
  )
    .flat()
    .sort(
      (left, right) =>
        (left.nextRunAt as number) - (right.nextRunAt as number) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )

  let claimed = 0
  for (const source of sourceRows) {
    if (claimed >= availableClaims) {
      break
    }
    const schedule = scheduleFromRow(source)
    if (!canClaimTrackingSource(schedule, now)) {
      continue
    }

    const trackingSourceId = source._id as TrackingSourceId
    if (
      schedule.leaseExpiresAt !== undefined &&
      schedule.leaseExpiresAt <= now &&
      schedule.leaseVersion > 0
    ) {
      const expiredRun = await findTrackingProviderRun(
        ctx,
        trackingProviderRunIdempotencyKey(
          trackingSourceId,
          schedule.leaseVersion,
        ),
      )
      if (expiredRun?.status === "running") {
        await finishTrackingProviderRun(
          ctx,
          {
            durationMs: Math.max(0, now - (expiredRun.startedAt as number)),
            errorCode: "lease_expired",
            errorMessage: "Tracking worker lease expired",
            outputCount: 0,
            run: expiredRun,
            status: "failed",
          },
          now,
        )
      }
    }
    const lease = createTrackingLease({
      now,
      source: schedule,
      sourceId: String(trackingSourceId),
    })
    const checkpointWindow = initialCheckpointWindow({ now, source: schedule })
    await ctx.db.patch("trackingSources", trackingSourceId, {
      inProgressWindowEndAt: checkpointWindow.endAt,
      inProgressWindowStartAt: checkpointWindow.startAt,
      leaseExpiresAt: lease.expiresAt,
      leaseToken: lease.token,
      leaseVersion: lease.version,
      updatedAt: now,
      ...(schedule.sourceType === "hacker_news" &&
      schedule.inProgressPage === undefined
        ? { inProgressPage: 0 }
        : {}),
    })
    await ctx.scheduler.runAfter(
      trackingDispatchDelayMs(String(trackingSourceId), lease.version),
      internal.scheduling.actions.executeTrackingSource,
      {
        leaseExpiresAt: lease.expiresAt,
        leaseToken: lease.token,
        leaseVersion: lease.version,
        trackingSourceId,
      },
    )
    claimed += 1
  }

  return claimed
}

export const dispatchDueTrackingSources = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const configuration = readSchedulingDispatchConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      return {
        invalid: configuration.invalid,
        state: "provider_unconfigured" as const,
      }
    }

    const bucketStartAt = Math.floor(now / HOUR_MS) * HOUR_MS
    const providers = [
      "xquik",
      "fetchlayer_reddit",
      "algolia_hacker_news",
    ] as const
    const claims: Record<TrackingProvider, number> = {
      algolia_hacker_news: 0,
      fetchlayer_reddit: 0,
      xquik: 0,
    }
    const circuits: Record<TrackingProvider, "closed" | "open"> = {
      algolia_hacker_news: "closed",
      fetchlayer_reddit: "closed",
      xquik: "closed",
    }

    for (const provider of providers) {
      const policy = configuration.policies[provider]
      const [hourlyRequests, recentRuns] = await Promise.all([
        hourlyRequestsForProvider(ctx, provider, bucketStartAt),
        recentProviderRuns(
          ctx,
          provider,
          Math.max(policy.circuitFailureThreshold * 2, 10),
        ),
      ])
      const state = providerDispatchState({
        hourlyRequests,
        now,
        policy,
        recentRuns,
      })
      circuits[provider] = state.circuit
      claims[provider] = await claimProviderSources(
        ctx,
        provider,
        state.availableClaims,
        now,
      )
    }

    return { circuits, claims, state: "dispatched" as const }
  },
})

export const loadTrackingExecutionContext = internalQuery({
  args: {
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) =>
    await readTrackingEligibility(ctx.db, args, Date.now()),
})

function pausePatchForReason(
  reason:
    | "keyword_inactive"
    | "paid_inactive"
    | "provider_unconfigured"
    | "usage_exhausted"
    | "workspace_deleting",
  deletionPausedAt?: number,
): Record<string, Value> {
  switch (reason) {
    case "keyword_inactive":
      return { pauseReason: "user", status: "paused" }
    case "paid_inactive":
      return { pauseReason: "paid", status: "paused" }
    case "provider_unconfigured":
      return { pauseReason: "config", status: "paused" }
    case "usage_exhausted":
      return { pauseReason: "usage", status: "paused" }
    case "workspace_deleting":
      if (deletionPausedAt === undefined) {
        throw new TypeError("Deletion pause requires its access fence")
      }
      return {
        deletionPausedAt,
        pauseReason: "user",
        status: "paused",
      }
  }
}

export const releaseIneligibleTrackingLease = internalMutation({
  args: {
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    reason: releaseReasonValidator,
    deletionPausedAt: v.optional(v.number()),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = await ctx.db.get("trackingSources", args.trackingSourceId)
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }

    if (args.reason === "workspace_deleting") {
      const workspace = await ctx.db.get(
        "workspaces",
        source.workspaceId as WorkspaceId,
      )
      if (!workspace || workspace.deletionPendingAt !== args.deletionPausedAt) {
        return { state: "stale_lease" as const }
      }
    }

    await ctx.db.patch("trackingSources", args.trackingSourceId, {
      ...pausePatchForReason(args.reason, args.deletionPausedAt),
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      updatedAt: now,
    })
    return { state: args.reason }
  },
})

export const startTrackingProviderRun = internalMutation({
  args: {
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = await ctx.db.get("trackingSources", args.trackingSourceId)
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }

    const idempotencyKey = trackingProviderRunIdempotencyKey(
      args.trackingSourceId,
      args.leaseVersion,
    )
    const existing = await findTrackingProviderRun(ctx, idempotencyKey)

    const pendingProviderPages = await ctx.db
      .query("trackingProviderPages")
      .withIndex("by_source_and_created_at", (q) =>
        q.eq("trackingSourceId", args.trackingSourceId),
      )
      .take(MAX_PENDING_PROVIDER_BATCHES + 1)
    if (pendingProviderPages.length > MAX_PENDING_PROVIDER_BATCHES) {
      throw new RangeError("Pending provider page count exceeds the maximum")
    }
    let hasPendingProviderPages = false
    for (const page of pendingProviderPages) {
      if (page.ready === true && page.providerQuery === source.providerQuery) {
        hasPendingProviderPages = true
        continue
      }
      await ctx.db.delete(
        "trackingProviderPages",
        page._id as TrackingProviderPageId,
      )
    }

    if (existing) {
      return {
        state:
          existing.status === "running"
            ? ("started" as const)
            : ("duplicate" as const),
      }
    }

    const sourceType = sourceTypeFromRow(source)
    const retry =
      (source.consecutiveFailures as number) > 0 ||
      source.inProgressCursor !== undefined ||
      ((source.inProgressPage as number | undefined) ?? 0) > 0 ||
      hasPendingProviderPages
    await ctx.db.insert("providerRuns", {
      attempt: (source.consecutiveFailures as number) + 1,
      createdAt: now,
      idempotencyKey,
      inputCount: 1,
      operation: operationForSourceType(sourceType),
      outputCount: 0,
      provider: sourceType,
      startedAt: now,
      status: "running",
      trackingSourceId: args.trackingSourceId,
      trigger: retry ? "retry" : "scheduled",
      updatedAt: now,
      workspaceId: source.workspaceId as WorkspaceId,
    })
    return { state: "started" as const }
  },
})

type ProviderPageIngestion = {
  associationsAdded: number
  mentionAnalysisJobsEnqueued: number
  inserted: number
  rediscovered: number
  unprocessedPosition?: number | undefined
  usageExhausted: boolean
}

async function ingestProviderPage(
  ctx: MutationCtx,
  input: {
    emailFrom: string
    emailReplyTo?: string | undefined
    items: ReturnType<typeof parseProviderSearchResultJson>["items"]
    keywordId: KeywordId
    startPosition?: number | undefined
    trackingSourceId: TrackingSourceId
    workspaceId: WorkspaceId
  },
  now: number,
): Promise<ProviderPageIngestion> {
  const chunks = createProviderIngestionChunks({
    items: input.items,
    keywordId: String(input.keywordId),
    ...(input.startPosition === undefined
      ? {}
      : { startPosition: input.startPosition }),
    trackingSourceId: String(input.trackingSourceId),
    workspaceId: String(input.workspaceId),
  })
  const aggregate: ProviderPageIngestion = {
    associationsAdded: 0,
    mentionAnalysisJobsEnqueued: 0,
    inserted: 0,
    rediscovered: 0,
    usageExhausted: false,
  }

  for (const chunk of chunks) {
    const result: IngestionChunkResult = await applyIngestionChunkAtomically(
      ctx,
      chunk,
      {
        emailFrom: input.emailFrom,
        now,
        ...(input.emailReplyTo === undefined
          ? {}
          : { emailReplyTo: input.emailReplyTo }),
      },
    )
    aggregate.associationsAdded += result.associationsAdded
    aggregate.mentionAnalysisJobsEnqueued += result.mentionAnalysisJobsEnqueued
    aggregate.inserted += result.inserted
    aggregate.rediscovered += result.rediscovered
    aggregate.usageExhausted = result.usage.exhausted

    if (result.checkpoint === "hold") {
      aggregate.unprocessedPosition = result.unprocessedPosition
      return aggregate
    }
  }

  return aggregate
}

export const stageTrackingProviderPage = internalMutation({
  args: {
    batchIndex: v.number(),
    durationMs: v.number(),
    finalize: v.boolean(),
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    providerOutputCount: v.number(),
    resultJson: v.string(),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = await ctx.db.get("trackingSources", args.trackingSourceId)
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }
    const run = await findTrackingProviderRun(
      ctx,
      trackingProviderRunIdempotencyKey(
        args.trackingSourceId,
        args.leaseVersion,
      ),
    )
    if (!run || run.status !== "running") {
      return { state: "stale_run" as const }
    }
    const result = parseProviderSearchResultJson(args.resultJson)
    if (
      !Number.isSafeInteger(args.batchIndex) ||
      args.batchIndex < 0 ||
      args.batchIndex >= MAX_PENDING_PROVIDER_BATCHES ||
      !Number.isSafeInteger(args.providerOutputCount) ||
      args.providerOutputCount < result.items.length ||
      result.items.length > MAX_INGESTION_CHUNK_SIZE ||
      new TextEncoder().encode(args.resultJson).byteLength >
        MAX_PENDING_PROVIDER_PAGE_JSON_BYTES
    ) {
      throw new RangeError("Staged provider page is invalid")
    }
    const existing = await ctx.db
      .query("trackingProviderPages")
      .withIndex("by_source_generation_and_batch", (q) =>
        q
          .eq("trackingSourceId", args.trackingSourceId)
          .eq("generation", args.leaseVersion)
          .eq("batchIndex", args.batchIndex),
      )
      .unique()
    if (existing) {
      if (
        existing.resultJson !== args.resultJson ||
        existing.finalize !== args.finalize ||
        existing.providerOutputCount !== args.providerOutputCount
      ) {
        throw new RangeError("Staged provider page conflicts with its retry")
      }
      return { state: "staged" as const }
    }

    await ctx.db.insert("trackingProviderPages", {
      batchIndex: args.batchIndex,
      createdAt: now,
      durationMs: args.durationMs,
      finalize: args.finalize,
      generation: args.leaseVersion,
      providerOutputCount: args.providerOutputCount,
      providerQuery: source.providerQuery as string,
      ready: false,
      resultJson: args.resultJson,
      startPosition: 0,
      trackingSourceId: args.trackingSourceId,
      updatedAt: now,
      workspaceId: source.workspaceId as WorkspaceId,
    })
    return { state: "staged" as const }
  },
})

export const commitTrackingProviderPages = internalMutation({
  args: {
    batchCount: v.number(),
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = await ctx.db.get("trackingSources", args.trackingSourceId)
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }
    const run = await findTrackingProviderRun(
      ctx,
      trackingProviderRunIdempotencyKey(
        args.trackingSourceId,
        args.leaseVersion,
      ),
    )
    if (!run || run.status !== "running") {
      return { state: "stale_run" as const }
    }
    if (
      !Number.isSafeInteger(args.batchCount) ||
      args.batchCount < 1 ||
      args.batchCount > MAX_PENDING_PROVIDER_BATCHES
    ) {
      throw new RangeError("Staged provider batch count is invalid")
    }
    const pages = await ctx.db
      .query("trackingProviderPages")
      .withIndex("by_source_generation_and_batch", (q) =>
        q
          .eq("trackingSourceId", args.trackingSourceId)
          .eq("generation", args.leaseVersion),
      )
      .take(MAX_PENDING_PROVIDER_BATCHES + 1)
    if (
      pages.length !== args.batchCount ||
      pages.some(
        (page, index) =>
          page.batchIndex !== index ||
          page.providerQuery !== source.providerQuery,
      )
    ) {
      throw new RangeError("Staged provider pages are incomplete")
    }
    for (const page of pages) {
      await ctx.db.patch(
        "trackingProviderPages",
        page._id as TrackingProviderPageId,
        {
          ready: true,
          updatedAt: now,
        },
      )
    }
    return { state: "committed" as const }
  },
})

export const applyNextTrackingProviderPage = internalMutation({
  args: {
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = await ctx.db.get("trackingSources", args.trackingSourceId)
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }
    const run = await findTrackingProviderRun(
      ctx,
      trackingProviderRunIdempotencyKey(
        args.trackingSourceId,
        args.leaseVersion,
      ),
    )
    if (!run || run.status !== "running") {
      return { state: "stale_run" as const }
    }

    const pendingPage = await ctx.db
      .query("trackingProviderPages")
      .withIndex("by_source_ready_and_batch", (q) =>
        q.eq("trackingSourceId", args.trackingSourceId).eq("ready", true),
      )
      .first()
    if (!pendingPage || pendingPage.providerQuery !== source.providerQuery) {
      return { state: "no_pending_page" as const }
    }
    const result = parseProviderSearchResultJson(
      pendingPage.resultJson as string,
    )
    const providerOutputCount = pendingPage.providerOutputCount as number
    if (
      result.items.length > MAX_INGESTION_CHUNK_SIZE ||
      !Number.isSafeInteger(providerOutputCount) ||
      providerOutputCount < result.items.length
    ) {
      throw new RangeError("Pending provider page is invalid")
    }
    const startPosition = pendingPage.startPosition as number
    if (
      !Number.isSafeInteger(startPosition) ||
      startPosition < 0 ||
      startPosition > result.items.length
    ) {
      throw new RangeError("Pending provider page position is invalid")
    }
    const eligibility = await readTrackingEligibility(ctx.db, args, now)
    if (eligibility.state !== "ready") {
      await ctx.db.patch("trackingSources", args.trackingSourceId, {
        ...(eligibility.state === "stale_lease"
          ? {}
          : pausePatchForReason(
              eligibility.state,
              eligibility.state === "workspace_deleting"
                ? eligibility.deletionPausedAt
                : undefined,
            )),
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        lastRunAt: now,
        updatedAt: now,
      })
      await finishTrackingProviderRun(
        ctx,
        {
          durationMs: pendingPage.durationMs as number,
          errorCode: "eligibility_changed",
          errorMessage: "Tracking eligibility changed before persistence",
          outputCount: providerOutputCount,
          run,
          status: "failed",
        },
        now,
      )
      return { state: eligibility.state }
    }

    const sender = readEmailSenderConfiguration(env)
    if (sender.state === "provider_unconfigured") {
      await ctx.db.patch("trackingSources", args.trackingSourceId, {
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: "config",
        status: "paused",
        updatedAt: now,
      })
      await finishTrackingProviderRun(
        ctx,
        {
          durationMs: pendingPage.durationMs as number,
          errorCode: "resend_provider_unconfigured",
          errorMessage: "Resend email sender is not configured",
          outputCount: providerOutputCount,
          run,
          status: "failed",
        },
        now,
      )
      return sender
    }

    const ingestion = await ingestProviderPage(
      ctx,
      {
        emailFrom: sender.from,
        items: result.items,
        keywordId: eligibility.keywordId,
        startPosition,
        trackingSourceId: args.trackingSourceId,
        workspaceId: eligibility.workspaceId,
        ...(sender.replyTo === undefined
          ? {}
          : { emailReplyTo: sender.replyTo }),
      },
      now,
    )

    if (ingestion.usageExhausted) {
      await ctx.db.patch(
        "trackingProviderPages",
        pendingPage._id as TrackingProviderPageId,
        {
          startPosition: ingestion.unprocessedPosition ?? result.items.length,
          updatedAt: now,
        },
      )
      await ctx.db.patch("trackingSources", args.trackingSourceId, {
        backoffMs: 0,
        backoffUntil: undefined,
        consecutiveFailures: 0,
        intervalMs: eligibility.intervalMs,
        lastError: undefined,
        lastRunAt: now,
        lastSuccessAt: now,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: "usage",
        status: "paused",
        updatedAt: now,
      })
    } else {
      await ctx.db.delete(
        "trackingProviderPages",
        pendingPage._id as TrackingProviderPageId,
      )
    }

    if (!ingestion.usageExhausted && pendingPage.finalize === true) {
      const transition = planCheckpointTransition({
        checkpointVersion: source.checkpointVersion as number,
        completedAt: now,
        intervalMs: eligibility.intervalMs,
        observation: result.checkpoint,
        pagination: result.pagination,
        scheduledFor: source.nextRunAt as number,
        settledWatermarkAt: source.settledWatermarkAt as number | undefined,
        windowEndAt: eligibility.windowEndAt,
      })
      const commonPatch = {
        backoffMs: 0,
        backoffUntil: undefined,
        checkpointVersion: transition.checkpointVersion,
        consecutiveFailures: 0,
        intervalMs: eligibility.intervalMs,
        lastError: undefined,
        lastRunAt: now,
        lastSuccessAt: now,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        nextRunAt: transition.nextRunAt,
        pauseReason: undefined,
        status: "active" as const,
        updatedAt: now,
      }

      if (transition.kind === "continue") {
        await ctx.db.patch("trackingSources", args.trackingSourceId, {
          ...commonPatch,
          inProgressCursor: transition.inProgressCursor,
          inProgressPage: transition.inProgressPage,
        })
      } else {
        await ctx.db.patch("trackingSources", args.trackingSourceId, {
          ...commonPatch,
          inProgressCursor: undefined,
          inProgressPage: undefined,
          inProgressWindowEndAt: undefined,
          inProgressWindowStartAt: undefined,
          settledWatermarkAt: transition.settledWatermarkAt,
          settledWatermarkItemId: transition.settledWatermarkItemId,
        })
      }
    } else if (!ingestion.usageExhausted) {
      return {
        associationsAdded: ingestion.associationsAdded,
        mentionAnalysisJobsEnqueued: ingestion.mentionAnalysisJobsEnqueued,
        inserted: ingestion.inserted,
        rediscovered: ingestion.rediscovered,
        state: "batch_applied" as const,
      }
    }

    await finishTrackingProviderRun(
      ctx,
      {
        durationMs: pendingPage.durationMs as number,
        outputCount: providerOutputCount,
        run,
        status: "succeeded",
      },
      now,
    )
    return {
      associationsAdded: ingestion.associationsAdded,
      mentionAnalysisJobsEnqueued: ingestion.mentionAnalysisJobsEnqueued,
      inserted: ingestion.inserted,
      rediscovered: ingestion.rediscovered,
      state: ingestion.usageExhausted
        ? ("usage_exhausted" as const)
        : ("applied" as const),
      ...(ingestion.unprocessedPosition === undefined
        ? {}
        : { unprocessedPosition: ingestion.unprocessedPosition }),
    }
  },
})

export const failTrackingProviderRun = internalMutation({
  args: {
    durationMs: v.number(),
    errorCode: v.string(),
    errorMessage: v.string(),
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    retryable: v.boolean(),
    retryAfterMs: v.optional(v.number()),
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = await ctx.db.get("trackingSources", args.trackingSourceId)
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }
    const run = await findTrackingProviderRun(
      ctx,
      trackingProviderRunIdempotencyKey(
        args.trackingSourceId,
        args.leaseVersion,
      ),
    )
    if (!run || run.status !== "running") {
      return { state: "stale_run" as const }
    }

    const consecutiveFailures = (source.consecutiveFailures as number) + 1
    const delayMs = trackingRetryDelayMs({
      consecutiveFailures,
      retryAfterMs: args.retryAfterMs,
      sourceKey: String(args.trackingSourceId),
    })
    await ctx.db.patch("trackingSources", args.trackingSourceId, {
      backoffMs: delayMs,
      backoffUntil: now + delayMs,
      consecutiveFailures,
      lastError: `${args.errorCode}:${args.errorMessage}`,
      lastRunAt: now,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextRunAt: now + delayMs,
      pauseReason:
        !args.retryable &&
        (args.errorCode === "auth" || args.errorCode === "invalid_query")
          ? "config"
          : undefined,
      status: args.retryable ? "active" : "error",
      totalFailures: (source.totalFailures as number) + 1,
      updatedAt: now,
    })
    await finishTrackingProviderRun(
      ctx,
      {
        durationMs: args.durationMs,
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
        outputCount: 0,
        run,
        status: "failed",
      },
      now,
    )
    return {
      nextRunAt: now + delayMs,
      state: args.retryable ? ("retry_scheduled" as const) : ("error" as const),
    }
  },
})

export type TrackingExecutionContext = Awaited<
  ReturnType<typeof readTrackingEligibility>
>
