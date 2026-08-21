import { internal } from "../_generated/api"
import { v } from "convex/values"

import { readEmailCompositionConfiguration } from "../email/config"
import {
  createPendingEmail,
  emailPayloadFingerprint,
  type EmailPayload,
} from "../lib/emailOutbox"
import { planDailyDigest } from "../lib/dailyDigest"
import { isCategorySystemKey } from "../lib/categories"
import { withoutUndefinedValues } from "../lib/jobRuntime"
import { env, internalMutation, type MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import {
  digestCategory,
  rankDigestMentions,
  type DigestMentionCandidate,
} from "./model"

const MAX_DUE_DIGESTS = 64
const DIGEST_AGGREGATION_PAGE_SIZE = 200

type EmailOutboxId = Id<"emailOutbox">
type MentionId = Id<"mentions">

type DigestAggregationCounts = {
  categories: Record<string, number>
  platforms: Record<"hacker_news" | "reddit" | "x", number>
  total: number
}

function emptyDigestAggregationCounts(): DigestAggregationCounts {
  return {
    categories: {},
    platforms: { hacker_news: 0, reddit: 0, x: 0 },
    total: 0,
  }
}

function parseDigestAggregationCounts(value: unknown): DigestAggregationCounts {
  if (typeof value !== "string") {
    return emptyDigestAggregationCounts()
  }
  const parsed = JSON.parse(value) as DigestAggregationCounts
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Number.isSafeInteger(parsed.total) ||
    parsed.total < 0
  ) {
    throw new TypeError("Digest aggregation counts are invalid")
  }
  return parsed
}

function platformFromRow(row: Doc<"mentions">) {
  return row.platform
}

function candidateFromRow(row: Doc<"mentions">): DigestMentionCandidate {
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

async function schedulePreference(
  ctx: MutationCtx,
  preference: Doc<"digestPreferences">,
  now: number,
): Promise<"duplicate" | "enqueued" | "skipped_empty" | "skipped_recipient"> {
  const preferenceId = preference._id
  const workspaceId = preference.workspaceId
  const userId = preference.userId
  const [workspace, user] = await Promise.all([
    ctx.db.get("workspaces", workspaceId),
    ctx.db.get("users", userId),
  ])

  if (workspace && typeof workspace.deletionPendingAt === "number") {
    await ctx.db.patch("digestPreferences", preferenceId, {
      deletionPausedAt: workspace.deletionPendingAt,
      enabled: false,
      updatedAt: now,
    })
    return "skipped_recipient"
  }

  if (
    !workspace ||
    workspace.deletedAt !== undefined ||
    !user ||
    user.deletedAt !== undefined ||
    user.disabledAt !== undefined ||
    typeof user.email !== "string" ||
    user.email.trim().length === 0
  ) {
    await ctx.db.patch("digestPreferences", preferenceId, {
      deletionPausedAt: undefined,
      enabled: false,
      updatedAt: now,
    })
    return "skipped_recipient"
  }

  const scheduledFor = preference.nextRunAt as number
  const plan = planDailyDigest({
    alreadyRecorded: false,
    mentionLimit: preference.mentionLimit as number,
    mentions: [],
    scheduledFor,
    timeZone: preference.timeZone as string,
    workspaceId: String(workspaceId),
  })
  const existing = await ctx.db
    .query("digestRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", plan.idempotencyKey),
    )
    .unique()

  await ctx.db.patch("digestPreferences", preferenceId, {
    nextRunAt: plan.nextRunAt,
    updatedAt: now,
  })
  if (existing) {
    return "duplicate"
  }

  const digestRunId = await ctx.db.insert("digestRuns", {
    createdAt: now,
    digestCountsJson: JSON.stringify(emptyDigestAggregationCounts()),
    digestPreferenceId: preferenceId,
    idempotencyKey: plan.idempotencyKey,
    localDate: plan.window.localDate,
    mentionCount: 0,
    mentionIds: [],
    mentionLimit: preference.mentionLimit as number,
    scheduledFor: plan.scheduledFor,
    status: "processing",
    updatedAt: now,
    userId,
    windowEndAt: plan.window.endAt,
    windowStartAt: plan.window.startAt,
    workspaceId,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.digest.internal.aggregateDailyDigestPage,
    {
      digestRunId,
    },
  )
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

    const due = await ctx.db
      .query("digestPreferences")
      .withIndex("by_enabled_and_next_run_at", (q) =>
        q.eq("enabled", true).lte("nextRunAt", now),
      )
      .take(MAX_DUE_DIGESTS)
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
    if (due.length === MAX_DUE_DIGESTS) {
      await ctx.scheduler.runAfter(
        0,
        internal.digest.internal.dispatchDueDailyDigests,
        {},
      )
    }

    return { outcomes, state: "dispatched" as const }
  },
})

export const aggregateDailyDigestPage = internalMutation({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("digestRuns", args.digestRunId)
    if (
      !run ||
      run.status !== "processing" ||
      run.aggregationCompletedAt !== undefined
    ) {
      return { state: "not_pending" as const }
    }

    const workspaceId = run.workspaceId
    const page = await ctx.db
      .query("mentions")
      .withIndex("by_workspace_feed_state_and_published_at", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("feedState", "visible")
          .gte("publishedAt", run.windowStartAt)
          .lt("publishedAt", run.windowEndAt),
      )
      .order("desc")
      .paginate({
        cursor:
          typeof run.aggregationCursor === "string"
            ? run.aggregationCursor
            : null,
        numItems: DIGEST_AGGREGATION_PAGE_SIZE,
      })
    const snapshotRows = page.page.filter(
      (mention) => (mention.firstSeenAt as number) <= (run.createdAt as number),
    )
    const previousTopRows = (
      await Promise.all(
        (run.mentionIds as MentionId[]).map(
          async (mentionId) => await ctx.db.get("mentions", mentionId),
        ),
      )
    ).filter(
      (mention): mention is Doc<"mentions"> =>
        mention !== null &&
        mention.workspaceId === workspaceId &&
        mention.feedState === "visible",
    )
    const mentionLimit =
      typeof run.mentionLimit === "number" ? run.mentionLimit : 10
    const ranked = rankDigestMentions(
      [...previousTopRows, ...snapshotRows].map(candidateFromRow),
      mentionLimit,
    )
    const mentionIds = ranked.map(({ candidate }) => candidate.id as MentionId)

    const counts = parseDigestAggregationCounts(run.digestCountsJson)
    for (const mention of snapshotRows) {
      const platform = platformFromRow(mention)
      const categoryId =
        mention.categoryId === undefined
          ? "unanalyzed"
          : String(mention.categoryId)
      counts.total += 1
      counts.platforms[platform] += 1
      counts.categories[categoryId] = (counts.categories[categoryId] ?? 0) + 1
    }
    const now = Date.now()
    const digestCountsJson = JSON.stringify(counts)

    if (!page.isDone) {
      await ctx.db.patch("digestRuns", args.digestRunId, {
        aggregationCursor: page.continueCursor,
        digestCountsJson,
        mentionCount: counts.total,
        mentionIds,
        updatedAt: now,
      })
      await ctx.scheduler.runAfter(
        0,
        internal.digest.internal.aggregateDailyDigestPage,
        args,
      )
      return { mentionCount: counts.total, state: "continued" as const }
    }

    if (counts.total === 0) {
      await ctx.db.patch("digestRuns", args.digestRunId, {
        aggregationCompletedAt: now,
        aggregationCursor: undefined,
        completedAt: now,
        digestCountsJson,
        mentionCount: 0,
        mentionIds: [],
        status: "skipped_empty",
        updatedAt: now,
      })
      return { mentionCount: 0, state: "skipped_empty" as const }
    }

    await ctx.db.patch("digestRuns", args.digestRunId, {
      aggregationCompletedAt: now,
      aggregationCursor: undefined,
      digestCountsJson,
      mentionCount: counts.total,
      mentionIds,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.digest.actions.renderDailyDigest,
      args,
    )
    return { mentionCount: counts.total, state: "ready" as const }
  },
})

export const loadDailyDigestRenderContext = internalMutation({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("digestRuns", args.digestRunId)
    if (
      !run ||
      run.status !== "processing" ||
      run.aggregationCompletedAt === undefined
    ) {
      return { state: "not_pending" as const }
    }

    const workspaceId = run.workspaceId
    const userId = run.userId
    const [workspace, user, categoryRows] = await Promise.all([
      ctx.db.get("workspaces", workspaceId),
      ctx.db.get("users", userId),
      ctx.db
        .query("categories")
        .withIndex("by_workspace_deleted_enabled_and_sort_order", (q) =>
          q.eq("workspaceId", workspaceId).eq("deletedAt", undefined),
        )
        .collect(),
    ])
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
    const mentionRows = await Promise.all(
      (run.mentionIds as MentionId[]).map(
        async (mentionId) => await ctx.db.get("mentions", mentionId),
      ),
    )
    const snapshotRows = mentionRows.filter(
      (mention): mention is Doc<"mentions"> =>
        mention !== null &&
        mention.workspaceId === workspaceId &&
        mention.feedState === "visible" &&
        (mention.firstSeenAt as number) <= (run.createdAt as number),
    )
    const aggregateCounts = parseDigestAggregationCounts(run.digestCountsJson)
    for (const mention of mentionRows) {
      if (
        !mention ||
        mention.workspaceId !== workspaceId ||
        mention.feedState === "visible" ||
        (mention.firstSeenAt as number) > (run.createdAt as number)
      ) {
        continue
      }
      const categoryId =
        mention.categoryId === undefined
          ? "unanalyzed"
          : String(mention.categoryId)
      aggregateCounts.categories[categoryId] = Math.max(
        0,
        (aggregateCounts.categories[categoryId] ?? 0) - 1,
      )
      aggregateCounts.platforms[mention.platform] = Math.max(
        0,
        aggregateCounts.platforms[mention.platform] - 1,
      )
      aggregateCounts.total = Math.max(0, aggregateCounts.total - 1)
    }
    const updatedAt = Date.now()
    if (aggregateCounts.total === 0) {
      await ctx.db.patch("digestRuns", args.digestRunId, {
        completedAt: updatedAt,
        digestCountsJson: JSON.stringify(aggregateCounts),
        mentionCount: 0,
        mentionIds: [],
        status: "skipped_empty",
        updatedAt,
      })
      return { state: "not_pending" as const }
    }

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
    const topMentionIds = snapshotRows.map(({ _id }) => String(_id))
    await ctx.db.patch("digestRuns", args.digestRunId, {
      digestCountsJson: JSON.stringify(aggregateCounts),
      mentionCount: aggregateCounts.total,
      mentionIds: snapshotRows.map(({ _id }) => _id),
      updatedAt,
    })
    const byCategory = {
      Bug: 0,
      Complaint: 0,
      "Competitor Mention": 0,
      "Feature Request": 0,
      Other: 0,
      Praise: 0,
      Question: 0,
    }
    for (const [categoryId, count] of Object.entries(
      aggregateCounts.categories,
    )) {
      const category =
        categoryId === "unanalyzed" ? undefined : categoryById.get(categoryId)
      const label = digestCategory(
        isCategorySystemKey(category?.systemKey)
          ? category.systemKey
          : undefined,
      )
      byCategory[label] += count
    }

    const recipientName =
      typeof user.name === "string" && user.name.trim().length > 0
        ? user.name.trim()
        : undefined
    return {
      localDate: run.localDate as string,
      mentions,
      counts: {
        byCategory,
        byPlatform: aggregateCounts.platforms,
        total: aggregateCounts.total,
      },
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
    const run = await ctx.db.get("digestRuns", args.digestRunId)
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
    const existing = await ctx.db
      .query("emailOutbox")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", idempotencyKey),
      )
      .unique()

    let outboxId: EmailOutboxId
    let created = false
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
      created = true
    }

    if (run.status === "processing") {
      await ctx.db.patch("digestRuns", args.digestRunId, {
        outboxId,
        status: "enqueued",
        updatedAt: Date.now(),
      })
    }
    if (created) {
      await ctx.scheduler.runAfter(
        0,
        internal.email.internal.dispatchPendingEmails,
        {},
      )
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
