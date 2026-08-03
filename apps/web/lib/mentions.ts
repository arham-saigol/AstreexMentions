import type { api } from "@astreex/backend/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

export type MentionFilters = NonNullable<
  FunctionArgs<typeof api.mentions.listMentions>["filters"]
>
export type MentionSort = NonNullable<
  FunctionArgs<typeof api.mentions.listMentions>["sort"]
>
export type MentionStatus = FunctionArgs<
  typeof api.mentions.updateMentionStatus
>["status"]
export type Platform = NonNullable<MentionFilters["platforms"]>[number]
export type MentionCategory = FunctionReturnType<
  typeof api.categories.listCategories
>[number]
export type MentionKeyword = FunctionReturnType<
  typeof api.keywords.listKeywords
>[number]
export type MentionItem = FunctionReturnType<
  typeof api.mentions.listMentions
>["items"][number]
export type MentionsPageResult = FunctionReturnType<
  typeof api.mentions.listMentions
>
export type SavedView = FunctionReturnType<
  typeof api.savedViews.listSavedViews
>[number]

export const ALL_MENTIONS_VIEW_ID = "all-mentions"

export function nextSparseMentionCursor(input: {
  filtered: boolean
  itemCount: number
  nextCursor?: string | null | undefined
}): string | undefined {
  if (!input.filtered || input.itemCount > 0) {
    return undefined
  }
  const cursor = input.nextCursor?.trim()
  return cursor ? cursor : undefined
}

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
