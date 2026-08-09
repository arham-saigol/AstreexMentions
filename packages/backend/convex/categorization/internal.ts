import { internal } from "../_generated/api"
import { v } from "convex/values"

import {
  DEEPSEEK_CATEGORIZATION_MODEL,
  MAX_CATEGORIZATION_BATCH_PROMPT_CHARS,
  MAX_CATEGORIZATION_BATCH_SIZE,
  type CategorizationCategory,
  type CategorizationMention,
} from "../lib/deepseekCategorization"
import { isCategorySystemKey } from "../lib/categories"
import { recordProviderMetricBuckets } from "../lib/providerMetricBuckets"
import { incrementDailySystemMetric } from "../lib/systemMetricBuckets"
import {
  categorizedMentionMetric,
  type CategorizedMentionGroup,
} from "../ingestion/model"
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import {
  parseCategorySnapshotJson,
  parseCategorizationResultsJson,
} from "./contracts"
import { transitionCategorizationStatusMetric } from "./metrics"
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
const DEEPSEEK_CATEGORIZATION_OPERATION = "chat.completions"
const MAX_KEYWORD_CONTEXTS_PER_MENTION = 3

type CategorizationJobId = Id<"categorizationJobs">
type CategoryId = Id<"categories">
type MentionId = Id<"mentions">
type ProviderRunId = Id<"providerRuns">
type WorkspaceId = Id<"workspaces">

export type CategorizationBatchLeaseArguments = {
  categorySnapshotJson: string
  jobIds: CategorizationJobId[]
  leaseToken: string
}

type LeasedBatch = {
  jobs: Doc<"categorizationJobs">[]
  workspaceId: WorkspaceId
}

type EnabledCategorySnapshot = {
  categories: CategorizationCategory[]
  json: string
  metricGroupByCategoryId: ReadonlyMap<string, CategorizedMentionGroup>
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

function dueAt(row: Doc<"categorizationJobs">): number {
  return ((row.status === "leased" ? row.leaseExpiresAt : row.nextAttemptAt) ??
    0) as number
}

function hasValidAttemptCounters(row: Doc<"categorizationJobs">): boolean {
  return (
    Number.isSafeInteger(row.attempts) &&
    (row.attempts as number) >= 0 &&
    Number.isSafeInteger(row.maxAttempts) &&
    (row.maxAttempts as number) >= 1
  )
}

function jobForClaim(
  row: Doc<"categorizationJobs">,
): CategorizationJobForClaim {
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
): Promise<Doc<"providerRuns"> | null> {
  return await ctx.db
    .query("providerRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", providerRunIdempotencyKey(leaseToken)),
    )
    .unique()
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
  const failureIncrement = input.status === "failed" ? 1 : 0
  const successIncrement = input.status === "succeeded" ? 1 : 0
  const retryIncrement = input.retry ? 1 : 0
  const rateLimitedIncrement = rateLimited(input.errorCode)
  await recordProviderMetricBuckets(
    ctx,
    {
      durationMs: input.durationMs,
      failureCount: failureIncrement,
      inputItemCount: input.inputCount,
      operation: DEEPSEEK_CATEGORIZATION_OPERATION,
      outputItemCount: input.outputCount,
      provider: "deepseek",
      rateLimitedCount: rateLimitedIncrement,
      retryCount: retryIncrement,
      successCount: successIncrement,
    },
    now,
  )
}

async function finishProviderRun(
  ctx: MutationCtx,
  input: {
    durationMs: number
    errorCode?: string | undefined
    errorMessage?: string | undefined
    outputCount: number
    run: Doc<"providerRuns">
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
  row: Doc<"categorizationJobs">,
  analysisState: "completed" | "failed" | "leased" | "pending",
  now: number,
): Promise<void> {
  const mentionId = row.mentionId as MentionId
  const mention = await ctx.db.get("mentions", mentionId)
  if (mention && mention.workspaceId === row.workspaceId) {
    await ctx.db.patch("mentions", mentionId, { analysisState, updatedAt: now })
  }
}

async function markJobDead(
  ctx: MutationCtx,
  row: Doc<"categorizationJobs">,
  errorCode: string,
  now: number,
): Promise<void> {
  await transitionCategorizationStatusMetric(ctx, {
    from: row.status as "leased" | "pending",
    to: "dead",
    updatedAt: now,
    workspaceId: row.workspaceId as WorkspaceId,
  })
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
  row: Doc<"categorizationJobs">,
  now: number,
): Promise<Doc<"categorizationJobs"> | null> {
  await finishExpiredProviderRun(ctx, row.leaseToken as string | undefined, now)
  if ((row.attempts as number) >= (row.maxAttempts as number)) {
    await markJobDead(ctx, row, "lease_expired", now)
    return null
  }

  await transitionCategorizationStatusMetric(ctx, {
    from: "leased",
    to: "pending",
    updatedAt: now,
    workspaceId: row.workspaceId as WorkspaceId,
  })
  await ctx.db.patch("categorizationJobs", row._id as CategorizationJobId, {
    lastError: "lease_expired",
    leaseExpiresAt: undefined,
    leaseToken: undefined,
    nextAttemptAt: now,
    status: "pending",
    updatedAt: now,
  })
  await patchMentionAnalysisState(ctx, row, "pending", now)
  const {
    leaseExpiresAt: _leaseExpiresAt,
    leaseToken: _leaseToken,
    ...rest
  } = row
  return {
    ...rest,
    lastError: "lease_expired",
    nextAttemptAt: now,
    status: "pending",
    updatedAt: now,
  }
}

async function dueCategorizationJobs(
  ctx: MutationCtx,
  now: number,
): Promise<Doc<"categorizationJobs">[]> {
  const [pending, expired] = await Promise.all([
    ctx.db
      .query("categorizationJobs")
      .withIndex("by_status_and_next_attempt_at", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .take(MAX_DUE_SCAN),
    ctx.db
      .query("categorizationJobs")
      .withIndex("by_status_and_lease_expires_at", (q) =>
        q.eq("status", "leased").lte("leaseExpiresAt", now),
      )
      .take(MAX_DUE_SCAN),
  ])

  const rows = [...pending, ...expired]
    .sort(
      (left, right) =>
        dueAt(left) - dueAt(right) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )
    .slice(0, MAX_DUE_SCAN)
  const claimable: Doc<"categorizationJobs">[] = []

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
  const rows = await db
    .query("categories")
    .withIndex("by_workspace_deleted_enabled_and_sort_order", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("deletedAt", undefined)
        .eq("enabled", true),
    )
    .collect()
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
    return {
      categories: parsed.categories,
      json,
      metricGroupByCategoryId: new Map(
        rows.map((row) => [
          String(row._id),
          isCategorySystemKey(row.systemKey) ? row.systemKey : "custom",
        ]),
      ),
    }
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

  const jobs = await Promise.all(
    args.jobIds.map(async (jobId) => await db.get("categorizationJobs", jobId)),
  )
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

  return {
    jobs: jobs.filter((job): job is Doc<"categorizationJobs"> => job !== null),
    workspaceId,
  }
}

async function categorizationMention(
  db: DatabaseReader,
  mention: Doc<"mentions">,
  companyDescription: string | undefined,
  now: number,
): Promise<CategorizationMention | null> {
  if (
    mention.retentionExpiresAt !== undefined &&
    mention.retentionExpiresAt <= now
  ) {
    return null
  }
  const matches = await db
    .query("mentionKeywordMatches")
    .withIndex("by_workspace_and_mention", (q) =>
      q.eq("workspaceId", mention.workspaceId).eq("mentionId", mention._id),
    )
    .take(MAX_KEYWORD_CONTEXTS_PER_MENTION)
  const keywordRows = await Promise.all(
    matches.map(async (match) => await db.get("keywords", match.keywordId)),
  )
  const keywords = keywordRows
    .filter(
      (keyword): keyword is Doc<"keywords"> =>
        keyword !== null && keyword.workspaceId === mention.workspaceId,
    )
    .map((keyword) => ({
      phrase: keyword.phrase,
      ...(keyword.description === undefined
        ? {}
        : { description: keyword.description }),
    }))
    .sort((left, right) => left.phrase.localeCompare(right.phrase, "en"))
  try {
    return {
      id: String(mention._id),
      text: mentionText({
        body: mention.body,
        ...(mention.title === undefined ? {} : { title: mention.title }),
      }),
      ...(companyDescription ? { companyDescription } : {}),
      ...(keywords.length ? { keywords } : {}),
    }
  } catch {
    return null
  }
}

async function mentionsForBatch(
  db: DatabaseReader,
  batch: LeasedBatch,
  now: number,
): Promise<CategorizationMention[] | null> {
  const [workspace, mentionRows] = await Promise.all([
    db.get("workspaces", batch.workspaceId),
    Promise.all(
      batch.jobs.map(
        async (job) => await db.get("mentions", job.mentionId as MentionId),
      ),
    ),
  ])
  if (
    !workspace ||
    mentionRows.some(
      (mention, index) =>
        !mention ||
        mention.workspaceId !== batch.workspaceId ||
        String(mention._id) !== String(batch.jobs[index]!.mentionId),
    )
  ) {
    return null
  }
  const mentions = await Promise.all(
    mentionRows
      .filter((mention): mention is Doc<"mentions"> => mention !== null)
      .map(
        async (mention) =>
          await categorizationMention(
            db,
            mention,
            workspace.companyDescription,
            now,
          ),
      ),
  )
  return mentions.some((mention) => mention === null)
    ? null
    : mentions.filter(
        (mention): mention is CategorizationMention => mention !== null,
      )
}

async function completeAlreadyCategorizedJob(
  ctx: MutationCtx,
  row: Doc<"categorizationJobs">,
  now: number,
): Promise<boolean> {
  const mention = await ctx.db.get("mentions", row.mentionId as MentionId)
  if (
    !mention ||
    mention.workspaceId !== row.workspaceId ||
    mention.categoryId === undefined ||
    mention.analysisState !== "completed"
  ) {
    return false
  }

  await transitionCategorizationStatusMetric(ctx, {
    from: row.status as "leased" | "pending",
    to: "completed",
    updatedAt: now,
    workspaceId: row.workspaceId as WorkspaceId,
  })
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
  rows: readonly Doc<"categorizationJobs">[],
  now: number,
): Promise<
  Array<{ mention: CategorizationMention; row: Doc<"categorizationJobs"> }>
> {
  const claimable: Array<{
    mention: CategorizationMention
    row: Doc<"categorizationJobs">
  }> = []
  const companyDescriptionByWorkspace = new Map<string, string | undefined>()
  for (const row of rows) {
    if (await completeAlreadyCategorizedJob(ctx, row, now)) {
      continue
    }
    const mention = await ctx.db.get("mentions", row.mentionId as MentionId)
    if (!mention || mention.workspaceId !== row.workspaceId) {
      await markJobDead(ctx, row, "invalid_mention", now)
      continue
    }
    const workspaceKey = String(row.workspaceId)
    if (!companyDescriptionByWorkspace.has(workspaceKey)) {
      const workspace = await ctx.db.get(
        "workspaces",
        row.workspaceId as WorkspaceId,
      )
      companyDescriptionByWorkspace.set(
        workspaceKey,
        workspace?.companyDescription,
      )
    }
    const context = await categorizationMention(
      ctx.db,
      mention,
      companyDescriptionByWorkspace.get(workspaceKey),
      now,
    )
    if (!context) {
      await markJobDead(ctx, row, "invalid_mention", now)
      continue
    }
    claimable.push({ mention: context, row })
  }
  return claimable
}

function promptBoundedJobs(
  candidates: readonly {
    mention: CategorizationMention
    row: Doc<"categorizationJobs">
  }[],
): Doc<"categorizationJobs">[] {
  const selected: CategorizationMention[] = []
  for (const candidate of candidates) {
    const next = [...selected, candidate.mention]
    if (
      selected.length > 0 &&
      JSON.stringify({ mentions: next }).length >
        MAX_CATEGORIZATION_BATCH_PROMPT_CHARS
    ) {
      break
    }
    selected.push(candidate.mention)
  }
  return candidates.slice(0, selected.length).map(({ row }) => row)
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
      const selected: Doc<"categorizationJobs">[] = []
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

      const claimable = await claimableRowsWithMentions(ctx, selected, now)
      const eligible = promptBoundedJobs(claimable)
      for (const { row } of claimable.slice(eligible.length)) {
        queue.push(row)
      }
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
        await transitionCategorizationStatusMetric(ctx, {
          from: "pending",
          to: "leased",
          updatedAt: now,
          workspaceId,
        })
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
            startedAt: typeof row.startedAt === "number" ? row.startedAt : now,
            status: "leased",
            updatedAt: now,
          },
        )
        await patchMentionAnalysisState(ctx, row, "leased", now)
      }
      await ctx.scheduler.runAfter(
        0,
        internal.categorization.actions.executeCategorizationBatch,
        {
          categorySnapshotJson: snapshot.json,
          jobIds,
          leaseToken: lease.token,
        },
      )
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
    const workspace = await ctx.db.get("workspaces", batch.workspaceId)
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
    const mentions = await mentionsForBatch(ctx.db, batch, now)
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
      await transitionCategorizationStatusMetric(ctx, {
        from: "leased",
        to: "pending",
        updatedAt: now,
        workspaceId: batch.workspaceId,
      })
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
    const workspace = await ctx.db.get("workspaces", batch.workspaceId)
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
    const workspace = await ctx.db.get("workspaces", batch.workspaceId)
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
    const mentions = await mentionsForBatch(ctx.db, batch, now)
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
      const metricGroup = result
        ? currentSnapshot.metricGroupByCategoryId.get(result.categoryId)
        : undefined
      if (!result || !categoryId || !metricGroup) {
        throw new TypeError("Categorization result cannot be applied")
      }
      const mention = await ctx.db.get("mentions", mentionId)
      if (!mention || mention.workspaceId !== batch.workspaceId) {
        throw new TypeError("Categorization mention is unavailable")
      }
      await ctx.db.patch("mentions", mentionId, {
        analysisState: "completed",
        categoryId,
        updatedAt: now,
      })
      await transitionCategorizationStatusMetric(ctx, {
        from: "leased",
        to: "completed",
        updatedAt: now,
        workspaceId: batch.workspaceId,
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
      await incrementDailySystemMetric(ctx, {
        bucketAt: mention.firstSeenAt as number,
        metric: categorizedMentionMetric(metricGroup),
        scope: "global",
        updatedAt: now,
        workspaceId: batch.workspaceId,
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
        await transitionCategorizationStatusMetric(ctx, {
          from: "leased",
          to: "dead",
          updatedAt: now,
          workspaceId: batch.workspaceId,
        })
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
        await transitionCategorizationStatusMetric(ctx, {
          from: "leased",
          to: "pending",
          updatedAt: now,
          workspaceId: batch.workspaceId,
        })
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
