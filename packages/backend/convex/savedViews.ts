import { ConvexError, type GenericId, v } from "convex/values"

import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import {
  assertPersistableSavedViewName,
  normalizeSavedViewName,
  SYNTHETIC_ALL_MENTIONS_VIEW_NAME,
} from "./lib/customerInputContract"
import {
  mentionSortValidator,
  mentionStatusValidator,
  platformValidator,
} from "./schema"
import { indexEquals } from "./server"
import { resolveCurrentCustomer } from "./users"

type SavedViewId = GenericId<"savedViews">
type CategoryId = GenericId<"categories">
type KeywordId = GenericId<"keywords">
type MentionStatus = "new" | "saved" | "dismissed"
type MentionSort = "newest" | "oldest" | "most_engaged"
type Platform = "x" | "reddit" | "hacker_news"

type MentionFilters = {
  categoryIds?: CategoryId[]
  keywordIds?: KeywordId[]
  mentionStatuses?: MentionStatus[]
  platforms?: Platform[]
  publishedAfter?: number
  publishedBefore?: number
}

type SavedViewResult = {
  filters: MentionFilters
  icon: string
  id: string
  name: string
  position: number
  sort: MentionSort
}

export const SYNTHETIC_ALL_MENTIONS_VIEW_ID = "all-mentions"

export const SYNTHETIC_ALL_MENTIONS_VIEW: Readonly<SavedViewResult> =
  Object.freeze({
    filters: {},
    icon: "funnel",
    id: SYNTHETIC_ALL_MENTIONS_VIEW_ID,
    name: SYNTHETIC_ALL_MENTIONS_VIEW_NAME,
    position: 0,
    sort: "newest",
  })

const filtersValidator = v.object({
  categoryIds: v.optional(v.array(v.id("categories"))),
  keywordIds: v.optional(v.array(v.id("keywords"))),
  mentionStatuses: v.optional(v.array(mentionStatusValidator)),
  platforms: v.optional(v.array(platformValidator)),
  publishedAfter: v.optional(v.number()),
  publishedBefore: v.optional(v.number()),
})

const savedViewResultValidator = v.object({
  filters: filtersValidator,
  icon: v.string(),
  id: v.string(),
  name: v.string(),
  position: v.number(),
  sort: mentionSortValidator,
})

function savedViewError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function validatedSavedViewName(value: string): string {
  let name: string
  try {
    name = assertPersistableSavedViewName(value)
  } catch (error) {
    savedViewError(
      "INVALID_SAVED_VIEW",
      error instanceof Error ? error.message : "Saved view name is invalid",
    )
  }
  if (name.length > 80) {
    savedViewError(
      "INVALID_SAVED_VIEW",
      "Saved view name cannot exceed 80 characters",
    )
  }
  return name
}

function validatedIcon(value: string): string {
  const icon = value.trim()
  if (icon.length === 0 || icon.length > 40 || !/^[a-z0-9_-]+$/i.test(icon)) {
    savedViewError(
      "INVALID_SAVED_VIEW",
      "Saved view icon must be a short icon token",
    )
  }
  return icon
}

function uniqueValues<T extends string>(
  values: readonly T[],
  field: string,
): T[] {
  if (new Set(values).size !== values.length) {
    savedViewError(
      "INVALID_SAVED_VIEW_FILTERS",
      `${field} cannot contain duplicates`,
    )
  }
  return [...values]
}

function validatedTimestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    savedViewError(
      "INVALID_SAVED_VIEW_FILTERS",
      `${field} must be a non-negative millisecond timestamp`,
    )
  }
  return value
}

async function validatedFilters(
  ctx: Parameters<typeof resolveCurrentCustomer>[0],
  workspaceId: GenericId<"workspaces">,
  filters: MentionFilters,
): Promise<MentionFilters> {
  const categoryIds =
    filters.categoryIds === undefined
      ? undefined
      : uniqueValues(filters.categoryIds, "Category filters")
  const keywordIds =
    filters.keywordIds === undefined
      ? undefined
      : uniqueValues(filters.keywordIds, "Keyword filters")
  const mentionStatuses =
    filters.mentionStatuses === undefined
      ? undefined
      : uniqueValues(filters.mentionStatuses, "Mention status filters")
  const platforms =
    filters.platforms === undefined
      ? undefined
      : uniqueValues(filters.platforms, "Platform filters")
  const publishedAfter =
    filters.publishedAfter === undefined
      ? undefined
      : validatedTimestamp(filters.publishedAfter, "Published after")
  const publishedBefore =
    filters.publishedBefore === undefined
      ? undefined
      : validatedTimestamp(filters.publishedBefore, "Published before")

  if (
    publishedAfter !== undefined &&
    publishedBefore !== undefined &&
    publishedAfter > publishedBefore
  ) {
    savedViewError(
      "INVALID_SAVED_VIEW_FILTERS",
      "Published after cannot be later than published before",
    )
  }

  for (const categoryId of categoryIds ?? []) {
    const category = await ctx.db.get("categories", categoryId)
    if (
      !category ||
      category.workspaceId !== workspaceId ||
      category.deletedAt !== undefined ||
      category.enabled !== true
    ) {
      savedViewError(
        "INVALID_SAVED_VIEW_FILTERS",
        "Saved view contains an unavailable category",
      )
    }
  }

  for (const keywordId of keywordIds ?? []) {
    const keyword = await ctx.db.get("keywords", keywordId)
    if (
      !keyword ||
      keyword.workspaceId !== workspaceId ||
      keyword.deletedAt !== undefined ||
      keyword.status === "deleted"
    ) {
      savedViewError(
        "INVALID_SAVED_VIEW_FILTERS",
        "Saved view contains an unavailable keyword",
      )
    }
  }

  return {
    ...(categoryIds?.length ? { categoryIds } : {}),
    ...(keywordIds?.length ? { keywordIds } : {}),
    ...(mentionStatuses?.length ? { mentionStatuses } : {}),
    ...(platforms?.length ? { platforms } : {}),
    ...(publishedAfter === undefined ? {} : { publishedAfter }),
    ...(publishedBefore === undefined ? {} : { publishedBefore }),
  }
}

function storedSavedViewResult(row: Record<string, unknown>): SavedViewResult {
  return {
    filters: row.filters as MentionFilters,
    icon: row.icon as string,
    id: String(row._id),
    name: row.name as string,
    position: row.position as number,
    sort: row.sort as MentionSort,
  }
}

async function findDuplicateName(
  ctx: Parameters<typeof resolveCurrentCustomer>[0],
  workspaceId: GenericId<"workspaces">,
  userId: GenericId<"users">,
  normalizedName: string,
): Promise<Record<string, unknown> | null> {
  return await ctx.db
    .query("savedViews")
    .withIndex("by_workspace_user_normalized_name_and_deleted_at", (q) =>
      indexEquals(
        q,
        ["workspaceId", workspaceId],
        ["userId", userId],
        ["normalizedName", normalizedName],
        ["deletedAt", undefined],
      ),
    )
    .unique()
}

async function storedViews(
  ctx: Parameters<typeof resolveCurrentCustomer>[0],
  workspaceId: GenericId<"workspaces">,
  userId: GenericId<"users">,
): Promise<Record<string, unknown>[]> {
  const rows = await ctx.db
    .query("savedViews")
    .withIndex("by_workspace_user_deleted_and_position", (q) =>
      indexEquals(
        q,
        ["workspaceId", workspaceId],
        ["userId", userId],
        ["deletedAt", undefined],
      ),
    )
    .collect()

  for (const row of rows) {
    if (
      normalizeSavedViewName(row.name as string) ===
      normalizeSavedViewName(SYNTHETIC_ALL_MENTIONS_VIEW_NAME)
    ) {
      savedViewError(
        "SAVED_VIEW_INVARIANT",
        "All Mentions cannot exist as a stored saved view",
      )
    }
  }
  return rows.sort(
    (left, right) =>
      (left.position as number) - (right.position as number) ||
      (left.createdAt as number) - (right.createdAt as number),
  )
}

function asSavedViewId(value: string): SavedViewId {
  if (value === SYNTHETIC_ALL_MENTIONS_VIEW_ID) {
    savedViewError(
      "SYNTHETIC_VIEW_IMMUTABLE",
      "All Mentions is synthetic and cannot be changed",
    )
  }
  return value as SavedViewId
}

export function normalizeSavedViewReorderIds(
  values: readonly string[],
): string[] {
  const ids = [...values]
  if (ids[0] === SYNTHETIC_ALL_MENTIONS_VIEW_ID) {
    ids.shift()
  }
  if (ids.includes(SYNTHETIC_ALL_MENTIONS_VIEW_ID)) {
    savedViewError(
      "INVALID_SAVED_VIEW_ORDER",
      "All Mentions must remain the first synthetic view",
    )
  }
  return uniqueValues(ids, "Saved view order")
}

export const listSavedViews = authenticatedQuery({
  args: {},
  returns: v.array(savedViewResultValidator),
  handler: async (ctx) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const rows = await storedViews(ctx, workspace.id, viewer.id)
    return [SYNTHETIC_ALL_MENTIONS_VIEW, ...rows.map(storedSavedViewResult)]
  },
})

export const createSavedView = authenticatedMutation({
  args: {
    filters: filtersValidator,
    icon: v.string(),
    name: v.string(),
    sort: mentionSortValidator,
  },
  returns: savedViewResultValidator,
  handler: async (ctx, args) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const name = validatedSavedViewName(args.name)
    const normalizedName = normalizeSavedViewName(name)
    if (await findDuplicateName(ctx, workspace.id, viewer.id, normalizedName)) {
      savedViewError(
        "SAVED_VIEW_NAME_CONFLICT",
        "Saved view name is already in use",
      )
    }

    const filters = await validatedFilters(ctx, workspace.id, args.filters)
    const icon = validatedIcon(args.icon)
    const rows = await storedViews(ctx, workspace.id, viewer.id)
    const position =
      rows.reduce(
        (maximum, row) => Math.max(maximum, row.position as number),
        0,
      ) + 1
    const now = Date.now()
    const savedViewId = (await ctx.db.insert("savedViews", {
      createdAt: now,
      filters,
      icon,
      name,
      normalizedName,
      position,
      sort: args.sort,
      updatedAt: now,
      userId: viewer.id,
      workspaceId: workspace.id,
    })) as SavedViewId

    return {
      filters,
      icon,
      id: savedViewId,
      name,
      position,
      sort: args.sort,
    }
  },
})

export const updateSavedView = authenticatedMutation({
  args: {
    filters: v.optional(filtersValidator),
    icon: v.optional(v.string()),
    name: v.optional(v.string()),
    savedViewId: v.string(),
    sort: v.optional(mentionSortValidator),
  },
  returns: savedViewResultValidator,
  handler: async (ctx, args) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    if (
      args.filters === undefined &&
      args.icon === undefined &&
      args.name === undefined &&
      args.sort === undefined
    ) {
      savedViewError(
        "INVALID_SAVED_VIEW",
        "At least one saved view field is required",
      )
    }

    const savedViewId = asSavedViewId(args.savedViewId)
    const row = await ctx.db.get("savedViews", savedViewId)
    if (
      !row ||
      row.workspaceId !== workspace.id ||
      row.userId !== viewer.id ||
      row.deletedAt !== undefined
    ) {
      savedViewError("SAVED_VIEW_NOT_FOUND", "Saved view not found")
    }

    const name =
      args.name === undefined ? undefined : validatedSavedViewName(args.name)
    if (name !== undefined) {
      const duplicate = await findDuplicateName(
        ctx,
        workspace.id,
        viewer.id,
        normalizeSavedViewName(name),
      )
      if (duplicate && duplicate._id !== savedViewId) {
        savedViewError(
          "SAVED_VIEW_NAME_CONFLICT",
          "Saved view name is already in use",
        )
      }
    }

    const filters =
      args.filters === undefined
        ? undefined
        : await validatedFilters(ctx, workspace.id, args.filters)
    const icon = args.icon === undefined ? undefined : validatedIcon(args.icon)
    const patch = {
      ...(filters === undefined ? {} : { filters }),
      ...(icon === undefined ? {} : { icon }),
      ...(name === undefined
        ? {}
        : { name, normalizedName: normalizeSavedViewName(name) }),
      ...(args.sort === undefined ? {} : { sort: args.sort }),
      updatedAt: Date.now(),
    }
    await ctx.db.patch("savedViews", savedViewId, patch)

    return storedSavedViewResult({ ...row, ...patch })
  },
})

export const reorderSavedViews = authenticatedMutation({
  args: { savedViewIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { savedViewIds }) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const ids = normalizeSavedViewReorderIds(savedViewIds)
    const rows = await storedViews(ctx, workspace.id, viewer.id)
    const expectedIds = new Set(rows.map((row) => String(row._id)))
    if (
      ids.length !== expectedIds.size ||
      ids.some((id) => !expectedIds.has(id))
    ) {
      savedViewError(
        "INVALID_SAVED_VIEW_ORDER",
        "Saved view order must contain every current saved view exactly once",
      )
    }

    const now = Date.now()
    for (const [index, id] of ids.entries()) {
      await ctx.db.patch("savedViews", asSavedViewId(id), {
        position: index + 1,
        updatedAt: now,
      })
    }
    return null
  },
})

export const deleteSavedView = authenticatedMutation({
  args: { savedViewId: v.string() },
  returns: v.null(),
  handler: async (ctx, { savedViewId: rawSavedViewId }) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const savedViewId = asSavedViewId(rawSavedViewId)
    const row = await ctx.db.get("savedViews", savedViewId)
    if (
      !row ||
      row.workspaceId !== workspace.id ||
      row.userId !== viewer.id ||
      row.deletedAt !== undefined
    ) {
      savedViewError("SAVED_VIEW_NOT_FOUND", "Saved view not found")
    }

    const now = Date.now()
    await ctx.db.patch("savedViews", savedViewId, {
      deletedAt: now,
      updatedAt: now,
    })
    const remaining = (await storedViews(ctx, workspace.id, viewer.id)).filter(
      (candidate) => candidate._id !== savedViewId,
    )
    for (const [index, candidate] of remaining.entries()) {
      await ctx.db.patch("savedViews", candidate._id as SavedViewId, {
        position: index + 1,
        updatedAt: now,
      })
    }
    return null
  },
})
