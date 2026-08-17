import type { UserIdentity } from "convex/server"
import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { env, type MutationCtx, type QueryCtx } from "./_generated/server"
import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { syncUsagePausedWorkspaceMetric } from "./lib/operationalMetrics"
import {
  resolveWorkspaceAllowance,
  type WorkspaceAllowance,
} from "./lib/workspaceAccess"
import { readProviderRuntimeConfiguration } from "./scheduling/config"
import {
  createInitialTrackingSchedule,
  type TrackingSourceType,
} from "./scheduling/model"
import { finalizeInvalidatedTrackingProviderRun } from "./scheduling/providerRuns"
import { resolveCurrentCustomer } from "./users"

export const MAX_DRAFT_KEYWORDS = 10
const MAX_KEYWORD_LENGTH = 160
const MAX_DESCRIPTION_LENGTH = 160
const MAX_ACTIVE_SAVED_VIEWS = 50
const MAX_SOURCES_PER_KEYWORD = 8

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
const keywordPauseReasonValidator = v.union(
  v.literal("user"),
  v.literal("capacity"),
  v.literal("payment"),
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
  v.literal("capacity"),
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
  description: v.union(v.string(), v.null()),
  id: v.id("keywords"),
  pauseReason: v.union(keywordPauseReasonValidator, v.null()),
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

type UserId = Id<"users">
type WorkspaceId = Id<"workspaces">
type KeywordId = Id<"keywords">
type Platform = "x" | "reddit" | "hacker_news"
type KeywordPauseReason = "user" | "capacity" | "payment"
type TrackingPauseReason = "paid" | "user" | "capacity" | "usage" | "config"
type CustomerDatabaseCtx = {
  db: QueryCtx["db"] | MutationCtx["db"]
  identity: UserIdentity
}

type DesiredSourceState = {
  pauseReason?: TrackingPauseReason
  status: "active" | "paused"
}

function keywordError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

async function currentCustomer(ctx: CustomerDatabaseCtx) {
  const { viewer, workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
  return { userId: viewer.id, workspaceId: workspace.id }
}

export function normalizeKeywordPhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en")
}

function validatedPhrase(value: string) {
  const phrase = value.trim().replace(/\s+/g, " ")
  if (!phrase || phrase.length > MAX_KEYWORD_LENGTH) {
    keywordError(
      "INVALID_KEYWORD",
      `Keyword phrases must contain 1 to ${MAX_KEYWORD_LENGTH} characters`,
    )
  }
  return { normalizedPhrase: normalizeKeywordPhrase(phrase), phrase }
}

function validatedDescription(value: string | undefined): string | undefined {
  const description = value?.trim() ?? ""
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    keywordError(
      "INVALID_KEYWORD_DESCRIPTION",
      `Keyword descriptions can contain at most ${MAX_DESCRIPTION_LENGTH} characters`,
    )
  }
  return description || undefined
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
    if (platform === "x") return ["x"]
    if (platform === "reddit") return ["reddit_posts", "reddit_comments"]
    return ["hacker_news"]
  })
}

async function configuredKeywords(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
): Promise<Doc<"keywords">[]> {
  const rows = (
    await Promise.all(
      (["active", "paused"] as const).map(async (status) =>
        ctx.db
          .query("keywords")
          .withIndex("by_workspace_status_and_created_at", (q) =>
            q.eq("workspaceId", workspaceId).eq("status", status),
          )
          .take(MAX_DRAFT_KEYWORDS + 1),
      ),
    )
  ).flat()
  const configured = rows.filter((row) => row.deletedAt === undefined)
  if (configured.length > MAX_DRAFT_KEYWORDS) {
    keywordError(
      "KEYWORD_CONFIGURATION_INVALID",
      "Workspace keyword count exceeds the supported maximum",
    )
  }
  return configured.sort(
    (left, right) =>
      (left.activationPriority ?? Number.MAX_SAFE_INTEGER) -
        (right.activationPriority ?? Number.MAX_SAFE_INTEGER) ||
      left.createdAt - right.createdAt ||
      String(left._id).localeCompare(String(right._id), "en"),
  )
}

async function sourcesForKeyword(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  keywordId: KeywordId,
): Promise<Doc<"trackingSources">[]> {
  return await ctx.db
    .query("trackingSources")
    .withIndex("by_keyword_and_source_type", (q) =>
      q.eq("keywordId", keywordId),
    )
    .take(MAX_SOURCES_PER_KEYWORD)
}

function sourceState(
  allowance: WorkspaceAllowance,
  keyword: Pick<Doc<"keywords">, "status" | "pauseReason">,
): DesiredSourceState {
  if (keyword.status === "paused") {
    if (keyword.pauseReason === "capacity") {
      return { pauseReason: "capacity", status: "paused" }
    }
    if (keyword.pauseReason === "payment") {
      return { pauseReason: "paid", status: "paused" }
    }
    return { pauseReason: "user", status: "paused" }
  }
  if (allowance.kind === "none") {
    return { pauseReason: allowance.pauseReason, status: "paused" }
  }
  if (allowance.exhausted) {
    return { pauseReason: "usage", status: "paused" }
  }
  return { status: "active" }
}

async function insertSource(
  ctx: MutationCtx,
  input: {
    allowance: WorkspaceAllowance
    keyword: Doc<"keywords">
    now: number
    sourceType: TrackingSourceType
  },
): Promise<void> {
  const state = sourceState(input.allowance, input.keyword)
  const schedule = createInitialTrackingSchedule({
    now: input.now,
    planId: input.allowance.planId,
    sourceKey: `${String(input.keyword.workspaceId)}:${String(input.keyword._id)}:${input.sourceType}`,
    sourceType: input.sourceType,
  })
  await ctx.db.insert("trackingSources", {
    ...schedule,
    createdAt: input.now,
    keywordId: input.keyword._id,
    providerQuery: input.keyword.phrase,
    sourceType: input.sourceType,
    status: state.status,
    ...(state.pauseReason === undefined
      ? {}
      : { pauseReason: state.pauseReason }),
    updatedAt: input.now,
    workspaceId: input.keyword.workspaceId,
  })
}

async function syncKeywordSources(
  ctx: MutationCtx,
  keyword: Doc<"keywords">,
  allowance: WorkspaceAllowance,
  now: number,
): Promise<void> {
  const desiredTypes = trackingSourceTypesForPlatforms(keyword.platforms)
  const desiredSet = new Set(desiredTypes)
  const retained = new Set<TrackingSourceType>()
  const state = sourceState(allowance, keyword)

  for (const source of await sourcesForKeyword(ctx, keyword._id)) {
    const sourceType = source.sourceType as TrackingSourceType
    if (!desiredSet.has(sourceType) || retained.has(sourceType)) {
      if (source.status !== "deleted" || source.deletedAt === undefined) {
        await finalizeInvalidatedTrackingProviderRun(ctx, {
          errorCode: "source_deleted",
          errorMessage: "Tracking source configuration was removed",
          now,
          source,
        })
        await ctx.db.patch("trackingSources", source._id, {
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
      continue
    }
    retained.add(sourceType)
    const reactivating =
      source.status === "deleted" || source.deletedAt !== undefined
    const queryChanged = source.providerQuery !== keyword.phrase
    if (queryChanged || reactivating || state.status === "paused") {
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode:
          state.status === "active" ? "source_changed" : "source_paused",
        errorMessage:
          state.status === "active"
            ? "Tracking source configuration changed"
            : "Tracking source became ineligible",
        now,
        source,
      })
    }
    const schedule = reactivating
      ? createInitialTrackingSchedule({
          now,
          planId: allowance.planId,
          sourceKey: `${String(keyword.workspaceId)}:${String(keyword._id)}:${sourceType}`,
          sourceType,
        })
      : {}
    const isHealing =
      state.status === "active" &&
      (source.status === "error" || source.pauseReason === "config")
    await ctx.db.patch("trackingSources", source._id, {
      ...schedule,
      deletedAt: undefined,
      ...(reactivating
        ? {
            inProgressCursor: undefined,
            inProgressPage: undefined,
            inProgressWindowEndAt: undefined,
            inProgressWindowStartAt: undefined,
          }
        : {}),
      providerQuery: keyword.phrase,
      status: state.status,
      pauseReason: state.pauseReason,
      ...(queryChanged || isHealing
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
            ...(queryChanged ? { leaseVersion: source.leaseVersion + 1 } : {}),
            nextRunAt: now,
          }
        : state.status === "active" && !reactivating
          ? {}
          : { leaseExpiresAt: undefined, leaseToken: undefined }),
      updatedAt: now,
    })
  }

  for (const sourceType of desiredTypes) {
    if (!retained.has(sourceType)) {
      await insertSource(ctx, { allowance, keyword, now, sourceType })
    }
  }
}

function activationOrder(
  left: Doc<"keywords">,
  right: Doc<"keywords">,
): number {
  return (
    Number(Boolean(right.brandCandidate)) -
      Number(Boolean(left.brandCandidate)) ||
    (left.activationPriority ?? Number.MAX_SAFE_INTEGER) -
      (right.activationPriority ?? Number.MAX_SAFE_INTEGER) ||
    left.createdAt - right.createdAt ||
    String(left._id).localeCompare(String(right._id), "en")
  )
}

export async function reconcileWorkspaceKeywords(
  ctx: MutationCtx,
  input: { now: number; workspaceId: WorkspaceId },
): Promise<{ activeCount: number; pausedCount: number }> {
  const [keywords, allowance] = await Promise.all([
    configuredKeywords(ctx, input.workspaceId),
    resolveWorkspaceAllowance(ctx, input.workspaceId, input.now),
  ])
  const eligible = keywords
    .filter((keyword) => keyword.pauseReason !== "user")
    .sort(activationOrder)
  const activeIds = new Set(
    (allowance.kind === "none"
      ? []
      : eligible.slice(0, allowance.keywordLimit)
    ).map((keyword) => String(keyword._id)),
  )

  for (const keyword of keywords) {
    const userPaused = keyword.pauseReason === "user"
    const active = activeIds.has(String(keyword._id))
    const pauseReason: KeywordPauseReason | undefined = active
      ? undefined
      : userPaused
        ? "user"
        : allowance.kind === "none"
          ? "payment"
          : "capacity"
    const status = active ? "active" : "paused"
    await ctx.db.patch("keywords", keyword._id, {
      pauseReason,
      pausedAt: active ? undefined : (keyword.pausedAt ?? input.now),
      status,
      updatedAt: input.now,
    })
    const updated = { ...keyword, pauseReason, status } as Doc<"keywords">
    await syncKeywordSources(ctx, updated, allowance, input.now)
  }
  await syncUsagePausedWorkspaceMetric(ctx, input.workspaceId, input.now)
  return {
    activeCount: activeIds.size,
    pausedCount: keywords.length - activeIds.size,
  }
}

async function assertUniquePhrase(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  normalizedPhrase: string,
  exceptKeywordId?: KeywordId,
): Promise<void> {
  const rows = await ctx.db
    .query("keywords")
    .withIndex("by_workspace_phrase_and_deleted_at", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("normalizedPhrase", normalizedPhrase)
        .eq("deletedAt", undefined),
    )
    .take(2)
  if (
    rows.some((row) => row._id !== exceptKeywordId && row.status !== "deleted")
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
): Promise<Doc<"keywords">> {
  const keyword = await ctx.db.get("keywords", keywordId)
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

async function removeFromSavedViews(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  keywordId: KeywordId,
  now: number,
): Promise<void> {
  const views = await ctx.db
    .query("savedViews")
    .withIndex("by_workspace_deleted_and_updated_at", (q) =>
      q.eq("workspaceId", workspaceId).eq("deletedAt", undefined),
    )
    .take(MAX_ACTIVE_SAVED_VIEWS + 1)
  if (views.length > MAX_ACTIVE_SAVED_VIEWS) {
    keywordError(
      "KEYWORD_UPDATE_FAILED",
      "Saved view count exceeds the supported maximum",
    )
  }
  for (const view of views) {
    if (!view.filters.keywordIds?.includes(keywordId)) continue
    const keywordIds = view.filters.keywordIds.filter((id) => id !== keywordId)
    const { keywordIds: _removedKeywordIds, ...otherFilters } = view.filters
    await ctx.db.patch("savedViews", view._id, {
      filters: {
        ...otherFilters,
        ...(keywordIds.length ? { keywordIds } : {}),
      },
      updatedAt: now,
    })
  }
}

async function deleteKeywordRow(
  ctx: MutationCtx,
  keyword: Doc<"keywords">,
  now: number,
): Promise<void> {
  await removeFromSavedViews(ctx, keyword.workspaceId, keyword._id, now)
  await ctx.db.patch("keywords", keyword._id, {
    deletedAt: now,
    pauseReason: undefined,
    status: "deleted",
    updatedAt: now,
  })
  for (const source of await sourcesForKeyword(ctx, keyword._id)) {
    if (source.status === "deleted" && source.deletedAt !== undefined) continue
    await finalizeInvalidatedTrackingProviderRun(ctx, {
      errorCode: "source_deleted",
      errorMessage: "Keyword configuration was removed",
      now,
      source,
    })
    await ctx.db.patch("trackingSources", source._id, {
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

export async function replaceWorkspaceKeywordConfiguration(
  ctx: MutationCtx,
  input: {
    keywords: Array<{
      brandCandidate?: boolean
      description?: string
      phrase: string
      platforms: Platform[]
      selectionOrder: number
    }>
    userId: UserId
    workspaceId: WorkspaceId
  },
): Promise<{
  activeCount: number
  keywordIds: KeywordId[]
  pausedCount: number
}> {
  if (
    input.keywords.length === 0 ||
    input.keywords.length > MAX_DRAFT_KEYWORDS
  ) {
    keywordError(
      "INVALID_KEYWORD",
      `Select 1 to ${MAX_DRAFT_KEYWORDS} keywords`,
    )
  }
  const desired = input.keywords.map((keyword, index) => ({
    ...validatedPhrase(keyword.phrase),
    brandCandidate: keyword.brandCandidate === true,
    description: validatedDescription(keyword.description),
    platforms: validatedPlatforms(keyword.platforms),
    selectionOrder:
      Number.isInteger(keyword.selectionOrder) && keyword.selectionOrder >= 0
        ? keyword.selectionOrder
        : index,
  }))
  if (
    new Set(desired.map(({ normalizedPhrase }) => normalizedPhrase)).size !==
    desired.length
  ) {
    keywordError(
      "KEYWORD_ALREADY_EXISTS",
      "Keyword phrases must be unique within the configuration",
    )
  }

  const now = Date.now()
  const existing = await configuredKeywords(ctx, input.workspaceId)
  const existingByPhrase = new Map(
    existing.map((row) => [row.normalizedPhrase, row]),
  )
  const desiredPhrases = new Set(desired.map((row) => row.normalizedPhrase))
  for (const keyword of existing) {
    if (!desiredPhrases.has(keyword.normalizedPhrase)) {
      await deleteKeywordRow(ctx, keyword, now)
    }
  }

  const ordered = [...desired].sort(
    (left, right) =>
      Number(right.brandCandidate) - Number(left.brandCandidate) ||
      left.selectionOrder - right.selectionOrder,
  )
  const priorityByPhrase = new Map(
    ordered.map((keyword, priority) => [keyword.normalizedPhrase, priority]),
  )
  const keywordIds: KeywordId[] = []
  for (const keyword of desired) {
    const current = existingByPhrase.get(keyword.normalizedPhrase)
    const document = {
      activationPriority: priorityByPhrase.get(keyword.normalizedPhrase)!,
      brandCandidate: keyword.brandCandidate,
      normalizedPhrase: keyword.normalizedPhrase,
      pauseReason: undefined,
      pausedAt: undefined,
      phrase: keyword.phrase,
      platforms: keyword.platforms,
      status: "paused" as const,
      updatedAt: now,
    }
    if (current) {
      await ctx.db.patch("keywords", current._id, {
        ...document,
        description: keyword.description,
      })
      keywordIds.push(current._id)
    } else {
      keywordIds.push(
        await ctx.db.insert("keywords", {
          activationPriority: document.activationPriority,
          brandCandidate: document.brandCandidate,
          ...(keyword.description === undefined
            ? {}
            : { description: keyword.description }),
          createdAt: now,
          createdByUserId: input.userId,
          normalizedPhrase: document.normalizedPhrase,
          phrase: document.phrase,
          platforms: document.platforms,
          status: document.status,
          updatedAt: now,
          workspaceId: input.workspaceId,
        }),
      )
    }
  }
  const counts = await reconcileWorkspaceKeywords(ctx, {
    now,
    workspaceId: input.workspaceId,
  })
  return { ...counts, keywordIds }
}

function sourceOrder(value: TrackingSourceType): number {
  return ["x", "reddit_posts", "reddit_comments", "hacker_news"].indexOf(value)
}

async function formatKeyword(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  keyword: Doc<"keywords">,
) {
  const sources = (await sourcesForKeyword(ctx, keyword._id))
    .filter(
      (source) => source.status !== "deleted" && source.deletedAt === undefined,
    )
    .sort(
      (left, right) =>
        sourceOrder(left.sourceType) - sourceOrder(right.sourceType),
    )
    .map((source) => {
      let status = source.status
      let pauseReason =
        (source.pauseReason as TrackingPauseReason | undefined) ?? null
      let lastError = source.lastError ?? null

      if (keyword.status === "active") {
        if (pauseReason === "config") {
          const config = readProviderRuntimeConfiguration(
            env,
            source.sourceType as TrackingSourceType,
          )
          if (config.state === "configured") {
            pauseReason = null
            if (status === "paused") {
              status = "active"
            }
          }
        }
      }

      return {
        id: source._id,
        intervalMs: source.intervalMs,
        lastCheckedAt: source.lastRunAt ?? source.lastSuccessAt ?? null,
        lastError,
        nextExpectedAt: source.nextRunAt ?? null,
        pauseReason,
        sourceType: source.sourceType,
        status,
      }
    })
  return {
    createdAt: keyword.createdAt,
    description: keyword.description ?? null,
    id: keyword._id,
    pauseReason:
      (keyword.pauseReason as KeywordPauseReason | undefined) ?? null,
    pausedAt: keyword.pausedAt ?? null,
    phrase: keyword.phrase,
    platforms: keyword.platforms,
    sources,
    status: keyword.status,
    updatedAt: keyword.updatedAt,
  }
}

export const listKeywords = authenticatedQuery({
  args: {},
  returns: v.array(keywordResultValidator),
  handler: async (ctx) => {
    const customer = await currentCustomer(ctx)
    const rows = await configuredKeywords(ctx, customer.workspaceId)
    return await Promise.all(
      rows.map(async (row) => await formatKeyword(ctx, row)),
    )
  },
})

export const getKeywordSummary = authenticatedQuery({
  args: { now: v.number() },
  returns: keywordSummaryValidator,
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.now) || args.now < 0) {
      keywordError("INVALID_KEYWORD_INPUT", "Current time is invalid")
    }
    const customer = await currentCustomer(ctx)
    const [keywords, allowance] = await Promise.all([
      configuredKeywords(ctx, customer.workspaceId),
      resolveWorkspaceAllowance(ctx, customer.workspaceId, args.now),
    ])
    const activeCount = keywords.filter(
      (keyword) => keyword.status === "active",
    ).length
    const monitoringState:
      "active" | "paused" | "setup_required" | "unpaid" | "usage_limited" =
      keywords.length === 0
        ? "setup_required"
        : allowance.kind === "none"
          ? "unpaid"
          : allowance.exhausted
            ? "usage_limited"
            : activeCount === 0
              ? "paused"
              : "active"
    const remaining = Math.max(0, MAX_DRAFT_KEYWORDS - keywords.length)
    return {
      activeCount,
      canCreate: remaining > 0,
      count: keywords.length,
      limit: allowance.keywordLimit,
      limitReached: activeCount >= allowance.keywordLimit,
      monitoringState,
      pausedCount: keywords.length - activeCount,
      remaining,
    }
  },
})

export const createKeyword = authenticatedMutation({
  args: {
    description: v.optional(v.string()),
    phrase: v.string(),
    platforms: v.array(platformValidator),
  },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await currentCustomer(ctx)
    const { normalizedPhrase, phrase } = validatedPhrase(args.phrase)
    const description = validatedDescription(args.description)
    const platforms = validatedPlatforms(args.platforms)
    const existing = await configuredKeywords(ctx, customer.workspaceId)
    if (existing.length >= MAX_DRAFT_KEYWORDS) {
      keywordError(
        "KEYWORD_LIMIT_REACHED",
        `Workspaces support up to ${MAX_DRAFT_KEYWORDS} configured keywords`,
      )
    }
    await assertUniquePhrase(ctx, customer.workspaceId, normalizedPhrase)
    const now = Date.now()
    const keywordId = await ctx.db.insert("keywords", {
      activationPriority: existing.length,
      createdAt: now,
      createdByUserId: customer.userId,
      ...(description === undefined ? {} : { description }),
      normalizedPhrase,
      pauseReason: "capacity",
      pausedAt: now,
      phrase,
      platforms,
      status: "paused",
      updatedAt: now,
      workspaceId: customer.workspaceId,
    })
    await reconcileWorkspaceKeywords(ctx, {
      now,
      workspaceId: customer.workspaceId,
    })
    return await formatKeyword(
      ctx,
      await keywordForWorkspace(ctx, customer.workspaceId, keywordId),
    )
  },
})

export const updateKeyword = authenticatedMutation({
  args: {
    description: v.optional(v.string()),
    keywordId: v.id("keywords"),
    phrase: v.string(),
    platforms: v.array(platformValidator),
  },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await currentCustomer(ctx)
    const existing = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      args.keywordId,
    )
    const { normalizedPhrase, phrase } = validatedPhrase(args.phrase)
    const description = validatedDescription(args.description)
    const platforms = validatedPlatforms(args.platforms)
    await assertUniquePhrase(
      ctx,
      customer.workspaceId,
      normalizedPhrase,
      args.keywordId,
    )
    const now = Date.now()
    await ctx.db.patch("keywords", args.keywordId, {
      description,
      normalizedPhrase,
      phrase,
      platforms,
      updatedAt: now,
    })
    const allowance = await resolveWorkspaceAllowance(
      ctx,
      customer.workspaceId,
      now,
    )
    await syncKeywordSources(
      ctx,
      { ...existing, normalizedPhrase, phrase, platforms, updatedAt: now },
      allowance,
      now,
    )
    return await formatKeyword(
      ctx,
      await keywordForWorkspace(ctx, customer.workspaceId, args.keywordId),
    )
  },
})

export const pauseKeyword = authenticatedMutation({
  args: { keywordId: v.id("keywords") },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await currentCustomer(ctx)
    const keyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      args.keywordId,
    )
    const now = Date.now()
    await ctx.db.patch("keywords", args.keywordId, {
      pauseReason: "user",
      pausedAt: now,
      status: "paused",
      updatedAt: now,
    })
    const allowance = await resolveWorkspaceAllowance(
      ctx,
      customer.workspaceId,
      now,
    )
    await syncKeywordSources(
      ctx,
      {
        ...keyword,
        pauseReason: "user",
        pausedAt: now,
        status: "paused",
        updatedAt: now,
      },
      allowance,
      now,
    )
    await syncUsagePausedWorkspaceMetric(ctx, customer.workspaceId, now)
    return await formatKeyword(
      ctx,
      await keywordForWorkspace(ctx, customer.workspaceId, args.keywordId),
    )
  },
})

export const resumeKeyword = authenticatedMutation({
  args: { keywordId: v.id("keywords") },
  returns: keywordResultValidator,
  handler: async (ctx, args) => {
    const customer = await currentCustomer(ctx)
    await keywordForWorkspace(ctx, customer.workspaceId, args.keywordId)
    const now = Date.now()
    const [keywords, allowance] = await Promise.all([
      configuredKeywords(ctx, customer.workspaceId),
      resolveWorkspaceAllowance(ctx, customer.workspaceId, now),
    ])
    if (allowance.kind === "none") {
      keywordError(
        "MONITORING_ACCESS_REQUIRED",
        "Start the free evaluation or activate a paid subscription first",
      )
    }
    const occupied = keywords.filter(
      (keyword) =>
        keyword.status === "active" && keyword._id !== args.keywordId,
    ).length
    if (occupied >= allowance.keywordLimit) {
      keywordError(
        "KEYWORD_LIMIT_REACHED",
        "Pause an active keyword before activating this one",
      )
    }
    await ctx.db.patch("keywords", args.keywordId, {
      pauseReason: undefined,
      pausedAt: undefined,
      status: "active",
      updatedAt: now,
    })
    const keyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      args.keywordId,
    )
    await syncKeywordSources(ctx, keyword, allowance, now)
    await syncUsagePausedWorkspaceMetric(ctx, customer.workspaceId, now)
    return await formatKeyword(ctx, keyword)
  },
})

export const deleteKeyword = authenticatedMutation({
  args: { keywordId: v.id("keywords") },
  returns: v.object({ id: v.id("keywords"), status: v.literal("deleted") }),
  handler: async (ctx, args) => {
    const customer = await currentCustomer(ctx)
    const keyword = await keywordForWorkspace(
      ctx,
      customer.workspaceId,
      args.keywordId,
    )
    const now = Date.now()
    await deleteKeywordRow(ctx, keyword, now)
    await reconcileWorkspaceKeywords(ctx, {
      now,
      workspaceId: customer.workspaceId,
    })
    return { id: args.keywordId, status: "deleted" as const }
  },
})
