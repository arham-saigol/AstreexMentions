import { z } from "zod"

import {
  convexActionReference,
  convexMutationReference,
  convexQueryReference,
} from "@/lib/convex"

export const onboardingPlatformSchema = z.enum(["x", "reddit", "hacker_news"])

export const categoryColorTokenSchema = z.enum([
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

const idSchema = z.string().trim().min(1)

const keywordResultSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    keywordId: idSchema.optional(),
    phrase: z.string().trim().min(1),
    platforms: z.array(onboardingPlatformSchema).min(1),
    status: z.enum(["active", "paused", "deleted"]).optional(),
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id ?? value._id ?? value.keywordId
    if (!id) {
      context.addIssue({
        code: "custom",
        message: "Keyword data is missing an id.",
      })
      return z.NEVER
    }

    return {
      id,
      phrase: value.phrase,
      platforms: value.platforms,
      status: value.status ?? ("active" as const),
    }
  })

const rawKeywordListResultSchema = z.union([
  z.array(keywordResultSchema),
  z
    .object({
      items: z.array(keywordResultSchema).optional(),
      keywords: z.array(keywordResultSchema).optional(),
    })
    .passthrough(),
])

export const keywordListResultSchema = rawKeywordListResultSchema.transform(
  (value, context) => {
    if (Array.isArray(value)) {
      return value
    }

    const items = value.items ?? value.keywords
    if (!items) {
      context.addIssue({
        code: "custom",
        message: "Keyword list data does not include items.",
      })
      return z.NEVER
    }

    return items
  },
)

const categoryResultSchema = z
  .object({
    _id: idSchema.optional(),
    categoryId: idSchema.optional(),
    colorToken: categoryColorTokenSchema,
    description: z.string(),
    enabled: z.boolean(),
    id: idSchema.optional(),
    isSystem: z.boolean().optional(),
    name: z.string().trim().min(1),
    sortOrder: z.number().finite().optional(),
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
  .passthrough()
  .superRefine((value, context) => {
    if (
      value.systemKey === "other" &&
      (!value.enabled || value.isSystem === false || value.name !== "Other")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The Other category must remain a system category named Other and enabled.",
      })
    }
  })
  .transform((value, context) => {
    const id = value.id ?? value._id ?? value.categoryId
    if (!id) {
      context.addIssue({
        code: "custom",
        message: "Category data is missing an id.",
      })
      return z.NEVER
    }

    return {
      colorToken: value.colorToken,
      description: value.description,
      enabled: value.enabled,
      id,
      isSystem: value.isSystem ?? Boolean(value.systemKey),
      name: value.name,
      sortOrder: value.sortOrder ?? 0,
      systemKey: value.systemKey,
    }
  })

const rawCategoryListResultSchema = z.union([
  z.array(categoryResultSchema),
  z
    .object({
      categories: z.array(categoryResultSchema).optional(),
      items: z.array(categoryResultSchema).optional(),
    })
    .passthrough(),
])

export const categoryListResultSchema = rawCategoryListResultSchema
  .transform((value, context) => {
    if (Array.isArray(value)) {
      return value
    }

    const items = value.items ?? value.categories
    if (!items) {
      context.addIssue({
        code: "custom",
        message: "Category list data does not include items.",
      })
      return z.NEVER
    }

    return [...items].sort((left, right) => left.sortOrder - right.sortOrder)
  })
  .superRefine((categories, context) => {
    const otherCategories = categories.filter(
      (category) => category.systemKey === "other",
    )
    if (otherCategories.length !== 1) {
      context.addIssue({
        code: "custom",
        message:
          "Category data must contain exactly one required Other category.",
      })
    }
  })

export const checkoutResultSchema = z.discriminatedUnion("state", [
  z
    .object({
      checkoutId: z.string().trim().min(1),
      reused: z.boolean(),
      state: z.literal("configured"),
      status: z.string().trim().min(1),
      url: z.string().url(),
    })
    .passthrough(),
  z
    .object({
      missing: z.array(z.string().trim().min(1)),
      state: z.literal("provider_unconfigured"),
    })
    .passthrough(),
])

export const onboardingConfigurationResultSchema = z.object({
  keywordCount: z.number().int().nonnegative(),
  keywordIds: z.array(idSchema),
  workspaceName: z.string().trim().min(1),
})

export type OnboardingPlatform = z.infer<typeof onboardingPlatformSchema>
export type CategoryColorToken = z.infer<typeof categoryColorTokenSchema>
export type KeywordResult = z.infer<typeof keywordResultSchema>
export type CategoryResult = z.infer<typeof categoryResultSchema>

export const onboardingConvex = {
  billing: {
    createCheckout: convexActionReference<
      {
        idempotencyKey: string
        planId: "starter" | "growth" | "scale"
      },
      unknown
    >("billing/customer:createCheckout"),
    getOverview: convexQueryReference<Record<string, never>, unknown>(
      "billing/customer:getBillingOverview",
    ),
  },
  categories: {
    list: convexQueryReference<Record<string, never>, unknown>(
      "categories:listCategories",
    ),
    update: convexMutationReference<
      {
        categoryId: string
        colorToken?: CategoryColorToken
        description?: string
        enabled?: boolean
        name?: string
      },
      unknown
    >("categories:updateCategory"),
  },
  configuration: {
    save: convexMutationReference<
      {
        categories: Array<{
          categoryId: string
          colorToken: CategoryColorToken
          description: string
          enabled: boolean
        }>
        keywords: Array<{
          phrase: string
          platforms: OnboardingPlatform[]
        }>
        workspaceName: string
      },
      unknown
    >("onboarding:saveOnboardingConfiguration"),
  },
  keywords: {
    create: convexMutationReference<
      { phrase: string; platforms: OnboardingPlatform[] },
      unknown
    >("keywords:createKeyword"),
    list: convexQueryReference<Record<string, never>, unknown>(
      "keywords:listKeywords",
    ),
    remove: convexMutationReference<{ keywordId: string }, unknown>(
      "keywords:deleteKeyword",
    ),
    update: convexMutationReference<
      {
        keywordId: string
        phrase: string
        platforms: OnboardingPlatform[]
      },
      unknown
    >("keywords:updateKeyword"),
  },
  workspaces: {
    update: convexMutationReference<{ name: string }, unknown>(
      "workspaces:updateCurrentWorkspace",
    ),
  },
} as const
