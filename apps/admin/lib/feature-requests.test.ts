import { describe, expect, it } from "vitest"

import { parseFeatureRequestPage, type FeatureRequest } from "./admin-data"
import {
  featureRequestStatusLabels,
  filterAndSortFeatureRequests,
} from "./feature-requests"

function request(
  id: string,
  createdAt: number,
  overrides: Partial<FeatureRequest> = {},
): FeatureRequest {
  return {
    id,
    adminNote: undefined,
    body: "Request body",
    createdAt,
    status: "new",
    title: `Request ${id}`,
    updatedAt: createdAt,
    user: {
      id: `user-${id}`,
      name: `User ${id}`,
      email: `${id}@example.com`,
    },
    workspace: {
      id: `workspace-${id}`,
      name: `Workspace ${id}`,
      slug: `workspace-${id}`,
    },
    submission: {
      source: "dashboard",
    },
    ...overrides,
  }
}

describe("feature request queue", () => {
  it("normalizes user, workspace, and submission metadata", () => {
    const parsed = parseFeatureRequestPage({
      items: [
        {
          id: "request-1",
          title: "Export reports",
          body: "Add a CSV export.",
          status: "planned",
          createdAt: 10,
          updatedAt: 20,
          submitterUserId: "user-1",
          submitterName: "Alex Rivera",
          submitterEmail: "alex@example.com",
          workspaceId: "workspace-1",
          workspaceName: "Acme",
          workspaceSlug: "acme",
          submissionSource: "dashboard",
        },
      ],
      nextCursor: "next-page",
    })

    expect(parsed?.items[0]).toMatchObject({
      user: {
        id: "user-1",
        name: "Alex Rivera",
        email: "alex@example.com",
      },
      workspace: {
        id: "workspace-1",
        name: "Acme",
        slug: "acme",
      },
      submission: { source: "dashboard" },
    })
    expect(parsed?.nextCursor).toBe("next-page")
  })

  it("uses the exact administrative status labels", () => {
    expect(Object.values(featureRequestStatusLabels)).toEqual([
      "New",
      "Planned",
      "In Progress",
      "Completed",
      "Declined",
    ])
  })

  it("searches request, user, workspace, and submission metadata", () => {
    const requests = [request("first", 1), request("second", 2)]

    expect(
      filterAndSortFeatureRequests(requests, "SECOND@EXAMPLE.COM", "newest"),
    ).toHaveLength(1)
    expect(
      filterAndSortFeatureRequests(requests, "workspace-first", "newest")[0]
        ?.id,
    ).toBe("first")
    expect(
      filterAndSortFeatureRequests(requests, "dashboard", "newest"),
    ).toHaveLength(2)
  })

  it("sorts deterministically by submission time", () => {
    const requests = [
      request("middle", 20),
      request("old", 10),
      request("new", 30),
    ]

    expect(
      filterAndSortFeatureRequests(requests, "", "newest").map(
        (item) => item.id,
      ),
    ).toEqual(["new", "middle", "old"])
    expect(
      filterAndSortFeatureRequests(requests, "", "oldest").map(
        (item) => item.id,
      ),
    ).toEqual(["old", "middle", "new"])
  })
})
