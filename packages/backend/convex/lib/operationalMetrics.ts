import type { GenericId } from "convex/values"

import { indexEquals, type MutationCtx } from "../server"
import {
  adjustSystemMetricGauge,
  SYSTEM_METRIC_GAUGE_BUCKET_START_AT,
} from "./systemMetricBuckets"

type WorkspaceId = GenericId<"workspaces">
type PlanId = "starter" | "growth" | "scale"

export const WORKSPACE_COUNT_METRIC = "operational_workspaces"
export const USAGE_PAUSED_WORKSPACE_METRIC =
  "operational_usage_paused_workspaces"

export function subscriptionCountMetric(
  planId: PlanId,
  active: boolean,
): string {
  return `operational_subscriptions:${planId}:${active ? "active" : "total"}`
}

function planId(value: unknown): PlanId | null {
  return value === "starter" || value === "growth" || value === "scale"
    ? value
    : null
}

export async function transitionSubscriptionMetrics(
  ctx: MutationCtx,
  input: {
    from?: Record<string, unknown> | undefined
    to?: Record<string, unknown> | undefined
    updatedAt: number
    workspaceId: WorkspaceId
  },
): Promise<void> {
  const deltas = new Map<string, number>()
  for (const [row, direction] of [
    [input.from, -1],
    [input.to, 1],
  ] as const) {
    const plan = planId(row?.planId)
    if (!plan) {
      continue
    }
    const totalMetric = subscriptionCountMetric(plan, false)
    deltas.set(totalMetric, (deltas.get(totalMetric) ?? 0) + direction)
    if (row?.entitlementStatus === "active") {
      const activeMetric = subscriptionCountMetric(plan, true)
      deltas.set(activeMetric, (deltas.get(activeMetric) ?? 0) + direction)
    }
  }

  for (const [metric, delta] of deltas) {
    if (delta === 0) {
      continue
    }
    await adjustSystemMetricGauge(ctx, {
      delta: delta as -1 | 1,
      metric,
      updatedAt: input.updatedAt,
      workspaceId: input.workspaceId,
    })
  }
}

export async function adjustWorkspaceCountMetric(
  ctx: MutationCtx,
  input: {
    delta: -1 | 1
    updatedAt: number
    workspaceId: WorkspaceId
  },
): Promise<void> {
  await adjustSystemMetricGauge(ctx, {
    ...input,
    metric: WORKSPACE_COUNT_METRIC,
  })
}

export async function syncUsagePausedWorkspaceMetric(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  updatedAt: number,
): Promise<void> {
  const pausedSources = await ctx.db
    .query("trackingSources")
    .withIndex("by_workspace_status_and_created_at", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["status", "paused"]),
    )
    .take(64)
  const desired = pausedSources.some(
    (source) =>
      source.pauseReason === "usage" && source.deletedAt === undefined,
  )
  const marker = await ctx.db
    .query("systemMetricBuckets")
    .withIndex("by_metric_scope_workspace_granularity_and_bucket", (q) =>
      indexEquals(
        q,
        ["metric", USAGE_PAUSED_WORKSPACE_METRIC],
        ["scope", "workspace"],
        ["workspaceId", workspaceId],
        ["granularity", "hour"],
        ["bucketStartAt", SYSTEM_METRIC_GAUGE_BUCKET_START_AT],
      ),
    )
    .unique()
  const markerValue = marker?.value
  const current = typeof markerValue === "number" && markerValue > 0
  if (current === desired) {
    return
  }
  await adjustSystemMetricGauge(ctx, {
    delta: desired ? 1 : -1,
    metric: USAGE_PAUSED_WORKSPACE_METRIC,
    updatedAt,
    workspaceId,
  })
}
