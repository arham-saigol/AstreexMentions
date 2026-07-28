import type { FeatureRequest } from "@/lib/admin-data"
import type { FeatureRequestStatus } from "@/lib/convex-references"

export type FeatureRequestSort = "newest" | "oldest"

export const featureRequestStatusLabels: Record<FeatureRequestStatus, string> =
  {
    new: "New",
    planned: "Planned",
    in_progress: "In Progress",
    completed: "Completed",
    declined: "Declined",
  }

export function filterAndSortFeatureRequests(
  requests: readonly FeatureRequest[],
  query: string,
  sort: FeatureRequestSort,
): FeatureRequest[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = normalizedQuery
    ? requests.filter((request) =>
        [
          request.id,
          request.title,
          request.body,
          request.adminNote,
          featureRequestStatusLabels[request.status],
          request.user.id,
          request.user.name,
          request.user.email,
          request.workspace.id,
          request.workspace.name,
          request.workspace.slug,
          request.submission.source,
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : [...requests]

  return filtered.sort((left, right) => {
    const timestampDifference = left.createdAt - right.createdAt
    const orderedDifference =
      sort === "oldest" ? timestampDifference : -timestampDifference

    return orderedDifference || left.id.localeCompare(right.id)
  })
}
