import type { Doc, Id } from "../_generated/dataModel"

import { recordProviderMetricBuckets } from "../lib/providerMetricBuckets"
import { type MutationCtx } from "../_generated/server"
import type { TrackingSourceType } from "./model"

type TrackingSourceId = Id<"trackingSources">
type ProviderRunId = Id<"providerRuns">

export function trackingProviderRunIdempotencyKey(
  trackingSourceId: TrackingSourceId,
  leaseVersion: number,
): string {
  return `tracking:${String(trackingSourceId)}:${leaseVersion}`
}

export async function findTrackingProviderRun(
  ctx: MutationCtx,
  idempotencyKey: string,
): Promise<Doc<"providerRuns"> | null> {
  return await ctx.db
    .query("providerRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()
}

function trackingProviderFromRun(run: Doc<"providerRuns">): TrackingSourceType {
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
  const successIncrement = input.status === "succeeded" ? 1 : 0
  const failureIncrement = input.status === "failed" ? 1 : 0
  const rateLimitIncrement = input.errorCode === "rate_limit" ? 1 : 0
  const retryIncrement = input.retry ? 1 : 0
  await recordProviderMetricBuckets(
    ctx,
    {
      durationMs: input.durationMs,
      failureCount: failureIncrement,
      inputItemCount: input.inputCount,
      operation: input.operation,
      outputItemCount: input.outputCount,
      provider: input.provider,
      rateLimitedCount: rateLimitIncrement,
      retryCount: retryIncrement,
      successCount: successIncrement,
    },
    now,
  )
}

export async function finishTrackingProviderRun(
  ctx: MutationCtx,
  input: {
    durationMs: number
    errorCode?: string | undefined
    errorMessage?: string | undefined
    outputCount: number
    run: Doc<"providerRuns">
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
    source: Doc<"trackingSources">
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
