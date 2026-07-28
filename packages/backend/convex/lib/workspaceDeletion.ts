import { ConvexError } from "convex/values"

import {
  assertInactiveBillingGuardConfirmation,
  type InactiveBillingGuardConfirmation,
} from "./billingDeletionGuard"

type WorkspaceForDeletion = {
  _id: string
  kind: string
}

type MembershipForDeletion = {
  revokedAt?: number | undefined
  role: string
  workspaceId: string
}

/**
 * Only the active owner of the account's personal workspace may delete it. The
 * caller must obtain billingConfirmation from the separate billing guard first.
 */
export function assertWorkspaceDeletionAllowed(
  workspace: WorkspaceForDeletion,
  membership: MembershipForDeletion,
  billingConfirmation: InactiveBillingGuardConfirmation | undefined,
): void {
  if (
    workspace.kind !== "personal" ||
    membership.workspaceId !== workspace._id ||
    membership.role !== "owner" ||
    membership.revokedAt !== undefined
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only an active personal workspace owner can delete it",
    })
  }

  assertInactiveBillingGuardConfirmation(billingConfirmation)
}

export function assertAccountDeletionAllowed(
  account: {
    _id: string
    deletedAt?: number | undefined
    personalWorkspaceId?: string | undefined
  },
  workspace: WorkspaceForDeletion & { ownerUserId: string },
  membership: MembershipForDeletion & { userId: string },
  billingConfirmation: InactiveBillingGuardConfirmation | undefined,
): void {
  if (
    account.deletedAt !== undefined ||
    account.personalWorkspaceId !== workspace._id ||
    workspace.ownerUserId !== account._id ||
    membership.userId !== account._id
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only the active account owner can delete this account",
    })
  }

  assertWorkspaceDeletionAllowed(workspace, membership, billingConfirmation)
}
