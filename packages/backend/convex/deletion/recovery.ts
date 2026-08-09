import type { Id } from "../_generated/dataModel"

import { type MutationCtx } from "../_generated/server"
import { reconcileWorkspaceKeywords } from "../keywords"

const MAX_DELETION_RECONCILE_SOURCES = 200
const MAX_DELETION_RECONCILE_DIGESTS = 50

type WorkspaceId = Id<"workspaces">

export async function restoreDeletionFenceState(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  accessFencedAt: number,
  now: number,
): Promise<void> {
  const [sources, digestPreferences] = await Promise.all([
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

  for (const source of sourceRows) {
    if (source.deletionPausedAt !== accessFencedAt) {
      continue
    }
    await ctx.db.patch("trackingSources", source._id, {
      deletionPausedAt: undefined,
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      updatedAt: now,
    })
  }
  await reconcileWorkspaceKeywords(ctx, { now, workspaceId })

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
