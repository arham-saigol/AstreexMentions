import { z } from "zod"

import type {
  MentionFilters,
  MentionSort,
  MentionStatus,
  Platform,
} from "@/lib/customer-convex"

const idSchema = z.string().trim().min(1)
const optionalTextSchema = z.string().trim().min(1).optional().nullable()
const platformSchema = z.enum(["x", "reddit", "hacker_news"])
const mentionStatusSchema = z.enum(["new", "saved", "dismissed"])
const mentionSortSchema = z.enum(["newest", "oldest", "most_engaged"])
const categoryColorTokenSchema = z.enum([
  "blue",
  "orange",
  "green",
  "red",
  "purple",
  "yellow",
  "gray",
  "pink",
  "cyan",
  "slate",
])

export const ALL_MENTIONS_VIEW_ID = "all-mentions"

const rawCategorySchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    colorToken: categoryColorTokenSchema.optional().nullable(),
    enabled: z.boolean().optional(),
    name: z.string().trim().min(1),
    sortOrder: z.number().finite().optional(),
    systemKey: optionalTextSchema,
  })
  .passthrough()
  .transform((value) => ({
    id: value.id ?? value._id ?? value.name,
    name: value.name,
    ...(value.colorToken ? { colorToken: value.colorToken } : {}),
    ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}),
    ...(value.systemKey ? { systemKey: value.systemKey } : {}),
  }))

const rawKeywordSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    phrase: z.string().trim().min(1),
    platforms: z.array(platformSchema).optional(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .passthrough()
  .transform((value) => ({
    id: value.id ?? value._id ?? value.phrase,
    phrase: value.phrase,
    platforms: value.platforms ?? [],
    status: value.status ?? ("active" as const),
  }))

const matchedKeywordSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .transform((phrase) => ({ phrase })),
  z
    .object({
      _id: idSchema.optional(),
      id: idSchema.optional(),
      keywordId: idSchema.optional(),
      matchedText: optionalTextSchema,
      phrase: optionalTextSchema,
      keyword: z
        .object({
          _id: idSchema.optional(),
          id: idSchema.optional(),
          phrase: z.string().trim().min(1),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .transform((value, context) => {
      const phrase = value.phrase ?? value.keyword?.phrase ?? value.matchedText
      if (!phrase) {
        context.addIssue({
          code: "custom",
          message: "A matched keyword is missing its phrase.",
        })
        return z.NEVER
      }

      const id =
        value.id ??
        value._id ??
        value.keywordId ??
        value.keyword?.id ??
        value.keyword?._id
      return { phrase, ...(id ? { id } : {}) }
    }),
])

const rawMentionSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    authorDisplayName: optionalTextSchema,
    authorHandle: optionalTextSchema,
    body: z.string().trim().min(1),
    canonicalUrl: z.string().trim().url(),
    category: rawCategorySchema.optional().nullable(),
    categoryId: idSchema.optional(),
    categoryName: optionalTextSchema,
    categorySystemKey: optionalTextSchema,
    commentCount: z.number().finite().nonnegative().optional(),
    engagementScore: z.number().finite().nonnegative().optional(),
    keywordMatches: z.array(matchedKeywordSchema).optional(),
    likeCount: z.number().finite().nonnegative().optional(),
    matchedKeywords: z.array(matchedKeywordSchema).optional(),
    platform: platformSchema,
    pointCount: z.number().finite().nonnegative().optional(),
    publishedAt: z.number().finite().nonnegative(),
    replyCount: z.number().finite().nonnegative().optional(),
    repostCount: z.number().finite().nonnegative().optional(),
    status: mentionStatusSchema,
    title: optionalTextSchema,
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id ?? value._id
    if (!id) {
      context.addIssue({
        code: "custom",
        message: "A mention is missing its id.",
      })
      return z.NEVER
    }

    const category =
      value.category ??
      (value.categoryName
        ? {
            id: value.categoryId ?? value.categoryName,
            name: value.categoryName,
            ...(value.categorySystemKey
              ? { systemKey: value.categorySystemKey }
              : {}),
          }
        : null)

    return {
      id,
      body: value.body,
      canonicalUrl: value.canonicalUrl,
      platform: value.platform,
      publishedAt: value.publishedAt,
      status: value.status,
      matchedKeywords: value.matchedKeywords ?? value.keywordMatches ?? [],
      category,
      ...(value.authorDisplayName
        ? { authorDisplayName: value.authorDisplayName }
        : {}),
      ...(value.authorHandle ? { authorHandle: value.authorHandle } : {}),
      ...(value.commentCount !== undefined
        ? { commentCount: value.commentCount }
        : {}),
      ...(value.engagementScore !== undefined
        ? { engagementScore: value.engagementScore }
        : {}),
      ...(value.likeCount !== undefined ? { likeCount: value.likeCount } : {}),
      ...(value.pointCount !== undefined
        ? { pointCount: value.pointCount }
        : {}),
      ...(value.replyCount !== undefined
        ? { replyCount: value.replyCount }
        : {}),
      ...(value.repostCount !== undefined
        ? { repostCount: value.repostCount }
        : {}),
      ...(value.title ? { title: value.title } : {}),
    }
  })

const filtersSchema = z
  .object({
    categoryIds: z.array(idSchema).optional(),
    keywordIds: z.array(idSchema).optional(),
    mentionStatuses: z.array(mentionStatusSchema).optional(),
    platforms: z.array(platformSchema).optional(),
    publishedAfter: z.number().finite().nonnegative().optional(),
    publishedBefore: z.number().finite().nonnegative().optional(),
  })
  .passthrough()
  .transform((value): MentionFilters => ({
    ...(value.categoryIds?.length ? { categoryIds: value.categoryIds } : {}),
    ...(value.keywordIds?.length ? { keywordIds: value.keywordIds } : {}),
    ...(value.mentionStatuses?.length
      ? { mentionStatuses: value.mentionStatuses }
      : {}),
    ...(value.platforms?.length ? { platforms: value.platforms } : {}),
    ...(value.publishedAfter !== undefined
      ? { publishedAfter: value.publishedAfter }
      : {}),
    ...(value.publishedBefore !== undefined
      ? { publishedBefore: value.publishedBefore }
      : {}),
  }))

const rawSavedViewSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    filters: filtersSchema,
    icon: z.string().trim().min(1),
    name: z.string().trim().min(1).max(80),
    position: z.number().finite(),
    sort: mentionSortSchema,
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id ?? value._id
    if (!id) {
      context.addIssue({
        code: "custom",
        message: "A saved view is missing its id.",
      })
      return z.NEVER
    }

    return {
      id,
      filters: value.filters,
      icon: value.icon,
      name: value.name,
      position: value.position,
      sort: value.sort,
    }
  })

function collectionSchema<Item extends z.ZodTypeAny>(item: Item) {
  return z.union([
    z.array(item),
    z
      .object({
        items: z.array(item).optional(),
        page: z.array(item).optional(),
      })
      .passthrough()
      .transform((value) => value.items ?? value.page ?? []),
  ])
}

export const categoriesResultSchema = collectionSchema(
  rawCategorySchema,
).transform((items) =>
  [...items]
    .filter((item) => item.enabled !== false)
    .sort(
      (left, right) =>
        (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name),
    ),
)

export const keywordsResultSchema = collectionSchema(
  rawKeywordSchema,
).transform((items) =>
  [...items].sort((left, right) => left.phrase.localeCompare(right.phrase)),
)

export const savedViewResultSchema = rawSavedViewSchema

export const savedViewsResultSchema = collectionSchema(
  rawSavedViewSchema,
).transform((items) =>
  [...items]
    .filter((item) => item.id !== ALL_MENTIONS_VIEW_ID)
    .sort((left, right) => left.position - right.position),
)

export const mentionResultSchema = rawMentionSchema

export const mentionsPageResultSchema = z
  .object({
    continueCursor: z.string().trim().min(1).optional().nullable(),
    feedState: z
      .enum(["active", "paused", "setup_required", "usage_limited"])
      .optional(),
    isDone: z.boolean().optional(),
    items: z.array(rawMentionSchema).optional(),
    monitoringState: z
      .enum(["active", "paused", "setup_required", "usage_limited"])
      .optional(),
    nextCursor: z.string().trim().min(1).optional().nullable(),
    page: z.array(rawMentionSchema).optional(),
    totalCount: z.number().int().nonnegative().optional(),
  })
  .passthrough()
  .transform((value) => {
    const nextCursor = value.nextCursor ?? value.continueCursor ?? null
    return {
      items: value.items ?? value.page ?? [],
      nextCursor,
      isDone: value.isDone ?? nextCursor === null,
      monitoringState: value.monitoringState ?? value.feedState ?? "active",
      ...(value.totalCount !== undefined
        ? { totalCount: value.totalCount }
        : {}),
    }
  })

export type MentionCategory = z.infer<typeof rawCategorySchema>
export type MentionKeyword = z.infer<typeof rawKeywordSchema>
export type MentionItem = z.infer<typeof rawMentionSchema>
export type MentionsPageResult = z.infer<typeof mentionsPageResultSchema>
export type SavedView = z.infer<typeof rawSavedViewSchema>

export const EMPTY_MENTION_FILTERS: MentionFilters = {}

export type OptimisticMentionStatus = {
  base: MentionStatus
  target: MentionStatus
}

export function visibleMentionStatus(
  serverStatus: MentionStatus,
  optimistic: OptimisticMentionStatus | undefined,
): MentionStatus {
  if (!optimistic || serverStatus !== optimistic.base) {
    return serverStatus
  }

  return optimistic.target
}

export function optimisticStatusHasSettled(
  serverStatus: MentionStatus | undefined,
  optimistic: OptimisticMentionStatus,
): boolean {
  return serverStatus === undefined || serverStatus !== optimistic.base
}

export function compactMentionFilters(filters: MentionFilters): MentionFilters {
  return {
    ...(filters.categoryIds?.length
      ? { categoryIds: filters.categoryIds }
      : {}),
    ...(filters.keywordIds?.length ? { keywordIds: filters.keywordIds } : {}),
    ...(filters.mentionStatuses?.length
      ? { mentionStatuses: filters.mentionStatuses }
      : {}),
    ...(filters.platforms?.length ? { platforms: filters.platforms } : {}),
    ...(filters.publishedAfter !== undefined
      ? { publishedAfter: filters.publishedAfter }
      : {}),
    ...(filters.publishedBefore !== undefined
      ? { publishedBefore: filters.publishedBefore }
      : {}),
  }
}

export function mentionFilterCount(filters: MentionFilters): number {
  return (
    (filters.categoryIds?.length ?? 0) +
    (filters.keywordIds?.length ?? 0) +
    (filters.mentionStatuses?.length ?? 0) +
    (filters.platforms?.length ?? 0) +
    (filters.publishedAfter !== undefined ||
    filters.publishedBefore !== undefined
      ? 1
      : 0)
  )
}

export function copyMentionFilters(filters: MentionFilters): MentionFilters {
  return {
    ...(filters.categoryIds ? { categoryIds: [...filters.categoryIds] } : {}),
    ...(filters.keywordIds ? { keywordIds: [...filters.keywordIds] } : {}),
    ...(filters.mentionStatuses
      ? { mentionStatuses: [...filters.mentionStatuses] }
      : {}),
    ...(filters.platforms ? { platforms: [...filters.platforms] } : {}),
    ...(filters.publishedAfter !== undefined
      ? { publishedAfter: filters.publishedAfter }
      : {}),
    ...(filters.publishedBefore !== undefined
      ? { publishedBefore: filters.publishedBefore }
      : {}),
  }
}

export function toggleFilterValue<T extends string>(
  values: T[] | undefined,
  value: T,
): T[] | undefined {
  const current = values ?? []
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
  return next.length ? next : undefined
}

export function setMentionFilterValues<
  Key extends "categoryIds" | "keywordIds" | "mentionStatuses" | "platforms",
>(
  filters: MentionFilters,
  key: Key,
  values: MentionFilters[Key] | undefined,
): MentionFilters {
  const next = copyMentionFilters(filters)
  if (values?.length) {
    Object.assign(next, { [key]: values })
  } else {
    delete next[key]
  }
  return next
}

export type { MentionFilters, MentionSort, MentionStatus, Platform }
