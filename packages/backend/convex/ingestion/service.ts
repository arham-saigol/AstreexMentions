import type { GenericId, Value } from "convex/values"

import {
  DEFAULT_CATEGORIZATION_MAX_ATTEMPTS,
  DEEPSEEK_CATEGORIZATION_MODEL,
} from "../lib/deepseekCategorization"
import { transitionCategorizationStatusMetric } from "../categorization/metrics"
import {
  buildMentionRediscoveryPatch,
  type MentionEngagementMetrics,
} from "../lib/mentionIngestion"
import { syncUsagePausedWorkspaceMetric } from "../lib/operationalMetrics"
import { createPendingEmail, emailPayloadFingerprint } from "../lib/emailOutbox"
import { indexEquals, type MutationCtx } from "../server"
import { finalizeInvalidatedTrackingProviderRun } from "../scheduling/providerRuns"
import { incrementHourlySystemMetric } from "../lib/systemMetricBuckets"
import type { IngestionCandidate, IngestionChunk } from "./contracts"
import {
  buildUsageWarningEmail,
  categorizationJobIdempotencyKey,
  INGESTED_MENTION_METRIC,
  ingestedMentionPlatformMetric,
  normalizeMentionFallbackKey,
  usageWarningIdempotencyKey,
  usageWarningThresholdsToEnqueue,
  type UsageWarningThreshold,
} from "./model"

type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type WorkspaceId = GenericId<"workspaces">
type UserId = GenericId<"users">
type KeywordId = GenericId<"keywords">
type TrackingSourceId = GenericId<"trackingSources">
type UsageCycleId = GenericId<"usageCycles">
type MentionId = GenericId<"mentions">

type TrackingSourceType =
  "hacker_news" | "reddit_comments" | "reddit_posts" | "x"

export class IngestionInvariantError extends Error {
  readonly code:
    | "CANDIDATE_SOURCE_MISMATCH"
    | "CATEGORIZATION_JOB_COLLISION"
    | "DEDUPE_IDENTITY_COLLISION"
    | "EMAIL_OUTBOX_COLLISION"
    | "EMAIL_RECIPIENT_UNCONFIGURED"
    | "INVALID_ID"
    | "KEYWORD_INACTIVE"
    | "KEYWORD_NOT_FOUND"
    | "SOURCE_INACTIVE"
    | "SOURCE_NOT_FOUND"
    | "SOURCE_SCOPE_MISMATCH"
    | "USAGE_CYCLE_INVALID"
    | "USAGE_CYCLE_NOT_FOUND"
    | "WORKSPACE_NOT_FOUND"

  constructor(code: IngestionInvariantError["code"], message: string) {
    super(message)
    this.name = "IngestionInvariantError"
    this.code = code
  }
}

export type IngestionChunkResult = {
  associationsAdded: number
  categorizationJobsEnqueued: number
  checkpoint: "advance" | "hold"
  inserted: number
  nextPosition: number
  pausedSourceCount: number
  rediscovered: number
  state: "applied" | "usage_exhausted"
  unprocessedPosition?: number | undefined
  usage: {
    exhausted: boolean
    mentionLimit: number
    mentionsUsed: number
  }
  warningThresholdsEnqueued: UsageWarningThreshold[]
}

export type IngestionServiceOptions = {
  emailFrom: string
  emailReplyTo?: string | undefined
  now: number
}

function withoutUndefined(
  value: Record<string, unknown>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as Record<string, Value>
}

function requireId<TableName extends string>(
  ctx: MutationCtx,
  tableName: TableName,
  value: string,
): GenericId<TableName> {
  const id = ctx.db.normalizeId(tableName, value)
  if (!id) {
    throw new IngestionInvariantError(
      "INVALID_ID",
      `Invalid ${tableName} identifier`,
    )
  }
  return id as GenericId<TableName>
}

function sourceTypeFromRow(source: GenericRow): TrackingSourceType {
  const sourceType = source.sourceType
  if (
    sourceType !== "x" &&
    sourceType !== "reddit_posts" &&
    sourceType !== "reddit_comments" &&
    sourceType !== "hacker_news"
  ) {
    throw new IngestionInvariantError(
      "SOURCE_SCOPE_MISMATCH",
      "Tracking source has an invalid source type",
    )
  }
  return sourceType
}

function assertCandidateMatchesSource(
  candidate: IngestionCandidate,
  sourceType: TrackingSourceType,
): void {
  const matches =
    (sourceType === "x" &&
      candidate.platform === "x" &&
      candidate.contentType === "tweet") ||
    (sourceType === "reddit_posts" &&
      candidate.platform === "reddit" &&
      candidate.contentType === "post") ||
    (sourceType === "reddit_comments" &&
      candidate.platform === "reddit" &&
      candidate.contentType === "comment") ||
    (sourceType === "hacker_news" &&
      candidate.platform === "hacker_news" &&
      (candidate.contentType === "story" ||
        candidate.contentType === "comment"))

  if (!matches) {
    throw new IngestionInvariantError(
      "CANDIDATE_SOURCE_MISMATCH",
      "Candidate platform or content type does not match the tracking source",
    )
  }
}

async function currentUsageCycle(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<GenericRow> {
  const cycles = (await ctx.db
    .query("usageCycles")
    .withIndex("by_workspace_status_and_period_end", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["status", "open"]),
    )
    .collect()) as GenericRow[]
  const current = cycles
    .filter(
      (cycle) =>
        (cycle.periodStartAt as number) <= now &&
        (cycle.periodEndAt as number) > now,
    )
    .sort(
      (left, right) =>
        (right.periodStartAt as number) - (left.periodStartAt as number),
    )[0]

  if (!current) {
    throw new IngestionInvariantError(
      "USAGE_CYCLE_NOT_FOUND",
      "No current open usage cycle exists for the workspace",
    )
  }
  const mentionLimit = current.mentionLimit
  const mentionsUsed = current.mentionsUsed
  if (
    !Number.isSafeInteger(mentionLimit) ||
    (mentionLimit as number) < 0 ||
    !Number.isSafeInteger(mentionsUsed) ||
    (mentionsUsed as number) < 0 ||
    (mentionsUsed as number) > (mentionLimit as number)
  ) {
    throw new IngestionInvariantError(
      "USAGE_CYCLE_INVALID",
      "Current usage cycle has invalid mention counters",
    )
  }
  return current
}

async function findExistingMention(
  ctx: MutationCtx,
  input: {
    candidate: IngestionCandidate
    fallbackKey?: string | undefined
    workspaceId: WorkspaceId
  },
): Promise<GenericRow | null> {
  const providerMatch = input.candidate.providerItemId
    ? ((await ctx.db
        .query("mentions")
        .withIndex("by_workspace_platform_content_provider_item", (q) =>
          indexEquals(
            q,
            ["workspaceId", input.workspaceId],
            ["platform", input.candidate.platform],
            ["contentType", input.candidate.contentType],
            ["providerItemId", input.candidate.providerItemId],
          ),
        )
        .unique()) as GenericRow | null)
    : null
  const fallbackMatch = input.fallbackKey
    ? ((await ctx.db
        .query("mentions")
        .withIndex("by_workspace_platform_content_fallback", (q) =>
          indexEquals(
            q,
            ["workspaceId", input.workspaceId],
            ["platform", input.candidate.platform],
            ["contentType", input.candidate.contentType],
            ["fallbackKey", input.fallbackKey],
          ),
        )
        .unique()) as GenericRow | null)
    : null

  if (
    providerMatch &&
    fallbackMatch &&
    providerMatch._id !== fallbackMatch._id
  ) {
    throw new IngestionInvariantError(
      "DEDUPE_IDENTITY_COLLISION",
      "Provider and fallback identities resolve to different mentions",
    )
  }
  return providerMatch ?? fallbackMatch
}

function metricsFromCandidate(
  candidate: IngestionCandidate,
): MentionEngagementMetrics {
  return {
    commentCount: candidate.commentCount,
    engagementScore: candidate.engagementScore,
    likeCount: candidate.likeCount,
    pointCount: candidate.pointCount,
    quoteCount: candidate.quoteCount,
    replyCount: candidate.replyCount,
    repostCount: candidate.repostCount,
  }
}

async function ensureKeywordAssociation(
  ctx: MutationCtx,
  input: {
    keywordId: KeywordId
    mentionId: MentionId
    trackingSourceId: TrackingSourceId
    workspaceId: WorkspaceId
  },
  now: number,
): Promise<boolean> {
  const existing = await ctx.db
    .query("mentionKeywordMatches")
    .withIndex("by_mention_and_keyword", (q) =>
      indexEquals(
        q,
        ["mentionId", input.mentionId],
        ["keywordId", input.keywordId],
      ),
    )
    .unique()
  if (existing) {
    return false
  }

  await ctx.db.insert("mentionKeywordMatches", {
    createdAt: now,
    keywordId: input.keywordId,
    matchKind: "provider",
    mentionId: input.mentionId,
    trackingSourceId: input.trackingSourceId,
    workspaceId: input.workspaceId,
  })
  return true
}

async function ensureCategorizationJob(
  ctx: MutationCtx,
  input: { mentionId: MentionId; workspaceId: WorkspaceId },
  now: number,
): Promise<boolean> {
  const idempotencyKey = categorizationJobIdempotencyKey(
    String(input.mentionId),
  )
  const existing = (await ctx.db
    .query("categorizationJobs")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()) as GenericRow | null
  if (existing) {
    if (
      existing.mentionId !== input.mentionId ||
      existing.workspaceId !== input.workspaceId
    ) {
      throw new IngestionInvariantError(
        "CATEGORIZATION_JOB_COLLISION",
        "Categorization idempotency key belongs to another mention",
      )
    }
    return false
  }

  await ctx.db.insert("categorizationJobs", {
    attempts: 0,
    createdAt: now,
    idempotencyKey,
    maxAttempts: DEFAULT_CATEGORIZATION_MAX_ATTEMPTS,
    mentionId: input.mentionId,
    model: DEEPSEEK_CATEGORIZATION_MODEL,
    nextAttemptAt: now,
    status: "pending",
    updatedAt: now,
    workspaceId: input.workspaceId,
  })
  await transitionCategorizationStatusMetric(ctx, {
    to: "pending",
    updatedAt: now,
    workspaceId: input.workspaceId,
  })
  return true
}

async function incrementIngestedMentionMetric(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  platform: IngestionCandidate["platform"],
  now: number,
): Promise<void> {
  await incrementHourlySystemMetric(ctx, {
    bucketAt: now,
    metric: INGESTED_MENTION_METRIC,
    updatedAt: now,
    workspaceId,
  })
  await incrementHourlySystemMetric(ctx, {
    bucketAt: now,
    metric: ingestedMentionPlatformMetric(platform),
    scope: "global",
    updatedAt: now,
    workspaceId,
  })
}

async function ensureUsageWarningEmail(
  ctx: MutationCtx,
  input: {
    emailFrom: string
    emailReplyTo?: string | undefined
    mentionLimit: number
    mentionsUsed: number
    owner: GenericRow
    threshold: UsageWarningThreshold
    usageCycleId: UsageCycleId
    workspace: GenericRow
    workspaceId: WorkspaceId
  },
  now: number,
): Promise<boolean> {
  const recipientEmail = input.owner.email
  if (
    typeof recipientEmail !== "string" ||
    recipientEmail.trim().length === 0
  ) {
    return false
  }
  const payload = buildUsageWarningEmail({
    from: input.emailFrom,
    mentionLimit: input.mentionLimit,
    mentionsUsed: input.mentionsUsed,
    recipientEmail,
    threshold: input.threshold,
    workspaceName: input.workspace.name as string,
    ...(input.emailReplyTo === undefined
      ? {}
      : { replyTo: input.emailReplyTo }),
  })
  const idempotencyKey = usageWarningIdempotencyKey(
    String(input.usageCycleId),
    input.threshold,
  )
  const payloadFingerprint = emailPayloadFingerprint(payload)
  const existing = (await ctx.db
    .query("emailOutbox")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()) as GenericRow | null
  if (existing) {
    if (
      existing.payloadFingerprint !== payloadFingerprint ||
      existing.userId !== input.owner._id ||
      existing.workspaceId !== input.workspaceId
    ) {
      throw new IngestionInvariantError(
        "EMAIL_OUTBOX_COLLISION",
        "Usage warning idempotency key belongs to another payload",
      )
    }
    return false
  }

  const pending = createPendingEmail({ idempotencyKey, now, payload })
  await ctx.db.insert(
    "emailOutbox",
    withoutUndefined({
      attempts: pending.attempts,
      createdAt: pending.createdAt,
      from: pending.payload.from,
      html: pending.payload.html,
      idempotencyKey: pending.idempotencyKey,
      nextAttemptAt: pending.nextAttemptAt,
      payloadFingerprint: pending.payloadFingerprint,
      provider: "resend",
      replyTo: pending.payload.replyTo,
      status: pending.status,
      subject: pending.payload.subject,
      text: pending.payload.text,
      to: [...pending.payload.to],
      updatedAt: pending.updatedAt,
      userId: input.owner._id as UserId,
      workspaceId: input.workspaceId,
    }),
  )
  return true
}

async function pauseWorkspaceSourcesForUsage(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  currentTrackingSourceId: TrackingSourceId,
  now: number,
): Promise<number> {
  const activeSources = (await ctx.db
    .query("trackingSources")
    .withIndex("by_workspace_status_and_created_at", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["status", "active"]),
    )
    .collect()) as GenericRow[]

  for (const source of activeSources) {
    if (source._id !== currentTrackingSourceId) {
      await finalizeInvalidatedTrackingProviderRun(ctx, {
        errorCode: "source_paused",
        errorMessage: "Workspace mention allowance was exhausted",
        now,
        source,
      })
    }
    await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      pauseReason: "usage",
      status: "paused",
      updatedAt: now,
    })
  }
  await syncUsagePausedWorkspaceMetric(ctx, workspaceId, now)
  return activeSources.length
}

function usageResult(mentionsUsed: number, mentionLimit: number) {
  return {
    exhausted: mentionsUsed >= mentionLimit,
    mentionLimit,
    mentionsUsed,
  }
}

/**
 * Must be called exactly once per Convex mutation. All lookups and writes share
 * Convex's serializable transaction, including range reads used for dedupe.
 */
export async function applyIngestionChunkAtomically(
  ctx: MutationCtx,
  input: IngestionChunk,
  options: IngestionServiceOptions,
): Promise<IngestionChunkResult> {
  if (!Number.isSafeInteger(options.now) || options.now < 0) {
    throw new RangeError("now must be a non-negative safe integer")
  }
  if (options.emailFrom.trim().length === 0) {
    throw new TypeError("emailFrom must be a non-empty string")
  }

  const workspaceId = requireId(ctx, "workspaces", input.workspaceId)
  const keywordId = requireId(ctx, "keywords", input.keywordId)
  const trackingSourceId = requireId(
    ctx,
    "trackingSources",
    input.trackingSourceId,
  )
  const [workspace, keyword, source] = (await Promise.all([
    ctx.db.get("workspaces", workspaceId),
    ctx.db.get("keywords", keywordId),
    ctx.db.get("trackingSources", trackingSourceId),
  ])) as [GenericRow | null, GenericRow | null, GenericRow | null]

  if (
    !workspace ||
    workspace.deletedAt !== undefined ||
    workspace.deletionPendingAt !== undefined
  ) {
    throw new IngestionInvariantError(
      "WORKSPACE_NOT_FOUND",
      "Workspace does not exist",
    )
  }
  if (!source || source.deletedAt !== undefined) {
    throw new IngestionInvariantError(
      "SOURCE_NOT_FOUND",
      "Tracking source does not exist",
    )
  }
  if (
    source.workspaceId !== workspaceId ||
    source.keywordId !== keywordId ||
    String(source.workspaceId) !== input.workspaceId
  ) {
    throw new IngestionInvariantError(
      "SOURCE_SCOPE_MISMATCH",
      "Tracking source does not belong to the supplied workspace and keyword",
    )
  }
  if (
    source.status !== "active" &&
    !(source.status === "paused" && source.pauseReason === "usage")
  ) {
    throw new IngestionInvariantError(
      "SOURCE_INACTIVE",
      "Tracking source is not eligible for ingestion",
    )
  }
  if (!keyword) {
    throw new IngestionInvariantError(
      "KEYWORD_NOT_FOUND",
      "Keyword does not exist",
    )
  }
  if (
    keyword.workspaceId !== workspaceId ||
    keyword.status !== "active" ||
    keyword.deletedAt !== undefined
  ) {
    throw new IngestionInvariantError(
      "KEYWORD_INACTIVE",
      "Keyword is not active in the supplied workspace",
    )
  }

  const owner = (await ctx.db.get(
    "users",
    workspace.ownerUserId as UserId,
  )) as GenericRow | null
  if (
    !owner ||
    owner.deletedAt !== undefined ||
    owner.disabledAt !== undefined
  ) {
    throw new IngestionInvariantError(
      "EMAIL_RECIPIENT_UNCONFIGURED",
      "Workspace owner cannot receive usage warnings",
    )
  }

  const usageCycle = await currentUsageCycle(ctx, workspaceId, options.now)
  const usageCycleId = usageCycle._id as UsageCycleId
  const mentionLimit = usageCycle.mentionLimit as number
  let mentionsUsed = usageCycle.mentionsUsed as number
  let sent80At = usageCycle.warning80SentAt as number | undefined
  let sent100At = usageCycle.warning100SentAt as number | undefined
  const sourceType = sourceTypeFromRow(source)
  let associationsAdded = 0
  let categorizationJobsEnqueued = 0
  let inserted = 0
  let pausedSourceCount = 0
  let rediscovered = 0
  let sourcesPaused = false
  const warningThresholdsEnqueued: UsageWarningThreshold[] = []

  for (const [candidateIndex, candidate] of input.candidates.entries()) {
    assertCandidateMatchesSource(candidate, sourceType)
    const fallbackKey = candidate.fallbackKey
      ? normalizeMentionFallbackKey(candidate.fallbackKey)
      : undefined
    const existing = await findExistingMention(ctx, {
      candidate,
      fallbackKey,
      workspaceId,
    })

    if (existing) {
      const mentionId = existing._id as MentionId
      await ctx.db.patch(
        "mentions",
        mentionId,
        buildMentionRediscoveryPatch(
          metricsFromCandidate(candidate),
          options.now,
        ),
      )
      if (
        await ensureKeywordAssociation(
          ctx,
          { keywordId, mentionId, trackingSourceId, workspaceId },
          options.now,
        )
      ) {
        associationsAdded += 1
      }
      rediscovered += 1
      continue
    }

    if (mentionsUsed >= mentionLimit) {
      if (!sourcesPaused) {
        pausedSourceCount = await pauseWorkspaceSourcesForUsage(
          ctx,
          workspaceId,
          trackingSourceId,
          options.now,
        )
        sourcesPaused = true
      }
      const unprocessedPosition = input.startPosition + candidateIndex
      return {
        associationsAdded,
        categorizationJobsEnqueued,
        checkpoint: "hold",
        inserted,
        nextPosition: unprocessedPosition,
        pausedSourceCount,
        rediscovered,
        state: "usage_exhausted",
        unprocessedPosition,
        usage: usageResult(mentionsUsed, mentionLimit),
        warningThresholdsEnqueued,
      }
    }

    const mentionId = (await ctx.db.insert(
      "mentions",
      withoutUndefined({
        analysisState: "pending",
        authorDisplayName: candidate.authorDisplayName,
        authorHandle: candidate.authorHandle,
        body: candidate.body,
        canonicalUrl: candidate.canonicalUrl,
        commentCount: candidate.commentCount,
        contentType: candidate.contentType,
        engagementScore: candidate.engagementScore,
        fallbackKey,
        firstSeenAt: options.now,
        language: candidate.language,
        lastMatchedAt: options.now,
        likeCount: candidate.likeCount,
        platform: candidate.platform,
        pointCount: candidate.pointCount,
        providerItemId: candidate.providerItemId,
        publishedAt: candidate.publishedAt,
        quoteCount: candidate.quoteCount,
        replyCount: candidate.replyCount,
        repostCount: candidate.repostCount,
        searchText: candidate.searchText,
        status: "new",
        title: candidate.title,
        trackingSourceId,
        updatedAt: options.now,
        workspaceId,
      }),
    )) as MentionId

    mentionsUsed += 1
    await ctx.db.patch("usageCycles", usageCycleId, {
      mentionsUsed,
      updatedAt: options.now,
    })
    if (
      await ensureCategorizationJob(
        ctx,
        { mentionId, workspaceId },
        options.now,
      )
    ) {
      categorizationJobsEnqueued += 1
    }
    if (
      await ensureKeywordAssociation(
        ctx,
        { keywordId, mentionId, trackingSourceId, workspaceId },
        options.now,
      )
    ) {
      associationsAdded += 1
    }
    await incrementIngestedMentionMetric(
      ctx,
      workspaceId,
      candidate.platform,
      options.now,
    )

    const thresholds = usageWarningThresholdsToEnqueue({
      mentionLimit,
      mentionsUsed,
      sent100At,
      sent80At,
    })
    for (const threshold of thresholds) {
      if (
        await ensureUsageWarningEmail(
          ctx,
          {
            emailFrom: options.emailFrom,
            emailReplyTo: options.emailReplyTo,
            mentionLimit,
            mentionsUsed,
            owner,
            threshold,
            usageCycleId,
            workspace,
            workspaceId,
          },
          options.now,
        )
      ) {
        warningThresholdsEnqueued.push(threshold)
      }
      if (threshold === 80) {
        sent80At = options.now
        await ctx.db.patch("usageCycles", usageCycleId, {
          warning80SentAt: options.now,
          updatedAt: options.now,
        })
      } else {
        sent100At = options.now
        await ctx.db.patch("usageCycles", usageCycleId, {
          warning100SentAt: options.now,
          updatedAt: options.now,
        })
      }
    }

    inserted += 1
    if (inserted === 1) {
      await ctx.db.patch("workspaces", workspaceId, {
        lastMentionAt: options.now,
      })
    }
    if (mentionsUsed >= mentionLimit && !sourcesPaused) {
      pausedSourceCount = await pauseWorkspaceSourcesForUsage(
        ctx,
        workspaceId,
        trackingSourceId,
        options.now,
      )
      sourcesPaused = true
    }
  }

  return {
    associationsAdded,
    categorizationJobsEnqueued,
    checkpoint: "advance",
    inserted,
    nextPosition: input.startPosition + input.candidates.length,
    pausedSourceCount,
    rediscovered,
    state: "applied",
    usage: usageResult(mentionsUsed, mentionLimit),
    warningThresholdsEnqueued,
  }
}
