import type { GenericId } from "convex/values"

import { indexEquals, type MutationCtx } from "../server"
import type { TrackingSourceType } from "./model"

const HOUR_MS = 3_600_000

type TrackingSourceId = GenericId<"trackingSources">
type ProviderRunId = GenericId<"providerRuns">
type ProviderMetricBucketId = GenericId<"providerMetricBuckets">
type GenericRow = Record<string, unknown> & { _id: GenericId<string> }

export function trackingProviderRunIdempotencyKey(
  trackingSourceId: TrackingSourceId,
  leaseVersion: number,
): string {
  return `tracking:${String(trackingSourceId)}:${leaseVersion}`
}

export async function findTrackingProviderRun(
  ctx: MutationCtx,
  idempotencyKey: string,
): Promise<GenericRow | null> {
  return (await ctx.db
    .query("providerRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()) as GenericRow | null
}

function trackingProviderFromRun(run: GenericRow): TrackingSourceType {
  const provider = run.provider
  if (
    provider !== "x" &&
    provider !== "reddit_posts" &&
    provider !== "reddit_comments" &&
    provider !== "hacker_news"
  ) {
    throw new TypeError("Tracking provider run has an invalid provider")
  }
  return provider
}

async function updateTrackingProviderMetric(
  ctx: MutationCtx,
  input: {
    durationMs: number
    errorCode?: string | undefined
    inputCount: number
    operation: string
    outputCount: number
    provider: TrackingSourceType
    retry: boolean
    status: "failed" | "succeeded"
  },
  now: number,
): Promise<void> {
  const bucketStartAt = Math.floor(now / HOUR_MS) * HOUR_MS
  const bucketEndAt = bucketStartAt + HOUR_MS
  const bucket = (await ctx.db
    .query("providerMetricBuckets")
    .withIndex("by_provider_operation_granularity_and_bucket", (q) =>
      indexEquals(
        q,
        ["provider", input.provider],
        ["operation", input.operation],
        ["granularity", "hour"],
        ["bucketStartAt", bucketStartAt],
      ),
    )
    .unique()) as GenericRow | null
  const durationMs = Math.max(0, Math.round(input.durationMs))
  const successIncrement = input.status === "succeeded" ? 1 : 0
  const failureIncrement = input.status === "failed" ? 1 : 0
  const rateLimitIncrement = input.errorCode === "rate_limit" ? 1 : 0
  const retryIncrement = input.retry ? 1 : 0

  if (bucket) {
    await ctx.db.patch(
      "providerMetricBuckets",
      bucket._id as ProviderMetricBucketId,
      {
        failureCount: (bucket.failureCount as number) + failureIncrement,
        inputItemCount: (bucket.inputItemCount as number) + input.inputCount,
        latencyMaxMs: Math.max(bucket.latencyMaxMs as number, durationMs),
        latencyTotalMs: (bucket.latencyTotalMs as number) + durationMs,
        outputItemCount: (bucket.outputItemCount as number) + input.outputCount,
        rateLimitedCount:
          (bucket.rateLimitedCount as number) + rateLimitIncrement,
        requestCount: (bucket.requestCount as number) + 1,
        retryCount: (bucket.retryCount as number) + retryIncrement,
        successCount: (bucket.successCount as number) + successIncrement,
        updatedAt: now,
      },
    )
    return
  }

  await ctx.db.insert("providerMetricBuckets", {
    bucketEndAt,
    bucketStartAt,
    failureCount: failureIncrement,
    granularity: "hour",
    inputItemCount: input.inputCount,
    latencyMaxMs: durationMs,
    latencyTotalMs: durationMs,
    operation: input.operation,
    outputItemCount: input.outputCount,
    provider: input.provider,
    rateLimitedCount: rateLimitIncrement,
    requestCount: 1,
    retryCount: retryIncrement,
    successCount: successIncrement,
    updatedAt: now,
  })
}

export async function finishTrackingProviderRun(
  ctx: MutationCtx,
  input: {
    durationMs: number
    errorCode?: string | undefined
    errorMessage?: string | undefined
    outputCount: number
    run: GenericRow
    status: "failed" | "succeeded"
  },
  now: number,
): Promise<void> {
  const durationMs = Math.max(0, Math.round(input.durationMs))
  await ctx.db.patch("providerRuns", input.run._id as ProviderRunId, {
    durationMs,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    finishedAt: now,
    outputCount: input.outputCount,
    status: input.status,
    updatedAt: now,
  })
  await updateTrackingProviderMetric(
    ctx,
    {
      durationMs,
      errorCode: input.errorCode,
      inputCount: input.run.inputCount as number,
      operation: input.run.operation as string,
      outputCount: input.outputCount,
      provider: trackingProviderFromRun(input.run),
      retry: input.run.trigger === "retry",
      status: input.status,
    },
    now,
  )
}

export async function finalizeInvalidatedTrackingProviderRun(
  ctx: MutationCtx,
  input: {
    errorCode: "source_changed" | "source_deleted" | "source_paused"
    errorMessage: string
    now: number
    source: GenericRow
  },
): Promise<void> {
  if (input.source.leaseToken === undefined) {
    return
  }
  const leaseVersion = input.source.leaseVersion
  if (!Number.isSafeInteger(leaseVersion) || (leaseVersion as number) < 0) {
    throw new TypeError("Tracking source has an invalid lease version")
  }
  const run = await findTrackingProviderRun(
    ctx,
    trackingProviderRunIdempotencyKey(
      input.source._id as TrackingSourceId,
      leaseVersion as number,
    ),
  )
  if (
    !run ||
    run.status !== "running" ||
    run.trackingSourceId !== input.source._id
  ) {
    return
  }
  await finishTrackingProviderRun(
    ctx,
    {
      durationMs: Math.max(0, input.now - (run.startedAt as number)),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      outputCount: 0,
      run,
      status: "failed",
    },
    input.now,
  )
}
