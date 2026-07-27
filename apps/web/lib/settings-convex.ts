import { z } from "zod"

const idSchema = z.string().trim().min(1)

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

const categorySchema = z
  .object({
    _id: idSchema.optional(),
    id: idSchema.optional(),
    colorToken: categoryColorTokenSchema,
    description: z.string().trim().max(300),
    enabled: z.boolean(),
    isSystem: z.boolean(),
    name: z.string().trim().min(1).max(80),
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
      (!value.enabled || !value.isSystem || value.name !== "Other")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The Other category must remain a system category named Other and enabled.",
      })
    }
  })
  .transform((value, context) => {
    const id = value.id ?? value._id
    if (!id) {
      context.addIssue({
        code: "custom",
        message: "A category is missing its id.",
      })
      return z.NEVER
    }

    return {
      id,
      colorToken: value.colorToken,
      description: value.description,
      enabled: value.enabled,
      isSystem: value.isSystem,
      name: value.name,
      sortOrder: value.sortOrder ?? Number.MAX_SAFE_INTEGER,
      systemKey: value.systemKey ?? null,
    }
  })

export const settingsCategoriesResultSchema = z
  .union([
    z.array(categorySchema),
    z
      .object({
        categories: z.array(categorySchema).optional(),
        items: z.array(categorySchema).optional(),
      })
      .passthrough()
      .transform((value) => value.categories ?? value.items ?? []),
  ])
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
  .transform((categories) =>
    [...categories].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    ),
  )

export const digestPreferenceSchema = z
  .object({
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
    mentionLimit: z.number().int().positive(),
    minute: z.number().int().min(0).max(59),
    nextRunAt: z.number().finite().nonnegative().optional(),
    timeZone: z.string().trim().min(1).max(120),
  })
  .passthrough()

export const settingsResultSchema = z.union([
  digestPreferenceSchema.transform((digest) => ({ digest })),
  z
    .object({
      digest: digestPreferenceSchema.optional(),
      digestPreferences: digestPreferenceSchema.optional(),
      preference: digestPreferenceSchema.optional(),
    })
    .passthrough()
    .transform((value, context) => {
      const digest = value.digest ?? value.digestPreferences ?? value.preference
      if (!digest) {
        context.addIssue({
          code: "custom",
          message: "Settings data is missing digest preferences.",
        })
        return z.NEVER
      }
      return { digest }
    }),
])

export const billingRedirectResultSchema = z.union([
  z
    .object({
      state: z.literal("configured"),
      url: z
        .string()
        .url()
        .refine((value) => value.startsWith("https://"), {
          message: "Billing redirects must use HTTPS.",
        }),
    })
    .passthrough(),
  z
    .object({
      state: z.literal("provider_unconfigured"),
      missing: z.array(z.string().trim().min(1)).optional(),
    })
    .passthrough(),
])

const accountDeletionAcceptedSchema = z.object({
  code: z.enum(["ACCOUNT_DELETION_ACCEPTED", "ACCOUNT_DELETION_IN_PROGRESS"]),
  deletionJobId: idSchema,
  message: z.string().trim().min(1),
  state: z.enum(["accepted", "in_progress"]),
  status: z.string().trim().min(1).optional(),
})
const accountDeletionPortalRequiredSchema = z.object({
  code: z.literal("BILLING_PORTAL_REQUIRED"),
  deletionJobId: idSchema.optional(),
  message: z.string().trim().min(1),
  state: z.literal("portal_required"),
})
const accountDeletionSupportRequiredSchema = z.object({
  code: z.string().trim().min(1),
  deletionJobId: idSchema.optional(),
  message: z.string().trim().min(1),
  state: z.literal("support_required"),
})

export const accountDeletionReadinessSchema = z.union([
  z.object({ state: z.literal("available") }),
  accountDeletionAcceptedSchema,
  accountDeletionPortalRequiredSchema,
  accountDeletionSupportRequiredSchema,
])

export const accountDeletionResponseSchema = z.union([
  accountDeletionAcceptedSchema.extend({ deleted: z.literal(false) }),
  accountDeletionPortalRequiredSchema.extend({ deleted: z.literal(false) }),
  accountDeletionSupportRequiredSchema.extend({ deleted: z.literal(false) }),
  z.object({
    code: z.string().trim().min(1),
    deleted: z.literal(false),
    message: z.string().trim().min(1),
  }),
])

export type CategoryColorToken = z.infer<typeof categoryColorTokenSchema>
export type DigestPreference = z.infer<typeof digestPreferenceSchema>
export type SettingsCategory = z.infer<typeof categorySchema>
