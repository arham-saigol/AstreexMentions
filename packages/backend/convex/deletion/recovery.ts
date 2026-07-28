import type { GenericId } from "convex/values"

import { effectiveEntitlementStatus } from "../billing/lifecycle"
import { indexEquals, type MutationCtx } from "../server"

const MAX_DELETION_RECONCILE_SOURCES = 200
const MAX_DELETION_RECONCILE_DIGESTS = 50

type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type KeywordId = GenericId<"keywords">
type TrackingSourceId = GenericId<"trackingSources">
type DigestPreferenceId = GenericId<"digestPreferences">
type GenericRow = Record<string, unknown> & { _id: GenericId<string> }

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
          indexEquals(q, ["workspaceId", workspaceId], ["status", "open"]),
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
  const subscriptionRow = subscription as GenericRow | null
  const usageCycleRows = usageCycles as GenericRow[]
  const sourceRows = sources as GenericRow[]
  const digestPreferenceRows = digestPreferences as GenericRow[]
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
        currentPeriodEnd: subscriptionRow.currentPeriodEnd as number,
        entitlementStatus: subscriptionRow.entitlementStatus as
          "active" | "inactive",
        status: subscriptionRow.status as string,
      },
      now,
    ) === "active"
  const usageCycle = usageCycleRows
    .filter(
      (cycle) =>
        (cycle.periodStartAt as number) <= now &&
        (cycle.periodEndAt as number) > now,
    )
    .sort(
      (left, right) =>
        (right.periodStartAt as number) - (left.periodStartAt as number),
    )[0]
  const hasUsageCapacity =
    usageCycle !== undefined &&
    (usageCycle.mentionsUsed as number) < (usageCycle.mentionLimit as number)

  for (const source of sourceRows) {
    if (source.deletionPausedAt !== accessFencedAt) {
      continue
    }
    const keyword = await ctx.db.get("keywords", source.keywordId as KeywordId)
    if (source.deletedAt !== undefined || source.status === "deleted") {
      await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
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
    await ctx.db.patch("trackingSources", source._id as TrackingSourceId, {
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
    const digestUser = await ctx.db.get("users", preference.userId as UserId)
    const recipientAvailable =
      digestUser !== null &&
      digestUser.deletedAt === undefined &&
      digestUser.disabledAt === undefined &&
      typeof digestUser.email === "string" &&
      digestUser.email.trim().length > 0
    await ctx.db.patch(
      "digestPreferences",
      preference._id as DigestPreferenceId,
      {
        deletionPausedAt: undefined,
        enabled: recipientAvailable,
        updatedAt: now,
      },
    )
  }
}
