import type { Id } from "../_generated/dataModel"

import { effectiveEntitlementStatus } from "../billing/lifecycle"
import { type MutationCtx } from "../_generated/server"

const MAX_DELETION_RECONCILE_SOURCES = 200
const MAX_DELETION_RECONCILE_DIGESTS = 50

type WorkspaceId = Id<"workspaces">

export async function restoreDeletionFenceState(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  accessFencedAt: number,
  now: number,
): Promise<void> {
  const [subscription, usageCycles, sources, digestPreferences] =
    await Promise.all([
      ctx.db
        .query("subscriptions")
        .withIndex("by_workspace_and_last_synced_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("usageCycles")
        .withIndex("by_workspace_status_and_period_end", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", "open"),
        )
        .collect(),
      ctx.db
        .query("trackingSources")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(MAX_DELETION_RECONCILE_SOURCES + 1),
      ctx.db
        .query("digestPreferences")
        .withIndex("by_workspace_and_updated_at", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .take(MAX_DELETION_RECONCILE_DIGESTS + 1),
    ])
  const subscriptionRow = subscription
  const usageCycleRows = usageCycles
  const sourceRows = sources
  const digestPreferenceRows = digestPreferences
  if (sourceRows.length > MAX_DELETION_RECONCILE_SOURCES) {
    throw new RangeError(
      "Tracking source count exceeds the deletion-fence recovery limit",
    )
  }
  if (digestPreferenceRows.length > MAX_DELETION_RECONCILE_DIGESTS) {
    throw new RangeError(
      "Digest preference count exceeds the deletion-fence recovery limit",
    )
  }

  const hasActiveSubscription =
    subscriptionRow !== null &&
    effectiveEntitlementStatus(
      {
        currentPeriodEnd: subscriptionRow.currentPeriodEnd,
        entitlementStatus: subscriptionRow.entitlementStatus,
        status: subscriptionRow.status,
      },
      now,
    ) === "active"
  const usageCycle = usageCycleRows
    .filter((cycle) => cycle.periodStartAt <= now && cycle.periodEndAt > now)
    .sort((left, right) => right.periodStartAt - left.periodStartAt)[0]
  const hasUsageCapacity =
    usageCycle !== undefined &&
    usageCycle.mentionsUsed < usageCycle.mentionLimit

  for (const source of sourceRows) {
    if (source.deletionPausedAt !== accessFencedAt) {
      continue
    }
    const keyword = await ctx.db.get("keywords", source.keywordId)
    if (source.deletedAt !== undefined || source.status === "deleted") {
      await ctx.db.patch("trackingSources", source._id, {
        deletionPausedAt: undefined,
        updatedAt: now,
      })
      continue
    }
    const keywordUnavailable =
      !keyword || keyword.deletedAt !== undefined || keyword.status !== "active"
    const desiredState = keywordUnavailable
      ? { pauseReason: "user" as const, status: "paused" as const }
      : !hasActiveSubscription
        ? { pauseReason: "paid" as const, status: "paused" as const }
        : !hasUsageCapacity
          ? { pauseReason: "usage" as const, status: "paused" as const }
          : { pauseReason: undefined, status: "active" as const }
    await ctx.db.patch("trackingSources", source._id, {
      deletionPausedAt: undefined,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      ...desiredState,
      updatedAt: now,
    })
  }

  for (const preference of digestPreferenceRows) {
    if (preference.deletionPausedAt !== accessFencedAt) {
      continue
    }
    const digestUser = await ctx.db.get("users", preference.userId)
    const recipientAvailable =
      digestUser !== null &&
      digestUser.deletedAt === undefined &&
      digestUser.disabledAt === undefined &&
      typeof digestUser.email === "string" &&
      digestUser.email.trim().length > 0
    await ctx.db.patch("digestPreferences", preference._id, {
      deletionPausedAt: undefined,
      enabled: recipientAvailable,
      updatedAt: now,
    })
  }
}
