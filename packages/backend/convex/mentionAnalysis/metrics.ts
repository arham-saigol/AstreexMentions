import type { Id } from "../_generated/dataModel"

import { adjustSystemMetricGauge } from "../lib/systemMetricBuckets"
import type { MutationCtx } from "../_generated/server"

export const MENTION_ANALYSIS_STATUS_METRIC_PREFIX =
  "mention_analysis_jobs_status:"
export const MENTION_ANALYSIS_JOB_STATUSES = [
  "pending",
  "leased",
  "completed",
  "dead",
] as const

export type MentionAnalysisJobStatus =
  (typeof MENTION_ANALYSIS_JOB_STATUSES)[number]

type WorkspaceId = Id<"workspaces">

export function mentionAnalysisStatusMetric(
  status: MentionAnalysisJobStatus,
): string {
  return `${MENTION_ANALYSIS_STATUS_METRIC_PREFIX}${status}`
}

export async function transitionMentionAnalysisStatusMetric(
  ctx: MutationCtx,
  input: {
    from?: MentionAnalysisJobStatus | undefined
    to?: MentionAnalysisJobStatus | undefined
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
      metric: mentionAnalysisStatusMetric(input.from),
      updatedAt: input.updatedAt,
      workspaceId: input.workspaceId,
    })
  }
  if (input.to) {
    await adjustSystemMetricGauge(ctx, {
      delta: 1,
      metric: mentionAnalysisStatusMetric(input.to),
      updatedAt: input.updatedAt,
      workspaceId: input.workspaceId,
    })
  }
}
