import { z } from "zod"

export const PLATFORMS = ["x", "reddit", "hacker_news"] as const
export const platformSchema = z.enum(PLATFORMS)
export type Platform = z.infer<typeof platformSchema>

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
