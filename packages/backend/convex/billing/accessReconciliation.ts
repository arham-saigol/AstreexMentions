import { internal } from "../_generated/api"
import { v } from "convex/values"

import { internalMutation } from "../_generated/server"
import { reconcileWorkspaceKeywords } from "../keywords"

const EXPIRED_WORKSPACES_PER_BATCH = 4

export const reconcileExpiredMonitoringAccess = internalMutation({
  args: { cursor: v.optional(v.string()), now: v.optional(v.number()) },
  returns: v.object({
    reconciled: v.number(),
    state: v.literal("completed"),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new TypeError("Billing reconciliation time is invalid")
    }
    const page = await ctx.db
      .query("subscriptions")
      .withIndex("by_entitlement_and_period_end", (q) =>
        q.eq("entitlementStatus", "active").lte("currentPeriodEnd", now),
      )
      .paginate({
        cursor: args.cursor ?? null,
        maximumRowsRead: EXPIRED_WORKSPACES_PER_BATCH,
        numItems: EXPIRED_WORKSPACES_PER_BATCH,
      })
    const workspaceIds = [
      ...new Map(
        page.page.map((subscription) => [
          String(subscription.workspaceId),
          subscription.workspaceId,
        ]),
      ).values(),
    ]
    for (const workspaceId of workspaceIds) {
      await reconcileWorkspaceKeywords(ctx, { now, workspaceId })
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.billing.accessReconciliation.reconcileExpiredMonitoringAccess,
        { cursor: page.continueCursor, now },
      )
    }
    return { reconciled: workspaceIds.length, state: "completed" as const }
  },
})
