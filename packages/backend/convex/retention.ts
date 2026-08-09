import { internal } from "./_generated/api"
import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import { transitionCategorizationStatusMetric } from "./categorization/metrics"

export const RETENTION_BATCH_SIZE = 25
const MAX_MATCHES_PER_MENTION = 16
const MAX_JOBS_PER_MENTION = 2

type MentionId = Id<"mentions">

export const purgeExpiredFreeMentions = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), state: v.literal("completed") }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new TypeError("Retention time is invalid")
    }
    const expired = await ctx.db
      .query("mentions")
      .withIndex("by_retention_expires_at", (q) =>
        q.gt("retentionExpiresAt", 0).lte("retentionExpiresAt", now),
      )
      .take(RETENTION_BATCH_SIZE)

    let deleted = 0
    let needsContinuation = expired.length === RETENTION_BATCH_SIZE
    for (const mention of expired) {
      const mentionId = mention._id as MentionId
      const matches = await ctx.db
        .query("mentionKeywordMatches")
        .withIndex("by_workspace_and_mention", (q) =>
          q.eq("workspaceId", mention.workspaceId).eq("mentionId", mentionId),
        )
        .take(MAX_MATCHES_PER_MENTION + 1)
      for (const match of matches.slice(0, MAX_MATCHES_PER_MENTION)) {
        await ctx.db.delete("mentionKeywordMatches", match._id)
      }
      if (matches.length > MAX_MATCHES_PER_MENTION) {
        needsContinuation = true
        continue
      }

      const jobs = await ctx.db
        .query("categorizationJobs")
        .withIndex("by_mention", (q) => q.eq("mentionId", mentionId))
        .take(MAX_JOBS_PER_MENTION + 1)
      for (const job of jobs.slice(0, MAX_JOBS_PER_MENTION)) {
        if (job.status !== "completed" && job.status !== "dead") {
          await transitionCategorizationStatusMetric(ctx, {
            from: job.status,
            updatedAt: now,
            workspaceId: mention.workspaceId,
          })
        }
        await ctx.db.delete("categorizationJobs", job._id)
      }
      if (jobs.length > MAX_JOBS_PER_MENTION) {
        needsContinuation = true
        continue
      }
      await ctx.db.delete("mentions", mentionId)
      deleted += 1
    }

    if (needsContinuation) {
      await ctx.scheduler.runAfter(
        0,
        internal.retention.purgeExpiredFreeMentions,
        { now },
      )
    }
    return { deleted, state: "completed" as const }
  },
})
