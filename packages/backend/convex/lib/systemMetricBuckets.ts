import type { GenericId } from "convex/values"

import { indexEquals, type MutationCtx } from "../server"

type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type SystemMetricBucketId = GenericId<"systemMetricBuckets">
type WorkspaceId = GenericId<"workspaces">

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
export const SYSTEM_METRIC_GAUGE_BUCKET_START_AT = 0

export async function adjustSystemMetricGauge(
  ctx: MutationCtx,
  input: {
    delta: -1 | 1
    metric: string
    updatedAt: number
    workspaceId: WorkspaceId
  },
): Promise<void> {
  const bucketStartAt = SYSTEM_METRIC_GAUGE_BUCKET_START_AT
  const bucketEndAt = bucketStartAt + HOUR_MS

  for (const scope of ["global", "workspace"] as const) {
    const metricWorkspaceId =
      scope === "workspace" ? input.workspaceId : undefined
    const bucket = (await ctx.db
      .query("systemMetricBuckets")
      .withIndex("by_metric_scope_workspace_granularity_and_bucket", (q) =>
        indexEquals(
          q,
          ["metric", input.metric],
          ["scope", scope],
          ["workspaceId", metricWorkspaceId],
          ["granularity", "hour"],
          ["bucketStartAt", bucketStartAt],
        ),
      )
      .unique()) as GenericRow | null

    if (!bucket) {
      // Older rows may predate gauge accounting. A missing decrement is a
      // migration no-op; the next positive transition establishes the gauge.
      if (input.delta < 0) {
        continue
      }
      await ctx.db.insert("systemMetricBuckets", {
        bucketEndAt,
        bucketStartAt,
        count: 1,
        granularity: "hour",
        maximum: 1,
        metric: input.metric,
        minimum: 1,
        scope,
        sum: 1,
        updatedAt: input.updatedAt,
        value: 1,
        ...(metricWorkspaceId === undefined
          ? {}
          : { workspaceId: metricWorkspaceId }),
      })
      continue
    }

    const nextValue = Math.max(0, (bucket.value as number) + input.delta)
    await ctx.db.patch(
      "systemMetricBuckets",
      bucket._id as SystemMetricBucketId,
      {
        count: nextValue,
        maximum: Math.max(bucket.maximum as number, nextValue),
        minimum: Math.min(bucket.minimum as number, nextValue),
        sum: nextValue,
        updatedAt: input.updatedAt,
        value: nextValue,
      },
    )
  }
}

export async function incrementDailySystemMetric(
  ctx: MutationCtx,
  input: {
    bucketAt: number
    metric: string
    scope?: "global" | "global_and_workspace"
    updatedAt: number
    workspaceId: WorkspaceId
  },
): Promise<void> {
  const bucketStartAt = Math.floor(input.bucketAt / DAY_MS) * DAY_MS
  const bucketEndAt = bucketStartAt + DAY_MS

  const scopes =
    input.scope === "global"
      ? (["global"] as const)
      : (["global", "workspace"] as const)
  for (const scope of scopes) {
    const metricWorkspaceId =
      scope === "workspace" ? input.workspaceId : undefined
    const bucket = (await ctx.db
      .query("systemMetricBuckets")
      .withIndex("by_metric_scope_workspace_granularity_and_bucket", (q) =>
        indexEquals(
          q,
          ["metric", input.metric],
          ["scope", scope],
          ["workspaceId", metricWorkspaceId],
          ["granularity", "day"],
          ["bucketStartAt", bucketStartAt],
        ),
      )
      .unique()) as GenericRow | null

    if (bucket) {
      await ctx.db.patch(
        "systemMetricBuckets",
        bucket._id as SystemMetricBucketId,
        {
          count: (bucket.count as number) + 1,
          maximum: Math.max(bucket.maximum as number, 1),
          minimum: Math.min(bucket.minimum as number, 1),
          sum: (bucket.sum as number) + 1,
          updatedAt: input.updatedAt,
          value: (bucket.value as number) + 1,
        },
      )
      continue
    }

    await ctx.db.insert("systemMetricBuckets", {
      bucketEndAt,
      bucketStartAt,
      count: 1,
      granularity: "day",
      maximum: 1,
      metric: input.metric,
      minimum: 1,
      scope,
      sum: 1,
      updatedAt: input.updatedAt,
      value: 1,
      ...(metricWorkspaceId === undefined
        ? {}
        : { workspaceId: metricWorkspaceId }),
    })
  }
}
