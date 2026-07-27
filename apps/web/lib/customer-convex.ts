import { z } from "zod"

import {
  convexActionReference,
  convexMutationReference,
  convexQueryReference,
} from "@/lib/convex"

const idSchema = z.string().trim().min(1)
const optionalTextSchema = z.string().trim().min(1).optional()

const rawUserSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    clerkUserId: optionalTextSchema,
    email: z.string().trim().email().optional(),
    imageUrl: z.string().trim().url().optional(),
    name: optionalTextSchema,
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id ?? value._id

    if (!id) {
      context.addIssue({
        code: "custom",
        message: "Current user data is missing an id.",
      })
      return z.NEVER
    }

    return {
      id,
      ...(value.clerkUserId ? { clerkUserId: value.clerkUserId } : {}),
      ...(value.email ? { email: value.email } : {}),
      ...(value.imageUrl ? { imageUrl: value.imageUrl } : {}),
      ...(value.name ? { name: value.name } : {}),
    }
  })

const rawWorkspaceSchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    kind: z.literal("personal").optional(),
    name: z.string().trim().min(1).max(160),
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.id ?? value._id

    if (!id) {
      context.addIssue({
        code: "custom",
        message: "Current account data is missing an id.",
      })
      return z.NEVER
    }

    return {
      id,
      kind: value.kind ?? ("personal" as const),
      name: value.name,
    }
  })

const membershipSchema = z
  .object({
    role: z.literal("owner"),
  })
  .passthrough()

const onboardingSchema = z
  .object({
    complete: z.boolean().optional(),
    completed: z.boolean().optional(),
    completedAt: z.number().finite().nonnegative().optional(),
    hasKeywords: z.boolean().optional(),
    keywordCount: z.number().int().nonnegative().optional(),
  })
  .passthrough()

const rawCurrentWorkspaceResultSchema = z
  .object({
    user: rawUserSchema.optional(),
    viewer: rawUserSchema.optional(),
    workspace: rawWorkspaceSchema,
    membership: membershipSchema.optional(),
    onboarding: onboardingSchema.optional(),
    onboardingComplete: z.boolean().optional(),
    keywordCount: z.number().int().nonnegative().optional(),
  })
  .passthrough()

export const bootstrapResultSchema = z.object({
  userId: idSchema,
  workspaceId: idSchema,
})

export const currentWorkspaceResultSchema =
  rawCurrentWorkspaceResultSchema.transform((value) => {
    const onboardingComplete =
      value.onboardingComplete ??
      value.onboarding?.complete ??
      value.onboarding?.completed ??
      (value.onboarding?.completedAt !== undefined
        ? true
        : (value.onboarding?.hasKeywords ??
          (value.onboarding?.keywordCount ?? value.keywordCount ?? 0) > 0))

    return {
      membership: value.membership ?? { role: "owner" as const },
      onboardingComplete,
      user: value.user ?? value.viewer ?? null,
      workspace: value.workspace,
    }
  })

const subscriptionSchema = z
  .object({
    cancelAtPeriodEnd: z.boolean(),
    currentPeriodEnd: z.number().finite().nonnegative(),
    currentPeriodStart: z.number().finite().nonnegative(),
    entitlementStatus: z.enum(["active", "inactive"]),
    planId: z.enum(["starter", "growth", "scale"]),
    status: z.string().trim().min(1),
  })
  .passthrough()

const usageSchema = z
  .object({
    keywordLimit: z.number().int().nonnegative(),
    mentionLimit: z.number().int().nonnegative(),
    mentionsUsed: z.number().int().nonnegative(),
    periodEndAt: z.number().finite().nonnegative(),
    periodStartAt: z.number().finite().nonnegative(),
  })
  .passthrough()

export const billingOverviewResultSchema = z
  .object({
    missing: z.array(z.string().trim().min(1)).optional(),
    providerState: z.enum(["configured", "provider_unconfigured"]),
    subscription: subscriptionSchema.nullable(),
    usage: usageSchema.nullable(),
  })
  .passthrough()

export type BootstrapResult = z.infer<typeof bootstrapResultSchema>
export type CurrentWorkspaceResult = z.infer<
  typeof currentWorkspaceResultSchema
>
export type BillingOverviewResult = z.infer<typeof billingOverviewResultSchema>
export type PlanId = "starter" | "growth" | "scale"
export type MentionStatus = "new" | "saved" | "dismissed"
export type MentionSort = "newest" | "oldest" | "most_engaged"
export type Platform = "x" | "reddit" | "hacker_news"

export type MentionFilters = {
  categoryIds?: string[]
  keywordIds?: string[]
  mentionStatuses?: MentionStatus[]
  platforms?: Platform[]
  publishedAfter?: number
  publishedBefore?: number
}

export const customerConvex = {
  users: {
    bootstrapCurrentUser: convexMutationReference<
      Record<string, never>,
      unknown
    >("users:bootstrapCurrentUser"),
    getCurrentUser: convexQueryReference<Record<string, never>, unknown>(
      "users:getCurrentUser",
    ),
    updateCurrentUser: convexMutationReference<
      { imageUrl?: string; name?: string },
      unknown
    >("users:updateCurrentUser"),
  },
  workspaces: {
    getCurrentWorkspace: convexQueryReference<Record<string, never>, unknown>(
      "workspaces:getCurrentWorkspace",
    ),
    updateCurrentWorkspace: convexMutationReference<{ name: string }, unknown>(
      "workspaces:updateCurrentWorkspace",
    ),
    deleteAccount: convexMutationReference<{ confirmation: string }, unknown>(
      "workspaces:deleteAccount",
    ),
    getAccountDeletionReadiness: convexQueryReference<
      Record<string, never>,
      unknown
    >("workspaces:getAccountDeletionReadiness"),
    getAccountDeletionStatus: convexQueryReference<
      Record<string, never>,
      unknown
    >("workspaces:getAccountDeletionStatus"),
  },
  billing: {
    getOverview: convexQueryReference<Record<string, never>, unknown>(
      "billing/customer:getBillingOverview",
    ),
    createCheckout: convexActionReference<
      { idempotencyKey: string; planId: PlanId },
      unknown
    >("billing/customer:createCheckout"),
    createPortal: convexActionReference<Record<string, never>, unknown>(
      "billing/customer:createBillingPortal",
    ),
    upgradeSubscription: convexActionReference<{ planId: PlanId }, unknown>(
      "billing/customer:upgradeSubscription",
    ),
  },
  keywords: {
    list: convexQueryReference<Record<string, never>, unknown>(
      "keywords:listKeywords",
    ),
    getSummary: convexQueryReference<Record<string, never>, unknown>(
      "keywords:getKeywordSummary",
    ),
    create: convexMutationReference<
      { phrase: string; platforms: Platform[] },
      unknown
    >("keywords:createKeyword"),
    update: convexMutationReference<
      { keywordId: string; phrase: string; platforms: Platform[] },
      unknown
    >("keywords:updateKeyword"),
    pause: convexMutationReference<{ keywordId: string }, unknown>(
      "keywords:pauseKeyword",
    ),
    resume: convexMutationReference<{ keywordId: string }, unknown>(
      "keywords:resumeKeyword",
    ),
    remove: convexMutationReference<{ keywordId: string }, unknown>(
      "keywords:deleteKeyword",
    ),
  },
  mentions: {
    list: convexQueryReference<
      {
        cursor?: string
        filters?: MentionFilters
        limit?: number
        query?: string
        sort?: MentionSort
      },
      unknown
    >("mentions:listMentions"),
    get: convexQueryReference<{ mentionId: string }, unknown>(
      "mentions:getMention",
    ),
    updateStatus: convexMutationReference<
      { mentionId: string; status: MentionStatus },
      unknown
    >("mentions:updateMentionStatus"),
  },
  categories: {
    list: convexQueryReference<Record<string, never>, unknown>(
      "categories:listCategories",
    ),
    create: convexMutationReference<
      { colorToken: string; description: string; name: string },
      unknown
    >("categories:createCategory"),
    update: convexMutationReference<
      {
        categoryId: string
        colorToken?: string
        description?: string
        enabled?: boolean
        name?: string
      },
      unknown
    >("categories:updateCategory"),
    remove: convexMutationReference<{ categoryId: string }, unknown>(
      "categories:deleteCategory",
    ),
  },
  savedViews: {
    list: convexQueryReference<Record<string, never>, unknown>(
      "savedViews:listSavedViews",
    ),
    create: convexMutationReference<
      {
        filters: MentionFilters
        icon: string
        name: string
        sort: MentionSort
      },
      unknown
    >("savedViews:createSavedView"),
    update: convexMutationReference<
      {
        filters?: MentionFilters
        icon?: string
        name?: string
        savedViewId: string
        sort?: MentionSort
      },
      unknown
    >("savedViews:updateSavedView"),
    reorder: convexMutationReference<{ savedViewIds: string[] }, unknown>(
      "savedViews:reorderSavedViews",
    ),
    remove: convexMutationReference<{ savedViewId: string }, unknown>(
      "savedViews:deleteSavedView",
    ),
  },
  settings: {
    get: convexQueryReference<Record<string, never>, unknown>(
      "settings:getSettings",
    ),
    updateDigest: convexMutationReference<
      {
        enabled: boolean
        hour: number
        mentionLimit: number
        minute: number
        timeZone: string
      },
      unknown
    >("settings:updateDigestPreferences"),
  },
  featureRequests: {
    create: convexMutationReference<
      { description: string; title: string },
      unknown
    >("featureRequests:createFeatureRequest"),
    listMine: convexQueryReference<Record<string, never>, unknown>(
      "featureRequests:listMyFeatureRequests",
    ),
  },
} as const
