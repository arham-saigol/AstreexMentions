import type { UserIdentity } from "convex/server"
import type { GenericId } from "convex/values"
import { ConvexError, v } from "convex/values"

import { effectiveEntitlementStatus } from "./billing/lifecycle"
import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { syncUsagePausedWorkspaceMetric } from "./lib/operationalMetrics"
import {
  createInitialTrackingSchedule,
  type PlanId,
  type TrackingSourceType,
} from "./scheduling/model"
import { finalizeInvalidatedTrackingProviderRun } from "./scheduling/providerRuns"
import { indexEquals, type MutationCtx, type QueryCtx } from "./server"
import { resolveCurrentCustomer } from "./users"

export const MAX_DRAFT_KEYWORDS = 10
const MAX_KEYWORD_LENGTH = 160
const MAX_ACTIVE_SAVED_VIEWS = 50

const platformValidator = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("hacker_news"),
)
const keywordStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("deleted"),
)
const trackingSourceTypeValidator = v.union(
  v.literal("x"),
  v.literal("reddit_posts"),
  v.literal("reddit_comments"),
  v.literal("hacker_news"),
)
const trackingSourceStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("error"),
  v.literal("deleted"),
)
const trackingPauseReasonValidator = v.union(
  v.literal("paid"),
  v.literal("user"),
  v.literal("usage"),
  v.literal("config"),
)

const trackingSourceResultValidator = v.object({
  id: v.id("trackingSources"),
  intervalMs: v.number(),
  lastCheckedAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
  nextExpectedAt: v.union(v.number(), v.null()),
  pauseReason: v.union(trackingPauseReasonValidator, v.null()),
  sourceType: trackingSourceTypeValidator,
  status: trackingSourceStatusValidator,
})

const keywordResultValidator = v.object({
  createdAt: v.number(),
  id: v.id("keywords"),
  pausedAt: v.union(v.number(), v.null()),
  phrase: v.string(),
  platforms: v.array(platformValidator),
  sources: v.array(trackingSourceResultValidator),
  status: keywordStatusValidator,
  updatedAt: v.number(),
})

const monitoringStateValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("setup_required"),
  v.literal("unpaid"),
  v.literal("usage_limited"),
)

const keywordSummaryValidator = v.object({
  activeCount: v.number(),
  canCreate: v.boolean(),
  count: v.number(),
  limit: v.number(),
  limitReached: v.boolean(),
  monitoringState: monitoringStateValidator,
  pausedCount: v.number(),
  remaining: v.number(),
})

const deletedKeywordResultValidator = v.object({
  id: v.id("keywords"),
  status: v.literal("deleted"),
})

type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type KeywordId = GenericId<"keywords">
type TrackingSourceId = GenericId<"trackingSources">
type Platform = "x" | "reddit" | "hacker_news"
type KeywordStatus = "active" | "paused" | "deleted"
type TrackingPauseReason = "paid" | "user" | "usage" | "config"
type TrackingSourceStatus = "active" | "paused" | "error" | "deleted"
type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type SavedViewFilters = {
  categoryIds?: GenericId<"categories">[]
  keywordIds?: KeywordId[]
  mentionStatuses?: Array<"new" | "saved" | "dismissed">
  platforms?: Platform[]
  publishedAfter?: number
  publishedBefore?: number
}

type CustomerDatabaseCtx = {
  db: QueryCtx["db"] | MutationCtx["db"]
  identity: UserIdentity
}

type CurrentCustomer = {
  userId: UserId
  workspaceId: WorkspaceId
}

type BillingKeywordState = {
  hasActiveSubscription: boolean
  hasCurrentUsage: boolean
  keywordLimit: number
  planId: PlanId
  usageExhausted: boolean
}

type DesiredTrackingState = {
  pauseReason?: TrackingPauseReason | undefined
  status: "active" | "paused"
}

function keywordError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function removeKeywordFromSavedViewFilters(
  filters: SavedViewFilters,
  keywordId: KeywordId,
): SavedViewFilters {
  const keywordIds = filters.keywordIds?.filter(
    (candidate) => candidate !== keywordId,
  )
  return {
    ...(filters.categoryIds === undefined
      ? {}
      : { categoryIds: filters.categoryIds }),
    ...(keywordIds === undefined || keywordIds.length === 0
      ? {}
      : { keywordIds }),
    ...(filters.mentionStatuses === undefined
      ? {}
      : { mentionStatuses: filters.mentionStatuses }),
    ...(filters.platforms === undefined
      ? {}
      : { platforms: filters.platforms }),
    ...(filters.publishedAfter === undefined
      ? {}
      : { publishedAfter: filters.publishedAfter }),
    ...(filters.publishedBefore === undefined
      ? {}
      : { publishedBefore: filters.publishedBefore }),
  }
}

export function normalizeKeywordPhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en")
}

function validatedPhrase(value: string): {
  normalizedPhrase: string
  phrase: string
} {
  const phrase = value.trim().replace(/\s+/g, " ")
  if (phrase.length === 0 || phrase.length > MAX_KEYWORD_LENGTH) {
    keywordError(
      "INVALID_KEYWORD",
      `Keyword phrases must contain 1 to ${MAX_KEYWORD_LENGTH} characters`,
    )
  }

  return {
    normalizedPhrase: normalizeKeywordPhrase(phrase),
    phrase,
  }
}

export function normalizeKeywordPlatforms(
  platforms: readonly Platform[],
): Platform[] {
  const selected = new Set(platforms)
  return (["x", "reddit", "hacker_news"] as const).filter((platform) =>
    selected.has(platform),
  )
}

function validatedPlatforms(platforms: readonly Platform[]): Platform[] {
  const normalized = normalizeKeywordPlatforms(platforms)
  if (normalized.length === 0) {
    keywordError(
      "INVALID_KEYWORD_PLATFORMS",
      "Select at least one platform for this keyword",
    )
  }
  return normalized
}

export function trackingSourceTypesForPlatforms(
  platforms: readonly Platform[],
): TrackingSourceType[] {
  return platforms.flatMap((platform) => {
    switch (platform) {
      case "x":
        return ["x"]
      case "reddit":
        return ["reddit_posts", "reddit_comments"]
      case "hacker_news":
        return ["hacker_news"]
    }
  })
}

export function keywordCapacity(input: {
  configuredCount: number
  paidKeywordLimit?: number | undefined
}): {
  canCreate: boolean
  limit: number
  limitReached: boolean
  remaining: number
} {
  if (!Number.isInteger(input.configuredCount) || input.configuredCount < 0) {
    throw new RangeError("configuredCount must be a non-negative integer")
  }
  if (
    input.paidKeywordLimit !== undefined &&
    (!Number.isInteger(input.paidKeywordLimit) || input.paidKeywordLimit < 0)
  ) {
    throw new RangeError("paidKeywordLimit must be a non-negative integer")
  }

  const limit = input.paidKeywordLimit ?? MAX_DRAFT_KEYWORDS
  const remaining = Math.max(0, limit - input.configuredCount)
  return {
    canCreate: remaining > 0,
    limit,
    limitReached: remaining === 0,
    remaining,
  }
}

export function desiredTrackingState(input: {
  hasActiveSubscription: boolean
  hasCurrentUsage: boolean
  keywordStatus: Exclude<KeywordStatus, "deleted">
  usageExhausted: boolean
}): DesiredTrackingState {
  if (input.keywordStatus === "paused") {
    return { pauseReason: "user", status: "paused" }
  }
  if (!input.hasActiveSubscription) {
    return { pauseReason: "paid", status: "paused" }
  }
  if (!input.hasCurrentUsage || input.usageExhausted) {
    return { pauseReason: "usage", status: "paused" }
  }
  return { status: "active" }
}

function planIdFrom(value: unknown): PlanId {
  if (value === "starter" || value === "growth" || value === "scale") {
    return value
  }
  keywordError("BILLING_STATE_INVALID", "The active plan is invalid")
}

async function requireCurrentCustomer(
  ctx: CustomerDatabaseCtx,
): Promise<CurrentCustomer> {
  const { viewer, workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
  return { userId: viewer.id, workspaceId: workspace.id }
}

async function readBillingKeywordState(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  now: number,
): Promise<BillingKeywordState> {
  const subscriptions = (await ctx.db
    .query("subscriptions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect()) as GenericRow[]
  const activeSubscription = subscriptions
    .sort(
      (left, right) =>
        (right.lastSyncedAt as number) - (left.lastSyncedAt as number),
    )
    .find(
      (subscription) =>
        effectiveEntitlementStatus(
          {
            currentPeriodEnd: subscription.currentPeriodEnd as number,
            entitlementStatus: subscription.entitlementStatus as
              "active" | "inactive",
            status: subscription.status as string,
          },
          now,
        ) === "active",
    )

  if (!activeSubscription) {
    return {
      hasActiveSubscription: false,
      hasCurrentUsage: false,
      keywordLimit: MAX_DRAFT_KEYWORDS,
      planId: "starter",
      usageExhausted: false,
    }
  }

  const planId = planIdFrom(activeSubscription.planId)
  const cycles = (await ctx.db
    .query("usageCycles")
    .withIndex("by_workspace_status_and_period_end", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["status", "open"]),
    )
    .collect()) as GenericRow[]
  const currentCycles = cycles
    .filter(
      (cycle) =>
        (cycle.periodStartAt as number) <= now &&
        (cycle.periodEndAt as number) > now,
    )
    .sort(
      (left, right) =>
        (right.periodStartAt as number) - (left.periodStartAt as number),
    )
  const linkedCycle = currentCycles.find(
    (cycle) => cycle.subscriptionId === activeSubscription._id,
  )
  const usageCycle =
    linkedCycle ??
    currentCycles.find(
      (cycle) =>
        cycle.subscriptionId === undefined &&
        (cycle.planSnapshot as { planId?: unknown } | undefined)?.planId ===
          planId,
    )

  if (!usageCycle) {
    return {
      hasActiveSubscription: true,
      hasCurrentUsage: false,
      keywordLimit: 0,
      planId,
      usageExhausted: true,
    }
  }

  const keywordLimit = usageCycle.keywordLimit as number
  const mentionLimit = usageCycle.mentionLimit as number
  const mentionsUsed = usageCycle.mentionsUsed as number
  if (
    !Number.isInteger(keywordLimit) ||
    keywordLimit < 0 ||
    !Number.isInteger(mentionLimit) ||
    mentionLimit < 0 ||
    !Number.isInteger(mentionsUsed) ||
    mentionsUsed < 0
  ) {
    keywordError("BILLING_STATE_INVALID", "The active usage cycle is invalid")
  }

  return {
    hasActiveSubscription: true,
    hasCurrentUsage: true,
    keywordLimit,
    planId,
    usageExhausted: mentionsUsed >= mentionLimit,
  }
}

async function configuredKeywords(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
): Promise<GenericRow[]> {
  const rows = (
    await Promise.all(
      (["active", "paused"] as const).map(
        async (status) =>
          (await ctx.db
            .query("keywords")
            .withIndex("by_workspace_status_and_created_at", (q) =>
              indexEquals(q, ["workspaceId", workspaceId], ["status", status]),
            )
            .collect()) as GenericRow[],
      ),
    )
  ).flat()
  return rows
    .filter((row) => row.deletedAt === undefined)
    .sort(
      (left, right) =>
        (right.updatedAt as number) - (left.updatedAt as number) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )
}

async function assertUniquePhrase(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  normalizedPhrase: string,
  exceptKeywordId?: KeywordId,
): Promise<void> {
  const matches = (await ctx.db
    .query("keywords")
    .withIndex("by_workspace_phrase_and_deleted_at", (q) =>
      indexEquals(
        q,
        ["workspaceId", workspaceId],
        ["normalizedPhrase", normalizedPhrase],
        ["deletedAt", undefined],
      ),
    )
    .take(2)) as GenericRow[]

  if (
    matches.some(
      (row) => row._id !== exceptKeywordId && row.status !== "deleted",
    )
  ) {
    keywordError(
      "KEYWORD_ALREADY_EXISTS",
      "A keyword with this phrase already exists",
    )
  }
}

async function keywordForWorkspace(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  keywordId: KeywordId,
): Promise<GenericRow> {
  const keyword = (await ctx.db.get("keywords", keywordId)) as GenericRow | null
  if (
    !keyword ||
    keyword.workspaceId !== workspaceId ||
    keyword.status === "deleted" ||
    keyword.deletedAt !== undefined
  ) {
    keywordError("KEYWORD_NOT_FOUND", "Keyword not found")
  }
  return keyword
}

function trackingStateFor(
  billing: BillingKeywordState,
  keywordStatus: Exclude<KeywordStatus, "deleted">,
): DesiredTrackingState {
  return desiredTrackingState({
    hasActiveSubscription: billing.hasActiveSubscription,
    hasCurrentUsage: billing.hasCurrentUsage,
    keywordStatus,
    usageExhausted: billing.usageExhausted,
  })
}

async function insertTrackingSource(
  ctx: MutationCtx,
  input: {
    billing: BillingKeywordState
    keywordId: KeywordId
    keywordStatus: Exclude<KeywordStatus, "deleted">
    now: number
    phrase: string
    sourceType: TrackingSourceType
    workspaceId: WorkspaceId
  },
): Promise<TrackingSourceId> {
  const schedule = createInitialTrackingSchedule({
    now: input.now,
    planId: input.billing.planId,
    sourceKey: `${String(input.workspaceId)}:${String(input.keywordId)}:${input.sourceType}`,
    sourceType: input.sourceType,
  })
  const trackingState = trackingStateFor(input.billing, input.keywordStatus)

  return (await ctx.db.insert("trackingSources", {
    ...schedule,
    createdAt: input.now,
    keywordId: input.keywordId,
    providerQuery: input.phrase,
    sourceType: input.sourceType,
    status: trackingState.status,
    ...(trackingState.pauseReason === undefined
      ? {}
      : { pauseReason: trackingState.pauseReason }),
    updatedAt: input.now,
    workspaceId: input.workspaceId,
  })) as TrackingSourceId
}

async function sourcesForKeyword(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  keywordId: KeywordId,
): Promise<GenericRow[]> {
  return (await ctx.db
    .query("trackingSources")
    .withIndex("by_keyword_and_source_type", (q) =>
      q.eq("keywordId", keywordId),
    )
    .collect()) as GenericRow[]
}

function sourceTypeOrder(value: unknown): number {
  switch (value) {
    case "x":
      return 0
    case "reddit_posts":
      return 1
    case "reddit_comments":
      return 2
    case "hacker_news":
      return 3
    default:
      return 4
  }
}

async function formatKeyword(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  keyword: GenericRow,
) {
  const sources = (await sourcesForKeyword(ctx, keyword._id as KeywordId))
    .filter(
      (source) => source.status !== "deleted" && source.deletedAt === undefined,
    )
    .sort(
      (left, right) =>
        sourceTypeOrder(left.sourceType) - sourceTypeOrder(right.sourceType),
    )
    .map((source) => ({
      id: source._id as TrackingSourceId,
      intervalMs: source.intervalMs as number,
      lastCheckedAt:
        (source.lastRunAt as number | undefined) ??
        (source.lastSuccessAt as number | undefined) ??
        null,
      lastError: (source.lastError as string | undefined) ?? null,
      nextExpectedAt: (source.nextRunAt as number | undefined) ?? null,
      pauseReason:
        (source.pauseReason as TrackingPauseReason | undefined) ?? null,
      sourceType: source.sourceType as TrackingSourceType,
      status: source.status as TrackingSourceStatus,
    }))

  return {
    createdAt: keyword.createdAt as number,
    id: keyword._id as KeywordId,
    pausedAt: (keyword.pausedAt as number | undefined) ?? null,
    phrase: keyword.phrase as string,
    platforms: keyword.platforms as Platform[],
    sources,
    status: keyword.status as KeywordStatus,
    updatedAt: keyword.updatedAt as number,
  }
}

async function syncTrackingSources(
  ctx: MutationCtx,
  input: {
    billing: BillingKeywordState
    keywordId: KeywordId
    keywordStatus: Exclude<KeywordStatus, "deleted">
    now: number
    phrase: string
    platforms: Platform[]
    workspaceId: WorkspaceId
  },
): Promise<void> {
  const desiredTypes = trackingSourceTypesForPlatforms(input.platforms)
  const desiredSet = new Set<TrackingSourceType>(desiredTypes)
  const currentSources = await sourcesForKeyword(ctx, input.keywordId)
  const retainedTypes = new Set<TrackingSourceType>()
  const desiredState = trackingStateFor(input.billing, input.keywordStatus)

  for (const source of currentSources) {
    const sourceType = source.sourceType as TrackingSourceType
    const sourceId = source._id as TrackingSourceId
    if (!desiredSet.has(sourceType) || retainedTypes.has(sourceType)) {
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode: "source_deleted",
        errorMessage: "Tracking source configuration was removed",
        now: input.now,
        source,
      })
      await ctx.db.patch("trackingSources", sourceId, {
        deletedAt: input.now,
        inProgressCursor: undefined,
        inProgressPage: undefined,
        inProgressWindowEndAt: undefined,
        inProgressWindowStartAt: undefined,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: undefined,
        status: "deleted",
        updatedAt: input.now,
      })
      continue
    }

    retainedTypes.add(sourceType)
    const reactivating =
      source.status === "deleted" || source.deletedAt !== undefined
    const providerQueryChanged = source.providerQuery !== input.phrase
    const schedule = reactivating
      ? createInitialTrackingSchedule({
          now: input.now,
          planId: input.billing.planId,
          sourceKey: `${String(input.workspaceId)}:${String(input.keywordId)}:${sourceType}`,
          sourceType,
        })
      : {}
    const preserveError =
      !reactivating &&
      !providerQueryChanged &&
      desiredState.status === "active" &&
      source.status === "error"
    if (
      providerQueryChanged ||
      reactivating ||
      desiredState.status !== "active"
    ) {
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode:
          desiredState.status === "active" ? "source_changed" : "source_paused",
        errorMessage:
          desiredState.status === "active"
            ? "Tracking source configuration changed"
            : "Tracking source became ineligible",
        now: input.now,
        source,
      })
    }

    await ctx.db.patch("trackingSources", sourceId, {
      ...schedule,
      deletedAt: undefined,
      providerQuery: input.phrase,
      status: preserveError ? "error" : desiredState.status,
      pauseReason: preserveError
        ? (source.pauseReason as TrackingPauseReason | undefined)
        : desiredState.pauseReason,
      ...(providerQueryChanged
        ? {
            backoffMs: 0,
            backoffUntil: undefined,
            consecutiveFailures: 0,
            inProgressCursor: undefined,
            inProgressPage: undefined,
            inProgressWindowEndAt: undefined,
            inProgressWindowStartAt: undefined,
            lastError: undefined,
            leaseExpiresAt: undefined,
            leaseToken: undefined,
            leaseVersion: (source.leaseVersion as number) + 1,
            nextRunAt: input.now,
          }
        : desiredState.status === "active" && !reactivating
          ? {}
          : {
              leaseExpiresAt: undefined,
              leaseToken: undefined,
            }),
      updatedAt: input.now,
    })
  }

  for (const sourceType of desiredTypes) {
    if (!retainedTypes.has(sourceType)) {
      await insertTrackingSource(ctx, {
        billing: input.billing,
        keywordId: input.keywordId,
        keywordStatus: input.keywordStatus,
        now: input.now,
        phrase: input.phrase,
        sourceType,
        workspaceId: input.workspaceId,
      })
    }
  }
  await syncUsagePausedWorkspaceMetric(ctx, input.workspaceId, input.now)
}

export async function replaceWorkspaceKeywordConfiguration(
  ctx: MutationCtx,
  input: {
    keywords: Array<{ phrase: string; platforms: Platform[] }>
    userId: UserId
    workspaceId: WorkspaceId
  },
): Promise<KeywordId[]> {
  const desired = input.keywords.map((keyword) => ({
    ...validatedPhrase(keyword.phrase),
    platforms: validatedPlatforms(keyword.platforms),
  }))
  const normalizedPhrases = new Set(
    desired.map((keyword) => keyword.normalizedPhrase),
  )
  if (desired.length === 0) {
    keywordError("INVALID_KEYWORD", "Onboarding requires at least one keyword")
  }
  if (normalizedPhrases.size !== desired.length) {
    keywordError(
      "KEYWORD_ALREADY_EXISTS",
      "Keyword phrases must be unique within the configuration",
    )
  }

  const now = Date.now()
  const [existing, billing] = await Promise.all([
    configuredKeywords(ctx, input.workspaceId),
    readBillingKeywordState(ctx, input.workspaceId, now),
  ])
  if (billing.hasActiveSubscription && !billing.hasCurrentUsage) {
    keywordError(
      "USAGE_CYCLE_REQUIRED",
      "The active subscription does not have a current usage cycle",
    )
  }
  const capacity = keywordCapacity({
    configuredCount: desired.length,
    ...(billing.hasActiveSubscription
      ? { paidKeywordLimit: billing.keywordLimit }
      : {}),
  })
  if (desired.length > capacity.limit) {
    keywordError(
      "KEYWORD_LIMIT_REACHED",
      billing.hasActiveSubscription
        ? "The active plan keyword limit has been reached"
        : `Keyword drafts are limited to ${MAX_DRAFT_KEYWORDS}`,
    )
  }

  const existingByPhrase = new Map(
    existing.map((keyword) => [keyword.normalizedPhrase as string, keyword]),
  )
  const desiredIds: KeywordId[] = []

  for (const keyword of existing) {
    if (normalizedPhrases.has(keyword.normalizedPhrase as string)) {
      continue
    }
    const keywordId = keyword._id as KeywordId
    await ctx.db.patch("keywords", keywordId, {
      deletedAt: now,
      status: "deleted",
      updatedAt: now,
    })
    for (const source of await sourcesForKeyword(ctx, keywordId)) {
      if (source.status === "deleted" && source.deletedAt !== undefined) {
        continue
      }
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode: "source_deleted",
        errorMessage: "Keyword configuration was removed",
        now,
        source,
      })
      await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
        deletedAt: now,
        inProgressCursor: undefined,
        inProgressPage: undefined,
        inProgressWindowEndAt: undefined,
        inProgressWindowStartAt: undefined,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: undefined,
        status: "deleted",
        updatedAt: now,
      })
    }
  }

  for (const keyword of desired) {
    const current = existingByPhrase.get(keyword.normalizedPhrase)
    if (current) {
      const keywordId = current._id as KeywordId
      const status = current.status as Exclude<KeywordStatus, "deleted">
      await ctx.db.patch("keywords", keywordId, {
        normalizedPhrase: keyword.normalizedPhrase,
        phrase: keyword.phrase,
        platforms: keyword.platforms,
        updatedAt: now,
      })
      await syncTrackingSources(ctx, {
        billing,
        keywordId,
        keywordStatus: status,
        now,
        phrase: keyword.phrase,
        platforms: keyword.platforms,
        workspaceId: input.workspaceId,
      })
      desiredIds.push(keywordId)
      continue
    }

    const keywordId = (await ctx.db.insert("keywords", {
      createdAt: now,
      createdByUserId: input.userId,
      normalizedPhrase: keyword.normalizedPhrase,
      phrase: keyword.phrase,
      platforms: keyword.platforms,
      status: "active",
      updatedAt: now,
      workspaceId: input.workspaceId,
    })) as KeywordId
    for (const sourceType of trackingSourceTypesForPlatforms(
      keyword.platforms,
    )) {
      await insertTrackingSource(ctx, {
        billing,
        keywordId,
        keywordStatus: "active",
        now,
        phrase: keyword.phrase,
        sourceType,
        workspaceId: input.workspaceId,
      })
    }
    desiredIds.push(keywordId)
  }

  await syncUsagePausedWorkspaceMetric(ctx, input.workspaceId, now)
  return desiredIds
}

export const listKeywords = authenticatedQuery({
  args: {},
  returns: v.array(keywordResultValidator),
  handler: async (ctx) => {
    const customer = await requireCurrentCustomer(ctx)
    const keywords = await configuredKeywords(ctx, customer.workspaceId)
    return await Promise.all(
      keywords.map(async (keyword) => await formatKeyword(ctx, keyword)),
    )
  },
})

export const getKeywordSummary = authenticatedQuery({
  args: {},
  returns: keywordSummaryValidator,
  handler: async (ctx) => {
    const customer = await requireCurrentCustomer(ctx)
    const now = Date.now()
    const [keywords, billing] = await Promise.all([
      configuredKeywords(ctx, customer.workspaceId),
      readBillingKeywordState(ctx, customer.workspaceId, now),
    ])
    const activeCount = keywords.filter(
      (keyword) => keyword.status === "active",
    ).length
    const pausedCount = keywords.filter(
      (keyword) => keyword.status === "paused",
    ).length
    const capacity = keywordCapacity({
      configuredCount: keywords.length,
      ...(billing.hasActiveSubscription
        ? { paidKeywordLimit: billing.keywordLimit }
        : {}),
    })
    const monitoringState:
      "active" | "paused" | "setup_required" | "unpaid" | "usage_limited" =
      keywords.length === 0
        ? "setup_required"
        : !billing.hasActiveSubscription
          ? "unpaid"
          : !billing.hasCurrentUsage || billing.usageExhausted
            ? "usage_limited"
            : activeCount === 0
              ? "paused"
              : "active"

    return {
      activeCount,
      canCreate: capacity.canCreate,
      count: keywords.length,
      limit: capacity.limit,
      limitReached: capacity.limitReached,
      monitoringState,
      pausedCount,
      remaining: capacity.remaining,
    }
  },
})

export const createKeyword = authenticatedMutation({
  args: {
    phrase: v.string(),
    platforms: v.array(platformValidator),
  },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const { normalizedPhrase, phrase } = validatedPhrase(args.phrase)
    const platforms = validatedPlatforms(args.platforms)
    const now = Date.now()
    const [keywords, billing] = await Promise.all([
      configuredKeywords(ctx, customer.workspaceId),
      readBillingKeywordState(ctx, customer.workspaceId, now),
      assertUniquePhrase(ctx, customer.workspaceId, normalizedPhrase),
    ])

    if (billing.hasActiveSubscription && !billing.hasCurrentUsage) {
      keywordError(
        "USAGE_CYCLE_REQUIRED",
        "The active subscription does not have a current usage cycle",
      )
    }
    const capacity = keywordCapacity({
      configuredCount: keywords.length,
      ...(billing.hasActiveSubscription
        ? { paidKeywordLimit: billing.keywordLimit }
        : {}),
    })
    if (!capacity.canCreate) {
      keywordError(
        "KEYWORD_LIMIT_REACHED",
        billing.hasActiveSubscription
          ? "The active plan keyword limit has been reached"
          : `Keyword drafts are limited to ${MAX_DRAFT_KEYWORDS}`,
      )
    }

    const keywordId = (await ctx.db.insert("keywords", {
      createdAt: now,
      createdByUserId: customer.userId,
      normalizedPhrase,
      phrase,
      platforms,
      status: "active",
      updatedAt: now,
      workspaceId: customer.workspaceId,
    })) as KeywordId

    for (const sourceType of trackingSourceTypesForPlatforms(platforms)) {
      await insertTrackingSource(ctx, {
        billing,
        keywordId,
        keywordStatus: "active",
        now,
        phrase,
        sourceType,
        workspaceId: customer.workspaceId,
      })
    }
    await syncUsagePausedWorkspaceMetric(ctx, customer.workspaceId, now)

    const keyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      keywordId,
    )
    return await formatKeyword(ctx, keyword)
  },
})

export const updateKeyword = authenticatedMutation({
  args: {
    keywordId: v.id("keywords"),
    phrase: v.string(),
    platforms: v.array(platformValidator),
  },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const keywordId = args.keywordId as KeywordId
    const existing = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      keywordId,
    )
    const { normalizedPhrase, phrase } = validatedPhrase(args.phrase)
    const platforms = validatedPlatforms(args.platforms)
    await assertUniquePhrase(
      ctx,
      customer.workspaceId,
      normalizedPhrase,
      keywordId,
    )

    const now = Date.now()
    const billing = await readBillingKeywordState(
      ctx,
      customer.workspaceId,
      now,
    )
    const keywordStatus = existing.status as Exclude<KeywordStatus, "deleted">
    await ctx.db.patch("keywords", keywordId, {
      normalizedPhrase,
      phrase,
      platforms,
      updatedAt: now,
    })
    await syncTrackingSources(ctx, {
      billing,
      keywordId,
      keywordStatus,
      now,
      phrase,
      platforms,
      workspaceId: customer.workspaceId,
    })

    const updated = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      keywordId,
    )
    return await formatKeyword(ctx, updated)
  },
})

export const pauseKeyword = authenticatedMutation({
  args: { keywordId: v.id("keywords") },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const keywordId = args.keywordId as KeywordId
    await keywordForWorkspace(ctx, customer.workspaceId, keywordId)
    const now = Date.now()

    await ctx.db.patch("keywords", keywordId, {
      pausedAt: now,
      status: "paused",
      updatedAt: now,
    })
    const sources = await sourcesForKeyword(ctx, keywordId)
    for (const source of sources) {
      if (source.status === "deleted" || source.deletedAt !== undefined) {
        continue
      }
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode: "source_paused",
        errorMessage: "Keyword was paused by the user",
        now,
        source,
      })
      await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: "user",
        status: "paused",
        updatedAt: now,
      })
    }
    await syncUsagePausedWorkspaceMetric(ctx, customer.workspaceId, now)

    const keyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      keywordId,
    )
    return await formatKeyword(ctx, keyword)
  },
})

export const resumeKeyword = authenticatedMutation({
  args: { keywordId: v.id("keywords") },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const keywordId = args.keywordId as KeywordId
    const existingKeyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      keywordId,
    )
    const now = Date.now()
    const billing = await readBillingKeywordState(
      ctx,
      customer.workspaceId,
      now,
    )
    if (
      existingKeyword.status !== "active" &&
      billing.hasActiveSubscription &&
      billing.keywordLimit <= MAX_DRAFT_KEYWORDS
    ) {
      if (billing.keywordLimit === 0) {
        keywordError(
          "KEYWORD_LIMIT_REACHED",
          "The active plan keyword limit has been reached",
        )
      }
      const activeKeywords = await ctx.db
        .query("keywords")
        .withIndex("by_workspace_status_and_created_at", (q) =>
          indexEquals(
            q,
            ["workspaceId", customer.workspaceId],
            ["status", "active"],
          ),
        )
        .take(billing.keywordLimit)
      if (activeKeywords.length >= billing.keywordLimit) {
        keywordError(
          "KEYWORD_LIMIT_REACHED",
          "The active plan keyword limit has been reached",
        )
      }
    }
    const trackingState = trackingStateFor(billing, "active")

    await ctx.db.patch("keywords", keywordId, {
      pausedAt: undefined,
      status: "active",
      updatedAt: now,
    })
    const sources = await sourcesForKeyword(ctx, keywordId)
    for (const source of sources) {
      if (source.status === "deleted" || source.deletedAt !== undefined) {
        continue
      }
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode: "source_changed",
        errorMessage: "Keyword was resumed with a new tracking lease",
        now,
        source,
      })
      await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: trackingState.pauseReason,
        status: trackingState.status,
        updatedAt: now,
      })
    }
    await syncUsagePausedWorkspaceMetric(ctx, customer.workspaceId, now)

    const keyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      keywordId,
    )
    return await formatKeyword(ctx, keyword)
  },
})

export const deleteKeyword = authenticatedMutation({
  args: { keywordId: v.id("keywords") },
  returns: deletedKeywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const keywordId = args.keywordId as KeywordId
    await keywordForWorkspace(ctx, customer.workspaceId, keywordId)
    const now = Date.now()

    const savedViews = await ctx.db
      .query("savedViews")
      .withIndex("by_workspace_deleted_and_updated_at", (q) =>
        indexEquals(
          q,
          ["workspaceId", customer.workspaceId],
          ["deletedAt", undefined],
        ),
      )
      .take(MAX_ACTIVE_SAVED_VIEWS + 1)
    if (savedViews.length > MAX_ACTIVE_SAVED_VIEWS) {
      keywordError(
        "KEYWORD_DELETE_FAILED",
        "Saved view count exceeds the supported maximum",
      )
    }
    for (const savedView of savedViews) {
      const filters = savedView.filters as SavedViewFilters
      if (!filters.keywordIds?.includes(keywordId)) {
        continue
      }
      await ctx.db.patch("savedViews", savedView._id, {
        filters: removeKeywordFromSavedViewFilters(filters, keywordId),
        updatedAt: now,
      })
    }
    await ctx.db.patch("keywords", keywordId, {
      deletedAt: now,
      status: "deleted",
      updatedAt: now,
    })
    const sources = await sourcesForKeyword(ctx, keywordId)
    for (const source of sources) {
      if (source.status === "deleted" && source.deletedAt !== undefined) {
        continue
      }
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode: "source_deleted",
        errorMessage: "Keyword was deleted",
        now,
        source,
      })
      await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
        deletedAt: now,
        inProgressCursor: undefined,
        inProgressPage: undefined,
        inProgressWindowEndAt: undefined,
        inProgressWindowStartAt: undefined,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        pauseReason: undefined,
        status: "deleted",
        updatedAt: now,
      })
    }
    await syncUsagePausedWorkspaceMetric(ctx, customer.workspaceId, now)

    return { id: keywordId, status: "deleted" as const }
  },
})
