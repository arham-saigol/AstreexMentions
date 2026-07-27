import { makeFunctionReference } from "convex/server"

export type MetricsRangeDays = 7 | 30 | 90

export type FeatureRequestStatus =
  "new" | "planned" | "in_progress" | "completed" | "declined"

export type ChangelogStatus = "draft" | "published"
export type DeletionJobStatus =
  | "pending"
  | "billing_check"
  | "blocked"
  | "leased"
  | "running"
  | "completed"
  | "failed"
  | "dead"
  | "canceled"

export const adminConvex = {
  getMetricsOverview: makeFunctionReference<
    "query",
    { days: MetricsRangeDays },
    unknown
  >("admin:getMetricsOverview"),
  listFeatureRequests: makeFunctionReference<
    "query",
    {
      cursor?: string
      limit?: number
      sort?: "newest" | "oldest"
      status?: FeatureRequestStatus
    },
    unknown
  >("admin:listFeatureRequests"),
  updateFeatureRequest: makeFunctionReference<
    "mutation",
    {
      adminNote?: string
      requestId: string
      status: FeatureRequestStatus
    },
    unknown
  >("admin:updateFeatureRequest"),
  listChangelogEntries: makeFunctionReference<
    "query",
    { cursor?: string; status?: ChangelogStatus },
    unknown
  >("admin:listChangelogEntries"),
  createChangelogEntry: makeFunctionReference<
    "mutation",
    {
      body: string
      label?: string
      publishedAt: number
      slug: string
      summary: string
      title: string
    },
    unknown
  >("admin:createChangelogEntry"),
  updateChangelogEntry: makeFunctionReference<
    "mutation",
    {
      body: string
      entryId: string
      label: string
      publishedAt: number
      slug: string
      summary: string
      title: string
    },
    unknown
  >("admin:updateChangelogEntry"),
  publishChangelogEntry: makeFunctionReference<
    "mutation",
    { entryId: string },
    unknown
  >("admin:publishChangelogEntry"),
  unpublishChangelogEntry: makeFunctionReference<
    "mutation",
    { entryId: string },
    unknown
  >("admin:unpublishChangelogEntry"),
  deleteChangelogEntry: makeFunctionReference<
    "mutation",
    { entryId: string },
    unknown
  >("admin:deleteChangelogEntry"),
  listDeletionJobs: makeFunctionReference<
    "query",
    { limit?: number; status?: DeletionJobStatus },
    unknown
  >("admin:listDeletionJobs"),
  getDeletionJob: makeFunctionReference<
    "query",
    { deletionJobId: string },
    unknown
  >("admin:getDeletionJob"),
  retryDeletionJob: makeFunctionReference<
    "mutation",
    { confirmation: string; deletionJobId: string },
    unknown
  >("admin:retryDeletionJob"),
  cancelDeletionJob: makeFunctionReference<
    "mutation",
    { confirmation: string; deletionJobId: string },
    unknown
  >("admin:cancelDeletionJob"),
} as const
