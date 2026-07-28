import { z } from "zod"

export const PLATFORMS = ["x", "reddit", "hacker_news"] as const
export const platformSchema = z.enum(PLATFORMS)
export type Platform = z.infer<typeof platformSchema>

export const MENTION_STATUSES = ["new", "saved", "dismissed"] as const
export const mentionStatusSchema = z.enum(MENTION_STATUSES)
export type MentionStatus = z.infer<typeof mentionStatusSchema>

export const MENTION_SORTS = ["newest", "oldest", "most_engaged"] as const
export const mentionSortSchema = z.enum(MENTION_SORTS)
export type MentionSort = z.infer<typeof mentionSortSchema>

export const MENTION_CATEGORIES = [
  "Question",
  "Complaint",
  "Praise",
  "Bug",
  "Feature Request",
  "Competitor Mention",
  "Other",
] as const
export const mentionCategorySchema = z.enum(MENTION_CATEGORIES)
export type MentionCategory = z.infer<typeof mentionCategorySchema>

export const PLAN_IDS = ["starter", "growth", "scale"] as const
export const planIdSchema = z.enum(PLAN_IDS)
export type PlanId = z.infer<typeof planIdSchema>

export function isPlatform(value: unknown): value is Platform {
  return platformSchema.safeParse(value).success
}

export function isMentionStatus(value: unknown): value is MentionStatus {
  return mentionStatusSchema.safeParse(value).success
}

export function isMentionSort(value: unknown): value is MentionSort {
  return mentionSortSchema.safeParse(value).success
}

export function isMentionCategory(value: unknown): value is MentionCategory {
  return mentionCategorySchema.safeParse(value).success
}
