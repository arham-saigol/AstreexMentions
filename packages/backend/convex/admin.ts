import type { UserIdentity } from "convex/server"
import type { GenericId } from "convex/values"
import { ConvexError, v } from "convex/values"

import {
  CATEGORIZATION_JOB_STATUSES,
  categorizationStatusMetric,
} from "./categorization/metrics"
import {
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  ACCOUNT_DELETION_PURGE_STAGES,
  ACCOUNT_DELETION_WORKFLOW_VERSION,
  accountDeletionOperationId,
} from "./deletion/model"
import {
  CATEGORIZED_MENTION_METRIC_PREFIX,
  ingestedMentionPlatformMetric,
} from "./ingestion/model"
import { adminMutation, adminQuery } from "./lib/authorization"
import { withoutUndefinedValues } from "./lib/jobRuntime"
import {
  subscriptionCountMetric,
  USAGE_PAUSED_WORKSPACE_METRIC,
  WORKSPACE_COUNT_METRIC,
} from "./lib/operationalMetrics"
import { SYSTEM_METRIC_GAUGE_BUCKET_START_AT } from "./lib/systemMetricBuckets"
import {
  indexEquals,
  indexGreaterThanOrEqual,
  type MutationCtx,
  type QueryCtx,
} from "./server"

const DAY_MS = 86_400_000
const MAX_TIMESTAMP = 8_640_000_000_000_000
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MENTION_METRIC = "mentions_ingested"
const DELIVERY_METRIC_PREFIX = "email_delivery_"
const MAX_ACTIVE_WORKSPACE_COUNT = 10_000

const featureRequestStatusValidator = v.union(
  v.literal("new"),
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("declined"),
)
const changelogStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
)
const platformValidator = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("hacker_news"),
)
const planValidator = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("scale"),
)
const deletionJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("billing_check"),
  v.literal("blocked"),
  v.literal("leased"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("dead"),
  v.literal("canceled"),
)
const deletionJobResultValidator = v.object({
  attempts: v.number(),
  billingGuardStatus: v.string(),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  dataDeletionVerifiedAt: v.optional(v.number()),
  generation: v.optional(v.number()),
  id: v.id("deletionJobs"),
  identityDeletionVerifiedAt: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  maxAttempts: v.number(),
  nextAttemptAt: v.optional(v.number()),
  operationId: v.optional(v.string()),
  phase: v.optional(v.string()),
  purgeStage: v.optional(v.string()),
  quiescedAt: v.optional(v.number()),
  scheduledAt: v.number(),
  securityFenceExpiresAt: v.optional(v.number()),
  status: deletionJobStatusValidator,
  supersedesJobId: v.optional(v.id("deletionJobs")),
  updatedAt: v.number(),
  workflowVersion: v.optional(v.number()),
  workspaceId: v.id("workspaces"),
})
const deletionAuditEventValidator = v.object({
  action: v.string(),
  createdAt: v.number(),
  metadataJson: v.optional(v.string()),
  outcome: v.union(
    v.literal("success"),
    v.literal("denied"),
    v.literal("failure"),
  ),
})

const featureRequestUserValidator = v.union(
  v.object({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    id: v.id("users"),
    name: v.optional(v.string()),
  }),
  v.null(),
)
const featureRequestWorkspaceValidator = v.union(
  v.object({
    id: v.id("workspaces"),
    name: v.string(),
  }),
  v.null(),
)
const featureRequestResultValidator = v.object({
  adminNote: v.optional(v.string()),
  body: v.string(),
  createdAt: v.number(),
  id: v.id("featureRequests"),
  status: featureRequestStatusValidator,
  title: v.string(),
  updatedAt: v.number(),
  user: featureRequestUserValidator,
  workspace: featureRequestWorkspaceValidator,
})

const changelogEntryResultValidator = v.object({
  body: v.string(),
  id: v.id("changelogEntries"),
  label: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  slug: v.string(),
  status: changelogStatusValidator,
  summary: v.string(),
  title: v.string(),
  updatedAt: v.number(),
})

const providerHealthValidator = v.object({
  averageLatencyMs: v.number(),
  failureCount: v.number(),
  inputItemCount: v.number(),
  maxLatencyMs: v.number(),
  outputItemCount: v.number(),
  provider: v.string(),
  rateLimitedCount: v.number(),
  requestCount: v.number(),
  retryCount: v.number(),
  successCount: v.number(),
})
const categoryBreakdownValidator = v.object({
  category: v.string(),
  count: v.number(),
})
const mentionByPlatformValidator = v.object({
  count: v.number(),
  platform: platformValidator,
})
const subscriptionByPlanValidator = v.object({
  activeCount: v.number(),
  count: v.number(),
  planId: planValidator,
})
const metricsResultValidator = v.object({
  categorization: v.object({
    completed: v.number(),
    failed: v.number(),
    leased: v.number(),
    pending: v.number(),
    total: v.number(),
  }),
  categoryBreakdown: v.array(categoryBreakdownValidator),
  digestDelivery: v.object({
    bounced: v.number(),
    clicked: v.number(),
    complained: v.number(),
    delivered: v.number(),
    deliveryDelayed: v.number(),
    failed: v.number(),
    opened: v.number(),
    scheduled: v.number(),
    sent: v.number(),
    suppressed: v.number(),
    total: v.number(),
  }),
  mentionVolume: v.array(
    v.object({
      count: v.number(),
      timestamp: v.number(),
    }),
  ),
  mentions: v.object({
    byPlatform: v.array(mentionByPlatformValidator),
    last30Days: v.number(),
    today: v.number(),
  }),
  providerHealth: v.array(providerHealthValidator),
  range: v.object({
    days: v.union(v.literal(7), v.literal(30), v.literal(90)),
    endAt: v.number(),
    startAt: v.number(),
  }),
  stats: v.object({
    activeWorkspaces: v.number(),
    emailsDelivered: v.number(),
    mentions: v.number(),
    workspaces: v.number(),
  }),
  subscriptionsByPlan: v.array(subscriptionByPlanValidator),
  usagePausedWorkspaces: v.number(),
})

type DatabaseCtx = Pick<QueryCtx | MutationCtx, "db">
type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type FeatureRequestId = GenericId<"featureRequests">
type ChangelogEntryId = GenericId<"changelogEntries">
type DeletionJobId = GenericId<"deletionJobs">
type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type FeatureRequestStatus =
  "new" | "planned" | "in_progress" | "completed" | "declined"
type ChangelogStatus = "draft" | "published"

type ProviderAggregate = {
  failureCount: number
  inputItemCount: number
  latencyMaxMs: number
  latencyTotalMs: number
  outputItemCount: number
  rateLimitedCount: number
  requestCount: number
  retryCount: number
  successCount: number
}

function adminError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function optionalTrimmedText(
  value: string | undefined,
  maximumLength: number,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > maximumLength) {
    adminError(
      "INVALID_ADMIN_INPUT",
      `${field} must contain at most ${maximumLength} characters`,
    )
  }
  return trimmed.length === 0 ? undefined : trimmed
}

function requiredTrimmedText(
  value: string,
  minimumLength: number,
  maximumLength: number,
  field: string,
): string {
  const trimmed = value.trim()
  if (trimmed.length < minimumLength || trimmed.length > maximumLength) {
    adminError(
      "INVALID_ADMIN_INPUT",
      `${field} must contain ${minimumLength} to ${maximumLength} characters`,
    )
  }
  return trimmed
}

function validatedSlug(value: string): string {
  const slug = value.trim()
  if (slug.length > 100 || !SLUG_PATTERN.test(slug)) {
    adminError(
      "INVALID_CHANGELOG_ENTRY",
      "Changelog slugs must contain lowercase letters, numbers, and hyphens",
    )
  }
  return slug
}

function validatedPublicationTimestamp(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TIMESTAMP) {
    adminError(
      "INVALID_CHANGELOG_ENTRY",
      "The changelog publication timestamp is invalid",
    )
  }
  return value
}

async function featureRequestForId(
  ctx: DatabaseCtx,
  requestId: FeatureRequestId,
): Promise<GenericRow> {
  const request = (await ctx.db.get(
    "featureRequests",
    requestId,
  )) as GenericRow | null
  if (!request) {
    adminError("FEATURE_REQUEST_NOT_FOUND", "Feature request not found")
  }
  return request
}

async function changelogEntryForId(
  ctx: DatabaseCtx,
  entryId: ChangelogEntryId,
): Promise<GenericRow> {
  const entry = (await ctx.db.get(
    "changelogEntries",
    entryId,
  )) as GenericRow | null
  if (!entry) {
    adminError("CHANGELOG_ENTRY_NOT_FOUND", "Changelog entry not found")
  }
  return entry
}

async function assertAvailableSlug(
  ctx: DatabaseCtx,
  slug: string,
  currentEntryId?: ChangelogEntryId,
): Promise<void> {
  const existing = await ctx.db
    .query("changelogEntries")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique()
  if (existing && existing._id !== currentEntryId) {
    adminError(
      "CHANGELOG_SLUG_CONFLICT",
      "This changelog slug is already in use",
    )
  }
}

async function formatFeatureRequest(ctx: DatabaseCtx, row: GenericRow) {
  const [user, workspace] = await Promise.all([
    ctx.db.get("users", row.createdByUserId as UserId),
    ctx.db.get("workspaces", row.workspaceId as WorkspaceId),
  ])

  return {
    ...(row.adminNote === undefined
      ? {}
      : { adminNote: row.adminNote as string }),
    body: row.body as string,
    createdAt: row.createdAt as number,
    id: row._id as FeatureRequestId,
    status: row.status as FeatureRequestStatus,
    title: row.title as string,
    updatedAt: row.updatedAt as number,
    user: user
      ? {
          clerkUserId: user.clerkUserId as string,
          ...(user.email === undefined ? {} : { email: user.email as string }),
          id: user._id as UserId,
          ...(user.name === undefined ? {} : { name: user.name as string }),
        }
      : null,
    workspace: workspace
      ? {
          id: workspace._id as WorkspaceId,
          name: workspace.name as string,
        }
      : null,
  }
}

function formatChangelogEntry(row: GenericRow) {
  const status = row.status as ChangelogStatus
  const displayedPublicationAt =
    status === "published" ? row.publishedAt : row.requestedPublicationAt

  return {
    body: row.body as string,
    id: row._id as ChangelogEntryId,
    ...(row.label === undefined ? {} : { label: row.label as string }),
    ...(displayedPublicationAt === undefined
      ? {}
      : { publishedAt: displayedPublicationAt as number }),
    slug: row.slug as string,
    status,
    summary: row.summary as string,
    title: row.title as string,
    updatedAt: row.updatedAt as number,
  }
}

function formatDeletionJob(row: GenericRow) {
  return {
    attempts: row.attempts as number,
    billingGuardStatus: String(row.billingGuardStatus),
    createdAt: row.createdAt as number,
    id: row._id as DeletionJobId,
    maxAttempts: row.maxAttempts as number,
    scheduledAt: row.scheduledAt as number,
    status: row.status as
      | "billing_check"
      | "blocked"
      | "canceled"
      | "completed"
      | "dead"
      | "failed"
      | "leased"
      | "pending"
      | "running",
    updatedAt: row.updatedAt as number,
    workspaceId: row.workspaceId as WorkspaceId,
    ...(row.completedAt === undefined
      ? {}
      : { completedAt: row.completedAt as number }),
    ...(row.dataDeletionVerifiedAt === undefined
      ? {}
      : { dataDeletionVerifiedAt: row.dataDeletionVerifiedAt as number }),
    ...(row.generation === undefined
      ? {}
      : { generation: row.generation as number }),
    ...(row.identityDeletionVerifiedAt === undefined
      ? {}
      : {
          identityDeletionVerifiedAt: row.identityDeletionVerifiedAt as number,
        }),
    ...(row.lastErrorCode === undefined
      ? {}
      : { lastErrorCode: row.lastErrorCode as string }),
    ...(row.leaseExpiresAt === undefined
      ? {}
      : { leaseExpiresAt: row.leaseExpiresAt as number }),
    ...(row.nextAttemptAt === undefined
      ? {}
      : { nextAttemptAt: row.nextAttemptAt as number }),
    ...(row.operationId === undefined
      ? {}
      : { operationId: row.operationId as string }),
    ...(row.phase === undefined ? {} : { phase: row.phase as string }),
    ...(row.purgeStage === undefined
      ? {}
      : { purgeStage: row.purgeStage as string }),
    ...(row.quiescedAt === undefined
      ? {}
      : { quiescedAt: row.quiescedAt as number }),
    ...(row.securityFenceExpiresAt === undefined
      ? {}
      : { securityFenceExpiresAt: row.securityFenceExpiresAt as number }),
    ...(row.supersedesJobId === undefined
      ? {}
      : { supersedesJobId: row.supersedesJobId as DeletionJobId }),
    ...(row.workflowVersion === undefined
      ? {}
      : { workflowVersion: row.workflowVersion as number }),
  }
}

async function auditAdminMutation(
  ctx: MutationCtx,
  identity: UserIdentity,
  input: {
    action: string
    metadata?: Record<string, unknown> | undefined
    targetId: string
    targetType: string
  },
  now: number,
): Promise<void> {
  await ctx.db.insert("auditEvents", {
    action: input.action,
    actorClerkUserId: identity.subject,
    actorType: "admin",
    createdAt: now,
    ...(input.metadata === undefined
      ? {}
      : { metadataJson: JSON.stringify(input.metadata) }),
    outcome: "success",
    targetId: input.targetId,
    targetType: input.targetType,
  })
}

function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS
}

function metricAmount(row: GenericRow): number {
  const value = row.value
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function sumMetric(
  rows: readonly GenericRow[],
  metric: string,
  startAt: number,
): number {
  return rows.reduce(
    (sum, row) =>
      row.scope === "global" &&
      row.metric === metric &&
      (row.bucketStartAt as number) >= startAt
        ? sum + metricAmount(row)
        : sum,
    0,
  )
}

function providerHealth(rows: readonly GenericRow[], startAt: number) {
  const aggregates = new Map<string, ProviderAggregate>()

  for (const row of rows) {
    if ((row.bucketStartAt as number) < startAt) {
      continue
    }
    const provider = row.provider as string
    const current = aggregates.get(provider) ?? {
      failureCount: 0,
      inputItemCount: 0,
      latencyMaxMs: 0,
      latencyTotalMs: 0,
      outputItemCount: 0,
      rateLimitedCount: 0,
      requestCount: 0,
      retryCount: 0,
      successCount: 0,
    }
    current.failureCount += row.failureCount as number
    current.inputItemCount += row.inputItemCount as number
    current.latencyMaxMs = Math.max(
      current.latencyMaxMs,
      row.latencyMaxMs as number,
    )
    current.latencyTotalMs += row.latencyTotalMs as number
    current.outputItemCount += row.outputItemCount as number
    current.rateLimitedCount += row.rateLimitedCount as number
    current.requestCount += row.requestCount as number
    current.retryCount += row.retryCount as number
    current.successCount += row.successCount as number
    aggregates.set(provider, current)
  }

  return [...aggregates.entries()]
    .map(([provider, aggregate]) => ({
      averageLatencyMs:
        aggregate.requestCount === 0
          ? 0
          : Math.round(aggregate.latencyTotalMs / aggregate.requestCount),
      failureCount: aggregate.failureCount,
      inputItemCount: aggregate.inputItemCount,
      maxLatencyMs: aggregate.latencyMaxMs,
      outputItemCount: aggregate.outputItemCount,
      provider,
      rateLimitedCount: aggregate.rateLimitedCount,
      requestCount: aggregate.requestCount,
      retryCount: aggregate.retryCount,
      successCount: aggregate.successCount,
    }))
    .sort(
      (left, right) =>
        right.requestCount - left.requestCount ||
        left.provider.localeCompare(right.provider),
    )
}

function mentionVolume(
  rows: readonly GenericRow[],
  startAt: number,
  days: 7 | 30 | 90,
) {
  const counts = new Map<number, number>()
  for (let offset = 0; offset < days; offset += 1) {
    counts.set(startAt + offset * DAY_MS, 0)
  }

  for (const row of rows) {
    if (
      row.scope !== "global" ||
      row.metric !== MENTION_METRIC ||
      (row.bucketStartAt as number) < startAt
    ) {
      continue
    }
    const timestamp = startOfUtcDay(row.bucketStartAt as number)
    if (!counts.has(timestamp)) {
      continue
    }
    counts.set(timestamp, (counts.get(timestamp) ?? 0) + metricAmount(row))
  }

  return [...counts.entries()].map(([timestamp, count]) => ({
    count,
    timestamp,
  }))
}

function digestDelivery(rows: readonly GenericRow[], startAt: number) {
  const result = {
    bounced: 0,
    clicked: 0,
    complained: 0,
    delivered: 0,
    deliveryDelayed: 0,
    failed: 0,
    opened: 0,
    scheduled: 0,
    sent: 0,
    suppressed: 0,
    total: 0,
  }

  for (const row of rows) {
    if (
      row.scope !== "global" ||
      typeof row.metric !== "string" ||
      !row.metric.startsWith(DELIVERY_METRIC_PREFIX) ||
      (row.bucketStartAt as number) < startAt
    ) {
      continue
    }
    const count = metricAmount(row)
    const status = row.metric.slice(DELIVERY_METRIC_PREFIX.length)
    switch (status) {
      case "scheduled":
        result.scheduled += count
        break
      case "sent":
        result.sent += count
        break
      case "delivery_delayed":
        result.deliveryDelayed += count
        break
      case "delivered":
        result.delivered += count
        break
      case "opened":
        result.opened += count
        break
      case "clicked":
        result.clicked += count
        break
      case "complained":
        result.complained += count
        break
      case "bounced":
        result.bounced += count
        break
      case "failed":
        result.failed += count
        break
      case "suppressed":
        result.suppressed += count
        break
      default:
        continue
    }
    result.total += count
  }

  return result
}

export const getMetricsOverview = adminQuery({
  args: {
    days: v.union(v.literal(7), v.literal(30), v.literal(90)),
  },
  returns: metricsResultValidator,
  handler: async (ctx, args) => {
    const endAt = Date.now()
    const todayStartAt = startOfUtcDay(endAt)
    const startAt = todayStartAt - (args.days - 1) * DAY_MS
    const last30DaysStartAt = todayStartAt - 29 * DAY_MS
    const metricReadStartAt = Math.min(startAt, last30DaysStartAt)
    const operationalMetricNames = [
      WORKSPACE_COUNT_METRIC,
      USAGE_PAUSED_WORKSPACE_METRIC,
      ...(["starter", "growth", "scale"] as const).flatMap((planId) => [
        subscriptionCountMetric(planId, false),
        subscriptionCountMetric(planId, true),
      ]),
    ]

    const [
      providerRows,
      systemRows,
      categorizationGaugeRows,
      operationalGaugeRows,
      activeWorkspaceRows,
    ] = (await Promise.all([
      ctx.db
        .query("providerMetricBuckets")
        .withIndex("by_granularity_and_bucket", (q) =>
          indexGreaterThanOrEqual(
            q.eq("granularity", "hour"),
            "bucketStartAt",
            startAt,
          ),
        )
        .collect(),
      ctx.db
        .query("systemMetricBuckets")
        .withIndex("by_scope_granularity_and_bucket", (q) =>
          indexGreaterThanOrEqual(
            indexEquals(q, ["scope", "global"], ["granularity", "hour"]),
            "bucketStartAt",
            metricReadStartAt,
          ),
        )
        .collect(),
      Promise.all(
        CATEGORIZATION_JOB_STATUSES.map(
          async (status) =>
            (await ctx.db
              .query("systemMetricBuckets")
              .withIndex(
                "by_metric_scope_workspace_granularity_and_bucket",
                (q) =>
                  indexEquals(
                    q,
                    ["metric", categorizationStatusMetric(status)],
                    ["scope", "global"],
                    ["workspaceId", undefined],
                    ["granularity", "hour"],
                    ["bucketStartAt", SYSTEM_METRIC_GAUGE_BUCKET_START_AT],
                  ),
              )
              .unique()) as GenericRow | null,
        ),
      ),
      Promise.all(
        operationalMetricNames.map(
          async (metric) =>
            (await ctx.db
              .query("systemMetricBuckets")
              .withIndex(
                "by_metric_scope_workspace_granularity_and_bucket",
                (q) =>
                  indexEquals(
                    q,
                    ["metric", metric],
                    ["scope", "global"],
                    ["workspaceId", undefined],
                    ["granularity", "hour"],
                    ["bucketStartAt", SYSTEM_METRIC_GAUGE_BUCKET_START_AT],
                  ),
              )
              .unique()) as GenericRow | null,
        ),
      ),
      ctx.db
        .query("workspaces")
        .withIndex("by_last_mention_at", (q) => q.gte("lastMentionAt", startAt))
        .take(MAX_ACTIVE_WORKSPACE_COUNT + 1),
    ])) as [
      GenericRow[],
      GenericRow[],
      Array<GenericRow | null>,
      Array<GenericRow | null>,
      GenericRow[],
    ]

    const relevantSystemRows = systemRows.filter(
      (row) => (row.bucketStartAt as number) >= metricReadStartAt,
    )
    const categoryIds = new Set<string>()
    for (const row of relevantSystemRows) {
      if (
        row.scope === "global" &&
        typeof row.metric === "string" &&
        row.metric.startsWith(CATEGORIZED_MENTION_METRIC_PREFIX) &&
        (row.bucketStartAt as number) >= startAt
      ) {
        categoryIds.add(
          row.metric.slice(CATEGORIZED_MENTION_METRIC_PREFIX.length),
        )
      }
    }
    const categories = await Promise.all(
      [...categoryIds].map(
        async (categoryId) =>
          (await ctx.db.get(
            "categories",
            categoryId as GenericId<"categories">,
          )) as GenericRow | null,
      ),
    )
    const categoryNames = new Map(
      categories
        .filter((category): category is GenericRow => category !== null)
        .map((category) => [String(category._id), category.name as string]),
    )
    const categoryCounts = new Map<string, number>()
    let categorizedMentions = 0
    for (const row of relevantSystemRows) {
      if (
        row.scope !== "global" ||
        typeof row.metric !== "string" ||
        !row.metric.startsWith(CATEGORIZED_MENTION_METRIC_PREFIX) ||
        (row.bucketStartAt as number) < startAt
      ) {
        continue
      }
      const categoryId = row.metric.slice(
        CATEGORIZED_MENTION_METRIC_PREFIX.length,
      )
      const category = categoryNames.get(categoryId) ?? "Unavailable category"
      const count = metricAmount(row)
      categorizedMentions += count
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + count)
    }
    const uncategorizedMentions = Math.max(
      0,
      sumMetric(relevantSystemRows, MENTION_METRIC, startAt) -
        categorizedMentions,
    )
    if (uncategorizedMentions > 0) {
      categoryCounts.set("Uncategorized", uncategorizedMentions)
    }
    const categoryBreakdown = [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.category.localeCompare(right.category),
      )

    const mentionsByPlatform = (["x", "reddit", "hacker_news"] as const).map(
      (platform) => ({
        count: sumMetric(
          relevantSystemRows,
          ingestedMentionPlatformMetric(platform),
          last30DaysStartAt,
        ),
        platform,
      }),
    )

    const categorizationCounts = Object.fromEntries(
      CATEGORIZATION_JOB_STATUSES.map((status, index) => [
        status,
        categorizationGaugeRows[index]
          ? metricAmount(categorizationGaugeRows[index]!)
          : 0,
      ]),
    ) as Record<(typeof CATEGORIZATION_JOB_STATUSES)[number], number>
    const categorization = {
      completed: categorizationCounts.completed,
      failed: categorizationCounts.dead,
      leased: categorizationCounts.leased,
      pending: categorizationCounts.pending,
      total: CATEGORIZATION_JOB_STATUSES.reduce(
        (total, status) => total + categorizationCounts[status],
        0,
      ),
    }

    const operationalCounts = new Map(
      operationalMetricNames.map((metric, index) => [
        metric,
        operationalGaugeRows[index]
          ? metricAmount(operationalGaugeRows[index]!)
          : 0,
      ]),
    )
    const subscriptionsByPlan = (["starter", "growth", "scale"] as const).map(
      (planId) => ({
        activeCount:
          operationalCounts.get(subscriptionCountMetric(planId, true)) ?? 0,
        count:
          operationalCounts.get(subscriptionCountMetric(planId, false)) ?? 0,
        planId,
      }),
    )

    const delivery = digestDelivery(relevantSystemRows, startAt)

    return {
      categorization,
      categoryBreakdown,
      digestDelivery: delivery,
      mentionVolume: mentionVolume(relevantSystemRows, startAt, args.days),
      mentions: {
        byPlatform: mentionsByPlatform,
        last30Days: sumMetric(
          relevantSystemRows,
          MENTION_METRIC,
          last30DaysStartAt,
        ),
        today: sumMetric(relevantSystemRows, MENTION_METRIC, todayStartAt),
      },
      providerHealth: providerHealth(providerRows, startAt),
      range: { days: args.days, endAt, startAt },
      stats: {
        activeWorkspaces: Math.min(
          activeWorkspaceRows.length,
          MAX_ACTIVE_WORKSPACE_COUNT,
        ),
        emailsDelivered: delivery.delivered,
        mentions: sumMetric(relevantSystemRows, MENTION_METRIC, startAt),
        workspaces: operationalCounts.get(WORKSPACE_COUNT_METRIC) ?? 0,
      },
      subscriptionsByPlan,
      usagePausedWorkspaces:
        operationalCounts.get(USAGE_PAUSED_WORKSPACE_METRIC) ?? 0,
    }
  },
})

export const listDeletionJobs = adminQuery({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(deletionJobStatusValidator),
  },
  returns: v.array(deletionJobResultValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      adminError("INVALID_ADMIN_INPUT", "Deletion job limit must be 1 to 200")
    }
    const rows = args.status
      ? await ctx.db
          .query("deletionJobs")
          .withIndex("by_kind_status_and_created_at", (q) =>
            indexEquals(q, ["kind", "account"], ["status", args.status]),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("deletionJobs")
          .withIndex("by_kind_and_created_at", (q) =>
            indexEquals(q, ["kind", "account"]),
          )
          .order("desc")
          .take(limit)
    return (rows as GenericRow[]).map(formatDeletionJob)
  },
})

export const getDeletionJob = adminQuery({
  args: { deletionJobId: v.id("deletionJobs") },
  returns: v.object({
    events: v.array(deletionAuditEventValidator),
    job: deletionJobResultValidator,
  }),
  handler: async (ctx, args) => {
    const row = (await ctx.db.get(
      "deletionJobs",
      args.deletionJobId,
    )) as GenericRow | null
    if (!row) {
      adminError("DELETION_JOB_NOT_FOUND", "Deletion job not found")
    }
    const events = await ctx.db
      .query("auditEvents")
      .withIndex("by_target_and_created_at", (q) =>
        indexEquals(
          q,
          ["targetType", "deletionJob"],
          ["targetId", String(args.deletionJobId)],
        ),
      )
      .order("asc")
      .collect()
    return {
      events: events.map((event) => ({
        action: event.action as string,
        createdAt: event.createdAt as number,
        outcome: event.outcome as "denied" | "failure" | "success",
        ...(event.metadataJson === undefined
          ? {}
          : { metadataJson: event.metadataJson as string }),
      })),
      job: formatDeletionJob(row),
    }
  },
})

export const retryDeletionJob = adminMutation({
  args: {
    confirmation: v.string(),
    deletionJobId: v.id("deletionJobs"),
  },
  returns: deletionJobResultValidator,
  handler: async (ctx, args) => {
    if (args.confirmation !== "RETRY") {
      adminError("CONFIRMATION_MISMATCH", "Type RETRY to create a new attempt")
    }
    const original = (await ctx.db.get(
      "deletionJobs",
      args.deletionJobId,
    )) as GenericRow | null
    if (!original) {
      adminError("DELETION_JOB_NOT_FOUND", "Deletion job not found")
    }
    if (
      original.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION ||
      original.kind !== "account" ||
      original.status !== "dead" ||
      typeof original.resourceKey !== "string" ||
      typeof original.identityClerkUserId !== "string"
    ) {
      adminError(
        "DELETION_RETRY_REJECTED",
        "Only terminal workflow-version-2 account jobs can be retried",
      )
    }
    const latest = await ctx.db
      .query("deletionJobs")
      .withIndex("by_resource_key_and_created_at", (q) =>
        q.eq("resourceKey", original.resourceKey as string),
      )
      .order("desc")
      .first()
    if (!latest || latest._id !== original._id) {
      adminError(
        "DELETION_RETRY_SUPERSEDED",
        "A newer deletion operation already exists",
      )
    }

    const now = Date.now()
    const generation = ((original.generation as number | undefined) ?? 1) + 1
    const operationId = accountDeletionOperationId(
      String(original.accountUserId),
      generation,
    )
    const hasVerifiedData = typeof original.dataDeletionVerifiedAt === "number"
    const hasQuiesced = typeof original.quiescedAt === "number"
    const phase = hasVerifiedData
      ? ("verify_data" as const)
      : hasQuiesced
        ? ("purge" as const)
        : ("billing_check" as const)
    const persistedStage = original.purgeStage as string | undefined
    const purgeStage =
      phase === "purge" &&
      ACCOUNT_DELETION_PURGE_STAGES.includes(
        persistedStage as (typeof ACCOUNT_DELETION_PURGE_STAGES)[number],
      )
        ? persistedStage
        : phase === "purge"
          ? ACCOUNT_DELETION_PURGE_STAGES[0]
          : undefined
    const deletionJobId = (await ctx.db.insert(
      "deletionJobs",
      withoutUndefinedValues({
        accountUserId: original.accountUserId,
        accessFencedAt: original.accessFencedAt,
        attempts: 0,
        billingCheckedAt: original.billingCheckedAt,
        billingGuardStatus: original.billingGuardStatus,
        createdAt: now,
        generation,
        idempotencyKey: operationId,
        identityClerkUserId: original.identityClerkUserId,
        kind: "account",
        leaseVersion: 0,
        maxAttempts: ACCOUNT_DELETION_MAX_ATTEMPTS,
        nextAttemptAt: now,
        operationId,
        phase,
        purgeStage,
        quiescedAt: original.quiescedAt,
        requestedByUserId: original.requestedByUserId,
        resourceKey: original.resourceKey,
        scheduledAt: now,
        status: "pending",
        supersedesJobId: original._id,
        updatedAt: now,
        workflowVersion: ACCOUNT_DELETION_WORKFLOW_VERSION,
        workspaceId: original.workspaceId,
      }),
    )) as DeletionJobId
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.account_deletion.retry_created",
        metadata: { supersedesJobId: String(original._id) },
        targetId: String(deletionJobId),
        targetType: "deletionJob",
      },
      now,
    )
    const created = (await ctx.db.get(
      "deletionJobs",
      deletionJobId,
    )) as GenericRow | null
    if (!created) {
      adminError("DELETION_RETRY_FAILED", "Deletion retry was not persisted")
    }
    return formatDeletionJob(created)
  },
})

export const cancelDeletionJob = adminMutation({
  args: {
    confirmation: v.string(),
    deletionJobId: v.id("deletionJobs"),
  },
  returns: deletionJobResultValidator,
  handler: async (ctx, args) => {
    if (args.confirmation !== "CANCEL") {
      adminError("CONFIRMATION_MISMATCH", "Type CANCEL to stop deletion")
    }
    const job = (await ctx.db.get(
      "deletionJobs",
      args.deletionJobId,
    )) as GenericRow | null
    if (!job) {
      adminError("DELETION_JOB_NOT_FOUND", "Deletion job not found")
    }
    if (
      job.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION ||
      job.quiescedAt !== undefined ||
      job.status === "canceled" ||
      job.status === "completed" ||
      job.status === "dead"
    ) {
      adminError(
        "DELETION_CANCEL_REJECTED",
        "Deletion can only be canceled before tenant quiescence",
      )
    }

    const now = Date.now()
    const user = await ctx.db.get("users", job.accountUserId as UserId)
    const workspace = await ctx.db.get(
      "workspaces",
      job.workspaceId as WorkspaceId,
    )
    if (user && user.disabledAt === job.accessFencedAt) {
      await ctx.db.patch("users", job.accountUserId as UserId, {
        disabledAt: undefined,
        updatedAt: now,
      })
    }
    if (workspace && workspace.deletionPendingAt === job.accessFencedAt) {
      await ctx.db.patch("workspaces", job.workspaceId as WorkspaceId, {
        deletionPendingAt: undefined,
        updatedAt: now,
      })
    }
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      lastError: "CANCELED_BY_OPERATOR",
      lastErrorCode: "CANCELED_BY_OPERATOR",
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt: undefined,
      status: "canceled",
      updatedAt: now,
    })
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.account_deletion.canceled",
        targetId: String(args.deletionJobId),
        targetType: "deletionJob",
      },
      now,
    )
    const canceled = (await ctx.db.get(
      "deletionJobs",
      args.deletionJobId,
    )) as GenericRow | null
    if (!canceled) {
      adminError(
        "DELETION_CANCEL_FAILED",
        "Deletion cancellation was not persisted",
      )
    }
    return formatDeletionJob(canceled)
  },
})

export const listFeatureRequests = adminQuery({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    sort: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
    status: v.optional(featureRequestStatusValidator),
  },
  returns: v.object({
    items: v.array(featureRequestResultValidator),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      adminError(
        "INVALID_ADMIN_INPUT",
        "Feature request page limit must be 1 to 50",
      )
    }
    const order = args.sort === "oldest" ? "asc" : "desc"
    const result = args.status
      ? await ctx.db
          .query("featureRequests")
          .withIndex("by_status_and_created_at", (q) =>
            indexEquals(q, ["status", args.status]),
          )
          .order(order)
          .paginate({ cursor: args.cursor ?? null, numItems: limit })
      : await ctx.db
          .query("featureRequests")
          .withIndex("by_created_at")
          .order(order)
          .paginate({ cursor: args.cursor ?? null, numItems: limit })

    return {
      items: await Promise.all(
        result.page.map(async (row) => await formatFeatureRequest(ctx, row)),
      ),
      ...(result.isDone ? {} : { nextCursor: result.continueCursor }),
    }
  },
})

export const updateFeatureRequest = adminMutation({
  args: {
    adminNote: v.optional(v.string()),
    requestId: v.id("featureRequests"),
    status: featureRequestStatusValidator,
  },
  returns: featureRequestResultValidator,
  handler: async (ctx, args) => {
    const requestId = args.requestId as FeatureRequestId
    const request = await featureRequestForId(ctx, requestId)
    const adminNote = optionalTrimmedText(args.adminNote, 2_000, "Admin note")
    const now = Date.now()
    const status = args.status as FeatureRequestStatus

    await ctx.db.patch("featureRequests", requestId, {
      ...(args.adminNote === undefined ? {} : { adminNote }),
      completedAt:
        status === "completed"
          ? ((request.completedAt as number | undefined) ?? now)
          : undefined,
      status,
      updatedAt: now,
    })
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.feature_request.updated",
        metadata: {
          adminNoteChanged: args.adminNote !== undefined,
          previousStatus: request.status,
          status,
        },
        targetId: String(requestId),
        targetType: "featureRequest",
      },
      now,
    )

    return await formatFeatureRequest(ctx, {
      ...request,
      ...(args.adminNote === undefined ? {} : { adminNote }),
      status,
      updatedAt: now,
    })
  },
})

export const listChangelogEntries = adminQuery({
  args: {
    cursor: v.optional(v.string()),
    status: v.optional(changelogStatusValidator),
  },
  returns: v.object({
    items: v.array(changelogEntryResultValidator),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const result = args.status
      ? await ctx.db
          .query("changelogEntries")
          .withIndex("by_status_and_updated_at", (q) =>
            indexEquals(q, ["status", args.status]),
          )
          .order("desc")
          .paginate({ cursor: args.cursor ?? null, numItems: 25 })
      : await ctx.db
          .query("changelogEntries")
          .withIndex("by_updated_at")
          .order("desc")
          .paginate({ cursor: args.cursor ?? null, numItems: 25 })
    return {
      items: result.page.map((row) => formatChangelogEntry(row)),
      ...(result.isDone ? {} : { nextCursor: result.continueCursor }),
    }
  },
})

export const createChangelogEntry = adminMutation({
  args: {
    body: v.string(),
    label: v.optional(v.string()),
    publishedAt: v.number(),
    slug: v.string(),
    summary: v.string(),
    title: v.string(),
  },
  returns: changelogEntryResultValidator,
  handler: async (ctx, args) => {
    const slug = validatedSlug(args.slug)
    await assertAvailableSlug(ctx, slug)
    const label = optionalTrimmedText(args.label, 40, "Label")
    const now = Date.now()
    const entryId = (await ctx.db.insert("changelogEntries", {
      body: requiredTrimmedText(args.body, 1, 30_000, "Body"),
      createdAt: now,
      createdByClerkUserId: ctx.adminIdentity.subject,
      ...(label === undefined ? {} : { label }),
      requestedPublicationAt: validatedPublicationTimestamp(args.publishedAt),
      slug,
      status: "draft",
      summary: requiredTrimmedText(args.summary, 1, 280, "Summary"),
      title: requiredTrimmedText(args.title, 1, 160, "Title"),
      updatedAt: now,
      updatedByClerkUserId: ctx.adminIdentity.subject,
    })) as ChangelogEntryId
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.changelog.created",
        metadata: { slug, status: "draft" },
        targetId: String(entryId),
        targetType: "changelogEntry",
      },
      now,
    )

    return formatChangelogEntry(await changelogEntryForId(ctx, entryId))
  },
})

export const updateChangelogEntry = adminMutation({
  args: {
    body: v.string(),
    entryId: v.id("changelogEntries"),
    label: v.string(),
    publishedAt: v.number(),
    slug: v.string(),
    summary: v.string(),
    title: v.string(),
  },
  returns: changelogEntryResultValidator,
  handler: async (ctx, args) => {
    const entryId = args.entryId as ChangelogEntryId
    const entry = await changelogEntryForId(ctx, entryId)
    if (entry.status !== "draft") {
      adminError(
        "CHANGELOG_ENTRY_NOT_EDITABLE",
        "Published changelog entries must be unpublished before editing",
      )
    }

    const slug = validatedSlug(args.slug)
    await assertAvailableSlug(ctx, slug, entryId)
    const label = optionalTrimmedText(args.label, 40, "Label")
    const now = Date.now()
    const patch = {
      body: requiredTrimmedText(args.body, 1, 30_000, "Body"),
      label,
      requestedPublicationAt: validatedPublicationTimestamp(args.publishedAt),
      slug,
      summary: requiredTrimmedText(args.summary, 1, 280, "Summary"),
      title: requiredTrimmedText(args.title, 1, 160, "Title"),
      updatedAt: now,
      updatedByClerkUserId: ctx.adminIdentity.subject,
    }
    await ctx.db.patch("changelogEntries", entryId, patch)
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.changelog.updated",
        metadata: { previousSlug: entry.slug, slug, status: "draft" },
        targetId: String(entryId),
        targetType: "changelogEntry",
      },
      now,
    )

    return formatChangelogEntry({ ...entry, ...patch })
  },
})

export const publishChangelogEntry = adminMutation({
  args: { entryId: v.id("changelogEntries") },
  returns: changelogEntryResultValidator,
  handler: async (ctx, args) => {
    const entryId = args.entryId as ChangelogEntryId
    const entry = await changelogEntryForId(ctx, entryId)
    if (entry.status !== "draft") {
      adminError(
        "CHANGELOG_ENTRY_ALREADY_PUBLISHED",
        "Changelog entry is already published",
      )
    }
    if (typeof entry.requestedPublicationAt !== "number") {
      adminError(
        "INVALID_CHANGELOG_ENTRY",
        "Set a publication date before publishing this entry",
      )
    }

    const now = Date.now()
    const patch = {
      publishedAt: entry.requestedPublicationAt as number,
      requestedPublicationAt: undefined,
      status: "published" as const,
      updatedAt: now,
      updatedByClerkUserId: ctx.adminIdentity.subject,
    }
    await ctx.db.patch("changelogEntries", entryId, patch)
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.changelog.published",
        metadata: { slug: entry.slug, status: "published" },
        targetId: String(entryId),
        targetType: "changelogEntry",
      },
      now,
    )

    return formatChangelogEntry({ ...entry, ...patch })
  },
})

export const unpublishChangelogEntry = adminMutation({
  args: { entryId: v.id("changelogEntries") },
  returns: changelogEntryResultValidator,
  handler: async (ctx, args) => {
    const entryId = args.entryId as ChangelogEntryId
    const entry = await changelogEntryForId(ctx, entryId)
    if (entry.status !== "published") {
      adminError(
        "CHANGELOG_ENTRY_NOT_PUBLISHED",
        "Changelog entry is not published",
      )
    }

    const now = Date.now()
    const patch = {
      publishedAt: undefined,
      requestedPublicationAt: (entry.publishedAt as number | undefined) ?? now,
      status: "draft" as const,
      updatedAt: now,
      updatedByClerkUserId: ctx.adminIdentity.subject,
    }
    await ctx.db.patch("changelogEntries", entryId, patch)
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.changelog.unpublished",
        metadata: { slug: entry.slug, status: "draft" },
        targetId: String(entryId),
        targetType: "changelogEntry",
      },
      now,
    )

    return formatChangelogEntry({ ...entry, ...patch })
  },
})

export const deleteChangelogEntry = adminMutation({
  args: { entryId: v.id("changelogEntries") },
  returns: v.object({ id: v.id("changelogEntries") }),
  handler: async (ctx, args) => {
    const entryId = args.entryId as ChangelogEntryId
    const entry = await changelogEntryForId(ctx, entryId)
    const now = Date.now()
    await ctx.db.delete("changelogEntries", entryId)
    await auditAdminMutation(
      ctx,
      ctx.adminIdentity,
      {
        action: "admin.changelog.deleted",
        metadata: { slug: entry.slug, status: entry.status },
        targetId: String(entryId),
        targetType: "changelogEntry",
      },
      now,
    )
    return { id: entryId }
  },
})
