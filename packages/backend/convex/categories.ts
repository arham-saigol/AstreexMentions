import { ConvexError, type GenericId, v } from "convex/values"

import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { internalMutationReference } from "./lib/functionReferences"
import {
  assertCategoryCatalog,
  assertCategoryDeletionAllowed,
  assertCategoryUpdateAllowed,
  CategoryInvariantError,
  normalizeCategoryName,
  type CategoryColorToken,
  type CategoryPolicyRecord,
  type CategorySystemKey,
} from "./lib/categories"
import { categoryColorTokenValidator } from "./schema"
import { indexEquals, internalMutation, type MutationCtx } from "./server"
import { resolveCurrentCustomer } from "./users"

type CategoryId = GenericId<"categories">
type WorkspaceId = GenericId<"workspaces">
type SavedViewFilters = {
  categoryIds?: CategoryId[]
  keywordIds?: GenericId<"keywords">[]
  mentionStatuses?: Array<"new" | "saved" | "dismissed">
  platforms?: Array<"x" | "reddit" | "hacker_news">
  publishedAfter?: number
  publishedBefore?: number
}

const CATEGORY_REASSIGN_BATCH_SIZE = 100
const MAX_ACTIVE_SAVED_VIEWS = 50
export const MAX_ACTIVE_CATEGORIES = 50

type CategoryRecord = CategoryPolicyRecord & {
  colorToken: CategoryColorToken
  description: string
  id: CategoryId
  sortOrder: number
  systemKey?: CategorySystemKey
}

const categoryResultValidator = v.object({
  colorToken: categoryColorTokenValidator,
  description: v.string(),
  enabled: v.boolean(),
  id: v.id("categories"),
  isSystem: v.boolean(),
  name: v.string(),
  sortOrder: v.number(),
  systemKey: v.optional(
    v.union(
      v.literal("question"),
      v.literal("complaint"),
      v.literal("praise"),
      v.literal("bug"),
      v.literal("feature_request"),
      v.literal("competitor_mention"),
      v.literal("other"),
    ),
  ),
})

function categoryError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function translateCategoryInvariant(error: unknown): never {
  if (error instanceof CategoryInvariantError) {
    categoryError(error.code, error.message)
  }
  throw error
}

function requiredCategoryText(
  value: string,
  field: string,
  maximumLength: number,
): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maximumLength) {
    categoryError(
      "INVALID_CATEGORY",
      `${field} must contain between 1 and ${maximumLength} characters`,
    )
  }
  return trimmed
}

function categoryRecord(category: Record<string, unknown>): CategoryRecord {
  const systemKey = category.systemKey as CategorySystemKey | undefined
  return {
    colorToken: category.colorToken as CategoryColorToken,
    ...(category.deletedAt === undefined
      ? {}
      : { deletedAt: category.deletedAt as number }),
    description: category.description as string,
    enabled: category.enabled as boolean,
    id: category._id as CategoryId,
    isSystem: category.isSystem as boolean,
    name: category.name as string,
    sortOrder: category.sortOrder as number,
    ...(systemKey === undefined ? {} : { systemKey }),
  }
}

function removeCategoryFromSavedViewFilters(
  filters: SavedViewFilters,
  categoryId: CategoryId,
): SavedViewFilters {
  const categoryIds = filters.categoryIds?.filter(
    (candidate) => candidate !== categoryId,
  )
  return {
    ...(categoryIds === undefined || categoryIds.length === 0
      ? {}
      : { categoryIds }),
    ...(filters.keywordIds === undefined
      ? {}
      : { keywordIds: filters.keywordIds }),
    ...(filters.mentionStatuses === undefined
      ? {}
      : { mentionStatuses: filters.mentionStatuses }),
    ...(filters.platforms === undefined
      ? {}
      : { platforms: filters.platforms }),
    ...(filters.publishedAfter === undefined
      ? {}
      : { publishedAfter: filters.publishedAfter }),
    ...(filters.publishedBefore === undefined
      ? {}
      : { publishedBefore: filters.publishedBefore }),
  }
}

async function removeCategoryFromActiveSavedViews(
  ctx: MutationCtx,
  workspaceId: WorkspaceId,
  categoryId: CategoryId,
  now: number,
  failureCode: "CATEGORY_DELETE_FAILED" | "CATEGORY_UPDATE_FAILED",
): Promise<void> {
  const savedViews = await ctx.db
    .query("savedViews")
    .withIndex("by_workspace_deleted_and_updated_at", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["deletedAt", undefined]),
    )
    .take(MAX_ACTIVE_SAVED_VIEWS + 1)
  if (savedViews.length > MAX_ACTIVE_SAVED_VIEWS) {
    categoryError(failureCode, "Saved view count exceeds the supported maximum")
  }
  for (const savedView of savedViews) {
    const filters = savedView.filters as SavedViewFilters
    if (!filters.categoryIds?.includes(categoryId)) {
      continue
    }
    await ctx.db.patch("savedViews", savedView._id as GenericId<"savedViews">, {
      filters: removeCategoryFromSavedViewFilters(filters, categoryId),
      updatedAt: now,
    })
  }
}

export function categoryResult(category: CategoryRecord): {
  colorToken: CategoryColorToken
  description: string
  enabled: boolean
  id: CategoryId
  isSystem: boolean
  name: string
  sortOrder: number
  systemKey?: CategorySystemKey
} {
  return {
    colorToken: category.colorToken,
    description: category.description,
    enabled: category.enabled,
    id: category.id,
    isSystem: category.isSystem,
    name: category.name,
    sortOrder: category.sortOrder,
    ...(category.systemKey === undefined
      ? {}
      : { systemKey: category.systemKey }),
  }
}

async function currentCategories(
  ctx: Parameters<typeof resolveCurrentCustomer>[0],
  workspaceId: GenericId<"workspaces">,
): Promise<CategoryRecord[]> {
  const rows = await ctx.db
    .query("categories")
    .withIndex("by_workspace_deleted_enabled_and_sort_order", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["deletedAt", undefined]),
    )
    .take(MAX_ACTIVE_CATEGORIES + 1)
  const availableRows = rows.filter(
    (row) => row.deletionPendingAt === undefined,
  )
  if (availableRows.length > MAX_ACTIVE_CATEGORIES) {
    categoryError(
      "CATEGORY_LIMIT_REACHED",
      `A workspace can have at most ${MAX_ACTIVE_CATEGORIES} active categories`,
    )
  }
  const categories = availableRows
    .map(categoryRecord)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    )

  try {
    assertCategoryCatalog(categories)
  } catch (error) {
    translateCategoryInvariant(error)
  }
  return categories
}

async function findDuplicateName(
  ctx: Parameters<typeof resolveCurrentCustomer>[0],
  workspaceId: GenericId<"workspaces">,
  normalizedName: string,
): Promise<Record<string, unknown> | null> {
  return await ctx.db
    .query("categories")
    .withIndex("by_workspace_normalized_name_and_deleted_at", (q) =>
      indexEquals(
        q,
        ["workspaceId", workspaceId],
        ["normalizedName", normalizedName],
        ["deletedAt", undefined],
      ),
    )
    .unique()
}

export async function applyOnboardingCategoryConfiguration(
  ctx: MutationCtx,
  input: {
    categories: Array<{
      categoryId: CategoryId
      colorToken: CategoryColorToken
      description: string
      enabled: boolean
    }>
    workspaceId: WorkspaceId
  },
): Promise<void> {
  const categoryIds = new Set(
    input.categories.map((category) => String(category.categoryId)),
  )
  if (categoryIds.size !== input.categories.length) {
    categoryError("INVALID_CATEGORY", "Category ids must be unique")
  }

  const current = await currentCategories(ctx, input.workspaceId)
  if (
    current.length !== input.categories.length ||
    current.some((category) => !categoryIds.has(String(category.id)))
  ) {
    categoryError(
      "INVALID_CATEGORY",
      "Onboarding must include the complete current category catalog",
    )
  }
  const currentById = new Map(
    current.map((category) => [String(category.id), category]),
  )
  const updates = input.categories.map((category) => {
    const currentCategory = currentById.get(String(category.categoryId))
    if (!currentCategory) {
      categoryError("CATEGORY_NOT_FOUND", "Category not found")
    }
    const description = requiredCategoryText(
      category.description,
      "Category description",
      300,
    )
    try {
      assertCategoryUpdateAllowed(currentCategory, {
        enabled: category.enabled,
      })
    } catch (error) {
      translateCategoryInvariant(error)
    }
    return { category, description }
  })

  const now = Date.now()
  for (const { category, description } of updates) {
    const currentCategory = currentById.get(String(category.categoryId))!
    if (currentCategory.enabled && !category.enabled) {
      await removeCategoryFromActiveSavedViews(
        ctx,
        input.workspaceId,
        category.categoryId,
        now,
        "CATEGORY_UPDATE_FAILED",
      )
    }
    await ctx.db.patch("categories", category.categoryId, {
      colorToken: category.colorToken,
      description,
      enabled: category.enabled,
      updatedAt: now,
    })
  }
}

export const listCategories = authenticatedQuery({
  args: {},
  returns: v.array(categoryResultValidator),
  handler: async (ctx) => {
    const { workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
    return (await currentCategories(ctx, workspace.id)).map(categoryResult)
  },
})

export const createCategory = authenticatedMutation({
  args: {
    colorToken: categoryColorTokenValidator,
    description: v.string(),
    name: v.string(),
  },
  returns: categoryResultValidator,
  handler: async (ctx, args) => {
    const { workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
    const categories = await currentCategories(ctx, workspace.id)
    if (categories.length >= MAX_ACTIVE_CATEGORIES) {
      categoryError(
        "CATEGORY_LIMIT_REACHED",
        `A workspace can have at most ${MAX_ACTIVE_CATEGORIES} active categories`,
      )
    }
    const name = requiredCategoryText(args.name, "Category name", 80)
    const description = requiredCategoryText(
      args.description,
      "Category description",
      300,
    )
    const normalizedName = normalizeCategoryName(name)
    if (await findDuplicateName(ctx, workspace.id, normalizedName)) {
      categoryError("CATEGORY_NAME_CONFLICT", "Category name is already in use")
    }

    const now = Date.now()
    const sortOrder =
      categories.reduce(
        (maximum, category) => Math.max(maximum, category.sortOrder),
        -1,
      ) + 1
    const categoryId = (await ctx.db.insert("categories", {
      colorToken: args.colorToken,
      createdAt: now,
      description,
      enabled: true,
      isSystem: false,
      name,
      normalizedName,
      sortOrder,
      updatedAt: now,
      workspaceId: workspace.id,
    })) as CategoryId

    return categoryResult({
      colorToken: args.colorToken,
      description,
      enabled: true,
      id: categoryId,
      isSystem: false,
      name,
      sortOrder,
    })
  },
})

export const updateCategory = authenticatedMutation({
  args: {
    categoryId: v.id("categories"),
    colorToken: v.optional(categoryColorTokenValidator),
    description: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    name: v.optional(v.string()),
  },
  returns: categoryResultValidator,
  handler: async (ctx, args) => {
    const { workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
    if (
      args.colorToken === undefined &&
      args.description === undefined &&
      args.enabled === undefined &&
      args.name === undefined
    ) {
      categoryError(
        "INVALID_CATEGORY",
        "At least one category field is required",
      )
    }

    const row = await ctx.db.get("categories", args.categoryId)
    if (
      !row ||
      row.workspaceId !== workspace.id ||
      row.deletedAt !== undefined ||
      row.deletionPendingAt !== undefined
    ) {
      categoryError("CATEGORY_NOT_FOUND", "Category not found")
    }
    const current = categoryRecord(row)
    const name =
      args.name === undefined
        ? undefined
        : requiredCategoryText(args.name, "Category name", 80)
    const description =
      args.description === undefined
        ? undefined
        : requiredCategoryText(args.description, "Category description", 300)

    try {
      assertCategoryUpdateAllowed(current, {
        enabled: args.enabled,
        name,
      })
    } catch (error) {
      translateCategoryInvariant(error)
    }

    if (name !== undefined) {
      const duplicate = await findDuplicateName(
        ctx,
        workspace.id,
        normalizeCategoryName(name),
      )
      if (duplicate && duplicate._id !== args.categoryId) {
        categoryError(
          "CATEGORY_NAME_CONFLICT",
          "Category name is already in use",
        )
      }
    }

    const now = Date.now()
    if (current.enabled && args.enabled === false) {
      await removeCategoryFromActiveSavedViews(
        ctx,
        workspace.id,
        args.categoryId,
        now,
        "CATEGORY_UPDATE_FAILED",
      )
    }
    const patch = {
      ...(args.colorToken === undefined ? {} : { colorToken: args.colorToken }),
      ...(description === undefined ? {} : { description }),
      ...(args.enabled === undefined ? {} : { enabled: args.enabled }),
      ...(name === undefined
        ? {}
        : { name, normalizedName: normalizeCategoryName(name) }),
      updatedAt: now,
    }
    await ctx.db.patch("categories", args.categoryId, patch)

    return categoryResult({ ...current, ...patch })
  },
})

export const deleteCategory = authenticatedMutation({
  args: { categoryId: v.id("categories") },
  returns: v.object({ state: v.literal("accepted") }),
  handler: async (ctx, { categoryId }) => {
    const { workspace } = await resolveCurrentCustomer(ctx, ctx.identity)
    const row = await ctx.db.get("categories", categoryId)
    if (
      !row ||
      row.workspaceId !== workspace.id ||
      row.deletedAt !== undefined
    ) {
      categoryError("CATEGORY_NOT_FOUND", "Category not found")
    }
    const category = categoryRecord(row)
    try {
      assertCategoryDeletionAllowed(category)
    } catch (error) {
      translateCategoryInvariant(error)
    }

    const other = await ctx.db
      .query("categories")
      .withIndex("by_workspace_and_system_key", (q) =>
        indexEquals(q, ["workspaceId", workspace.id], ["systemKey", "other"]),
      )
      .unique()
    if (
      !other ||
      other.deletedAt !== undefined ||
      other.enabled !== true ||
      other.isSystem !== true ||
      other.name !== "Other"
    ) {
      categoryError(
        "OTHER_CATEGORY_REQUIRED",
        "The required Other category is unavailable",
      )
    }

    const now = Date.now()
    await removeCategoryFromActiveSavedViews(
      ctx,
      workspace.id,
      categoryId,
      now,
      "CATEGORY_DELETE_FAILED",
    )
    await ctx.db.patch("categories", categoryId, {
      deletionPendingAt: row.deletionPendingAt ?? now,
      enabled: false,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, reassignCategoryDeletionBatchReference, {
      categoryId,
      otherCategoryId: other._id as CategoryId,
      workspaceId: workspace.id,
    })

    return { state: "accepted" as const }
  },
})

export const reassignCategoryDeletionBatch = internalMutation({
  args: {
    categoryId: v.id("categories"),
    otherCategoryId: v.id("categories"),
    workspaceId: v.id("workspaces"),
  },
  returns: v.object({
    reassignedCount: v.number(),
    state: v.union(
      v.literal("completed"),
      v.literal("in_progress"),
      v.literal("stale"),
    ),
  }),
  handler: async (ctx, args) => {
    const [category, other] = await Promise.all([
      ctx.db.get("categories", args.categoryId),
      ctx.db.get("categories", args.otherCategoryId),
    ])
    if (
      !category ||
      category.workspaceId !== args.workspaceId ||
      category.deletedAt !== undefined ||
      category.deletionPendingAt === undefined ||
      !other ||
      other.workspaceId !== args.workspaceId ||
      other.deletedAt !== undefined ||
      other.enabled !== true ||
      other.isSystem !== true ||
      other.systemKey !== "other"
    ) {
      return { reassignedCount: 0, state: "stale" as const }
    }

    const now = Date.now()
    const mentions = await ctx.db
      .query("mentions")
      .withIndex("by_workspace_category_and_published_at", (q) =>
        indexEquals(
          q,
          ["workspaceId", args.workspaceId],
          ["categoryId", args.categoryId],
        ),
      )
      .take(CATEGORY_REASSIGN_BATCH_SIZE)
    for (const mention of mentions) {
      await ctx.db.patch("mentions", mention._id, {
        categoryId: args.otherCategoryId,
        updatedAt: now,
      })
    }

    if (mentions.length === CATEGORY_REASSIGN_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, reassignCategoryDeletionBatchReference, {
        categoryId: args.categoryId,
        otherCategoryId: args.otherCategoryId,
        workspaceId: args.workspaceId,
      })
      return {
        reassignedCount: mentions.length,
        state: "in_progress" as const,
      }
    }

    await ctx.db.patch("categories", args.categoryId, {
      deletedAt: now,
      deletionPendingAt: undefined,
      enabled: false,
      updatedAt: now,
    })
    return { reassignedCount: mentions.length, state: "completed" as const }
  },
})

export const reassignCategoryDeletionBatchReference =
  internalMutationReference<{
    categoryId: CategoryId
    otherCategoryId: CategoryId
    workspaceId: WorkspaceId
  }>("categories:reassignCategoryDeletionBatch")
