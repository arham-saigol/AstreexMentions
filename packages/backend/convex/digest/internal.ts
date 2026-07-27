import { type GenericId, v } from "convex/values"

import { readEmailCompositionConfiguration } from "../email/config"
import {
  createPendingEmail,
  emailPayloadFingerprint,
  type EmailPayload,
} from "../lib/emailOutbox"
import { planDailyDigest } from "../lib/dailyDigest"
import { isCategorySystemKey } from "../lib/categories"
import {
  internalActionReference,
  internalMutationReference,
  internalQueryReference,
} from "../lib/functionReferences"
import {
  indexAtMost,
  indexWindow,
  withoutUndefinedValues,
} from "../lib/jobRuntime"
import {
  env,
  indexEquals,
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../server"
import { rankableDigestCandidate, type DigestMentionCandidate } from "./model"

const MAX_DUE_DIGESTS = 64
const MAX_DIGEST_WINDOW_MENTIONS = 500

type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type DigestPreferenceId = GenericId<"digestPreferences">
type DigestRunId = GenericId<"digestRuns">
type EmailOutboxId = GenericId<"emailOutbox">
type MentionId = GenericId<"mentions">
type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">

function platformFromRow(row: GenericRow): "hacker_news" | "reddit" | "x" {
  if (
    row.platform !== "hacker_news" &&
    row.platform !== "reddit" &&
    row.platform !== "x"
  ) {
    throw new TypeError("Mention has an invalid platform")
  }
  return row.platform
}

function candidateFromRow(row: GenericRow): DigestMentionCandidate {
  return {
    body: row.body as string,
    canonicalUrl: row.canonicalUrl as string,
    engagementScore: row.engagementScore as number,
    id: String(row._id),
    platform: platformFromRow(row),
    publishedAt: row.publishedAt as number,
    ...(row.authorDisplayName === undefined
      ? {}
      : { authorDisplayName: row.authorDisplayName as string }),
    ...(row.authorHandle === undefined
      ? {}
      : { authorHandle: row.authorHandle as string }),
    ...(row.commentCount === undefined
      ? {}
      : { commentCount: row.commentCount as number }),
    ...(row.likeCount === undefined
      ? {}
      : { likeCount: row.likeCount as number }),
    ...(row.pointCount === undefined
      ? {}
      : { pointCount: row.pointCount as number }),
    ...(row.quoteCount === undefined
      ? {}
      : { quoteCount: row.quoteCount as number }),
    ...(row.replyCount === undefined
      ? {}
      : { replyCount: row.replyCount as number }),
    ...(row.repostCount === undefined
      ? {}
      : { repostCount: row.repostCount as number }),
    ...(row.title === undefined ? {} : { title: row.title as string }),
  }
}

async function mentionsInWindow(
  db: DatabaseReader,
  workspaceId: WorkspaceId,
  startAt: number,
  endAt: number,
): Promise<GenericRow[]> {
  return (await db
    .query("mentions")
    .withIndex("by_workspace_and_published_at", (q) =>
      indexWindow(
        indexEquals(q, ["workspaceId", workspaceId]),
        "publishedAt",
        startAt,
        endAt,
      ),
    )
    .order("desc")
    .take(MAX_DIGEST_WINDOW_MENTIONS)) as GenericRow[]
}

async function schedulePreference(
  ctx: MutationCtx,
  preference: GenericRow,
  now: number,
): Promise<"duplicate" | "enqueued" | "skipped_empty" | "skipped_recipient"> {
  const preferenceId = preference._id as DigestPreferenceId
  const workspaceId = preference.workspaceId as WorkspaceId
  const userId = preference.userId as UserId
  const [workspace, user] = (await Promise.all([
    ctx.db.get("workspaces", workspaceId),
    ctx.db.get("users", userId),
  ])) as [GenericRow | null, GenericRow | null]

  if (
    !workspace ||
    workspace.deletedAt !== undefined ||
    workspace.deletionPendingAt !== undefined ||
    !user ||
    user.deletedAt !== undefined ||
    user.disabledAt !== undefined ||
    typeof user.email !== "string" ||
    user.email.trim().length === 0
  ) {
    await ctx.db.patch("digestPreferences", preferenceId, {
      enabled: false,
      updatedAt: now,
    })
    return "skipped_recipient"
  }

  const schedule = {
    hour: preference.hour as number,
    minute: preference.minute as number,
    timeZone: preference.timeZone as string,
  }
  const scheduledFor = preference.nextRunAt as number
  const preliminary = planDailyDigest({
    alreadyRecorded: false,
    mentionLimit: preference.mentionLimit as number,
    mentions: [],
    schedule,
    scheduledFor,
    workspaceId: String(workspaceId),
  })
  const rows = await mentionsInWindow(
    ctx.db,
    workspaceId,
    preliminary.window.startAt,
    preliminary.window.endAt,
  )
  const candidates = rows.map(candidateFromRow)
  const plan = planDailyDigest({
    alreadyRecorded: false,
    mentionLimit: preference.mentionLimit as number,
    mentions: candidates.map(rankableDigestCandidate),
    schedule,
    scheduledFor,
    workspaceId: String(workspaceId),
  })
  const existing = (await ctx.db
    .query("digestRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", plan.idempotencyKey),
    )
    .unique()) as GenericRow | null

  await ctx.db.patch("digestPreferences", preferenceId, {
    nextRunAt: plan.nextRunAt,
    updatedAt: now,
  })
  if (existing) {
    return "duplicate"
  }

  if (plan.kind === "skipped_empty") {
    await ctx.db.insert("digestRuns", {
      completedAt: now,
      createdAt: now,
      digestPreferenceId: preferenceId,
      idempotencyKey: plan.idempotencyKey,
      localDate: plan.window.localDate,
      mentionCount: 0,
      mentionIds: [],
      scheduledFor: plan.scheduledFor,
      status: "skipped_empty",
      updatedAt: now,
      userId,
      windowEndAt: plan.window.endAt,
      windowStartAt: plan.window.startAt,
      workspaceId,
    })
    return "skipped_empty"
  }
  if (plan.kind !== "enqueue") {
    return "duplicate"
  }

  const mentionIds = plan.rankedMentions.map(
    ({ candidate }) => candidate.id as MentionId,
  )
  const digestRunId = (await ctx.db.insert("digestRuns", {
    createdAt: now,
    digestPreferenceId: preferenceId,
    idempotencyKey: plan.idempotencyKey,
    localDate: plan.window.localDate,
    mentionCount: candidates.length,
    mentionIds,
    scheduledFor: plan.scheduledFor,
    status: "processing",
    updatedAt: now,
    userId,
    windowEndAt: plan.window.endAt,
    windowStartAt: plan.window.startAt,
    workspaceId,
  })) as DigestRunId
  await ctx.scheduler.runAfter(0, renderDailyDigestReference, { digestRunId })
  return "enqueued"
}

export const dispatchDueDailyDigests = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const configuration = readEmailCompositionConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      return {
        missing: configuration.missing,
        state: "blocked_config" as const,
      }
    }

    const due = (await ctx.db
      .query("digestPreferences")
      .withIndex("by_enabled_and_next_run_at", (q) =>
        indexAtMost(indexEquals(q, ["enabled", true]), "nextRunAt", now),
      )
      .take(MAX_DUE_DIGESTS)) as GenericRow[]
    const outcomes = {
      duplicate: 0,
      enqueued: 0,
      skipped_empty: 0,
      skipped_recipient: 0,
    }

    for (const preference of due.sort(
      (left, right) =>
        (left.nextRunAt as number) - (right.nextRunAt as number) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )) {
      outcomes[await schedulePreference(ctx, preference, now)] += 1
    }

    return { outcomes, state: "dispatched" as const }
  },
})

export const loadDailyDigestRenderContext = internalQuery({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, args) => {
    const run = (await ctx.db.get(
      "digestRuns",
      args.digestRunId,
    )) as GenericRow | null
    if (!run || run.status !== "processing") {
      return { state: "not_pending" as const }
    }

    const workspaceId = run.workspaceId as WorkspaceId
    const userId = run.userId as UserId
    const [workspace, user, categoryRows] = (await Promise.all([
      ctx.db.get("workspaces", workspaceId),
      ctx.db.get("users", userId),
      ctx.db
        .query("categories")
        .withIndex("by_workspace_and_sort_order", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .collect(),
    ])) as [GenericRow | null, GenericRow | null, GenericRow[]]
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined ||
      !user ||
      user.deletedAt !== undefined ||
      user.disabledAt !== undefined ||
      typeof user.email !== "string" ||
      user.email.trim().length === 0
    ) {
      return { state: "recipient_unavailable" as const }
    }

    const categoryById = new Map(
      categoryRows.map((category) => [String(category._id), category]),
    )
    const snapshotRows = (
      await mentionsInWindow(
        ctx.db,
        workspaceId,
        run.windowStartAt as number,
        run.windowEndAt as number,
      )
    ).filter(
      (mention) => (mention.firstSeenAt as number) <= (run.createdAt as number),
    )
    const mentions = snapshotRows.map((mention) => {
      const category =
        mention.categoryId === undefined
          ? undefined
          : categoryById.get(String(mention.categoryId))
      const candidate = candidateFromRow(mention)
      return {
        ...candidate,
        ...(isCategorySystemKey(category?.systemKey)
          ? { categorySystemKey: category.systemKey }
          : {}),
      }
    })
    const snapshotIds = new Set(mentions.map(({ id }) => id))
    const topMentionIds = (run.mentionIds as MentionId[]).map(String)
    if (topMentionIds.some((mentionId) => !snapshotIds.has(mentionId))) {
      throw new TypeError("Digest mention snapshot is unavailable")
    }

    const recipientName =
      typeof user.name === "string" && user.name.trim().length > 0
        ? user.name.trim()
        : undefined
    return {
      localDate: run.localDate as string,
      mentions,
      recipientEmail: user.email.trim(),
      state: "ready" as const,
      topMentionIds,
      workspaceName: workspace.name as string,
      ...(recipientName === undefined ? {} : { recipientName }),
    }
  },
})

export const enqueueRenderedDailyDigest = internalMutation({
  args: {
    digestRunId: v.id("digestRuns"),
    from: v.string(),
    html: v.string(),
    replyTo: v.optional(v.string()),
    subject: v.string(),
    text: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const run = (await ctx.db.get(
      "digestRuns",
      args.digestRunId,
    )) as GenericRow | null
    if (!run) {
      throw new TypeError("Digest run does not exist")
    }
    const payload: EmailPayload = {
      from: args.from,
      html: args.html,
      subject: args.subject,
      text: args.text,
      to: [args.to],
      ...(args.replyTo === undefined ? {} : { replyTo: args.replyTo }),
    }
    const idempotencyKey = `email:${run.idempotencyKey as string}`
    const fingerprint = emailPayloadFingerprint(payload)
    const existing = (await ctx.db
      .query("emailOutbox")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", idempotencyKey),
      )
      .unique()) as GenericRow | null

    let outboxId: EmailOutboxId
    if (existing) {
      if (
        existing.payloadFingerprint !== fingerprint ||
        existing.workspaceId !== run.workspaceId ||
        existing.userId !== run.userId
      ) {
        throw new TypeError("Digest email idempotency collision")
      }
      outboxId = existing._id as EmailOutboxId
    } else {
      const now = Date.now()
      const pending = createPendingEmail({ idempotencyKey, now, payload })
      outboxId = (await ctx.db.insert(
        "emailOutbox",
        withoutUndefinedValues({
          attempts: pending.attempts,
          createdAt: pending.createdAt,
          digestRunId: args.digestRunId,
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
          userId: run.userId,
          workspaceId: run.workspaceId,
        }),
      )) as EmailOutboxId
    }

    if (run.status === "processing") {
      await ctx.db.patch("digestRuns", args.digestRunId, {
        outboxId,
        status: "enqueued",
        updatedAt: Date.now(),
      })
    }
    return {
      outboxId,
      state: existing ? ("duplicate" as const) : ("enqueued" as const),
    }
  },
})

export const markDailyDigestFailed = internalMutation({
  args: {
    digestRunId: v.id("digestRuns"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("digestRuns", args.digestRunId)
    if (!run || run.status !== "processing") {
      return { state: "not_pending" as const }
    }
    const now = Date.now()
    await ctx.db.patch("digestRuns", args.digestRunId, {
      completedAt: now,
      error: args.error,
      status: "failed",
      updatedAt: now,
    })
    return { state: "failed" as const }
  },
})

type DigestRunArguments = { digestRunId: DigestRunId }

export const renderDailyDigestReference =
  internalActionReference<DigestRunArguments>(
    "digest/actions:renderDailyDigest",
  )

export const dispatchDueDailyDigestsReference = internalMutationReference<{
  now?: number
}>("digest/internal:dispatchDueDailyDigests")

export const loadDailyDigestRenderContextReference =
  internalQueryReference<DigestRunArguments>(
    "digest/internal:loadDailyDigestRenderContext",
  )

export const enqueueRenderedDailyDigestReference = internalMutationReference<
  DigestRunArguments & {
    from: string
    html: string
    replyTo?: string
    subject: string
    text: string
    to: string
  }
>("digest/internal:enqueueRenderedDailyDigest")

export const markDailyDigestFailedReference = internalMutationReference<
  DigestRunArguments & { error: string }
>("digest/internal:markDailyDigestFailed")
