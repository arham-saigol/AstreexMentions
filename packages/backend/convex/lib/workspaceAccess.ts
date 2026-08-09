import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { effectiveEntitlementStatus } from "../billing/lifecycle"

export const FREE_EVALUATION_KEYWORD_LIMIT = 1
export const FREE_EVALUATION_MENTION_LIMIT = 100
export const FREE_MENTION_RETENTION_MS = 60 * 24 * 60 * 60 * 1_000
const MAX_BILLING_ROWS = 16

type WorkspaceId = Id<"workspaces">
type DatabaseCtx = Pick<QueryCtx | MutationCtx, "db">

export type WorkspaceAllowance =
  | {
      exhausted: boolean
      grant: Doc<"freeEvaluationGrants">
      keywordLimit: number
      kind: "free"
      mentionLimit: number
      mentionsUsed: number
      planId: "starter"
    }
  | {
      cycle: Doc<"usageCycles">
      exhausted: boolean
      keywordLimit: number
      kind: "paid"
      mentionLimit: number
      mentionsUsed: number
      planId: "starter" | "growth" | "scale"
      subscription: Doc<"subscriptions">
    }
  | {
      exhausted: boolean
      keywordLimit: 0
      kind: "none"
      mentionLimit: 0
      mentionsUsed: 0
      pauseReason: "paid" | "usage"
      planId: "starter"
    }

function validCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function planId(value: unknown): "starter" | "growth" | "scale" {
  if (value === "starter" || value === "growth" || value === "scale") {
    return value
  }
  throw new TypeError("Workspace billing plan is invalid")
}

async function activeSubscription(
  ctx: DatabaseCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<Doc<"subscriptions"> | null> {
  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_workspace_and_last_synced_at", (q) =>
      q.eq("workspaceId", workspaceId),
    )
    .order("desc")
    .take(MAX_BILLING_ROWS)
  return (
    subscriptions.find(
      (subscription) =>
        effectiveEntitlementStatus(
          {
            currentPeriodEnd: subscription.currentPeriodEnd,
            entitlementStatus: subscription.entitlementStatus,
            status: subscription.status,
          },
          now,
        ) === "active",
    ) ?? null
  )
}

async function currentPaidCycle(
  ctx: DatabaseCtx,
  workspaceId: WorkspaceId,
  subscription: Doc<"subscriptions">,
  now: number,
): Promise<Doc<"usageCycles"> | null> {
  const cycles = await ctx.db
    .query("usageCycles")
    .withIndex("by_workspace_status_and_period_end", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("status", "open")
        .gt("periodEndAt", now),
    )
    .take(MAX_BILLING_ROWS)
  const current = cycles
    .filter(
      (cycle) =>
        cycle.periodStartAt <= now &&
        (cycle.subscriptionId === subscription._id ||
          (cycle.subscriptionId === undefined &&
            cycle.planSnapshot.planId === subscription.planId)),
    )
    .sort((left, right) => right.periodStartAt - left.periodStartAt)[0]
  return current ?? null
}

export async function freeEvaluationGrant(
  ctx: DatabaseCtx,
  workspaceId: WorkspaceId,
): Promise<Doc<"freeEvaluationGrants"> | null> {
  return await ctx.db
    .query("freeEvaluationGrants")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique()
}

export async function ensureFreeEvaluationGrant(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<void> {
  if (await freeEvaluationGrant(ctx, workspaceId)) return
  await ctx.db.insert("freeEvaluationGrants", {
    activatedAt: now,
    createdAt: now,
    mentionLimit: FREE_EVALUATION_MENTION_LIMIT,
    mentionsUsed: 0,
    updatedAt: now,
    workspaceId,
  })
}

export async function resolveWorkspaceAllowance(
  ctx: DatabaseCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<WorkspaceAllowance> {
  const subscription = await activeSubscription(ctx, workspaceId, now)
  if (subscription) {
    const cycle = await currentPaidCycle(ctx, workspaceId, subscription, now)
    if (!cycle) {
      return {
        exhausted: true,
        keywordLimit: 0,
        kind: "none",
        mentionLimit: 0,
        mentionsUsed: 0,
        pauseReason: "usage",
        planId: "starter",
      }
    }
    if (
      !validCounter(cycle.keywordLimit) ||
      !validCounter(cycle.mentionLimit) ||
      !validCounter(cycle.mentionsUsed) ||
      cycle.mentionsUsed > cycle.mentionLimit
    ) {
      throw new TypeError("Workspace paid allowance is invalid")
    }
    return {
      cycle,
      exhausted: cycle.mentionsUsed >= cycle.mentionLimit,
      keywordLimit: cycle.keywordLimit,
      kind: "paid",
      mentionLimit: cycle.mentionLimit,
      mentionsUsed: cycle.mentionsUsed,
      planId: planId(cycle.planSnapshot.planId),
      subscription,
    }
  }

  const grant = await freeEvaluationGrant(ctx, workspaceId)
  if (!grant) {
    return {
      exhausted: false,
      keywordLimit: 0,
      kind: "none",
      mentionLimit: 0,
      mentionsUsed: 0,
      pauseReason: "paid",
      planId: "starter",
    }
  }
  if (
    grant.mentionLimit !== FREE_EVALUATION_MENTION_LIMIT ||
    !validCounter(grant.mentionsUsed) ||
    grant.mentionsUsed > grant.mentionLimit
  ) {
    throw new TypeError("Workspace free evaluation allowance is invalid")
  }
  return {
    exhausted: grant.mentionsUsed >= grant.mentionLimit,
    grant,
    keywordLimit: FREE_EVALUATION_KEYWORD_LIMIT,
    kind: "free",
    mentionLimit: grant.mentionLimit,
    mentionsUsed: grant.mentionsUsed,
    planId: "starter",
  }
}
