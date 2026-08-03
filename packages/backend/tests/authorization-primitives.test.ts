import type { UserIdentity } from "convex/server"
import { ConvexError } from "convex/values"
import { describe, expect, it, vi } from "vitest"

import { assertAdminClerkUserId } from "../convex/lib/adminAuthorization"
import {
  confirmFullyInactiveEntitlement,
  evaluateDeletionBillingGuard,
} from "../convex/lib/billingDeletionGuard"
import {
  bootstrapPersonalWorkspace,
  type PersonalWorkspaceBootstrapStore,
} from "../convex/lib/bootstrapPersonalWorkspace"
import {
  authorizeCurrentCustomerTenant,
  authorizeCustomerTenant,
  type CustomerTenantStore,
} from "../convex/lib/customerTenantAuthorization"
import {
  assertAccountDeletionAllowed,
  assertWorkspaceDeletionAllowed,
} from "../convex/lib/workspaceDeletion"

const identity = {
  issuer: "https://clerk.example.test",
  subject: "user_clerk_1",
  tokenIdentifier: "https://clerk.example.test|user_clerk_1",
} as UserIdentity

function expectConvexErrorCode(operation: () => void, code: string): void {
  try {
    operation()
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError)
    expect((error as ConvexError<{ code: string }>).data.code).toBe(code)
    return
  }

  throw new Error(`Expected ConvexError with code ${code}`)
}

describe("admin authorization", () => {
  it.each([undefined, "", "   "])(
    "denies a missing ADMIN_CLERK_USER_ID value",
    (configuredAdminClerkUserId) => {
      expectConvexErrorCode(
        () =>
          assertAdminClerkUserId(identity.subject, configuredAdminClerkUserId),
        "ADMIN_NOT_CONFIGURED",
      )
    },
  )

  it("requires an exact Clerk subject match", () => {
    expect(() =>
      assertAdminClerkUserId(identity.subject, identity.subject),
    ).not.toThrow()
    expectConvexErrorCode(
      () => assertAdminClerkUserId(`${identity.subject} `, identity.subject),
      "FORBIDDEN",
    )
    expectConvexErrorCode(
      () => assertAdminClerkUserId(identity.subject, ` ${identity.subject} `),
      "FORBIDDEN",
    )
  })
})

describe("personal workspace bootstrap", () => {
  it("atomically creates a user, personal workspace, and owner membership", async () => {
    const store = {
      findMembership: vi.fn().mockResolvedValue(null),
      findPersonalWorkspaceByOwner: vi.fn().mockResolvedValue(null),
      findUserByClerkUserId: vi.fn().mockResolvedValue(null),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(null),
      getWorkspace: vi.fn().mockResolvedValue(null),
      insertMembership: vi.fn().mockResolvedValue("membership_1"),
      insertUser: vi.fn().mockResolvedValue("user_1"),
      insertWorkspace: vi.fn().mockResolvedValue("workspace_1"),
      patchMembership: vi.fn().mockResolvedValue(undefined),
      patchUser: vi.fn().mockResolvedValue(undefined),
    } satisfies PersonalWorkspaceBootstrapStore<string, string, string>

    await expect(
      bootstrapPersonalWorkspace(store, identity, 100),
    ).resolves.toEqual({
      created: true,
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(store.insertWorkspace).toHaveBeenCalledWith({
      createdAt: 100,
      kind: "personal",
      name: "Personal workspace",
      ownerUserId: "user_1",
      updatedAt: 100,
    })
    expect(store.insertMembership).toHaveBeenCalledWith({
      createdAt: 100,
      role: "owner",
      updatedAt: 100,
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(store.patchUser).toHaveBeenCalledWith("user_1", {
      personalWorkspaceId: "workspace_1",
      updatedAt: 100,
    })
  })

  it("reuses an existing valid personal workspace", async () => {
    const existingUser = {
      clerkUserId: identity.subject,
      id: "user_1",
      personalWorkspaceId: "workspace_1",
      tokenIdentifier: identity.tokenIdentifier,
    }
    const store = {
      findMembership: vi.fn().mockResolvedValue({
        id: "membership_1",
        role: "owner",
        userId: "user_1",
        workspaceId: "workspace_1",
      }),
      findPersonalWorkspaceByOwner: vi.fn().mockResolvedValue(null),
      findUserByClerkUserId: vi.fn().mockResolvedValue(existingUser),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(existingUser),
      getWorkspace: vi.fn().mockResolvedValue({
        id: "workspace_1",
        kind: "personal",
        ownerUserId: "user_1",
      }),
      insertMembership: vi.fn().mockResolvedValue("membership_1"),
      insertUser: vi.fn().mockResolvedValue("user_1"),
      insertWorkspace: vi.fn().mockResolvedValue("workspace_1"),
      patchMembership: vi.fn().mockResolvedValue(undefined),
      patchUser: vi.fn().mockResolvedValue(undefined),
    } satisfies PersonalWorkspaceBootstrapStore<string, string, string>

    await expect(
      bootstrapPersonalWorkspace(store, identity, 200),
    ).resolves.toEqual({
      created: false,
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(store.insertUser).not.toHaveBeenCalled()
    expect(store.insertWorkspace).not.toHaveBeenCalled()
    expect(store.insertMembership).not.toHaveBeenCalled()
    expect(store.patchUser).not.toHaveBeenCalled()
  })

  it("preserves a workspace-owned name during recurring bootstrap", async () => {
    const existingUser = {
      clerkUserId: identity.subject,
      id: "user_1",
      personalWorkspaceId: "workspace_1",
      tokenIdentifier: identity.tokenIdentifier,
    }
    const store = {
      findMembership: vi.fn().mockResolvedValue({
        id: "membership_1",
        role: "owner",
        userId: "user_1",
        workspaceId: "workspace_1",
      }),
      findPersonalWorkspaceByOwner: vi.fn().mockResolvedValue(null),
      findUserByClerkUserId: vi.fn().mockResolvedValue(existingUser),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(existingUser),
      getWorkspace: vi.fn().mockResolvedValue({
        id: "workspace_1",
        kind: "personal",
        ownerUserId: "user_1",
      }),
      insertMembership: vi.fn().mockResolvedValue("membership_1"),
      insertUser: vi.fn().mockResolvedValue("user_1"),
      insertWorkspace: vi.fn().mockResolvedValue("workspace_1"),
      patchMembership: vi.fn().mockResolvedValue(undefined),
      patchUser: vi.fn().mockResolvedValue(undefined),
    } satisfies PersonalWorkspaceBootstrapStore<string, string, string>

    await bootstrapPersonalWorkspace(
      store,
      { ...identity, name: "Clerk profile name" },
      300,
    )

    expect(store.patchUser).not.toHaveBeenCalled()
  })

  it("patches only when a recurring identity field changes", async () => {
    const existingUser = {
      clerkUserId: identity.subject,
      email: "old@example.com",
      id: "user_1",
      personalWorkspaceId: "workspace_1",
      tokenIdentifier: identity.tokenIdentifier,
    }
    const store = {
      findMembership: vi.fn().mockResolvedValue({
        id: "membership_1",
        role: "owner",
        userId: "user_1",
        workspaceId: "workspace_1",
      }),
      findPersonalWorkspaceByOwner: vi.fn().mockResolvedValue(null),
      findUserByClerkUserId: vi.fn().mockResolvedValue(existingUser),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(existingUser),
      getWorkspace: vi.fn().mockResolvedValue({
        id: "workspace_1",
        kind: "personal",
        ownerUserId: "user_1",
      }),
      insertMembership: vi.fn().mockResolvedValue("membership_1"),
      insertUser: vi.fn().mockResolvedValue("user_1"),
      insertWorkspace: vi.fn().mockResolvedValue("workspace_1"),
      patchMembership: vi.fn().mockResolvedValue(undefined),
      patchUser: vi.fn().mockResolvedValue(undefined),
    } satisfies PersonalWorkspaceBootstrapStore<string, string, string>

    await bootstrapPersonalWorkspace(
      store,
      { ...identity, email: "new@example.com" },
      400,
    )

    expect(store.patchUser).toHaveBeenCalledWith("user_1", {
      clerkUserId: identity.subject,
      email: "new@example.com",
      imageUrl: undefined,
      personalWorkspaceId: "workspace_1",
      tokenIdentifier: identity.tokenIdentifier,
      updatedAt: 400,
    })
  })
})

describe("customer tenant authorization", () => {
  const user = {
    clerkUserId: identity.subject,
    id: "user_1",
    personalWorkspaceId: "workspace_1",
    tokenIdentifier: identity.tokenIdentifier,
  }
  const workspace = {
    id: "workspace_1",
    kind: "personal",
    ownerUserId: "user_1",
  }
  const membership = {
    role: "owner",
    userId: "user_1",
    workspaceId: "workspace_1",
  }

  it("returns context only after membership and personal-owner checks", async () => {
    const store = {
      findMembership: vi.fn().mockResolvedValue(membership),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(user),
      getWorkspace: vi.fn().mockResolvedValue(workspace),
    } satisfies CustomerTenantStore<string, string>

    await expect(
      authorizeCustomerTenant(store, identity, "workspace_1"),
    ).resolves.toEqual({ membership, viewer: user, workspace })
  })

  it("derives the personal workspace instead of accepting a client tenant", async () => {
    const store = {
      findMembership: vi.fn().mockResolvedValue(membership),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(user),
      getWorkspace: vi.fn().mockResolvedValue(workspace),
    } satisfies CustomerTenantStore<string, string>

    await expect(
      authorizeCurrentCustomerTenant(store, identity),
    ).resolves.toEqual({ membership, viewer: user, workspace })
    expect(store.getWorkspace).toHaveBeenCalledWith("workspace_1")
  })

  it("denies a cross-tenant request without an active membership", async () => {
    const store = {
      findMembership: vi.fn().mockResolvedValue(null),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(user),
      getWorkspace: vi.fn().mockResolvedValue({
        id: "workspace_2",
        kind: "personal",
        ownerUserId: "user_2",
      }),
    } satisfies CustomerTenantStore<string, string>

    await expect(
      authorizeCustomerTenant(store, identity, "workspace_2"),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } })
  })

  it("denies every non-owner membership in the single-user model", async () => {
    const store = {
      findMembership: vi.fn().mockResolvedValue({
        ...membership,
        role: "member",
      }),
      findUserByTokenIdentifier: vi.fn().mockResolvedValue(user),
      getWorkspace: vi.fn().mockResolvedValue(workspace),
    } satisfies CustomerTenantStore<string, string>

    await expect(
      authorizeCustomerTenant(store, identity, "workspace_1"),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } })
  })
})

describe("workspace deletion guard", () => {
  const workspace = { _id: "workspace_1", kind: "personal" }
  const membership = {
    role: "owner",
    workspaceId: "workspace_1",
  }

  it("allows a personal workspace only after billing confirms inactivity", () => {
    const billingConfirmation = confirmFullyInactiveEntitlement([], 100)

    expect(() =>
      assertWorkspaceDeletionAllowed(
        workspace,
        membership,
        billingConfirmation,
      ),
    ).not.toThrow()
    expect(billingConfirmation).toEqual({
      checkedAt: 100,
      status: "confirmed_inactive",
      subscriptionCount: 0,
    })
  })

  it("fails closed without a separate billing confirmation", () => {
    expectConvexErrorCode(
      () => assertWorkspaceDeletionAllowed(workspace, membership, undefined),
      "BILLING_GUARD_REQUIRED",
    )
    expectConvexErrorCode(
      () => confirmFullyInactiveEntitlement([{ entitlementStatus: "active" }]),
      "BILLING_ENTITLEMENT_ACTIVE",
    )
  })

  it("keeps active and scheduled-cancel subscriptions portal-blocked", () => {
    expect(
      evaluateDeletionBillingGuard(
        [
          {
            cancelAtPeriodEnd: true,
            entitlementStatus: "active",
            status: "active",
          },
        ],
        100,
      ),
    ).toEqual({
      checkedAt: 100,
      status: "blocked_active",
      subscriptionCount: 1,
    })
  })
})

describe("account deletion guard", () => {
  const account = {
    _id: "user_1",
    personalWorkspaceId: "workspace_1",
  }
  const workspace = {
    _id: "workspace_1",
    kind: "personal",
    ownerUserId: "user_1",
  }
  const membership = {
    role: "owner",
    userId: "user_1",
    workspaceId: "workspace_1",
  }

  it("allows the account owner after a fully inactive entitlement check", () => {
    expect(() =>
      assertAccountDeletionAllowed(
        account,
        workspace,
        membership,
        confirmFullyInactiveEntitlement(
          [
            {
              cancelAtPeriodEnd: false,
              entitlementStatus: "inactive",
              status: "canceled",
            },
          ],
          100,
        ),
      ),
    ).not.toThrow()
  })

  it("fails closed for active entitlement or a mismatched account target", () => {
    expectConvexErrorCode(
      () => confirmFullyInactiveEntitlement([{ entitlementStatus: "active" }]),
      "BILLING_ENTITLEMENT_ACTIVE",
    )
    expectConvexErrorCode(
      () =>
        assertAccountDeletionAllowed(
          { ...account, _id: "user_2" },
          workspace,
          membership,
          confirmFullyInactiveEntitlement([]),
        ),
      "FORBIDDEN",
    )
  })
})
