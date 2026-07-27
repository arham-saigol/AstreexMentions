import { type GenericId, v } from "convex/values"

import {
  DEEPSEEK_CATEGORIZATION_MODEL,
  MAX_CATEGORIZATION_BATCH_SIZE,
  type CategorizationCategory,
  type CategorizationMention,
} from "../lib/deepseekCategorization"
import {
  internalActionReference,
  internalMutationReference,
  internalQueryReference,
} from "../lib/functionReferences"
import { indexAtMost } from "../lib/jobRuntime"
import {
  indexEquals,
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../server"
import {
  parseCategorySnapshotJson,
  parseCategorizationResultsJson,
} from "./contracts"
import {
  categorySnapshotJson,
  createCategorizationLease,
  mentionText,
  planCategorizationFailure,
  validateCategorizationApplication,
  type CategorizationJobForClaim,
} from "./model"

const MAX_DUE_SCAN = 256
const MAX_BATCHES_PER_DISPATCH = 4
const MAX_WORKSPACES_PER_DISPATCH = 16
const BLOCKED_CONFIGURATION_RETRY_MS = 5 * 60_000
const HOUR_MS = 3_600_000
const DEEPSEEK_CATEGORIZATION_OPERATION = "chat.completions"

type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type CategorizationJobId = GenericId<"categorizationJobs">
type CategoryId = GenericId<"categories">
type MentionId = GenericId<"mentions">
type ProviderMetricBucketId = GenericId<"providerMetricBuckets">
type ProviderRunId = GenericId<"providerRuns">
type WorkspaceId = GenericId<"workspaces">

export type CategorizationBatchLeaseArguments = {
  categorySnapshotJson: string
  jobIds: CategorizationJobId[]
  leaseToken: string
}

type LeasedBatch = {
  jobs: GenericRow[]
  workspaceId: WorkspaceId
}

type EnabledCategorySnapshot = {
  categories: CategorizationCategory[]
  json: string
}

export type CategorizationBatchExecutionContext =
  | { state: "stale_lease" }
  | {
      errorCode: string
      retryable: boolean
      state: "invalid_batch"
    }
  | {
      categories: CategorizationCategory[]
      mentions: CategorizationMention[]
      state: "ready"
    }

function dueAt(row: GenericRow): number {
  return ((row.status === "leased" ? row.leaseExpiresAt : row.nextAttemptAt) ??
    0) as number
}

function hasValidAttemptCounters(row: GenericRow): boolean {
  return (
    Number.isSafeInteger(row.attempts) &&
    (row.attempts as number) >= 0 &&
    Number.isSafeInteger(row.maxAttempts) &&
    (row.maxAttempts as number) >= 1
  )
}

function jobForClaim(row: GenericRow): CategorizationJobForClaim {
  return {
    attempts: row.attempts as number,
    id: String(row._id),
    maxAttempts: row.maxAttempts as number,
    nextAttemptAt: row.nextAttemptAt as number | undefined,
    status: row.status as CategorizationJobForClaim["status"],
    workspaceId: String(row.workspaceId),
  }
}

function providerRunIdempotencyKey(leaseToken: string): string {
  return `deepseek:categorization:${leaseToken}`
}

async function findProviderRun(
  ctx: MutationCtx,
  leaseToken: string,
): Promise<GenericRow | null> {
  return (await ctx.db
    .query("providerRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", providerRunIdempotencyKey(leaseToken)),
    )
    .unique()) as GenericRow | null
}

function rateLimited(errorCode: string | undefined): number {
  if (errorCode === undefined) {
    return 0
  }
  const normalized = errorCode.trim().toUpperCase()
  return normalized === "RATE_LIMIT" || normalized === "HTTP_429" ? 1 : 0
}

async function recordProviderMetric(
  ctx: MutationCtx,
  input: {
    durationMs: number
    errorCode?: string | undefined
    inputCount: number
    outputCount: number
    retry: boolean
    status: "failed" | "succeeded"
  },
  now: number,
): Promise<void> {
  const bucketStartAt = Math.floor(now / HOUR_MS) * HOUR_MS
  const bucketEndAt = bucketStartAt + HOUR_MS
  const bucket = (await ctx.db
    .query("providerMetricBuckets")
    .withIndex("by_provider_operation_granularity_and_bucket", (q) =>
      indexEquals(
        q,
        ["provider", "deepseek"],
        ["operation", DEEPSEEK_CATEGORIZATION_OPERATION],
        ["granularity", "hour"],
        ["bucketStartAt", bucketStartAt],
      ),
    )
    .unique()) as GenericRow | null
  const durationMs = Math.max(0, Math.round(input.durationMs))
  const failureIncrement = input.status === "failed" ? 1 : 0
  const successIncrement = input.status === "succeeded" ? 1 : 0
  const retryIncrement = input.retry ? 1 : 0
  const rateLimitedIncrement = rateLimited(input.errorCode)

  if (bucket) {
    await ctx.db.patch(
      "providerMetricBuckets",
      bucket._id as ProviderMetricBucketId,
      {
        failureCount: (bucket.failureCount as number) + failureIncrement,
        inputItemCount: (bucket.inputItemCount as number) + input.inputCount,
        latencyMaxMs: Math.max(bucket.latencyMaxMs as number, durationMs),
        latencyTotalMs: (bucket.latencyTotalMs as number) + durationMs,
        outputItemCount: (bucket.outputItemCount as number) + input.outputCount,
        rateLimitedCount:
          (bucket.rateLimitedCount as number) + rateLimitedIncrement,
        requestCount: (bucket.requestCount as number) + 1,
        retryCount: (bucket.retryCount as number) + retryIncrement,
        successCount: (bucket.successCount as number) + successIncrement,
        updatedAt: now,
      },
    )
    return
  }

  await ctx.db.insert("providerMetricBuckets", {
    bucketEndAt,
    bucketStartAt,
    failureCount: failureIncrement,
    granularity: "hour",
    inputItemCount: input.inputCount,
    latencyMaxMs: durationMs,
    latencyTotalMs: durationMs,
    operation: DEEPSEEK_CATEGORIZATION_OPERATION,
    outputItemCount: input.outputCount,
    provider: "deepseek",
    rateLimitedCount: rateLimitedIncrement,
    requestCount: 1,
    retryCount: retryIncrement,
    successCount: successIncrement,
    updatedAt: now,
  })
}

async function finishProviderRun(
  ctx: MutationCtx,
  input: {
    durationMs: number
    errorCode?: string | undefined
    errorMessage?: string | undefined
    outputCount: number
    run: GenericRow
    status: "failed" | "succeeded"
  },
  now: number,
): Promise<void> {
  if (input.run.status !== "running") {
    return
  }
  const durationMs = Math.max(0, Math.round(input.durationMs))
  await ctx.db.patch("providerRuns", input.run._id as ProviderRunId, {
    durationMs,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    finishedAt: now,
    outputCount: input.outputCount,
    status: input.status,
    updatedAt: now,
  })
  await recordProviderMetric(
    ctx,
    {
      durationMs,
      errorCode: input.errorCode,
      inputCount: input.run.inputCount as number,
      outputCount: input.outputCount,
      retry: input.run.trigger === "retry",
      status: input.status,
    },
    now,
  )
}

async function finishExpiredProviderRun(
  ctx: MutationCtx,
  leaseToken: string | undefined,
  now: number,
): Promise<void> {
  if (!leaseToken) {
    return
  }
  const run = await findProviderRun(ctx, leaseToken)
  if (!run || run.status !== "running") {
    return
  }
  await finishProviderRun(
    ctx,
    {
      durationMs: Math.max(0, now - (run.startedAt as number)),
      errorCode: "lease_expired",
      errorMessage: "Categorization worker lease expired",
      outputCount: 0,
      run,
      status: "failed",
    },
    now,
  )
}

async function patchMentionAnalysisState(
  ctx: MutationCtx,
  row: GenericRow,
  analysisState: "completed" | "failed" | "leased" | "pending",
  now: number,
): Promise<void> {
  const mentionId = row.mentionId as MentionId
  const mention = (await ctx.db.get("mentions", mentionId)) as GenericRow | null
  if (mention && mention.workspaceId === row.workspaceId) {
    await ctx.db.patch("mentions", mentionId, { analysisState, updatedAt: now })
  }
}

async function markJobDead(
  ctx: MutationCtx,
  row: GenericRow,
  errorCode: string,
  now: number,
): Promise<void> {
  await ctx.db.patch("categorizationJobs", row._id as CategorizationJobId, {
    completedAt: now,
    lastError: errorCode,
    leaseExpiresAt: undefined,
    leaseToken: undefined,
    nextAttemptAt: undefined,
    status: "dead",
    updatedAt: now,
  })
  await patchMentionAnalysisState(ctx, row, "failed", now)
}

async function recoverExpiredJob(
  ctx: MutationCtx,
  row: GenericRow,
  now: number,
): Promise<GenericRow | null> {
  await finishExpiredProviderRun(ctx, row.leaseToken as string | undefined, now)
  if ((row.attempts as number) >= (row.maxAttempts as number)) {
    await markJobDead(ctx, row, "lease_expired", now)
    return null
  }

  await ctx.db.patch("categorizationJobs", row._id as CategorizationJobId, {
    lastError: "lease_expired",
    leaseExpiresAt: undefined,
    leaseToken: undefined,
    nextAttemptAt: now,
    status: "pending",
    updatedAt: now,
  })
  await patchMentionAnalysisState(ctx, row, "pending", now)
  return {
    ...row,
    lastError: "lease_expired",
    leaseExpiresAt: undefined,
    leaseToken: undefined,
    nextAttemptAt: now,
    status: "pending",
    updatedAt: now,
  }
}

async function dueCategorizationJobs(
  ctx: MutationCtx,
  now: number,
): Promise<GenericRow[]> {
  const [pending, expired] = (await Promise.all([
    ctx.db
      .query("categorizationJobs")
      .withIndex("by_status_and_next_attempt_at", (q) =>
        indexAtMost(
          indexEquals(q, ["status", "pending"]),
          "nextAttemptAt",
          now,
        ),
      )
      .take(MAX_DUE_SCAN),
    ctx.db
      .query("categorizationJobs")
      .withIndex("by_status_and_lease_expires_at", (q) =>
        indexAtMost(
          indexEquals(q, ["status", "leased"]),
          "leaseExpiresAt",
          now,
        ),
      )
      .take(MAX_DUE_SCAN),
  ])) as [GenericRow[], GenericRow[]]

  const rows = [...pending, ...expired]
    .sort(
      (left, right) =>
        dueAt(left) - dueAt(right) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )
    .slice(0, MAX_DUE_SCAN)
  const claimable: GenericRow[] = []

  for (const row of rows) {
    if (
      !hasValidAttemptCounters(row) ||
      row.model !== DEEPSEEK_CATEGORIZATION_MODEL
    ) {
      await markJobDead(ctx, row, "invalid_job", now)
      continue
    }
    if (row.status === "leased") {
      const recovered = await recoverExpiredJob(ctx, row, now)
      if (recovered) {
        claimable.push(recovered)
      }
      continue
    }
    if ((row.attempts as number) >= (row.maxAttempts as number)) {
      await markJobDead(ctx, row, "attempts_exhausted", now)
      continue
    }
    claimable.push(row)
  }

  return claimable
}

async function enabledCategorySnapshot(
  db: DatabaseReader,
  workspaceId: WorkspaceId,
): Promise<EnabledCategorySnapshot | null> {
  const rows = (await db
    .query("categories")
    .withIndex("by_workspace_deleted_enabled_and_sort_order", (q) =>
      indexEquals(
        q,
        ["workspaceId", workspaceId],
        ["deletedAt", undefined],
        ["enabled", true],
      ),
    )
    .collect()) as GenericRow[]
  const otherRows = rows.filter(
    (row) =>
      row.systemKey === "other" &&
      row.isSystem === true &&
      row.name === "Other",
  )
  if (rows.length === 0 || otherRows.length !== 1) {
    return null
  }

  const categories = rows.map((row) => ({
    description: row.description as string,
    id: String(row._id),
    name: row.name as string,
  }))
  try {
    const json = categorySnapshotJson(categories)
    const parsed = parseCategorySnapshotJson(json)
    return { categories: parsed.categories, json }
  } catch {
    return null
  }
}

async function currentBatchLease(
  db: DatabaseReader,
  args: CategorizationBatchLeaseArguments,
  now: number,
): Promise<LeasedBatch | null> {
  if (
    args.jobIds.length === 0 ||
    args.jobIds.length > MAX_CATEGORIZATION_BATCH_SIZE ||
    new Set(args.jobIds.map(String)).size !== args.jobIds.length ||
    args.leaseToken.trim().length === 0
  ) {
    return null
  }

  const jobs = (await Promise.all(
    args.jobIds.map(async (jobId) => await db.get("categorizationJobs", jobId)),
  )) as (GenericRow | null)[]
  const first = jobs[0]
  if (!first) {
    return null
  }
  const workspaceId = first.workspaceId as WorkspaceId
  const leaseExpiresAt = first.leaseExpiresAt
  if (
    typeof leaseExpiresAt !== "number" ||
    leaseExpiresAt <= now ||
    jobs.some(
      (job) =>
        !job ||
        job.status !== "leased" ||
        job.leaseToken !== args.leaseToken ||
        job.leaseExpiresAt !== leaseExpiresAt ||
        job.workspaceId !== workspaceId ||
        job.model !== DEEPSEEK_CATEGORIZATION_MODEL,
    )
  ) {
    return null
  }

  return { jobs: jobs as GenericRow[], workspaceId }
}

async function mentionsForBatch(
  db: DatabaseReader,
  batch: LeasedBatch,
): Promise<CategorizationMention[] | null> {
  const mentionRows = (await Promise.all(
    batch.jobs.map(
      async (job) => await db.get("mentions", job.mentionId as MentionId),
    ),
  )) as (GenericRow | null)[]
  if (
    mentionRows.some(
      (mention, index) =>
        !mention ||
        mention.workspaceId !== batch.workspaceId ||
        String(mention._id) !== String(batch.jobs[index]!.mentionId),
    )
  ) {
    return null
  }

  try {
    return (mentionRows as GenericRow[]).map((mention) => ({
      id: String(mention._id),
      text: mentionText({
        body: mention.body as string,
        ...(mention.title === undefined
          ? {}
          : { title: mention.title as string }),
      }),
    }))
  } catch {
    return null
  }
}

async function completeAlreadyCategorizedJob(
  ctx: MutationCtx,
  row: GenericRow,
  now: number,
): Promise<boolean> {
  const mention = (await ctx.db.get(
    "mentions",
    row.mentionId as MentionId,
  )) as GenericRow | null
  if (
    !mention ||
    mention.workspaceId !== row.workspaceId ||
    mention.categoryId === undefined ||
    mention.analysisState !== "completed"
  ) {
    return false
  }

  await ctx.db.patch("categorizationJobs", row._id as CategorizationJobId, {
    completedAt: now,
    lastError: undefined,
    leaseExpiresAt: undefined,
    leaseToken: undefined,
    nextAttemptAt: undefined,
    status: "completed",
    updatedAt: now,
  })
  return true
}

async function claimableRowsWithMentions(
  ctx: MutationCtx,
  rows: readonly GenericRow[],
  now: number,
): Promise<GenericRow[]> {
  const claimable: GenericRow[] = []
  for (const row of rows) {
    if (await completeAlreadyCategorizedJob(ctx, row, now)) {
      continue
    }
    const mention = (await ctx.db.get(
      "mentions",
      row.mentionId as MentionId,
    )) as GenericRow | null
    if (!mention || mention.workspaceId !== row.workspaceId) {
      await markJobDead(ctx, row, "invalid_mention", now)
      continue
    }
    try {
      mentionText({
        body: mention.body as string,
        ...(mention.title === undefined
          ? {}
          : { title: mention.title as string }),
      })
    } catch {
      await markJobDead(ctx, row, "invalid_mention", now)
      continue
    }
    claimable.push(row)
  }
  return claimable
}

export const dispatchDueCategorizationJobs = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const queue = await dueCategorizationJobs(ctx, now)
    const snapshotByWorkspace = new Map<
      string,
      EnabledCategorySnapshot | null
    >()
    const consideredWorkspaces = new Set<string>()
    let batches = 0
    let blockedCatalog = 0
    let claimed = 0

    while (
      queue.length > 0 &&
      batches < MAX_BATCHES_PER_DISPATCH &&
      consideredWorkspaces.size < MAX_WORKSPACES_PER_DISPATCH
    ) {
      const first = queue[0]!
      const workspaceId = first.workspaceId as WorkspaceId
      const workspaceKey = String(workspaceId)
      consideredWorkspaces.add(workspaceKey)
      const selected: GenericRow[] = []
      for (
        let index = 0;
        index < queue.length && selected.length < MAX_CATEGORIZATION_BATCH_SIZE;
      ) {
        if (queue[index]!.workspaceId === workspaceId) {
          selected.push(queue[index]!)
          queue.splice(index, 1)
        } else {
          index += 1
        }
      }

      let snapshot = snapshotByWorkspace.get(workspaceKey)
      if (snapshot === undefined) {
        snapshot = await enabledCategorySnapshot(ctx.db, workspaceId)
        snapshotByWorkspace.set(workspaceKey, snapshot)
      }
      if (!snapshot) {
        blockedCatalog += selected.length
        for (let index = queue.length - 1; index >= 0; index -= 1) {
          if (queue[index]!.workspaceId === workspaceId) {
            blockedCatalog += 1
            queue.splice(index, 1)
          }
        }
        continue
      }

      const eligible = await claimableRowsWithMentions(ctx, selected, now)
      if (eligible.length === 0) {
        continue
      }
      const lease = createCategorizationLease({
        jobs: eligible.map(jobForClaim),
        now,
        snapshotJson: snapshot.json,
      })
      const jobIds = eligible.map((row) => row._id as CategorizationJobId)
      for (const row of eligible) {
        await ctx.db.patch(
          "categorizationJobs",
          row._id as CategorizationJobId,
          {
            attempts: (row.attempts as number) + 1,
            completedAt: undefined,
            lastError: undefined,
            leaseExpiresAt: lease.expiresAt,
            leaseToken: lease.token,
            nextAttemptAt: undefined,
            startedAt: row.startedAt ?? now,
            status: "leased",
            updatedAt: now,
          },
        )
        await patchMentionAnalysisState(ctx, row, "leased", now)
      }
      await ctx.scheduler.runAfter(0, executeCategorizationBatchReference, {
        categorySnapshotJson: snapshot.json,
        jobIds,
        leaseToken: lease.token,
      })
      batches += 1
      claimed += eligible.length
    }

    return {
      batches,
      blockedCatalog,
      claimed,
      state: "dispatched" as const,
    }
  },
})

export const loadCategorizationBatchContext = internalQuery({
  args: {
    categorySnapshotJson: v.string(),
    jobIds: v.array(v.id("categorizationJobs")),
    leaseToken: v.string(),
  },
  handler: async (ctx, args): Promise<CategorizationBatchExecutionContext> => {
    const now = Date.now()
    const batch = await currentBatchLease(ctx.db, args, now)
    if (!batch) {
      return { state: "stale_lease" }
    }
    const workspace = (await ctx.db.get(
      "workspaces",
      batch.workspaceId,
    )) as GenericRow | null
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      return {
        errorCode: "workspace_unavailable",
        retryable: false,
        state: "invalid_batch",
      }
    }
    const currentSnapshot = await enabledCategorySnapshot(
      ctx.db,
      batch.workspaceId,
    )
    if (
      !currentSnapshot ||
      currentSnapshot.json !== args.categorySnapshotJson
    ) {
      return {
        errorCode: "category_snapshot_changed",
        retryable: true,
        state: "invalid_batch",
      }
    }
    const mentions = await mentionsForBatch(ctx.db, batch)
    if (!mentions) {
      return {
        errorCode: "invalid_mention",
        retryable: false,
        state: "invalid_batch",
      }
    }

    return {
      categories: currentSnapshot.categories,
      mentions,
      state: "ready",
    }
  },
})

export const releaseCategorizationBlockedConfiguration = internalMutation({
  args: {
    categorySnapshotJson: v.string(),
    jobIds: v.array(v.id("categorizationJobs")),
    leaseToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const batch = await currentBatchLease(ctx.db, args, now)
    if (!batch) {
      return { state: "stale_lease" as const }
    }

    for (const job of batch.jobs) {
      await ctx.db.patch("categorizationJobs", job._id as CategorizationJobId, {
        attempts: Math.max(0, (job.attempts as number) - 1),
        lastError: "blocked_config",
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        nextAttemptAt: now + BLOCKED_CONFIGURATION_RETRY_MS,
        status: "pending",
        updatedAt: now,
      })
      await patchMentionAnalysisState(ctx, job, "pending", now)
    }
    return {
      nextAttemptAt: now + BLOCKED_CONFIGURATION_RETRY_MS,
      state: "blocked_config" as const,
    }
  },
})

export const startCategorizationProviderRun = internalMutation({
  args: {
    categorySnapshotJson: v.string(),
    jobIds: v.array(v.id("categorizationJobs")),
    leaseToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const batch = await currentBatchLease(ctx.db, args, now)
    if (!batch) {
      return { state: "stale_lease" as const }
    }
    const workspace = (await ctx.db.get(
      "workspaces",
      batch.workspaceId,
    )) as GenericRow | null
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      return { state: "stale_lease" as const }
    }
    const currentSnapshot = await enabledCategorySnapshot(
      ctx.db,
      batch.workspaceId,
    )
    if (
      !currentSnapshot ||
      currentSnapshot.json !== args.categorySnapshotJson
    ) {
      return { state: "snapshot_changed" as const }
    }

    const idempotencyKey = providerRunIdempotencyKey(args.leaseToken)
    const existing = await findProviderRun(ctx, args.leaseToken)
    if (existing) {
      return { state: "duplicate" as const }
    }
    const attempt = Math.max(...batch.jobs.map((job) => job.attempts as number))
    await ctx.db.insert("providerRuns", {
      attempt,
      createdAt: now,
      idempotencyKey,
      inputCount: batch.jobs.length,
      operation: DEEPSEEK_CATEGORIZATION_OPERATION,
      outputCount: 0,
      provider: "deepseek",
      startedAt: now,
      status: "running",
      trigger: attempt > 1 ? "retry" : "scheduled",
      updatedAt: now,
      workspaceId: batch.workspaceId,
    })
    return { state: "started" as const }
  },
})

export const applyCategorizationBatch = internalMutation({
  args: {
    categorySnapshotJson: v.string(),
    durationMs: v.number(),
    jobIds: v.array(v.id("categorizationJobs")),
    leaseToken: v.string(),
    resultsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const batch = await currentBatchLease(ctx.db, args, now)
    if (!batch) {
      return { state: "stale_lease" as const }
    }
    const run = await findProviderRun(ctx, args.leaseToken)
    if (!run || run.status !== "running") {
      return { state: "stale_run" as const }
    }
    const workspace = (await ctx.db.get(
      "workspaces",
      batch.workspaceId,
    )) as GenericRow | null
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      return { state: "stale_lease" as const }
    }
    const currentSnapshot = await enabledCategorySnapshot(
      ctx.db,
      batch.workspaceId,
    )
    if (
      !currentSnapshot ||
      currentSnapshot.json !== args.categorySnapshotJson
    ) {
      throw new TypeError("Categorization category snapshot changed")
    }
    const mentions = await mentionsForBatch(ctx.db, batch)
    if (!mentions) {
      throw new TypeError("Categorization mention batch is invalid")
    }
    const parsedResults = parseCategorizationResultsJson(args.resultsJson)
    const results = validateCategorizationApplication({
      categories: currentSnapshot.categories,
      mentions,
      results: parsedResults,
    })
    const categoryIdByString = new Map(
      currentSnapshot.categories.map((category) => [
        category.id,
        category.id as CategoryId,
      ]),
    )
    const resultByMentionId = new Map(
      results.map((result) => [result.mentionId, result]),
    )

    for (const job of batch.jobs) {
      const mentionId = job.mentionId as MentionId
      const result = resultByMentionId.get(String(mentionId))
      const categoryId = result
        ? categoryIdByString.get(result.categoryId)
        : undefined
      if (!result || !categoryId) {
        throw new TypeError("Categorization result cannot be applied")
      }
      await ctx.db.patch("mentions", mentionId, {
        analysisState: "completed",
        categoryId,
        updatedAt: now,
      })
      await ctx.db.patch("categorizationJobs", job._id as CategorizationJobId, {
        completedAt: now,
        lastError: undefined,
        leaseExpiresAt: undefined,
        leaseToken: undefined,
        nextAttemptAt: undefined,
        status: "completed",
        updatedAt: now,
      })
    }
    await finishProviderRun(
      ctx,
      {
        durationMs: args.durationMs,
        outputCount: results.length,
        run,
        status: "succeeded",
      },
      now,
    )
    return { completed: results.length, state: "completed" as const }
  },
})

export const failCategorizationBatch = internalMutation({
  args: {
    categorySnapshotJson: v.string(),
    durationMs: v.number(),
    errorCode: v.string(),
    errorMessage: v.string(),
    jobIds: v.array(v.id("categorizationJobs")),
    leaseToken: v.string(),
    retryable: v.boolean(),
    retryAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const batch = await currentBatchLease(ctx.db, args, now)
    if (!batch) {
      return { state: "stale_lease" as const }
    }
    const run = await findProviderRun(ctx, args.leaseToken)
    let dead = 0
    let pending = 0

    for (const job of batch.jobs) {
      const plan = planCategorizationFailure({
        attempts: job.attempts as number,
        errorCode: args.errorCode,
        maxAttempts: job.maxAttempts as number,
        now,
        retryAfterMs: args.retryAfterMs,
        retryable: args.retryable,
        stableJobKey: String(job._id),
      })
      if (plan.status === "dead") {
        dead += 1
        await ctx.db.patch(
          "categorizationJobs",
          job._id as CategorizationJobId,
          {
            completedAt: plan.completedAt,
            lastError: plan.lastError,
            leaseExpiresAt: undefined,
            leaseToken: undefined,
            nextAttemptAt: undefined,
            status: "dead",
            updatedAt: now,
          },
        )
        await patchMentionAnalysisState(ctx, job, "failed", now)
      } else {
        pending += 1
        await ctx.db.patch(
          "categorizationJobs",
          job._id as CategorizationJobId,
          {
            completedAt: undefined,
            lastError: plan.lastError,
            leaseExpiresAt: undefined,
            leaseToken: undefined,
            nextAttemptAt: plan.nextAttemptAt,
            status: "pending",
            updatedAt: now,
          },
        )
        await patchMentionAnalysisState(ctx, job, "pending", now)
      }
    }

    if (run?.status === "running") {
      await finishProviderRun(
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
    }
    return { dead, pending, state: "failed" as const }
  },
})

export const dispatchDueCategorizationJobsReference =
  internalMutationReference<{ now?: number }>(
    "categorization/internal:dispatchDueCategorizationJobs",
  )

export const executeCategorizationBatchReference =
  internalActionReference<CategorizationBatchLeaseArguments>(
    "categorization/actions:executeCategorizationBatch",
  )

export const loadCategorizationBatchContextReference = internalQueryReference<
  CategorizationBatchLeaseArguments,
  CategorizationBatchExecutionContext
>("categorization/internal:loadCategorizationBatchContext")

export const releaseCategorizationBlockedConfigurationReference =
  internalMutationReference<CategorizationBatchLeaseArguments>(
    "categorization/internal:releaseCategorizationBlockedConfiguration",
  )

export const startCategorizationProviderRunReference =
  internalMutationReference<CategorizationBatchLeaseArguments>(
    "categorization/internal:startCategorizationProviderRun",
  )

export const applyCategorizationBatchReference = internalMutationReference<
  CategorizationBatchLeaseArguments & {
    durationMs: number
    resultsJson: string
  }
>("categorization/internal:applyCategorizationBatch")

export const failCategorizationBatchReference = internalMutationReference<
  CategorizationBatchLeaseArguments & {
    durationMs: number
    errorCode: string
    errorMessage: string
    retryable: boolean
    retryAfterMs?: number
  }
>("categorization/internal:failCategorizationBatch")
