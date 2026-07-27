import { describe, expect, it } from "vitest"

import { assertAdminClerkUserId } from "../../../packages/backend/convex/lib/adminAuthorization"
import { assertWorkspaceDeletionAllowed } from "../../../packages/backend/convex/lib/workspaceDeletion"

function expectConvexErrorCode(operation: () => void, code: string): void {
  try {
    operation()
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as { data?: { code?: unknown } }).data?.code).toBe(code)
    return
  }

  throw new Error(`Expected ConvexError with code ${code}`)
}

describe("admin authorization guard", () => {
  it.each([undefined, "", "   "])(
    "denies access when ADMIN_CLERK_USER_ID is %s",
    (configuredAdminClerkUserId) => {
      expectConvexErrorCode(
        () => assertAdminClerkUserId("user_admin", configuredAdminClerkUserId),
        "ADMIN_NOT_CONFIGURED",
      )
    },
  )

  it("requires an exact Clerk user ID match", () => {
    expectConvexErrorCode(
      () => assertAdminClerkUserId("user_admin ", "user_admin"),
      "FORBIDDEN",
    )
    expectConvexErrorCode(
      () => assertAdminClerkUserId("USER_ADMIN", "user_admin"),
      "FORBIDDEN",
    )
    expect(() =>
      assertAdminClerkUserId("user_admin", "user_admin"),
    ).not.toThrow()
  })
})

describe("workspace deletion guard", () => {
  const ownerMembership = {
    role: "owner",
    workspaceId: "workspace_1",
  }
  const inactiveBillingConfirmation = {
    checkedAt: 1,
    status: "confirmed_inactive" as const,
    subscriptionCount: 0,
  }

  it("requires a separate inactive billing confirmation", () => {
    expectConvexErrorCode(
      () =>
        assertWorkspaceDeletionAllowed(
          { _id: "workspace_1", kind: "personal" },
          ownerMembership,
          undefined,
        ),
      "BILLING_GUARD_REQUIRED",
    )
  })

  it("allows the active personal workspace owner after the billing guard", () => {
    expect(() =>
      assertWorkspaceDeletionAllowed(
        { _id: "workspace_1", kind: "personal" },
        ownerMembership,
        inactiveBillingConfirmation,
      ),
    ).not.toThrow()
  })

  it("rejects non-personal workspaces and invalid memberships", () => {
    expectConvexErrorCode(
      () =>
        assertWorkspaceDeletionAllowed(
          { _id: "workspace_1", kind: "team" },
          ownerMembership,
          inactiveBillingConfirmation,
        ),
      "FORBIDDEN",
    )
    expectConvexErrorCode(
      () =>
        assertWorkspaceDeletionAllowed(
          { _id: "workspace_1", kind: "personal" },
          { ...ownerMembership, role: "member" },
          inactiveBillingConfirmation,
        ),
      "FORBIDDEN",
    )
    expectConvexErrorCode(
      () =>
        assertWorkspaceDeletionAllowed(
          { _id: "workspace_1", kind: "personal" },
          { ...ownerMembership, revokedAt: Date.now() },
          inactiveBillingConfirmation,
        ),
      "FORBIDDEN",
    )
    expectConvexErrorCode(
      () =>
        assertWorkspaceDeletionAllowed(
          { _id: "workspace_1", kind: "personal" },
          { ...ownerMembership, workspaceId: "workspace_2" },
          inactiveBillingConfirmation,
        ),
      "FORBIDDEN",
    )
  })
})
