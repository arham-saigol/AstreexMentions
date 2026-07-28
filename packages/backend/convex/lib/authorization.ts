import type { UserIdentity } from "convex/server"
import { makeFunctionReference, type FunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { ConvexError, v } from "convex/values"
import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions"

import {
  action,
  env,
  indexEquals,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../server"
import { assertAdminClerkUserId } from "./adminAuthorization"
import {
  authorizeCurrentCustomerTenant,
  authorizeCustomerTenant,
  type CustomerMembership,
  type CustomerTenantStore,
  type CustomerUser,
  type CustomerWorkspace,
} from "./customerTenantAuthorization"

type AuthorizationErrorCode =
  "BOOTSTRAP_REQUIRED" | "FORBIDDEN" | "TENANT_NOT_FOUND" | "UNAUTHENTICATED"

type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type MembershipId = GenericId<"workspaceMembers">

type AuthorizedViewer = CustomerUser<UserId, WorkspaceId> & {
  _id: UserId
  email?: string | undefined
  imageUrl?: string | undefined
  name?: string | undefined
}

type AuthorizedWorkspace = CustomerWorkspace<UserId, WorkspaceId> & {
  _id: WorkspaceId
  name: string
}

type AuthorizedMembership = CustomerMembership<UserId, WorkspaceId> & {
  _id: MembershipId
}

export type CustomerAuthorization = {
  membership: AuthorizedMembership
  viewer: AuthorizedViewer
  workspace: AuthorizedWorkspace
}

export type CurrentCustomerAuthorization = {
  membership: AuthorizedMembership & { role: "owner" }
  viewer: AuthorizedViewer & { personalWorkspaceId: WorkspaceId }
  workspace: AuthorizedWorkspace & { kind: "personal" }
}

type DatabaseAuthorizationCtx = {
  db: QueryCtx["db"] | MutationCtx["db"]
}

type IdentityCtx = Pick<ActionCtx, "auth">

function authorizationError(
  code: AuthorizationErrorCode,
  message: string,
): never {
  throw new ConvexError({ code, message })
}

export async function requireIdentity(ctx: IdentityCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    authorizationError("UNAUTHENTICATED", "Authentication is required")
  }

  return identity
}

export async function requireAdminIdentity(
  ctx: IdentityCtx,
): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx)

  assertAdminClerkUserId(identity.subject, env.ADMIN_CLERK_USER_ID)

  return identity
}

function customerStore(
  ctx: DatabaseAuthorizationCtx,
): CustomerTenantStore<
  UserId,
  WorkspaceId,
  AuthorizedViewer,
  AuthorizedWorkspace,
  AuthorizedMembership
> {
  return {
    findMembership: async (workspaceId, userId) => {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_and_user", (q) =>
          indexEquals(q, ["workspaceId", workspaceId], ["userId", userId]),
        )
        .unique()

      if (!membership) {
        return null
      }

      return {
        _id: membership._id as MembershipId,
        id: membership._id as MembershipId,
        revokedAt: membership.revokedAt as number | undefined,
        role: membership.role as string,
        userId: membership.userId as UserId,
        workspaceId: membership.workspaceId as WorkspaceId,
      }
    },
    findUserByTokenIdentifier: async (tokenIdentifier) => {
      const viewer = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", tokenIdentifier),
        )
        .unique()

      if (!viewer) {
        return null
      }

      return {
        _id: viewer._id as UserId,
        clerkUserId: viewer.clerkUserId as string,
        deletedAt: viewer.deletedAt as number | undefined,
        disabledAt: viewer.disabledAt as number | undefined,
        email: viewer.email as string | undefined,
        id: viewer._id as UserId,
        imageUrl: viewer.imageUrl as string | undefined,
        name: viewer.name as string | undefined,
        personalWorkspaceId: viewer.personalWorkspaceId as
          WorkspaceId | undefined,
        tokenIdentifier: viewer.tokenIdentifier as string,
      }
    },
    getWorkspace: async (workspaceId) => {
      const workspace = await ctx.db.get("workspaces", workspaceId)

      if (!workspace) {
        return null
      }

      return {
        _id: workspace._id as WorkspaceId,
        deletedAt: workspace.deletedAt as number | undefined,
        deletionPendingAt: workspace.deletionPendingAt as number | undefined,
        id: workspace._id as WorkspaceId,
        kind: workspace.kind as string,
        name: workspace.name as string,
        ownerUserId: workspace.ownerUserId as UserId,
      }
    },
  }
}

async function readCustomerAuthorization(
  ctx: DatabaseAuthorizationCtx,
  identity: Pick<UserIdentity, "subject" | "tokenIdentifier">,
  workspaceId: WorkspaceId,
): Promise<CustomerAuthorization> {
  return await authorizeCustomerTenant(
    customerStore(ctx),
    identity,
    workspaceId,
  )
}

export async function resolveCurrentCustomerAuthorization(
  ctx: DatabaseAuthorizationCtx,
  identity: Pick<UserIdentity, "subject" | "tokenIdentifier">,
): Promise<CurrentCustomerAuthorization> {
  return (await authorizeCurrentCustomerTenant(
    customerStore(ctx),
    identity,
  )) as CurrentCustomerAuthorization
}

export const resolveCustomerAuthorization = internalQuery({
  args: {
    clerkUserId: v.string(),
    tokenIdentifier: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) =>
    await readCustomerAuthorization(
      ctx,
      {
        subject: args.clerkUserId,
        tokenIdentifier: args.tokenIdentifier,
      },
      args.workspaceId,
    ),
})

export const resolveCurrentCustomerAuthorizationForAction = internalQuery({
  args: {
    clerkUserId: v.string(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) =>
    await resolveCurrentCustomerAuthorization(ctx, {
      subject: args.clerkUserId,
      tokenIdentifier: args.tokenIdentifier,
    }),
})

const resolveCurrentCustomerAuthorizationReference = makeFunctionReference<
  "query",
  {
    clerkUserId: string
    tokenIdentifier: string
  },
  CurrentCustomerAuthorization
>(
  "lib/authorization:resolveCurrentCustomerAuthorizationForAction",
) as unknown as FunctionReference<
  "query",
  "internal",
  {
    clerkUserId: string
    tokenIdentifier: string
  },
  CurrentCustomerAuthorization
>

export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => ({
    args,
    ctx: { identity: await requireIdentity(ctx) },
  }),
})

export const authenticatedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => ({
    args,
    ctx: { identity: await requireIdentity(ctx) },
  }),
})

export const authenticatedAction = customAction(action, {
  args: {},
  input: async (ctx, args) => ({
    args,
    ctx: { identity: await requireIdentity(ctx) },
  }),
})

export const customerQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const authorization = await resolveCurrentCustomerAuthorization(
      ctx,
      identity,
    )

    return {
      args,
      ctx: { identity, ...authorization },
    }
  },
})

export const customerMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const authorization = await resolveCurrentCustomerAuthorization(
      ctx,
      identity,
    )

    return {
      args,
      ctx: { identity, ...authorization },
    }
  },
})

export const customerAction = customAction(action, {
  args: {},
  input: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const authorization = await ctx.runQuery(
      resolveCurrentCustomerAuthorizationReference,
      {
        clerkUserId: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
      },
    )

    return {
      args,
      ctx: { identity, ...authorization },
    }
  },
})

export const adminQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => ({
    args,
    ctx: { adminIdentity: await requireAdminIdentity(ctx) },
  }),
})

export const adminMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => ({
    args,
    ctx: { adminIdentity: await requireAdminIdentity(ctx) },
  }),
})

export const adminAction = customAction(action, {
  args: {},
  input: async (ctx, args) => ({
    args,
    ctx: { adminIdentity: await requireAdminIdentity(ctx) },
  }),
})

// This name makes deliberately unauthenticated reads visible to authorization
// inventory checks. Do not add publicMutation or publicAction aliases.
export const publicQuery = query
