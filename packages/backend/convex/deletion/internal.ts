import { internal } from "../_generated/api"
import { v } from "convex/values"
import {
  adjustWorkspaceCountMetric,
  syncUsagePausedWorkspaceMetric,
  transitionSubscriptionMetrics,
} from "../lib/operationalMetrics"
import { transitionCategorizationStatusMetric } from "../categorization/metrics"
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { readDeletionBillingSnapshot } from "./billing"
import {
  ACCOUNT_DELETION_BATCH_SIZE,
  ACCOUNT_DELETION_LEASE_MS,
  ACCOUNT_DELETION_PURGE_STAGES,
  ACCOUNT_DELETION_WORKFLOW_VERSION,
  type AccountDeletionJobStatus,
  type AccountDeletionPhase,
  type AccountDeletionPurgeStage,
  canClaimDeletionJob,
  createDeletionContinuationLease,
  createDeletionLease,
  nextPurgeStage,
  planDeletionFailure,
  safeDeletionErrorCode,
} from "./model"
import { restoreDeletionFenceState } from "./recovery"

const MAX_DELETION_CLAIMS = 8
const MAX_DUE_SCAN_PER_STATUS = 32

type DeletionJobId = Id<"deletionJobs">
type UserId = Id<"users">
type WorkspaceId = Id<"workspaces">

export type AccountDeletionLeaseArguments = {
  deletionJobId: DeletionJobId
  leaseToken: string
  leaseVersion: number
}

export type AccountDeletionExecutionContext =
  | { state: "stale_lease" }
  | {
      accountUserId: UserId
      attempts: number
      billingGuard: Awaited<
        ReturnType<typeof readDeletionBillingSnapshot>
      >["guard"]
      clerkUserId: string
      maxAttempts: number
      phase: AccountDeletionPhase
      securityFenceExpiresAt?: number | undefined
      state: "ready"
      subscriptions: Array<{
        cancelAtPeriodEnd?: boolean | undefined
        entitlementStatus: string
        providerSubscriptionId: string
        status?: string | undefined
      }>
      workspaceId: WorkspaceId
    }

const WORKSPACE_INDEXED_PURGE_STAGES = [
  "audit_events",
  "billing_checkouts",
  "categorization_jobs",
  "categories",
  "digest_preferences",
  "digest_runs",
  "email_outbox",
  "email_webhook_events",
  "feature_requests",
  "keywords",
  "mention_keyword_matches",
  "mentions",
  "provider_runs",
  "saved_views",
  "subscriptions",
  "system_metric_buckets",
  "tracking_provider_pages",
  "tracking_sources",
  "usage_cycles",
  "workspace_members",
] as const

type WorkspaceIndexedPurgeStage =
  (typeof WORKSPACE_INDEXED_PURGE_STAGES)[number]

function deletionStatus(row: Doc<"deletionJobs">): AccountDeletionJobStatus {
  const status = row.status
  if (
    status !== "billing_check" &&
    status !== "blocked" &&
    status !== "canceled" &&
    status !== "completed" &&
    status !== "dead" &&
    status !== "failed" &&
    status !== "leased" &&
    status !== "pending" &&
    status !== "running"
  ) {
    throw new TypeError("Account deletion job has an invalid status")
  }
  return status
}

function deletionPhase(row: Doc<"deletionJobs">): AccountDeletionPhase {
  const phase = row.phase
  if (
    phase !== "billing_check" &&
    phase !== "purge" &&
    phase !== "verify_data" &&
    phase !== "identity_delete" &&
    phase !== "security_fence" &&
    phase !== "done"
  ) {
    throw new TypeError("Account deletion job has an invalid phase")
  }
  return phase
}

function purgeStage(row: Doc<"deletionJobs">): AccountDeletionPurgeStage {
  const stage = row.purgeStage
  if (
    !ACCOUNT_DELETION_PURGE_STAGES.includes(stage as AccountDeletionPurgeStage)
  ) {
    throw new TypeError("Account deletion job has an invalid purge stage")
  }
  return stage as AccountDeletionPurgeStage
}

function currentLeaseMatches(
  row: Doc<"deletionJobs"> | null,
  args: AccountDeletionLeaseArguments,
  now: number,
): row is Doc<"deletionJobs"> {
  return Boolean(
    row &&
    row.workflowVersion === ACCOUNT_DELETION_WORKFLOW_VERSION &&
    row.kind === "account" &&
    (row.status === "leased" || row.status === "running") &&
    row.leaseToken === args.leaseToken &&
    row.leaseVersion === args.leaseVersion &&
    typeof row.leaseExpiresAt === "number" &&
    row.leaseExpiresAt > now,
  )
}

async function currentDeletionJob(
  db: DatabaseReader,
  args: AccountDeletionLeaseArguments,
  now: number,
): Promise<Doc<"deletionJobs"> | null> {
  const row = await db.get("deletionJobs", args.deletionJobId)
  return currentLeaseMatches(row, args, now) ? row : null
}

async function recordDeletionAudit(
  ctx: MutationCtx,
  job: Doc<"deletionJobs">,
  action: string,
  outcome: "denied" | "failure" | "success",
  now: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await ctx.db.insert("auditEvents", {
    action,
    actorType: "system",
    createdAt: now,
    metadataJson: JSON.stringify({
      attempt: job.attempts,
      operationId: job.operationId,
      phase: job.phase,
      workflowVersion: job.workflowVersion,
      ...metadata,
    }),
    outcome,
    targetId: String(job._id),
    targetType: "deletionJob",
  })
}

async function dueJobsForStatus(
  ctx: MutationCtx,
  status: "failed" | "leased" | "pending" | "running",
  now: number,
): Promise<Doc<"deletionJobs">[]> {
  if (status === "pending" || status === "failed") {
    return await ctx.db
      .query("deletionJobs")
      .withIndex("by_status_and_next_attempt_at", (q) =>
        q.eq("status", status).lte("nextAttemptAt", now),
      )
      .take(MAX_DUE_SCAN_PER_STATUS)
  }
  return await ctx.db
    .query("deletionJobs")
    .withIndex("by_status_and_lease_expires_at", (q) =>
      q.eq("status", status).lte("leaseExpiresAt", now),
    )
    .take(MAX_DUE_SCAN_PER_STATUS)
}

async function dueAccountDeletionJobs(
  ctx: MutationCtx,
  now: number,
): Promise<Doc<"deletionJobs">[]> {
  const rows = (
    await Promise.all(
      (["pending", "failed", "leased", "running"] as const).map(
        async (status) => await dueJobsForStatus(ctx, status, now),
      ),
    )
  ).flat()
  const unique = new Map<string, Doc<"deletionJobs">>()
  for (const row of rows) {
    unique.set(String(row._id), row)
  }
  return [...unique.values()]
    .filter(
      (row) =>
        row.workflowVersion === ACCOUNT_DELETION_WORKFLOW_VERSION &&
        row.kind === "account" &&
        canClaimDeletionJob({
          leaseExpiresAt: row.leaseExpiresAt as number | undefined,
          nextAttemptAt: row.nextAttemptAt as number | undefined,
          now,
          status: deletionStatus(row),
        }),
    )
    .sort(
      (left, right) =>
        (((left.status === "leased" || left.status === "running"
          ? left.leaseExpiresAt
          : left.nextAttemptAt) as number | undefined) ?? 0) -
          (((right.status === "leased" || right.status === "running"
            ? right.leaseExpiresAt
            : right.nextAttemptAt) as number | undefined) ?? 0) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )
    .slice(0, MAX_DELETION_CLAIMS)
}

export const dispatchDueAccountDeletions = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const due = await dueAccountDeletionJobs(ctx, now)
    let claimed = 0
    let dead = 0

    for (const row of due) {
      const attempts = row.attempts as number
      const maxAttempts = row.maxAttempts as number
      if (attempts >= maxAttempts) {
        await ctx.db.patch("deletionJobs", row._id as DeletionJobId, {
          lastError: "ACCOUNT_DELETION_ATTEMPTS_EXHAUSTED",
          lastErrorCode: "ACCOUNT_DELETION_ATTEMPTS_EXHAUSTED",
          leaseExpiresAt: undefined,
          leaseToken: undefined,
          nextAttemptAt: undefined,
          status: "dead",
          updatedAt: now,
        })
        await recordDeletionAudit(
          ctx,
          row,
          "account.deletion.dead",
          "failure",
          now,
          { errorCode: "ACCOUNT_DELETION_ATTEMPTS_EXHAUSTED" },
        )
        dead += 1
        continue
      }

      const lease = createDeletionLease({
        attempts,
        jobId: String(row._id),
        leaseVersion: (row.leaseVersion as number | undefined) ?? 0,
        now,
      })
      await ctx.db.patch("deletionJobs", row._id as DeletionJobId, {
        attempts: lease.attempts,
        leaseExpiresAt: lease.expiresAt,
        leaseToken: lease.token,
        leaseVersion: lease.version,
        nextAttemptAt: undefined,
        status: "leased",
        updatedAt: now,
      })
      await recordDeletionAudit(
        ctx,
        { ...row, attempts: lease.attempts },
        "account.deletion.claimed",
        "success",
        now,
      )
      await ctx.scheduler.runAfter(
        0,
        internal.deletion.actions.runAccountDeletion,
        {
          deletionJobId: row._id as DeletionJobId,
          leaseToken: lease.token,
          leaseVersion: lease.version,
        },
      )
      claimed += 1
    }

    return { claimed, dead, state: "dispatched" as const }
  },
})

export const startAccountDeletionAttempt = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<AccountDeletionExecutionContext> => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job || job.identityClerkUserId === undefined) {
      return { state: "stale_lease" }
    }
    const phase = deletionPhase(job)
    const snapshot = await readDeletionBillingSnapshot(
      ctx.db,
      job.workspaceId as WorkspaceId,
      now,
    )
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      status: "running",
      updatedAt: now,
    })

    return {
      accountUserId: job.accountUserId,
      attempts: job.attempts as number,
      billingGuard: snapshot.guard,
      clerkUserId: job.identityClerkUserId,
      maxAttempts: job.maxAttempts as number,
      phase,
      securityFenceExpiresAt: job.securityFenceExpiresAt as number | undefined,
      state: "ready",
      subscriptions: snapshot.subscriptions,
      workspaceId: job.workspaceId as WorkspaceId,
    }
  },
})

export const blockAccountDeletionForBilling = internalMutation({
  args: {
    code: v.string(),
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job || deletionPhase(job) !== "billing_check") {
      return { state: "stale_lease" as const }
    }
    const errorCode = safeDeletionErrorCode(args.code)
    const user = await ctx.db.get("users", job.accountUserId)
    const workspace = await ctx.db.get(
      "workspaces",
      job.workspaceId as WorkspaceId,
    )
    if (
      user &&
      user.deletedAt === undefined &&
      user.disabledAt === job.accessFencedAt
    ) {
      await ctx.db.patch("users", user._id, {
        disabledAt: undefined,
        updatedAt: now,
      })
    }
    const restoresWorkspaceFence =
      workspace &&
      workspace.deletedAt === undefined &&
      workspace.deletionPendingAt === job.accessFencedAt
    if (restoresWorkspaceFence) {
      await ctx.db.patch("workspaces", workspace._id as WorkspaceId, {
        deletionPendingAt: undefined,
        updatedAt: now,
      })
      await restoreDeletionFenceState(
        ctx,
        workspace._id as WorkspaceId,
        job.accessFencedAt as number,
        now,
      )
    }
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      billingCheckedAt: now,
      billingGuardStatus: "blocked_active",
      lastError: errorCode,
      lastErrorCode: errorCode,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt: undefined,
      status: "blocked",
      updatedAt: now,
    })
    await recordDeletionAudit(
      ctx,
      job,
      "account.deletion.billing_blocked",
      "denied",
      now,
      { errorCode },
    )
    return { state: "blocked" as const }
  },
})

export const beginAccountDeletionPurge = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
    providerVerifiedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job || deletionPhase(job) !== "billing_check") {
      return { state: "stale_lease" as const }
    }
    if (
      args.providerVerifiedAt > now ||
      now - args.providerVerifiedAt > ACCOUNT_DELETION_LEASE_MS
    ) {
      return { state: "provider_verification_expired" as const }
    }

    const snapshot = await readDeletionBillingSnapshot(
      ctx.db,
      job.workspaceId as WorkspaceId,
      now,
    )
    if (snapshot.guard.status !== "confirmed_inactive") {
      return {
        code:
          "code" in snapshot.guard
            ? snapshot.guard.code
            : "BILLING_RECONCILIATION_REQUIRED",
        state: "billing_blocked" as const,
      }
    }

    const user = await ctx.db.get("users", job.accountUserId)
    const workspace = await ctx.db.get(
      "workspaces",
      job.workspaceId as WorkspaceId,
    )
    if (
      !user ||
      !workspace ||
      user.clerkUserId !== job.identityClerkUserId ||
      user.disabledAt !== job.accessFencedAt ||
      workspace.deletionPendingAt !== job.accessFencedAt ||
      workspace.ownerUserId !== user._id
    ) {
      return { state: "account_state_invalid" as const }
    }
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", user._id),
      )
      .unique()
    if (!membership || membership.role !== "owner") {
      return { state: "account_state_invalid" as const }
    }

    await ctx.db.patch("users", user._id, {
      deletedAt: now,
      disabledAt: job.accessFencedAt,
      updatedAt: now,
    })
    await ctx.db.patch("workspaces", workspace._id as WorkspaceId, {
      deletedAt: now,
      deletionPendingAt: job.accessFencedAt,
      updatedAt: now,
    })
    await ctx.db.patch("workspaceMembers", membership._id, {
      revokedAt: now,
      updatedAt: now,
    })
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      billingCheckedAt: now,
      billingGuardStatus: "confirmed_inactive",
      lastError: undefined,
      lastErrorCode: undefined,
      phase: "purge",
      purgeStage: ACCOUNT_DELETION_PURGE_STAGES[0],
      quiescedAt: now,
      status: "running",
      updatedAt: now,
    })
    await recordDeletionAudit(
      ctx,
      { ...job, phase: "purge" },
      "account.deletion.quiesced",
      "success",
      now,
    )
    return { state: "ready" as const }
  },
})

async function workspaceRows(
  db: DatabaseReader,
  stage: WorkspaceIndexedPurgeStage,
  workspaceId: WorkspaceId,
  limit: number,
) {
  switch (stage) {
    case "audit_events":
      return await db
        .query("auditEvents")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "billing_checkouts":
      return await db
        .query("billingCheckouts")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "categorization_jobs":
      return await db
        .query("categorizationJobs")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "categories":
      return await db
        .query("categories")
        .withIndex("by_workspace_and_sort_order", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "digest_preferences":
      return await db
        .query("digestPreferences")
        .withIndex("by_workspace_and_updated_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "digest_runs":
      return await db
        .query("digestRuns")
        .withIndex("by_workspace_and_scheduled_for", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "email_outbox":
      return await db
        .query("emailOutbox")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "email_webhook_events":
      return await db
        .query("emailWebhookEvents")
        .withIndex("by_workspace_and_received_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "feature_requests":
      return await db
        .query("featureRequests")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "keywords":
      return await db
        .query("keywords")
        .withIndex("by_workspace_and_updated_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "mention_keyword_matches":
      return await db
        .query("mentionKeywordMatches")
        .withIndex("by_workspace_and_mention", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "mentions":
      return await db
        .query("mentions")
        .withIndex("by_workspace_and_published_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "provider_runs":
      return await db
        .query("providerRuns")
        .withIndex("by_workspace_and_started_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "saved_views":
      return await db
        .query("savedViews")
        .withIndex("by_workspace_and_updated_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "subscriptions":
      return await db
        .query("subscriptions")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(limit)
    case "system_metric_buckets":
      return await db
        .query("systemMetricBuckets")
        .withIndex("by_workspace_and_bucket", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "tracking_provider_pages":
      return await db
        .query("trackingProviderPages")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "tracking_sources":
      return await db
        .query("trackingSources")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "usage_cycles":
      return await db
        .query("usageCycles")
        .withIndex("by_workspace_and_period_start", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(limit)
    case "workspace_members":
      return await db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(limit)
  }
}

async function purgeWorkspaceIndexedStage(
  ctx: MutationCtx,
  stage: WorkspaceIndexedPurgeStage,
  workspaceId: WorkspaceId,
  now: number,
): Promise<number> {
  if (stage === "categorization_jobs") {
    const rows = await ctx.db
      .query("categorizationJobs")
      .withIndex("by_workspace_and_created_at", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .take(ACCOUNT_DELETION_BATCH_SIZE)
    for (const row of rows) {
      await transitionCategorizationStatusMetric(ctx, {
        from: row.status,
        updatedAt: now,
        workspaceId,
      })
      await ctx.db.delete(row._id)
    }
    return rows.length
  }
  if (stage === "subscriptions") {
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(ACCOUNT_DELETION_BATCH_SIZE)
    for (const row of rows) {
      await transitionSubscriptionMetrics(ctx, {
        from: row,
        updatedAt: now,
        workspaceId,
      })
      await ctx.db.delete(row._id)
    }
    return rows.length
  }
  const rows = await workspaceRows(
    ctx.db,
    stage,
    workspaceId,
    ACCOUNT_DELETION_BATCH_SIZE,
  )
  for (const row of rows) {
    await ctx.db.delete(row._id)
  }
  if (stage === "tracking_sources") {
    await syncUsagePausedWorkspaceMetric(ctx, workspaceId, now)
  }
  return rows.length
}

async function redactBillingEvents(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<number> {
  const rows = await ctx.db
    .query("billingEvents")
    .withIndex("by_workspace_redacted_and_received_at", (q) =>
      q.eq("workspaceId", workspaceId).eq("redactedAt", undefined),
    )
    .take(ACCOUNT_DELETION_BATCH_SIZE)
  for (const row of rows) {
    await ctx.db.patch("billingEvents", row._id, {
      lastError: undefined,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt: undefined,
      objectId: undefined,
      payloadJson: "{}",
      redactedAt: now,
      updatedAt: now,
    })
  }
  return rows.length
}

async function purgeSpecialStage(
  ctx: MutationCtx,
  job: Doc<"deletionJobs">,
  stage: "user_tombstone" | "workspace",
  now: number,
): Promise<number> {
  if (stage === "workspace") {
    const workspace = await ctx.db.get(
      "workspaces",
      job.workspaceId as WorkspaceId,
    )
    if (!workspace) {
      return 0
    }
    await adjustWorkspaceCountMetric(ctx, {
      delta: -1,
      updatedAt: now,
      workspaceId: job.workspaceId as WorkspaceId,
    })
    await ctx.db.delete("workspaces", job.workspaceId as WorkspaceId)
    return 1
  }

  const user = await ctx.db.get("users", job.accountUserId)
  if (!user) {
    return 0
  }
  const alreadyScrubbed =
    user.email === undefined &&
    user.imageUrl === undefined &&
    user.name === undefined &&
    user.personalWorkspaceId === undefined
  if (alreadyScrubbed) {
    return 0
  }
  await ctx.db.patch("users", user._id, {
    email: undefined,
    imageUrl: undefined,
    name: undefined,
    personalWorkspaceId: undefined,
    updatedAt: now,
  })
  return 1
}

export const purgeAccountDeletionBatch = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job || deletionPhase(job) !== "purge") {
      return { state: "stale_lease" as const }
    }
    const stage = purgeStage(job)
    let affected = 0
    if (stage === "billing_events") {
      affected = await redactBillingEvents(
        ctx,
        job.workspaceId as WorkspaceId,
        now,
      )
    } else if (stage === "workspace" || stage === "user_tombstone") {
      affected = await purgeSpecialStage(ctx, job, stage, now)
    } else {
      affected = await purgeWorkspaceIndexedStage(
        ctx,
        stage,
        job.workspaceId as WorkspaceId,
        now,
      )
    }

    const stageComplete = affected < ACCOUNT_DELETION_BATCH_SIZE
    const next = stageComplete ? nextPurgeStage(stage) : stage
    if (stageComplete) {
      await recordDeletionAudit(
        ctx,
        job,
        "account.deletion.purge_stage_completed",
        "success",
        now,
        { stage },
      )
    }
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      leaseExpiresAt: now + ACCOUNT_DELETION_LEASE_MS,
      ...(next === null
        ? { phase: "verify_data", purgeStage: undefined }
        : { purgeStage: next }),
      updatedAt: now,
    })
    return {
      affected,
      phase: next === null ? ("verify_data" as const) : ("purge" as const),
      stage: next,
      state: "advanced" as const,
    }
  },
})

async function hasWorkspaceRows(
  db: DatabaseReader,
  workspaceId: WorkspaceId,
): Promise<boolean> {
  for (const stage of WORKSPACE_INDEXED_PURGE_STAGES) {
    if ((await workspaceRows(db, stage, workspaceId, 1)).length > 0) {
      return true
    }
  }
  const unredactedBillingEvent = await db
    .query("billingEvents")
    .withIndex("by_workspace_redacted_and_received_at", (q) =>
      q.eq("workspaceId", workspaceId).eq("redactedAt", undefined),
    )
    .first()
  return unredactedBillingEvent !== null
}

export const verifyAccountDeletionData = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job || deletionPhase(job) !== "verify_data") {
      return { state: "stale_lease" as const }
    }
    if (await hasWorkspaceRows(ctx.db, job.workspaceId as WorkspaceId)) {
      return { state: "data_remaining" as const }
    }
    const workspace = await ctx.db.get(
      "workspaces",
      job.workspaceId as WorkspaceId,
    )
    const user = await ctx.db.get("users", job.accountUserId)
    if (
      workspace ||
      !user ||
      user.deletedAt === undefined ||
      user.disabledAt === undefined ||
      user.email !== undefined ||
      user.imageUrl !== undefined ||
      user.name !== undefined ||
      user.personalWorkspaceId !== undefined ||
      user.clerkUserId !== job.identityClerkUserId
    ) {
      return { state: "data_remaining" as const }
    }

    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      dataDeletionVerifiedAt: now,
      phase: "identity_delete",
      updatedAt: now,
    })
    await recordDeletionAudit(
      ctx,
      { ...job, phase: "identity_delete" },
      "account.deletion.data_verified",
      "success",
      now,
    )
    return { state: "verified" as const }
  },
})

export const loadIdentityDeletionContext = internalQuery({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (
      !job ||
      deletionPhase(job) !== "identity_delete" ||
      typeof job.dataDeletionVerifiedAt !== "number" ||
      typeof job.identityClerkUserId !== "string" ||
      job.identityClerkUserId.length === 0 ||
      (await hasWorkspaceRows(ctx.db, job.workspaceId as WorkspaceId))
    ) {
      return { state: "not_ready" as const }
    }
    return {
      clerkUserId: job.identityClerkUserId,
      state: "ready" as const,
    }
  },
})

export const completeIdentityDeletion = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    fenceExpiresAt: v.number(),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (
      !job ||
      deletionPhase(job) !== "identity_delete" ||
      typeof job.dataDeletionVerifiedAt !== "number" ||
      args.fenceExpiresAt <= now
    ) {
      return { state: "stale_lease" as const }
    }
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      identityDeletionVerifiedAt: now,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt: args.fenceExpiresAt,
      phase: "security_fence",
      securityFenceExpiresAt: args.fenceExpiresAt,
      status: "pending",
      updatedAt: now,
    })
    await recordDeletionAudit(
      ctx,
      { ...job, phase: "security_fence" },
      "account.deletion.identity_verified",
      "success",
      now,
    )
    return { state: "fenced" as const }
  },
})

export const finalizeSecurityTombstone = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job || deletionPhase(job) !== "security_fence") {
      return { state: "stale_lease" as const }
    }
    const fenceExpiresAt = job.securityFenceExpiresAt as number | undefined
    if (fenceExpiresAt === undefined || fenceExpiresAt > now) {
      await ctx.db.patch("deletionJobs", args.deletionJobId, {
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        nextAttemptAt: fenceExpiresAt ?? now + ACCOUNT_DELETION_LEASE_MS,
        status: "pending",
        updatedAt: now,
      })
      return { state: "waiting" as const }
    }

    const user = await ctx.db.get("users", job.accountUserId)
    if (user) {
      await ctx.db.delete("users", job.accountUserId)
    }
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      completedAt: now,
      identityClerkUserId: undefined,
      lastError: undefined,
      lastErrorCode: undefined,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt: undefined,
      phase: "done",
      status: "completed",
      updatedAt: now,
    })
    await recordDeletionAudit(
      ctx,
      { ...job, phase: "done" },
      "account.deletion.completed",
      "success",
      now,
    )
    return { state: "completed" as const }
  },
})

export const continueAccountDeletion = internalMutation({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job) {
      return { state: "stale_lease" as const }
    }
    const lease = createDeletionContinuationLease({
      attempts: job.attempts as number,
      jobId: String(job._id),
      leaseVersion: job.leaseVersion as number,
      now,
    })
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      attempts: lease.attempts,
      leaseExpiresAt: lease.expiresAt,
      leaseToken: lease.token,
      leaseVersion: lease.version,
      nextAttemptAt: undefined,
      status: "leased",
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.deletion.actions.runAccountDeletion,
      {
        deletionJobId: args.deletionJobId,
        leaseToken: lease.token,
        leaseVersion: lease.version,
      },
    )
    return { state: "continued" as const }
  },
})

export const failAccountDeletionAttempt = internalMutation({
  args: {
    code: v.string(),
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
    now: v.optional(v.number()),
    retryable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const job = await currentDeletionJob(ctx.db, args, now)
    if (!job) {
      return { state: "stale_lease" as const }
    }
    const errorCode = safeDeletionErrorCode(args.code)
    const plan = planDeletionFailure({
      attempts: job.attempts as number,
      maxAttempts: job.maxAttempts as number,
      now,
      retryable: args.retryable,
    })
    await ctx.db.patch("deletionJobs", args.deletionJobId, {
      lastError: errorCode,
      lastErrorCode: errorCode,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt: plan.status === "failed" ? plan.nextAttemptAt : undefined,
      status: plan.status,
      updatedAt: now,
    })
    await recordDeletionAudit(
      ctx,
      job,
      plan.status === "dead"
        ? "account.deletion.dead"
        : "account.deletion.retry_scheduled",
      "failure",
      now,
      { errorCode },
    )
    return {
      ...(plan.status === "failed"
        ? { nextAttemptAt: plan.nextAttemptAt }
        : {}),
      state: plan.status,
    }
  },
})
