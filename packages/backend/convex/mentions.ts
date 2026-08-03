import type { UserIdentity } from "convex/server"
import { ConvexError, v } from "convex/values"

import { effectiveEntitlementStatus } from "./billing/lifecycle"
import type { Doc, Id } from "./_generated/dataModel"
import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { type MutationCtx, type QueryCtx } from "./_generated/server"
import { resolveCurrentCustomer } from "./users"

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50
const MAX_FILTER_VALUES = 50
const MAX_SEARCH_LENGTH = 200
const MAX_CURSOR_LENGTH = 100_000
const MENTION_SCAN_MAX_BYTES = 4 * 1024 * 1024
const MENTION_SCAN_MAX_ROWS = 1_000
const CURSOR_VERSION = 1

const platformValidator = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("hacker_news"),
)
const mentionStatusValidator = v.union(
  v.literal("new"),
  v.literal("saved"),
  v.literal("dismissed"),
)
const mentionSortValidator = v.union(
  v.literal("newest"),
  v.literal("oldest"),
  v.literal("most_engaged"),
)

const mentionFiltersValidator = v.object({
  categoryIds: v.optional(v.array(v.id("categories"))),
  keywordIds: v.optional(v.array(v.id("keywords"))),
  mentionStatuses: v.optional(v.array(mentionStatusValidator)),
  platforms: v.optional(v.array(platformValidator)),
  publishedAfter: v.optional(v.number()),
  publishedBefore: v.optional(v.number()),
})

const categoryResultValidator = v.object({
  colorToken: v.optional(v.string()),
  id: v.id("categories"),
  name: v.string(),
  systemKey: v.optional(v.string()),
})

const matchedKeywordResultValidator = v.object({
  id: v.id("keywords"),
  phrase: v.string(),
})

const mentionResultValidator = v.object({
  authorDisplayName: v.optional(v.string()),
  authorHandle: v.optional(v.string()),
  body: v.string(),
  canonicalUrl: v.string(),
  category: v.union(categoryResultValidator, v.null()),
  commentCount: v.optional(v.number()),
  engagementScore: v.number(),
  id: v.id("mentions"),
  likeCount: v.optional(v.number()),
  matchedKeywords: v.array(matchedKeywordResultValidator),
  platform: platformValidator,
  pointCount: v.optional(v.number()),
  publishedAt: v.number(),
  replyCount: v.optional(v.number()),
  repostCount: v.optional(v.number()),
  status: mentionStatusValidator,
  title: v.optional(v.string()),
})

const mentionMonitoringStateValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("setup_required"),
  v.literal("usage_limited"),
)

const mentionPageResultValidator = v.object({
  isDone: v.boolean(),
  items: v.array(mentionResultValidator),
  monitoringState: mentionMonitoringStateValidator,
  nextCursor: v.union(v.string(), v.null()),
  totalCount: v.optional(v.number()),
})

type UserId = Id<"users">
type WorkspaceId = Id<"workspaces">
type MentionId = Id<"mentions">
type KeywordId = Id<"keywords">
type CategoryId = Id<"categories">
type Platform = "x" | "reddit" | "hacker_news"
type MentionStatus = "new" | "saved" | "dismissed"
type MentionSort = "newest" | "oldest" | "most_engaged"
type MentionMonitoringState =
  "active" | "paused" | "setup_required" | "usage_limited"

type CustomerDatabaseCtx = {
  db: QueryCtx["db"] | MutationCtx["db"]
  identity: UserIdentity
}

type CurrentCustomer = {
  userId: UserId
  workspaceId: WorkspaceId
}

type NormalizedMentionFilters = {
  categoryIds: CategoryId[]
  keywordIds: KeywordId[]
  mentionStatuses: MentionStatus[]
  platforms: Platform[]
  publishedAfter?: number | undefined
  publishedBefore?: number | undefined
}

type MentionCursor = {
  bufferedMentionIds: string[]
  continueCursor: string
  databaseDone: boolean
  fingerprint: string
  sort: MentionSort
  version: typeof CURSOR_VERSION
  workspaceId: string
}

export type SortableMention = {
  _id: string
  engagementScore: number
  publishedAt: number
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function mentionError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

async function requireCurrentCustomer(
  ctx: CustomerDatabaseCtx,
): Promise<CurrentCustomer> {
  const { viewer, workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
  return { userId: viewer.id, workspaceId: workspace.id }
}

function normalizedIdArray<TableName extends "categories" | "keywords">(
  values: readonly Id<TableName>[] | undefined,
  label: string,
): Id<TableName>[] {
  if (!values) {
    return []
  }
  if (values.length > MAX_FILTER_VALUES) {
    mentionError(
      "INVALID_MENTION_FILTERS",
      `${label} supports at most ${MAX_FILTER_VALUES} values`,
    )
  }
  return [...new Set(values)]
}

function normalizedEnumArray<Value extends string>(
  values: readonly Value[] | undefined,
  label: string,
): Value[] {
  if (!values) {
    return []
  }
  if (values.length > MAX_FILTER_VALUES) {
    mentionError(
      "INVALID_MENTION_FILTERS",
      `${label} supports at most ${MAX_FILTER_VALUES} values`,
    )
  }
  return [...new Set(values)]
}

function validatedTimestamp(
  value: number | undefined,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    mentionError(
      "INVALID_MENTION_FILTERS",
      `${label} must be a non-negative timestamp`,
    )
  }
  return value
}

function normalizeMentionFilters(
  filters:
    | {
        categoryIds?: CategoryId[] | undefined
        keywordIds?: KeywordId[] | undefined
        mentionStatuses?: MentionStatus[] | undefined
        platforms?: Platform[] | undefined
        publishedAfter?: number | undefined
        publishedBefore?: number | undefined
      }
    | undefined,
): NormalizedMentionFilters {
  const publishedAfter = validatedTimestamp(
    filters?.publishedAfter,
    "publishedAfter",
  )
  const publishedBefore = validatedTimestamp(
    filters?.publishedBefore,
    "publishedBefore",
  )
  if (
    publishedAfter !== undefined &&
    publishedBefore !== undefined &&
    publishedAfter > publishedBefore
  ) {
    mentionError(
      "INVALID_MENTION_FILTERS",
      "publishedAfter cannot be later than publishedBefore",
    )
  }

  return {
    categoryIds: normalizedIdArray(filters?.categoryIds, "categoryIds"),
    keywordIds: normalizedIdArray(filters?.keywordIds, "keywordIds"),
    mentionStatuses: normalizedEnumArray(
      filters?.mentionStatuses,
      "mentionStatuses",
    ),
    platforms: normalizedEnumArray(filters?.platforms, "platforms"),
    ...(publishedAfter === undefined ? {} : { publishedAfter }),
    ...(publishedBefore === undefined ? {} : { publishedBefore }),
  }
}

export function normalizeMentionSearchQuery(value: string | undefined): string {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? ""
  if (normalized.length > MAX_SEARCH_LENGTH) {
    mentionError(
      "INVALID_MENTION_QUERY",
      `Mention search is limited to ${MAX_SEARCH_LENGTH} characters`,
    )
  }
  return normalized.toLocaleLowerCase("en")
}

function validatedLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_PAGE_SIZE
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    mentionError(
      "INVALID_PAGE_SIZE",
      `Mention page size must be between 1 and ${MAX_PAGE_SIZE}`,
    )
  }
  return limit
}

export function compareMentionRecords(
  left: SortableMention,
  right: SortableMention,
  sort: MentionSort,
): number {
  if (sort === "oldest") {
    return (
      left.publishedAt - right.publishedAt || compareText(left._id, right._id)
    )
  }
  if (sort === "most_engaged") {
    return (
      right.engagementScore - left.engagementScore ||
      right.publishedAt - left.publishedAt ||
      compareText(right._id, left._id)
    )
  }
  return (
    right.publishedAt - left.publishedAt || compareText(right._id, left._id)
  )
}

export function safeCanonicalUrl(value: string): string {
  const canonicalUrl = value.trim()
  let parsed: URL
  try {
    parsed = new URL(canonicalUrl)
  } catch {
    throw new TypeError("Mention canonicalUrl must be an absolute URL")
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new TypeError(
      "Mention canonicalUrl must be an HTTP(S) URL without credentials",
    )
  }
  return parsed.toString()
}

function requestFingerprint(input: {
  filters: NormalizedMentionFilters
  query: string
  sort: MentionSort
}): string {
  return JSON.stringify({
    filters: {
      categoryIds: input.filters.categoryIds.map(String).sort(),
      keywordIds: input.filters.keywordIds.map(String).sort(),
      mentionStatuses: [...input.filters.mentionStatuses].sort(),
      platforms: [...input.filters.platforms].sort(),
      ...(input.filters.publishedAfter === undefined
        ? {}
        : { publishedAfter: input.filters.publishedAfter }),
      ...(input.filters.publishedBefore === undefined
        ? {}
        : { publishedBefore: input.filters.publishedBefore }),
    },
    query: input.query,
    sort: input.sort,
  })
}

function encodeMentionCursor(cursor: MentionCursor): string {
  return `m${CURSOR_VERSION}:${encodeURIComponent(JSON.stringify(cursor))}`
}

function decodeMentionCursor(
  value: string,
  expected: {
    fingerprint: string
    sort: MentionSort
    workspaceId: WorkspaceId
  },
): MentionCursor {
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH) {
    mentionError("INVALID_CURSOR", "Mention cursor is invalid")
  }

  let parsed: unknown
  try {
    const prefix = `m${CURSOR_VERSION}:`
    if (!value.startsWith(prefix)) {
      mentionError("INVALID_CURSOR", "Mention cursor is invalid")
    }
    parsed = JSON.parse(
      decodeURIComponent(value.slice(prefix.length)),
    ) as unknown
  } catch (error) {
    if (error instanceof ConvexError) {
      throw error
    }
    mentionError("INVALID_CURSOR", "Mention cursor is invalid")
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    parsed.version !== CURSOR_VERSION ||
    !("workspaceId" in parsed) ||
    parsed.workspaceId !== String(expected.workspaceId) ||
    !("fingerprint" in parsed) ||
    parsed.fingerprint !== expected.fingerprint ||
    !("sort" in parsed) ||
    parsed.sort !== expected.sort ||
    !("continueCursor" in parsed) ||
    typeof parsed.continueCursor !== "string" ||
    parsed.continueCursor.length === 0 ||
    !("databaseDone" in parsed) ||
    typeof parsed.databaseDone !== "boolean" ||
    !("bufferedMentionIds" in parsed) ||
    !Array.isArray(parsed.bufferedMentionIds) ||
    parsed.bufferedMentionIds.length > MENTION_SCAN_MAX_ROWS ||
    parsed.bufferedMentionIds.some(
      (mentionId) => typeof mentionId !== "string" || mentionId.length === 0,
    )
  ) {
    mentionError(
      "INVALID_CURSOR",
      "Mention cursor does not belong to this workspace and filter set",
    )
  }

  return parsed as MentionCursor
}

async function assertAuthorizedFilterIds(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  filters: NormalizedMentionFilters,
): Promise<void> {
  for (const categoryId of filters.categoryIds) {
    const category = await ctx.db.get("categories", categoryId)
    if (!category || category.workspaceId !== workspaceId) {
      mentionError("FILTER_NOT_FOUND", "Mention filter not found")
    }
  }
  for (const keywordId of filters.keywordIds) {
    const keyword = await ctx.db.get("keywords", keywordId)
    if (!keyword || keyword.workspaceId !== workspaceId) {
      mentionError("FILTER_NOT_FOUND", "Mention filter not found")
    }
  }
}

function mentionMatchesFilters(
  row: Doc<"mentions">,
  input: {
    filters: NormalizedMentionFilters
    query: string
  },
): boolean {
  const { filters } = input
  if (
    filters.categoryIds.length > 0 &&
    !filters.categoryIds.includes(row.categoryId as CategoryId)
  ) {
    return false
  }
  if (
    filters.mentionStatuses.length > 0 &&
    !filters.mentionStatuses.includes(row.status as MentionStatus)
  ) {
    return false
  }
  if (
    filters.platforms.length > 0 &&
    !filters.platforms.includes(row.platform as Platform)
  ) {
    return false
  }
  if (
    filters.publishedAfter !== undefined &&
    (row.publishedAt as number) < filters.publishedAfter
  ) {
    return false
  }
  if (
    filters.publishedBefore !== undefined &&
    (row.publishedAt as number) > filters.publishedBefore
  ) {
    return false
  }
  if (
    input.query.length > 0 &&
    !(row.searchText as string).toLocaleLowerCase("en").includes(input.query)
  ) {
    return false
  }
  return true
}

async function mentionMatchesKeywordFilter(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  mentionId: MentionId,
  keywordIds: ReadonlySet<string>,
): Promise<boolean> {
  if (keywordIds.size === 0) {
    return true
  }

  const matches = await ctx.db
    .query("mentionKeywordMatches")
    .withIndex("by_workspace_and_mention", (q) =>
      q.eq("workspaceId", workspaceId).eq("mentionId", mentionId),
    )
    .collect()
  return matches.some((match) => keywordIds.has(String(match.keywordId)))
}

async function filterMentionRows(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  rows: readonly Doc<"mentions">[],
  input: {
    filters: NormalizedMentionFilters
    keywordIds: ReadonlySet<string>
    query: string
  },
): Promise<Doc<"mentions">[]> {
  const filtered: Doc<"mentions">[] = []
  for (const row of rows) {
    if (
      row.workspaceId === workspaceId &&
      mentionMatchesFilters(row, input) &&
      (await mentionMatchesKeywordFilter(
        ctx,
        workspaceId,
        row._id,
        input.keywordIds,
      ))
    ) {
      filtered.push(row)
    }
  }
  return filtered
}

async function bufferedMentionRows(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  mentionIds: readonly string[],
): Promise<Doc<"mentions">[]> {
  const rows: Doc<"mentions">[] = []
  for (const mentionId of mentionIds) {
    const row = await ctx.db.get("mentions", mentionId as MentionId)
    if (row?.workspaceId === workspaceId) {
      rows.push(row)
    }
  }
  return rows
}

async function mentionForWorkspace(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  mentionId: MentionId,
): Promise<Doc<"mentions">> {
  const mention = await ctx.db.get("mentions", mentionId)
  if (!mention || mention.workspaceId !== workspaceId) {
    mentionError("MENTION_NOT_FOUND", "Mention not found")
  }
  return mention
}

async function formatCategory(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  mention: Doc<"mentions">,
): Promise<{
  colorToken?: string
  id: CategoryId
  name: string
  systemKey?: string
} | null> {
  if (mention.categoryId === undefined) {
    return null
  }
  const category = await ctx.db.get(
    "categories",
    mention.categoryId as CategoryId,
  )
  if (!category || category.workspaceId !== mention.workspaceId) {
    return null
  }

  return {
    id: category._id as CategoryId,
    name: category.name as string,
    ...(category.colorToken === undefined
      ? {}
      : { colorToken: category.colorToken as string }),
    ...(category.systemKey === undefined
      ? {}
      : { systemKey: category.systemKey as string }),
  }
}

async function formatMatchedKeywords(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  mention: Doc<"mentions">,
): Promise<Array<{ id: KeywordId; phrase: string }>> {
  const matches = await ctx.db
    .query("mentionKeywordMatches")
    .withIndex("by_workspace_and_mention", (q) =>
      q.eq("workspaceId", mention.workspaceId).eq("mentionId", mention._id),
    )
    .collect()
  const keywords = new Map<string, { id: KeywordId; phrase: string }>()

  for (const match of matches) {
    const keyword = await ctx.db.get("keywords", match.keywordId as KeywordId)
    if (keyword && keyword.workspaceId === mention.workspaceId) {
      keywords.set(String(keyword._id), {
        id: keyword._id as KeywordId,
        phrase: keyword.phrase as string,
      })
    }
  }

  return [...keywords.values()].sort((left, right) =>
    left.phrase.localeCompare(right.phrase),
  )
}

async function formatMention(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  mention: Doc<"mentions">,
) {
  let canonicalUrl: string
  try {
    canonicalUrl = safeCanonicalUrl(mention.canonicalUrl as string)
  } catch {
    mentionError(
      "INVALID_MENTION_DATA",
      "Mention canonical data is not safe to return",
    )
  }

  const [category, matchedKeywords] = await Promise.all([
    formatCategory(ctx, mention),
    formatMatchedKeywords(ctx, mention),
  ])

  return {
    body: mention.body as string,
    canonicalUrl,
    category,
    engagementScore: mention.engagementScore as number,
    id: mention._id as MentionId,
    matchedKeywords,
    platform: mention.platform as Platform,
    publishedAt: mention.publishedAt as number,
    status: mention.status as MentionStatus,
    ...(mention.authorDisplayName === undefined
      ? {}
      : { authorDisplayName: mention.authorDisplayName as string }),
    ...(mention.authorHandle === undefined
      ? {}
      : { authorHandle: mention.authorHandle as string }),
    ...(mention.commentCount === undefined
      ? {}
      : { commentCount: mention.commentCount as number }),
    ...(mention.likeCount === undefined
      ? {}
      : { likeCount: mention.likeCount as number }),
    ...(mention.pointCount === undefined
      ? {}
      : { pointCount: mention.pointCount as number }),
    ...(mention.replyCount === undefined
      ? {}
      : { replyCount: mention.replyCount as number }),
    ...(mention.repostCount === undefined
      ? {}
      : { repostCount: mention.repostCount as number }),
    ...(mention.title === undefined ? {} : { title: mention.title as string }),
  }
}

async function readMentionMonitoringState(
  ctx: Pick<CustomerDatabaseCtx, "db">,
  workspaceId: WorkspaceId,
  now: number,
): Promise<MentionMonitoringState> {
  const configuredKeywords = (
    await Promise.all(
      (["active", "paused"] as const).map(
        async (status) =>
          await ctx.db
            .query("keywords")
            .withIndex("by_workspace_status_and_created_at", (q) =>
              q.eq("workspaceId", workspaceId).eq("status", status),
            )
            .collect(),
      ),
    )
  ).flat()
  if (configuredKeywords.length === 0) {
    return "setup_required"
  }

  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect()
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
    return "paused"
  }

  const cycles = await ctx.db
    .query("usageCycles")
    .withIndex("by_workspace_status_and_period_end", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "open"),
    )
    .collect()
  const usageCycle = cycles
    .filter(
      (cycle) =>
        (cycle.periodStartAt as number) <= now &&
        (cycle.periodEndAt as number) > now &&
        (cycle.subscriptionId === activeSubscription._id ||
          (cycle.subscriptionId === undefined &&
            (cycle.planSnapshot as { planId?: unknown } | undefined)?.planId ===
              activeSubscription.planId)),
    )
    .sort(
      (left, right) =>
        (right.periodStartAt as number) - (left.periodStartAt as number),
    )[0]
  if (
    !usageCycle ||
    (usageCycle.mentionsUsed as number) >= (usageCycle.mentionLimit as number)
  ) {
    return "usage_limited"
  }

  const activeKeywordIds = new Set(
    configuredKeywords
      .filter((keyword) => keyword.status === "active")
      .map((keyword) => String(keyword._id)),
  )
  if (activeKeywordIds.size === 0) {
    return "paused"
  }
  const activeSources = await ctx.db
    .query("trackingSources")
    .withIndex("by_workspace_status_and_created_at", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "active"),
    )
    .collect()
  return activeSources.some(
    (source) =>
      source.deletedAt === undefined &&
      activeKeywordIds.has(String(source.keywordId)),
  )
    ? "active"
    : "paused"
}

export const listMentions = authenticatedQuery({
  args: {
    cursor: v.optional(v.string()),
    filters: v.optional(mentionFiltersValidator),
    limit: v.optional(v.number()),
    now: v.number(),
    query: v.optional(v.string()),
    sort: v.optional(mentionSortValidator),
  },
  returns: mentionPageResultValidator,
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.now) || args.now < 0) {
      mentionError("INVALID_MENTION_INPUT", "Current time is invalid")
    }
    const customer = await requireCurrentCustomer(ctx)
    const filters = normalizeMentionFilters(args.filters)
    const query = normalizeMentionSearchQuery(args.query)
    const sort = args.sort ?? "newest"
    const limit = validatedLimit(args.limit)
    const fingerprint = requestFingerprint({ filters, query, sort })
    const cursor =
      args.cursor === undefined
        ? null
        : decodeMentionCursor(args.cursor, {
            fingerprint,
            sort,
            workspaceId: customer.workspaceId,
          })

    await assertAuthorizedFilterIds(ctx, customer.workspaceId, filters)
    const keywordIds = new Set(filters.keywordIds.map(String))
    const bufferedRows = await bufferedMentionRows(
      ctx,
      customer.workspaceId,
      cursor?.bufferedMentionIds ?? [],
    )
    const candidates = await filterMentionRows(
      ctx,
      customer.workspaceId,
      bufferedRows,
      { filters, keywordIds, query },
    )
    let continueCursor = cursor?.continueCursor ?? null
    let databaseDone = cursor?.databaseDone ?? false

    if (candidates.length <= limit && !databaseDone) {
      const scanQuery =
        sort === "most_engaged"
          ? ctx.db
              .query("mentions")
              .withIndex("by_workspace_engagement_and_published_at", (q) =>
                q.eq("workspaceId", customer.workspaceId),
              )
              .order("desc")
          : ctx.db
              .query("mentions")
              .withIndex("by_workspace_and_published_at", (q) =>
                q.eq("workspaceId", customer.workspaceId),
              )
              .order(sort === "oldest" ? "asc" : "desc")
      const scanned = await scanQuery.paginate({
        cursor: continueCursor,
        maximumBytesRead: MENTION_SCAN_MAX_BYTES,
        maximumRowsRead: MENTION_SCAN_MAX_ROWS,
        numItems: MENTION_SCAN_MAX_ROWS,
      })
      continueCursor = scanned.continueCursor
      databaseDone = scanned.isDone
      candidates.push(
        ...(await filterMentionRows(ctx, customer.workspaceId, scanned.page, {
          filters,
          keywordIds,
          query,
        })),
      )
    }

    const pageRows = candidates.slice(0, limit)
    const bufferedCandidates = candidates.slice(limit)
    const hasMore = bufferedCandidates.length > 0 || !databaseDone
    const nextCursor =
      hasMore && continueCursor
        ? encodeMentionCursor({
            bufferedMentionIds: bufferedCandidates.map((row) =>
              String(row._id),
            ),
            continueCursor,
            databaseDone,
            fingerprint,
            sort,
            version: CURSOR_VERSION,
            workspaceId: String(customer.workspaceId),
          })
        : null
    const [items, monitoringState] = await Promise.all([
      Promise.all(
        pageRows.map(async (mention) => await formatMention(ctx, mention)),
      ),
      readMentionMonitoringState(ctx, customer.workspaceId, args.now),
    ])

    return {
      isDone: nextCursor === null,
      items,
      monitoringState,
      nextCursor,
    }
  },
})

export const getMention = authenticatedQuery({
  args: { mentionId: v.id("mentions") },
  returns: mentionResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const mention = await mentionForWorkspace(
      ctx,
      customer.workspaceId,
      args.mentionId as MentionId,
    )
    return await formatMention(ctx, mention)
  },
})

export const updateMentionStatus = authenticatedMutation({
  args: {
    mentionId: v.id("mentions"),
    status: mentionStatusValidator,
  },
  returns: mentionResultValidator,
  handler: async (ctx, args) => {
    const customer = await requireCurrentCustomer(ctx)
    const mentionId = args.mentionId as MentionId
    await mentionForWorkspace(ctx, customer.workspaceId, mentionId)
    await ctx.db.patch("mentions", mentionId, {
      status: args.status,
      updatedAt: Date.now(),
    })
    const mention = await mentionForWorkspace(
      ctx,
      customer.workspaceId,
      mentionId,
    )
    return await formatMention(ctx, mention)
  },
})
