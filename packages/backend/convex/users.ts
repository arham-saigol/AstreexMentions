import { ConvexError, type GenericId, v } from "convex/values"

import {
  authenticatedMutation,
  authenticatedQuery,
  resolveCurrentCustomerAuthorization,
  type CurrentCustomerAuthorization,
} from "./lib/authorization"
import {
  bootstrapPersonalWorkspace,
  type BootstrapMembership,
  type BootstrapUser,
  type BootstrapWorkspace,
  type PersonalWorkspaceBootstrapStore,
} from "./lib/bootstrapPersonalWorkspace"
import { DEFAULT_CATEGORIES, normalizeCategoryName } from "./lib/categories"
import {
  DEFAULT_DIGEST_MENTION_LIMIT,
  nextDailyDigestRunAt,
} from "./lib/dailyDigest"
import { adjustWorkspaceCountMetric } from "./lib/operationalMetrics"
import { indexEquals, type MutationCtx } from "./server"

type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type MembershipId = GenericId<"workspaceMembers">

type BootstrapStore = PersonalWorkspaceBootstrapStore<
  UserId,
  WorkspaceId,
  MembershipId
>

export type CurrentCustomer = CurrentCustomerAuthorization
export const resolveCurrentCustomer = resolveCurrentCustomerAuthorization

const currentUserResultValidator = v.object({
  clerkUserId: v.string(),
  email: v.optional(v.string()),
  id: v.id("users"),
  imageUrl: v.optional(v.string()),
  name: v.optional(v.string()),
})

function customerError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function asBootstrapUser(
  user: Record<string, unknown>,
): BootstrapUser<UserId, WorkspaceId> {
  return {
    clerkUserId: user.clerkUserId as string,
    deletedAt: user.deletedAt as number | undefined,
    disabledAt: user.disabledAt as number | undefined,
    email: user.email as string | undefined,
    id: user._id as UserId,
    imageUrl: user.imageUrl as string | undefined,
    personalWorkspaceId: user.personalWorkspaceId as WorkspaceId | undefined,
    tokenIdentifier: user.tokenIdentifier as string,
  }
}

function asBootstrapWorkspace(
  workspace: Record<string, unknown>,
): BootstrapWorkspace<UserId, WorkspaceId> {
  return {
    deletedAt: workspace.deletedAt as number | undefined,
    id: workspace._id as WorkspaceId,
    kind: workspace.kind as string,
    ownerUserId: workspace.ownerUserId as UserId,
  }
}

function asBootstrapMembership(
  membership: Record<string, unknown>,
): BootstrapMembership<UserId, WorkspaceId, MembershipId> {
  return {
    id: membership._id as MembershipId,
    revokedAt: membership.revokedAt as number | undefined,
    role: membership.role as string,
    userId: membership.userId as UserId,
    workspaceId: membership.workspaceId as WorkspaceId,
  }
}

function bootstrapStore(ctx: MutationCtx): BootstrapStore {
  return {
    findMembership: async (workspaceId, userId) => {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_and_user", (q) =>
          indexEquals(q, ["workspaceId", workspaceId], ["userId", userId]),
        )
        .unique()

      return membership ? asBootstrapMembership(membership) : null
    },
    findPersonalWorkspaceByOwner: async (userId) => {
      const workspace = await ctx.db
        .query("workspaces")
        .withIndex("by_owner_and_kind", (q) =>
          indexEquals(q, ["ownerUserId", userId], ["kind", "personal"]),
        )
        .unique()

      return workspace ? asBootstrapWorkspace(workspace) : null
    },
    findUserByClerkUserId: async (clerkUserId) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
        .unique()

      return user ? asBootstrapUser(user) : null
    },
    findUserByTokenIdentifier: async (tokenIdentifier) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", tokenIdentifier),
        )
        .unique()

      return user ? asBootstrapUser(user) : null
    },
    getWorkspace: async (workspaceId) => {
      const workspace = await ctx.db.get("workspaces", workspaceId)
      return workspace ? asBootstrapWorkspace(workspace) : null
    },
    insertMembership: async (input) =>
      (await ctx.db.insert("workspaceMembers", input)) as MembershipId,
    insertUser: async (input) =>
      (await ctx.db.insert("users", input)) as UserId,
    insertWorkspace: async (input) => {
      const workspaceId = (await ctx.db.insert("workspaces", {
        ...input,
        normalizedName: input.name.toLocaleLowerCase("en"),
      })) as WorkspaceId
      await adjustWorkspaceCountMetric(ctx, {
        delta: 1,
        updatedAt: input.updatedAt,
        workspaceId,
      })
      return workspaceId
    },
    patchMembership: async (membershipId, patch) => {
      await ctx.db.patch("workspaceMembers", membershipId, patch)
    },
    patchUser: async (userId, patch) => {
      await ctx.db.patch("users", userId, patch)
    },
  }
}

async function ensureDefaultCategories(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  now: number,
): Promise<void> {
  for (const category of DEFAULT_CATEGORIES) {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_workspace_and_system_key", (q) =>
        indexEquals(
          q,
          ["workspaceId", workspaceId],
          ["systemKey", category.systemKey],
        ),
      )
      .unique()

    if (!existing) {
      await ctx.db.insert("categories", {
        colorToken: category.colorToken,
        createdAt: now,
        description: category.description,
        enabled: category.enabled,
        isSystem: category.isSystem,
        name: category.name,
        normalizedName: normalizeCategoryName(category.name),
        sortOrder: category.sortOrder,
        systemKey: category.systemKey,
        updatedAt: now,
        workspaceId,
      })
      continue
    }

    // Bootstrap repairs only the immutable fallback identity. Other system
    // category labels, colors, descriptions, ordering, and enabled state are
    // workspace-owned settings.
    if (
      category.systemKey === "other" &&
      (existing.name !== "Other" ||
        existing.normalizedName !== "other" ||
        existing.enabled !== true ||
        existing.deletedAt !== undefined ||
        existing.isSystem !== true)
    ) {
      await ctx.db.patch(
        "categories",
        existing._id as GenericId<"categories">,
        {
          deletedAt: undefined,
          enabled: true,
          isSystem: true,
          name: "Other",
          normalizedName: "other",
          updatedAt: now,
        },
      )
    }
  }
}

async function ensureDigestDefaults(
  ctx: MutationCtx,
  userId: UserId,
  workspaceId: WorkspaceId,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("digestPreferences")
    .withIndex("by_workspace_and_user", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["userId", userId]),
    )
    .unique()

  if (existing) {
    return
  }

  const schedule = { hour: 9, minute: 0, timeZone: "UTC" }
  await ctx.db.insert("digestPreferences", {
    createdAt: now,
    enabled: true,
    hour: schedule.hour,
    mentionLimit: DEFAULT_DIGEST_MENTION_LIMIT,
    minute: schedule.minute,
    nextRunAt: nextDailyDigestRunAt(now, schedule),
    timeZone: schedule.timeZone,
    updatedAt: now,
    userId,
    workspaceId,
  })
}

export function currentUserResult(viewer: CurrentCustomer["viewer"]): {
  clerkUserId: string
  email?: string
  id: UserId
  imageUrl?: string
  name?: string
} {
  return {
    clerkUserId: viewer.clerkUserId,
    ...(viewer.email === undefined ? {} : { email: viewer.email }),
    id: viewer.id,
    ...(viewer.imageUrl === undefined ? {} : { imageUrl: viewer.imageUrl }),
    ...(viewer.name === undefined ? {} : { name: viewer.name }),
  }
}

function requiredTrimmedText(
  value: string,
  field: string,
  maximumLength: number,
): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maximumLength) {
    customerError(
      "INVALID_PROFILE",
      `${field} must contain between 1 and ${maximumLength} characters`,
    )
  }
  return trimmed
}

function validatedImageUrl(value: string): string {
  const trimmed = requiredTrimmedText(value, "Image URL", 2_048)
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    customerError("INVALID_PROFILE", "Image URL must be a valid URL")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    customerError("INVALID_PROFILE", "Image URL must use HTTP or HTTPS")
  }
  return parsed.toString()
}

export const bootstrapCurrentUser = authenticatedMutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
  }),
  handler: async (ctx) => {
    const now = Date.now()
    const result = await bootstrapPersonalWorkspace(
      bootstrapStore(ctx),
      ctx.identity,
      now,
    )

    await ensureDefaultCategories(ctx, result.workspaceId, now)
    await ensureDigestDefaults(ctx, result.userId, result.workspaceId, now)

    return { userId: result.userId, workspaceId: result.workspaceId }
  },
})

export const getCurrentUser = authenticatedQuery({
  args: {},
  returns: currentUserResultValidator,
  handler: async (ctx) => {
    const { viewer } = await resolveCurrentCustomer(ctx, ctx.identity)
    return currentUserResult(viewer)
  },
})

export const updateCurrentUser = authenticatedMutation({
  args: {
    imageUrl: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  returns: currentUserResultValidator,
  handler: async (ctx, args) => {
    const { viewer } = await resolveCurrentCustomer(ctx, ctx.identity)
    if (args.imageUrl === undefined && args.name === undefined) {
      customerError("INVALID_PROFILE", "At least one profile field is required")
    }

    const patch = {
      ...(args.imageUrl === undefined
        ? {}
        : { imageUrl: validatedImageUrl(args.imageUrl) }),
      ...(args.name === undefined
        ? {}
        : { name: requiredTrimmedText(args.name, "Name", 160) }),
      updatedAt: Date.now(),
    }
    await ctx.db.patch("users", viewer.id, patch)

    return currentUserResult({ ...viewer, ...patch })
  },
})
