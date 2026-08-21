import { internal } from "../_generated/api"
import { GEMINI_MODEL } from "../integrations/geminiModel"
import { DEFAULT_MENTION_ANALYSIS_MAX_ATTEMPTS } from "../lib/mentionAnalysis"
import { transitionMentionAnalysisStatusMetric } from "../mentionAnalysis/metrics"
import {
  buildMentionRediscoveryPatch,
  type MentionEngagementMetrics,
} from "../lib/mentionIngestion"
import { syncUsagePausedWorkspaceMetric } from "../lib/operationalMetrics"
import { createPendingEmail, emailPayloadFingerprint } from "../lib/emailOutbox"
import { type MutationCtx } from "../_generated/server"
import type { Doc, Id, TableNames } from "../_generated/dataModel"
import { finalizeInvalidatedTrackingProviderRun } from "../scheduling/providerRuns"
import { incrementDailySystemMetric } from "../lib/systemMetricBuckets"
import {
  FREE_MENTION_RETENTION_MS,
  resolveWorkspaceAllowance,
  type WorkspaceAllowance,
} from "../lib/workspaceAccess"
import type { IngestionCandidate, IngestionChunk } from "./contracts"
import {
  buildUsageWarningEmail,
  mentionAnalysisJobIdempotencyKey,
  INGESTED_MENTION_METRIC,
  ingestedMentionPlatformMetric,
  normalizeMentionFallbackKey,
  usageWarningIdempotencyKey,
  usageWarningThresholdsToEnqueue,
  type UsageWarningThreshold,
} from "./model"

type WorkspaceId = Id<"workspaces">
type KeywordId = Id<"keywords">
type TrackingSourceId = Id<"trackingSources">
type UsageCycleId = Id<"usageCycles">
type MentionId = Id<"mentions">

type TrackingSourceType =
  "hacker_news" | "reddit_comments" | "reddit_posts" | "x"

export class IngestionInvariantError extends Error {
  readonly code:
    | "CANDIDATE_SOURCE_MISMATCH"
    | "MENTION_ANALYSIS_JOB_COLLISION"
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
  mentionAnalysisJobsEnqueued: number
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

export async function scheduleIngestionDispatchers(
  ctx: MutationCtx,
  work: {
    mentionAnalysisJobsEnqueued: number
    usageWarningEmailsEnqueued: number
  },
): Promise<void> {
  if (work.mentionAnalysisJobsEnqueued > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.mentionAnalysis.internal.dispatchDueMentionAnalysisJobs,
      {},
    )
  }
  if (work.usageWarningEmailsEnqueued > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.email.internal.dispatchPendingEmails,
      {},
    )
  }
}

export type IngestionServiceOptions = {
  emailFrom?: string | undefined
  emailReplyTo?: string | undefined
  now: number
}

function withoutUndefined<T extends Record<string, unknown>>(
  value: T,
): { [Key in keyof T]: Exclude<T[Key], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as { [Key in keyof T]: Exclude<T[Key], undefined> }
}

function requireId<TableName extends TableNames>(
  ctx: MutationCtx,
  tableName: TableName,
  value: string,
): Id<TableName> {
  const id = ctx.db.normalizeId(tableName, value)
  if (!id) {
    throw new IngestionInvariantError(
      "INVALID_ID",
      `Invalid ${tableName} identifier`,
    )
  }
  return id
}

function sourceTypeFromRow(source: Doc<"trackingSources">): TrackingSourceType {
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

async function currentAllowance(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<Exclude<WorkspaceAllowance, { kind: "none" }>> {
  const allowance = await resolveWorkspaceAllowance(ctx, workspaceId, now)
  if (allowance.kind === "none") {
    throw new IngestionInvariantError(
      "USAGE_CYCLE_NOT_FOUND",
      "No effective monitoring allowance exists for the workspace",
    )
  }
  return allowance
}

async function findExistingMention(
  ctx: MutationCtx,
  input: {
    candidate: IngestionCandidate
    fallbackKey?: string | undefined
    workspaceId: WorkspaceId
  },
): Promise<Doc<"mentions"> | null> {
  const providerMatch = input.candidate.providerItemId
    ? await ctx.db
        .query("mentions")
        .withIndex("by_workspace_platform_content_provider_item", (q) =>
          q
            .eq("workspaceId", input.workspaceId)
            .eq("platform", input.candidate.platform)
            .eq("contentType", input.candidate.contentType)
            .eq("providerItemId", input.candidate.providerItemId),
        )
        .unique()
    : null
  const fallbackMatch = input.fallbackKey
    ? await ctx.db
        .query("mentions")
        .withIndex("by_workspace_platform_content_fallback", (q) =>
          q
            .eq("workspaceId", input.workspaceId)
            .eq("platform", input.candidate.platform)
            .eq("contentType", input.candidate.contentType)
            .eq("fallbackKey", input.fallbackKey),
        )
        .unique()
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
      q.eq("mentionId", input.mentionId).eq("keywordId", input.keywordId),
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

async function ensureMentionAnalysisJob(
  ctx: MutationCtx,
  input: { mentionId: MentionId; workspaceId: WorkspaceId },
  now: number,
): Promise<boolean> {
  const idempotencyKey = mentionAnalysisJobIdempotencyKey(
    String(input.mentionId),
  )
  const existing = await ctx.db
    .query("mentionAnalysisJobs")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()
  if (existing) {
    if (
      existing.mentionId !== input.mentionId ||
      existing.workspaceId !== input.workspaceId
    ) {
      throw new IngestionInvariantError(
        "MENTION_ANALYSIS_JOB_COLLISION",
        "Mention analysis idempotency key belongs to another mention",
      )
    }
    return false
  }

  await ctx.db.insert("mentionAnalysisJobs", {
    attempts: 0,
    createdAt: now,
    idempotencyKey,
    maxAttempts: DEFAULT_MENTION_ANALYSIS_MAX_ATTEMPTS,
    mentionId: input.mentionId,
    model: GEMINI_MODEL,
    nextAttemptAt: now,
    status: "pending",
    updatedAt: now,
    workspaceId: input.workspaceId,
  })
  await transitionMentionAnalysisStatusMetric(ctx, {
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
  await incrementDailySystemMetric(ctx, {
    bucketAt: now,
    metric: INGESTED_MENTION_METRIC,
    updatedAt: now,
    workspaceId,
  })
  await incrementDailySystemMetric(ctx, {
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
    emailFrom?: string | undefined
    emailReplyTo?: string | undefined
    mentionLimit: number
    mentionsUsed: number
    owner: Doc<"users">
    threshold: UsageWarningThreshold
    usageCycleId: UsageCycleId
    workspace: Doc<"workspaces">
    workspaceId: WorkspaceId
  },
  now: number,
): Promise<boolean> {
  if (!input.emailFrom || input.emailFrom.trim().length === 0) {
    return false
  }
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
  const existing = await ctx.db
    .query("emailOutbox")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()
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
      userId: input.owner._id,
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
  const activeSources = await ctx.db
    .query("trackingSources")
    .withIndex("by_workspace_status_and_created_at", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "active"),
    )
    .collect()

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

  const workspaceId = requireId(ctx, "workspaces", input.workspaceId)
  const keywordId = requireId(ctx, "keywords", input.keywordId)
  const trackingSourceId = requireId(
    ctx,
    "trackingSources",
    input.trackingSourceId,
  )
  const [workspace, keyword, source] = await Promise.all([
    ctx.db.get("workspaces", workspaceId),
    ctx.db.get("keywords", keywordId),
    ctx.db.get("trackingSources", trackingSourceId),
  ])

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

  const owner = await ctx.db.get("users", workspace.ownerUserId)
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

  const allowance = await currentAllowance(ctx, workspaceId, options.now)
  const usageCycleId =
    allowance.kind === "paid"
      ? (allowance.cycle._id as UsageCycleId)
      : undefined
  const mentionLimit = allowance.mentionLimit
  let mentionsUsed = allowance.mentionsUsed
  let sent80At =
    allowance.kind === "paid" ? allowance.cycle.warning80SentAt : undefined
  let sent100At =
    allowance.kind === "paid" ? allowance.cycle.warning100SentAt : undefined
  const sourceType = sourceTypeFromRow(source)
  let associationsAdded = 0
  let mentionAnalysisJobsEnqueued = 0
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
        mentionAnalysisJobsEnqueued,
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
        feedState: "pending",
        firstSeenAt: options.now,
        language: candidate.language,
        lastMatchedAt: options.now,
        retentionExpiresAt:
          allowance.kind === "free"
            ? options.now + FREE_MENTION_RETENTION_MS
            : undefined,
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
    if (allowance.kind === "paid") {
      await ctx.db.patch("usageCycles", usageCycleId!, {
        mentionsUsed,
        updatedAt: options.now,
      })
    } else {
      await ctx.db.patch("freeEvaluationGrants", allowance.grant._id, {
        exhaustedAt:
          mentionsUsed >= mentionLimit
            ? (allowance.grant.exhaustedAt ?? options.now)
            : undefined,
        mentionsUsed,
        updatedAt: options.now,
      })
    }
    if (
      await ensureMentionAnalysisJob(
        ctx,
        { mentionId, workspaceId },
        options.now,
      )
    ) {
      mentionAnalysisJobsEnqueued += 1
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

    const thresholds =
      allowance.kind === "paid"
        ? usageWarningThresholdsToEnqueue({
            mentionLimit,
            mentionsUsed,
            sent100At,
            sent80At,
          })
        : []
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
            usageCycleId: usageCycleId!,
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
        await ctx.db.patch("usageCycles", usageCycleId!, {
          warning80SentAt: options.now,
          updatedAt: options.now,
        })
      } else {
        sent100At = options.now
        await ctx.db.patch("usageCycles", usageCycleId!, {
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
    mentionAnalysisJobsEnqueued,
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
