import type { Id } from "../_generated/dataModel"

import { type MutationCtx } from "../_generated/server"

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export const PROVIDER_DAILY_ROLLUP_OPERATION = "daily_rollup"
export const METRIC_PROVIDERS = [
  "x",
  "reddit_posts",
  "reddit_comments",
  "hacker_news",
  "deepseek",
  "resend",
  "creem",
  "tinyfish",
] as const

export type MetricProvider = (typeof METRIC_PROVIDERS)[number]

type ProviderMetricBucketId = Id<"providerMetricBuckets">

export async function recordProviderMetricBuckets(
  ctx: MutationCtx,
  input: {
    durationMs: number
    failureCount: number
    inputItemCount: number
    operation: string
    outputItemCount: number
    provider: MetricProvider
    rateLimitedCount: number
    retryCount: number
    successCount: number
  },
  updatedAt: number,
): Promise<void> {
  const durationMs = Math.max(0, Math.round(input.durationMs))

  for (const bucket of [
    {
      duration: HOUR_MS,
      granularity: "hour" as const,
      operation: input.operation,
    },
    {
      duration: DAY_MS,
      granularity: "day" as const,
      operation: PROVIDER_DAILY_ROLLUP_OPERATION,
    },
  ]) {
    const bucketStartAt =
      Math.floor(updatedAt / bucket.duration) * bucket.duration
    const existing = await ctx.db
      .query("providerMetricBuckets")
      .withIndex("by_provider_operation_granularity_and_bucket", (q) =>
        q
          .eq("provider", input.provider)
          .eq("operation", bucket.operation)
          .eq("granularity", bucket.granularity)
          .eq("bucketStartAt", bucketStartAt),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(
        "providerMetricBuckets",
        existing._id as ProviderMetricBucketId,
        {
          failureCount: (existing.failureCount as number) + input.failureCount,
          inputItemCount:
            (existing.inputItemCount as number) + input.inputItemCount,
          latencyMaxMs: Math.max(existing.latencyMaxMs as number, durationMs),
          latencyTotalMs: (existing.latencyTotalMs as number) + durationMs,
          outputItemCount:
            (existing.outputItemCount as number) + input.outputItemCount,
          rateLimitedCount:
            (existing.rateLimitedCount as number) + input.rateLimitedCount,
          requestCount: (existing.requestCount as number) + 1,
          retryCount: (existing.retryCount as number) + input.retryCount,
          successCount: (existing.successCount as number) + input.successCount,
          updatedAt,
        },
      )
      continue
    }

    await ctx.db.insert("providerMetricBuckets", {
      bucketEndAt: bucketStartAt + bucket.duration,
      bucketStartAt,
      failureCount: input.failureCount,
      granularity: bucket.granularity,
      inputItemCount: input.inputItemCount,
      latencyMaxMs: durationMs,
      latencyTotalMs: durationMs,
      operation: bucket.operation,
      outputItemCount: input.outputItemCount,
      provider: input.provider,
      rateLimitedCount: input.rateLimitedCount,
      requestCount: 1,
      retryCount: input.retryCount,
      successCount: input.successCount,
      updatedAt,
    })
  }
}
