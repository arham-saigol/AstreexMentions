import { internal } from "../_generated/api"
import { v } from "convex/values"

import { internalMutation } from "../_generated/server"
import { reconcileWorkspaceKeywords } from "../keywords"

const EXPIRED_WORKSPACES_PER_BATCH = 4

export const reconcileExpiredMonitoringAccess = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    reconciled: v.number(),
    state: v.literal("completed"),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new TypeError("Billing reconciliation time is invalid")
    }
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_entitlement_reconciled_at_and_period_end", (q) =>
        q
          .eq("entitlementStatus", "active")
          .eq("monitoringAccessReconciledAt", undefined)
          .lte("currentPeriodEnd", now),
      )
      .take(EXPIRED_WORKSPACES_PER_BATCH)
    const workspaceIds = [
      ...new Map(
        subscriptions.map((subscription) => [
          String(subscription.workspaceId),
          subscription.workspaceId,
        ]),
      ).values(),
    ]
    for (const workspaceId of workspaceIds) {
      await reconcileWorkspaceKeywords(ctx, { now, workspaceId })
    }
    for (const subscription of subscriptions) {
      await ctx.db.patch("subscriptions", subscription._id, {
        monitoringAccessReconciledAt: now,
      })
    }
    if (subscriptions.length === EXPIRED_WORKSPACES_PER_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.billing.accessReconciliation.reconcileExpiredMonitoringAccess,
        { now },
      )
    }
    return { reconciled: workspaceIds.length, state: "completed" as const }
  },
})
