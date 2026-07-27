import type { UserIdentity } from "convex/server"
import { ConvexError } from "convex/values"

export type CustomerUser<UserId extends string, WorkspaceId extends string> = {
  clerkUserId: string
  deletedAt?: number | undefined
  disabledAt?: number | undefined
  id: UserId
  personalWorkspaceId?: WorkspaceId | undefined
  tokenIdentifier: string
}

export type CustomerWorkspace<
  UserId extends string,
  WorkspaceId extends string,
> = {
  deletedAt?: number | undefined
  deletionPendingAt?: number | undefined
  id: WorkspaceId
  kind: string
  ownerUserId: UserId
}

export type CustomerMembership<
  UserId extends string,
  WorkspaceId extends string,
> = {
  revokedAt?: number | undefined
  role: string
  userId: UserId
  workspaceId: WorkspaceId
}

export interface CustomerTenantStore<
  UserId extends string,
  WorkspaceId extends string,
  User extends CustomerUser<UserId, WorkspaceId> = CustomerUser<
    UserId,
    WorkspaceId
  >,
  Workspace extends CustomerWorkspace<UserId, WorkspaceId> = CustomerWorkspace<
    UserId,
    WorkspaceId
  >,
  Membership extends CustomerMembership<UserId, WorkspaceId> =
    CustomerMembership<UserId, WorkspaceId>,
> {
  findMembership(
    workspaceId: WorkspaceId,
    userId: UserId,
  ): Promise<Membership | null>
  findUserByTokenIdentifier(tokenIdentifier: string): Promise<User | null>
  getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null>
}

function deny(
  code: "BOOTSTRAP_REQUIRED" | "FORBIDDEN" | "TENANT_NOT_FOUND",
  message: string,
): never {
  throw new ConvexError({ code, message })
}

/**
 * Resolves and authorizes one customer tenant boundary.
 *
 * The Convex adapter implements these reads with the by_token_identifier and
 * by_workspace_and_user indexes. Public actions call an internal query using
 * the same policy; actions never trust a client-supplied workspaceId alone.
 */
export async function authorizeCustomerTenant<
  UserId extends string,
  WorkspaceId extends string,
  User extends CustomerUser<UserId, WorkspaceId>,
  Workspace extends CustomerWorkspace<UserId, WorkspaceId>,
  Membership extends CustomerMembership<UserId, WorkspaceId>,
>(
  store: CustomerTenantStore<UserId, WorkspaceId, User, Workspace, Membership>,
  identity: Pick<UserIdentity, "subject" | "tokenIdentifier">,
  workspaceId: WorkspaceId,
): Promise<{
  membership: Membership
  viewer: User
  workspace: Workspace
}> {
  const viewer = await store.findUserByTokenIdentifier(identity.tokenIdentifier)

  if (!viewer) {
    deny("BOOTSTRAP_REQUIRED", "Complete account setup before using Astreex")
  }

  if (
    viewer.clerkUserId !== identity.subject ||
    viewer.disabledAt !== undefined ||
    viewer.deletedAt !== undefined
  ) {
    deny("FORBIDDEN", "This account cannot access Astreex")
  }

  const workspace = await store.getWorkspace(workspaceId)

  if (
    !workspace ||
    workspace.deletedAt !== undefined ||
    workspace.deletionPendingAt !== undefined
  ) {
    deny("TENANT_NOT_FOUND", "Workspace not found")
  }

  const membership = await store.findMembership(workspaceId, viewer.id)

  if (!membership || membership.revokedAt !== undefined) {
    deny("FORBIDDEN", "Workspace access is required")
  }

  if (
    membership.userId !== viewer.id ||
    membership.workspaceId !== workspace.id
  ) {
    deny("FORBIDDEN", "Workspace membership is invalid")
  }

  if (
    workspace.kind !== "personal" ||
    workspace.ownerUserId !== viewer.id ||
    viewer.personalWorkspaceId !== workspace.id ||
    membership.role !== "owner"
  ) {
    deny("FORBIDDEN", "Personal workspace owner access is required")
  }

  return { membership, viewer, workspace }
}

/**
 * Resolves the authenticated user's personal workspace from persisted identity
 * state. Customer-facing functions never accept a client-selected tenant id.
 */
export async function authorizeCurrentCustomerTenant<
  UserId extends string,
  WorkspaceId extends string,
  User extends CustomerUser<UserId, WorkspaceId>,
  Workspace extends CustomerWorkspace<UserId, WorkspaceId>,
  Membership extends CustomerMembership<UserId, WorkspaceId>,
>(
  store: CustomerTenantStore<UserId, WorkspaceId, User, Workspace, Membership>,
  identity: Pick<UserIdentity, "subject" | "tokenIdentifier">,
): Promise<{
  membership: Membership
  viewer: User & { personalWorkspaceId: WorkspaceId }
  workspace: Workspace
}> {
  const viewer = await store.findUserByTokenIdentifier(identity.tokenIdentifier)

  if (!viewer || viewer.personalWorkspaceId === undefined) {
    deny("BOOTSTRAP_REQUIRED", "Complete account setup before using Astreex")
  }

  const authorization = await authorizeCustomerTenant(
    store,
    identity,
    viewer.personalWorkspaceId,
  )

  return {
    ...authorization,
    viewer: authorization.viewer as User & {
      personalWorkspaceId: WorkspaceId
    },
  }
}
