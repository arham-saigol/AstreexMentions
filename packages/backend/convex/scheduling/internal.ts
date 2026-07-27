import { type GenericId, type Value, v } from "convex/values"

import { readEmailSenderConfiguration } from "../email/config"
import {
  applyIngestionChunkAtomically,
  type IngestionChunkResult,
} from "../ingestion/service"
import { MAX_INGESTION_CHUNK_SIZE } from "../ingestion/contracts"
import {
  internalActionReference,
  internalMutationReference,
  internalQueryReference,
} from "../lib/functionReferences"
import { indexAtMost } from "../lib/jobRuntime"
import {
  env,
  indexEquals,
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../server"
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
)

const HOUR_MS = 3_600_000
const MAX_DUE_SCAN = 256

type TrackingSourceId = GenericId<"trackingSources">
type KeywordId = GenericId<"keywords">
type WorkspaceId = GenericId<"workspaces">
type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type LeaseArguments = {
  leaseExpiresAt: number
  leaseToken: string
  leaseVersion: number
  trackingSourceId: TrackingSourceId
}

function sourceTypeFromRow(row: GenericRow): TrackingSourceType {
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

function planIdFromRow(row: GenericRow): PlanId {
  const planId = row.planId
  if (planId !== "starter" && planId !== "growth" && planId !== "scale") {
    throw new TypeError("Subscription has an invalid planId")
  }
  return planId
}

function scheduleFromRow(row: GenericRow): TrackingSourceSchedule {
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
  source: GenericRow | null,
  expected: TrackingLease,
  now: number,
): source is GenericRow {
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

async function latestWorkspaceSubscription(
  db: DatabaseReader,
  workspaceId: WorkspaceId,
): Promise<GenericRow | null> {
  const subscriptions = (await db
    .query("subscriptions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect()) as GenericRow[]

  return (
    subscriptions.sort(
      (left, right) =>
        (right.lastSyncedAt as number) - (left.lastSyncedAt as number),
    )[0] ?? null
  )
}

async function currentUsageCycle(
  db: DatabaseReader,
  workspaceId: WorkspaceId,
  now: number,
): Promise<GenericRow | null> {
  const cycles = (await db
    .query("usageCycles")
    .withIndex("by_workspace_status_and_period_end", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["status", "open"]),
    )
    .collect()) as GenericRow[]

  return (
    cycles
      .filter(
        (cycle) =>
          (cycle.periodStartAt as number) <= now &&
          (cycle.periodEndAt as number) > now,
      )
      .sort(
        (left, right) =>
          (right.periodStartAt as number) - (left.periodStartAt as number),
      )[0] ?? null
  )
}

type TrackingEligibility =
  | { state: "keyword_inactive" }
  | { state: "paid_inactive" }
  | { state: "stale_lease" }
  | { state: "usage_exhausted" }
  | {
      cursor?: string | undefined
      intervalMs: number
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
  const source = (await db.get(
    "trackingSources",
    args.trackingSourceId,
  )) as GenericRow | null
  const expectedLease = leaseFromArguments(args)
  if (!currentLeaseMatches(source, expectedLease, now)) {
    return { state: "stale_lease" }
  }
  if (source.status !== "active") {
    return { state: "keyword_inactive" }
  }

  const workspaceId = source.workspaceId as WorkspaceId
  const keywordId = source.keywordId as KeywordId
  const [workspace, keyword, subscription, usageCycle] = await Promise.all([
    db.get("workspaces", workspaceId) as Promise<GenericRow | null>,
    db.get("keywords", keywordId) as Promise<GenericRow | null>,
    latestWorkspaceSubscription(db, workspaceId),
    currentUsageCycle(db, workspaceId, now),
  ])
  const sourceType = sourceTypeFromRow(source)
  const platform = platformForSourceType(sourceType)

  if (
    !workspace ||
    workspace.deletedAt !== undefined ||
    workspace.deletionPendingAt !== undefined ||
    !keyword ||
    keyword.workspaceId !== workspaceId ||
    keyword.status !== "active" ||
    keyword.deletedAt !== undefined ||
    !(keyword.platforms as unknown[]).includes(platform)
  ) {
    return { state: "keyword_inactive" }
  }

  if (
    !subscription ||
    subscription.workspaceId !== workspaceId ||
    subscription.entitlementStatus !== "active" ||
    (subscription.currentPeriodStart as number) > now ||
    (subscription.currentPeriodEnd as number) <= now
  ) {
    return { state: "paid_inactive" }
  }

  if (!usageCycle) {
    return { state: "usage_exhausted" }
  }
  const remainingMentions = Math.max(
    0,
    (usageCycle.mentionLimit as number) - (usageCycle.mentionsUsed as number),
  )
  if (remainingMentions === 0) {
    return { state: "usage_exhausted" }
  }

  const schedule = scheduleFromRow(source)
  const window = initialCheckpointWindow({ now, source: schedule })
  const planId = planIdFromRow(subscription)

  return {
    cursor: source.inProgressCursor as string | undefined,
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
    const buckets = (await ctx.db
      .query("providerMetricBuckets")
      .withIndex("by_provider_granularity_and_bucket", (q) =>
        indexEquals(
          q,
          ["provider", persistedProvider],
          ["granularity", "hour"],
          ["bucketStartAt", bucketStartAt],
        ),
      )
      .collect()) as GenericRow[]
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
      const rows = (await ctx.db
        .query("providerRuns")
        .withIndex("by_provider_status_and_started_at", (q) =>
          indexEquals(q, ["provider", persistedProvider], ["status", status]),
        )
        .order("desc")
        .take(limit)) as GenericRow[]
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
): Promise<GenericRow[]> {
  return (await ctx.db
    .query("trackingSources")
    .withIndex("by_source_type_status_and_next_run_at", (q) =>
      indexAtMost(
        indexEquals(q, ["sourceType", sourceType], ["status", "active"]),
        "nextRunAt",
        now,
      ),
    )
    .take(MAX_DUE_SCAN)) as GenericRow[]
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
      executeTrackingSourceReference,
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
    | "usage_exhausted",
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
  }
}

export const releaseIneligibleTrackingLease = internalMutation({
  args: {
    leaseExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    reason: releaseReasonValidator,
    trackingSourceId: v.id("trackingSources"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const source = (await ctx.db.get(
      "trackingSources",
      args.trackingSourceId,
    )) as GenericRow | null
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }

    await ctx.db.patch("trackingSources", args.trackingSourceId, {
      ...pausePatchForReason(args.reason),
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
    const source = (await ctx.db.get(
      "trackingSources",
      args.trackingSourceId,
    )) as GenericRow | null
    if (!currentLeaseMatches(source, leaseFromArguments(args), now)) {
      return { state: "stale_lease" as const }
    }

    const idempotencyKey = trackingProviderRunIdempotencyKey(
      args.trackingSourceId,
      args.leaseVersion,
    )
    const existing = await findTrackingProviderRun(ctx, idempotencyKey)
    if (existing) {
      return { state: "duplicate" as const }
    }

    const sourceType = sourceTypeFromRow(source)
    const retry =
      (source.consecutiveFailures as number) > 0 ||
      source.inProgressCursor !== undefined ||
      ((source.inProgressPage as number | undefined) ?? 0) > 0
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
  categorizationJobsEnqueued: number
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
    trackingSourceId: TrackingSourceId
    workspaceId: WorkspaceId
  },
  now: number,
): Promise<ProviderPageIngestion> {
  const chunks = createProviderIngestionChunks({
    items: input.items,
    keywordId: String(input.keywordId),
    trackingSourceId: String(input.trackingSourceId),
    workspaceId: String(input.workspaceId),
  })
  const aggregate: ProviderPageIngestion = {
    associationsAdded: 0,
    categorizationJobsEnqueued: 0,
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
    aggregate.categorizationJobsEnqueued += result.categorizationJobsEnqueued
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

export const applyTrackingProviderPage = internalMutation({
  args: {
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
    const source = (await ctx.db.get(
      "trackingSources",
      args.trackingSourceId,
    )) as GenericRow | null
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
      result.items.length > MAX_INGESTION_CHUNK_SIZE ||
      !Number.isSafeInteger(args.providerOutputCount) ||
      args.providerOutputCount < result.items.length
    ) {
      throw new RangeError("Provider apply batch is invalid")
    }
    const eligibility = await readTrackingEligibility(ctx.db, args, now)
    if (eligibility.state !== "ready") {
      await ctx.db.patch("trackingSources", args.trackingSourceId, {
        ...(eligibility.state === "stale_lease"
          ? {}
          : pausePatchForReason(eligibility.state)),
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        lastRunAt: now,
        updatedAt: now,
      })
      await finishTrackingProviderRun(
        ctx,
        {
          durationMs: args.durationMs,
          errorCode: "eligibility_changed",
          errorMessage: "Tracking eligibility changed before persistence",
          outputCount: args.providerOutputCount,
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
          durationMs: args.durationMs,
          errorCode: "resend_provider_unconfigured",
          errorMessage: "Resend email sender is not configured",
          outputCount: args.providerOutputCount,
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
        trackingSourceId: args.trackingSourceId,
        workspaceId: eligibility.workspaceId,
        ...(sender.replyTo === undefined
          ? {}
          : { emailReplyTo: sender.replyTo }),
      },
      now,
    )

    if (ingestion.usageExhausted) {
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
    } else if (args.finalize) {
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
        pauseReason: ingestion.usageExhausted ? ("usage" as const) : undefined,
        status: ingestion.usageExhausted
          ? ("paused" as const)
          : ("active" as const),
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
    } else {
      return {
        associationsAdded: ingestion.associationsAdded,
        categorizationJobsEnqueued: ingestion.categorizationJobsEnqueued,
        inserted: ingestion.inserted,
        rediscovered: ingestion.rediscovered,
        state: "batch_applied" as const,
      }
    }

    await finishTrackingProviderRun(
      ctx,
      {
        durationMs: args.durationMs,
        outputCount: args.providerOutputCount,
        run,
        status: "succeeded",
      },
      now,
    )
    return {
      associationsAdded: ingestion.associationsAdded,
      categorizationJobsEnqueued: ingestion.categorizationJobsEnqueued,
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
    const source = (await ctx.db.get(
      "trackingSources",
      args.trackingSourceId,
    )) as GenericRow | null
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

export const dispatchDueTrackingSourcesReference = internalMutationReference<{
  now?: number
}>("scheduling/internal:dispatchDueTrackingSources")

export const executeTrackingSourceReference =
  internalActionReference<LeaseArguments>(
    "scheduling/actions:executeTrackingSource",
  )

export const loadTrackingExecutionContextReference = internalQueryReference<
  LeaseArguments,
  TrackingExecutionContext
>("scheduling/internal:loadTrackingExecutionContext")

type ReleaseIneligibleTrackingLeaseArguments = LeaseArguments & {
  reason:
    | "keyword_inactive"
    | "paid_inactive"
    | "provider_unconfigured"
    | "usage_exhausted"
}

export const releaseIneligibleTrackingLeaseReference =
  internalMutationReference<ReleaseIneligibleTrackingLeaseArguments>(
    "scheduling/internal:releaseIneligibleTrackingLease",
  )

export const startTrackingProviderRunReference =
  internalMutationReference<LeaseArguments>(
    "scheduling/internal:startTrackingProviderRun",
  )

export const applyTrackingProviderPageReference = internalMutationReference<
  LeaseArguments & {
    durationMs: number
    finalize: boolean
    providerOutputCount: number
    resultJson: string
  },
  { state: string }
>("scheduling/internal:applyTrackingProviderPage")

export const failTrackingProviderRunReference = internalMutationReference<
  LeaseArguments & {
    durationMs: number
    errorCode: string
    errorMessage: string
    retryable: boolean
    retryAfterMs?: number
  }
>("scheduling/internal:failTrackingProviderRun")
