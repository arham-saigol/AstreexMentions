import { z } from "zod"

const onboardingPlatformSchema = z.enum(["x", "reddit", "hacker_news"])
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

export const ONBOARDING_STEP_COUNT = 7
export const MAX_DRAFT_KEYWORDS = 10

export const onboardingStepSchema = z.number().int().min(1).max(7)

export const onboardingKeywordDraftSchema = z.object({
  clientId: z.string().trim().min(1),
  kind: z.enum(["own", "other"]),
  phrase: z.string().max(160),
  platforms: z.array(onboardingPlatformSchema),
})

export const onboardingCategoryDraftSchema = z.object({
  colorToken: categoryColorTokenSchema,
  description: z.string().max(300),
  enabled: z.boolean(),
  isSystem: z.boolean(),
  name: z.string().trim().min(1).max(80),
  serverId: z.string().trim().min(1),
  systemKey: z
    .enum([
      "question",
      "complaint",
      "praise",
      "bug",
      "feature_request",
      "competitor_mention",
      "other",
    ])
    .optional(),
})

const pendingCheckoutSchema = z.object({
  checkoutId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(8),
  planId: z.enum(["starter", "growth", "scale"]),
  startedAt: z.number().finite().nonnegative(),
  status: z.string().trim().min(1),
  url: z.string().url().optional(),
})

export const onboardingDraftSchema = z
  .object({
    categories: z.array(onboardingCategoryDraftSchema),
    checkout: pendingCheckoutSchema.optional(),
    configurationSavedAt: z.number().finite().nonnegative().optional(),
    keywords: z.array(onboardingKeywordDraftSchema).max(MAX_DRAFT_KEYWORDS),
    selectedPlan: z.enum(["starter", "growth", "scale"]).nullable(),
    step: onboardingStepSchema,
    version: z.literal(1),
    workspaceName: z.string().max(160),
  })
  .superRefine((draft, context) => {
    if (draft.categories.length === 0) {
      return
    }

    const otherCategories = draft.categories.filter(
      (category) => category.systemKey === "other",
    )
    const other = otherCategories[0]
    if (
      otherCategories.length !== 1 ||
      !other ||
      !other.enabled ||
      !other.isSystem ||
      other.name !== "Other"
    ) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message:
          "The draft must contain one enabled, immutable Other category.",
      })
    }
  })

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>
export type OnboardingKeywordDraft = z.infer<
  typeof onboardingKeywordDraftSchema
>
export type OnboardingCategoryDraft = z.infer<
  typeof onboardingCategoryDraftSchema
>
export type OnboardingStep = z.infer<typeof onboardingStepSchema>

export function createOnboardingDraft(workspaceName: string): OnboardingDraft {
  return {
    categories: [],
    keywords: [],
    selectedPlan: null,
    step: 1,
    version: 1,
    workspaceName,
  }
}

export function normalizeKeywordPhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en")
}

export function draftStorageKey(workspaceId: string): string {
  return `astreex:onboarding:${workspaceId}:v1`
}
