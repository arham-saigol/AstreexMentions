import type { UserIdentity } from "convex/server"
import { ConvexError } from "convex/values"

type ClerkProfile = {
  email?: string
  imageUrl?: string
  name?: string
}

type ClerkProfilePatch = {
  email?: string | undefined
  imageUrl?: string | undefined
}

export type BootstrapUser<UserId extends string, WorkspaceId extends string> = {
  clerkUserId: string
  deletedAt?: number | undefined
  disabledAt?: number | undefined
  email?: string | undefined
  id: UserId
  imageUrl?: string | undefined
  personalWorkspaceId?: WorkspaceId | undefined
  tokenIdentifier: string
}

export type BootstrapWorkspace<
  UserId extends string,
  WorkspaceId extends string,
> = {
  deletedAt?: number | undefined
  id: WorkspaceId
  kind: string
  ownerUserId: UserId
}

export type BootstrapMembership<
  UserId extends string,
  WorkspaceId extends string,
  MembershipId extends string,
> = {
  id: MembershipId
  revokedAt?: number | undefined
  role: string
  userId: UserId
  workspaceId: WorkspaceId
}

export interface PersonalWorkspaceBootstrapStore<
  UserId extends string,
  WorkspaceId extends string,
  MembershipId extends string,
> {
  findMembership(
    workspaceId: WorkspaceId,
    userId: UserId,
  ): Promise<BootstrapMembership<UserId, WorkspaceId, MembershipId> | null>
  findPersonalWorkspaceByOwner(
    userId: UserId,
  ): Promise<BootstrapWorkspace<UserId, WorkspaceId> | null>
  findUserByClerkUserId(
    clerkUserId: string,
  ): Promise<BootstrapUser<UserId, WorkspaceId> | null>
  findUserByTokenIdentifier(
    tokenIdentifier: string,
  ): Promise<BootstrapUser<UserId, WorkspaceId> | null>
  getWorkspace(
    workspaceId: WorkspaceId,
  ): Promise<BootstrapWorkspace<UserId, WorkspaceId> | null>
  insertMembership(input: {
    createdAt: number
    role: "owner"
    updatedAt: number
    userId: UserId
    workspaceId: WorkspaceId
  }): Promise<MembershipId>
  insertUser(
    input: ClerkProfile & {
      clerkUserId: string
      createdAt: number
      tokenIdentifier: string
      updatedAt: number
    },
  ): Promise<UserId>
  insertWorkspace(input: {
    createdAt: number
    kind: "personal"
    name: string
    ownerUserId: UserId
    updatedAt: number
  }): Promise<WorkspaceId>
  patchMembership(
    membershipId: MembershipId,
    patch: {
      revokedAt: undefined
      role: "owner"
      updatedAt: number
    },
  ): Promise<void>
  patchUser(
    userId: UserId,
    patch: ClerkProfilePatch & {
      clerkUserId?: string
      personalWorkspaceId?: WorkspaceId | undefined
      tokenIdentifier?: string
      updatedAt: number
    },
  ): Promise<void>
}

function profileFromIdentity(identity: UserIdentity): ClerkProfile {
  const profile: ClerkProfile = {}

  if (typeof identity.email === "string") {
    profile.email = identity.email
  }
  if (typeof identity.name === "string") {
    profile.name = identity.name
  }
  if (typeof identity.pictureUrl === "string") {
    profile.imageUrl = identity.pictureUrl
  }

  return profile
}

function recurringProfilePatch(identity: UserIdentity): ClerkProfilePatch {
  return {
    email: typeof identity.email === "string" ? identity.email : undefined,
    imageUrl:
      typeof identity.pictureUrl === "string" ? identity.pictureUrl : undefined,
  }
}

async function ensurePersonalWorkspace<
  UserId extends string,
  WorkspaceId extends string,
  MembershipId extends string,
>(
  store: PersonalWorkspaceBootstrapStore<UserId, WorkspaceId, MembershipId>,
  userId: UserId,
  personalWorkspaceId: WorkspaceId | undefined,
  now: number,
): Promise<WorkspaceId> {
  const workspaceFromUser = personalWorkspaceId
    ? await store.getWorkspace(personalWorkspaceId)
    : null
  const workspace =
    workspaceFromUser ?? (await store.findPersonalWorkspaceByOwner(userId))

  if (workspace) {
    if (
      workspace.kind !== "personal" ||
      workspace.ownerUserId !== userId ||
      workspace.deletedAt !== undefined
    ) {
      throw new ConvexError({
        code: "PERSONAL_WORKSPACE_INVALID",
        message: "The personal workspace is not available",
      })
    }

    const membership = await store.findMembership(workspace.id, userId)

    if (!membership) {
      await store.insertMembership({
        createdAt: now,
        role: "owner",
        updatedAt: now,
        userId,
        workspaceId: workspace.id,
      })
    } else if (
      membership.role !== "owner" ||
      membership.revokedAt !== undefined
    ) {
      await store.patchMembership(membership.id, {
        revokedAt: undefined,
        role: "owner",
        updatedAt: now,
      })
    }

    return workspace.id
  }

  const workspaceId = await store.insertWorkspace({
    createdAt: now,
    kind: "personal",
    name: "Personal workspace",
    ownerUserId: userId,
    updatedAt: now,
  })

  await store.insertMembership({
    createdAt: now,
    role: "owner",
    updatedAt: now,
    userId,
    workspaceId,
  })

  return workspaceId
}

/**
 * Idempotent account bootstrap intended to run inside one Convex mutation.
 * Convex's serializable mutation transaction makes the indexed lookups and
 * inserts race-safe when the adapter uses ctx.db throughout this call.
 */
export async function bootstrapPersonalWorkspace<
  UserId extends string,
  WorkspaceId extends string,
  MembershipId extends string,
>(
  store: PersonalWorkspaceBootstrapStore<UserId, WorkspaceId, MembershipId>,
  identity: UserIdentity,
  now = Date.now(),
): Promise<{
  created: boolean
  userId: UserId
  workspaceId: WorkspaceId
}> {
  const byTokenIdentifier = await store.findUserByTokenIdentifier(
    identity.tokenIdentifier,
  )
  const byClerkUserId = await store.findUserByClerkUserId(identity.subject)

  if (
    byTokenIdentifier &&
    byClerkUserId &&
    byTokenIdentifier.id !== byClerkUserId.id
  ) {
    throw new ConvexError({
      code: "ACCOUNT_IDENTITY_CONFLICT",
      message: "The authenticated identity conflicts with an existing account",
    })
  }

  const existingUser = byTokenIdentifier ?? byClerkUserId
  if (existingUser) {
    if (
      existingUser.disabledAt !== undefined ||
      existingUser.deletedAt !== undefined
    ) {
      throw new ConvexError({
        code: "ACCOUNT_DISABLED",
        message: "This account cannot access Astreex",
      })
    }

    const workspaceId = await ensurePersonalWorkspace(
      store,
      existingUser.id,
      existingUser.personalWorkspaceId,
      now,
    )

    const profilePatch = recurringProfilePatch(identity)
    if (
      existingUser.clerkUserId !== identity.subject ||
      existingUser.email !== profilePatch.email ||
      existingUser.imageUrl !== profilePatch.imageUrl ||
      existingUser.personalWorkspaceId !== workspaceId ||
      existingUser.tokenIdentifier !== identity.tokenIdentifier
    ) {
      await store.patchUser(existingUser.id, {
        ...profilePatch,
        clerkUserId: identity.subject,
        personalWorkspaceId: workspaceId,
        tokenIdentifier: identity.tokenIdentifier,
        updatedAt: now,
      })
    }

    return { created: false, userId: existingUser.id, workspaceId }
  }

  const profile = profileFromIdentity(identity)
  const userId = await store.insertUser({
    ...profile,
    clerkUserId: identity.subject,
    createdAt: now,
    tokenIdentifier: identity.tokenIdentifier,
    updatedAt: now,
  })
  const workspaceId = await ensurePersonalWorkspace(
    store,
    userId,
    undefined,
    now,
  )

  await store.patchUser(userId, {
    personalWorkspaceId: workspaceId,
    updatedAt: now,
  })

  return { created: true, userId, workspaceId }
}
