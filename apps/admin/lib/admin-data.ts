import type { api } from "@astreex/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

export type MetricsRangeDays = FunctionArgs<
  typeof api.admin.getMetricsOverview
>["days"]
export type FeatureRequestStatus = NonNullable<
  FunctionArgs<typeof api.admin.listFeatureRequests>["status"]
>
export type FeatureRequestSort = NonNullable<
  FunctionArgs<typeof api.admin.listFeatureRequests>["sort"]
>
export type ChangelogStatus = NonNullable<
  FunctionArgs<typeof api.admin.listChangelogEntries>["status"]
>
export type DeletionJobStatus = NonNullable<
  FunctionArgs<typeof api.admin.listDeletionJobs>["status"]
>

export type MetricsOverview = FunctionReturnType<
  typeof api.admin.getMetricsOverview
>
export type FeatureRequestPage = FunctionReturnType<
  typeof api.admin.listFeatureRequests
>
export type FeatureRequest = FeatureRequestPage["items"][number]
export type ChangelogPage = FunctionReturnType<
  typeof api.admin.listChangelogEntries
>
export type ChangelogEntry = ChangelogPage["items"][number]
export type DeletionJob = FunctionReturnType<
  typeof api.admin.listDeletionJobs
>[number]
export type DeletionJobDetail = FunctionReturnType<
  typeof api.admin.getDeletionJob
>

export const featureRequestStatuses = [
  "new",
  "planned",
  "in_progress",
  "completed",
  "declined",
] as const satisfies readonly FeatureRequestStatus[]

export const featureRequestStatusLabels: Record<FeatureRequestStatus, string> =
  {
    new: "New",
    planned: "Planned",
    in_progress: "In Progress",
    completed: "Completed",
    declined: "Declined",
  }

export const changelogStatuses = [
  "draft",
  "published",
] as const satisfies readonly ChangelogStatus[]

export const deletionJobStatuses = [
  "pending",
  "billing_check",
  "blocked",
  "leased",
  "running",
  "completed",
  "failed",
  "dead",
  "canceled",
] as const satisfies readonly DeletionJobStatus[]
