import type { GenericId } from "convex/values"

import { adjustSystemMetricGauge } from "../lib/systemMetricBuckets"
import type { MutationCtx } from "../server"

export const CATEGORIZATION_STATUS_METRIC_PREFIX = "categorization_jobs_status:"
export const CATEGORIZATION_JOB_STATUSES = [
  "pending",
  "leased",
  "completed",
  "dead",
] as const

export type CategorizationJobStatus =
  (typeof CATEGORIZATION_JOB_STATUSES)[number]

type WorkspaceId = GenericId<"workspaces">

export function categorizationStatusMetric(
  status: CategorizationJobStatus,
): string {
  return `${CATEGORIZATION_STATUS_METRIC_PREFIX}${status}`
}

export async function transitionCategorizationStatusMetric(
  ctx: MutationCtx,
  input: {
    from?: CategorizationJobStatus | undefined
    to?: CategorizationJobStatus | undefined
    updatedAt: number
    workspaceId: WorkspaceId
  },
): Promise<void> {
  if (input.from === input.to) {
    return
  }
  if (input.from) {
    await adjustSystemMetricGauge(ctx, {
      delta: -1,
      metric: categorizationStatusMetric(input.from),
      updatedAt: input.updatedAt,
      workspaceId: input.workspaceId,
    })
  }
  if (input.to) {
    await adjustSystemMetricGauge(ctx, {
      delta: 1,
      metric: categorizationStatusMetric(input.to),
      updatedAt: input.updatedAt,
      workspaceId: input.workspaceId,
    })
  }
}
