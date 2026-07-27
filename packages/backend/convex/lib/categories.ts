export const CATEGORY_SYSTEM_KEYS = [
  "question",
  "complaint",
  "praise",
  "bug",
  "feature_request",
  "competitor_mention",
  "other",
] as const

export type CategorySystemKey = (typeof CATEGORY_SYSTEM_KEYS)[number]
export type CategoryColorToken =
  | "blue"
  | "orange"
  | "green"
  | "red"
  | "purple"
  | "yellow"
  | "gray"
  | "pink"
  | "cyan"
  | "slate"

export type CategoryPolicyRecord = {
  deletedAt?: number | undefined
  enabled: boolean
  isSystem: boolean
  name: string
  systemKey?: CategorySystemKey | undefined
}

export const DEFAULT_CATEGORIES = [
  {
    colorToken: "blue",
    description: "Questions and requests for help",
    enabled: true,
    isSystem: true,
    name: "Question",
    sortOrder: 0,
    systemKey: "question",
  },
  {
    colorToken: "orange",
    description: "Negative feedback and customer frustrations",
    enabled: true,
    isSystem: true,
    name: "Complaint",
    sortOrder: 1,
    systemKey: "complaint",
  },
  {
    colorToken: "green",
    description: "Positive feedback and recommendations",
    enabled: true,
    isSystem: true,
    name: "Praise",
    sortOrder: 2,
    systemKey: "praise",
  },
  {
    colorToken: "red",
    description: "Defects, failures, and broken behavior",
    enabled: true,
    isSystem: true,
    name: "Bug",
    sortOrder: 3,
    systemKey: "bug",
  },
  {
    colorToken: "purple",
    description: "Requests for new or improved functionality",
    enabled: true,
    isSystem: true,
    name: "Feature Request",
    sortOrder: 4,
    systemKey: "feature_request",
  },
  {
    colorToken: "yellow",
    description: "Comparisons with or references to competitors",
    enabled: true,
    isSystem: true,
    name: "Competitor Mention",
    sortOrder: 5,
    systemKey: "competitor_mention",
  },
  {
    colorToken: "gray",
    description: "Mentions that do not fit another enabled category",
    enabled: true,
    isSystem: true,
    name: "Other",
    sortOrder: 6,
    systemKey: "other",
  },
] as const satisfies readonly (CategoryPolicyRecord & {
  colorToken: CategoryColorToken
  description: string
  sortOrder: number
  systemKey: CategorySystemKey
})[]

/** Default display names only; workspace category names remain flexible strings. */
export const MENTION_CATEGORIES = DEFAULT_CATEGORIES.map(({ name }) => name)
export type MentionCategory = string

export class CategoryInvariantError extends Error {
  readonly code:
    | "INVALID_CATEGORY"
    | "OTHER_CATEGORY_REQUIRED"
    | "OTHER_CATEGORY_IMMUTABLE"
    | "SYSTEM_CATEGORY_DELETE_FORBIDDEN"
    | "SYSTEM_CATEGORY_METADATA_INVALID"

  constructor(code: CategoryInvariantError["code"], message: string) {
    super(message)
    this.name = "CategoryInvariantError"
    this.code = code
  }
}

export function normalizeCategoryName(value: string): string {
  return value.trim().toLocaleLowerCase("en")
}

export function isMentionCategory(value: unknown): value is string {
  return typeof value === "string" && normalizeCategoryName(value).length > 0
}

export function requireMentionCategory(value: unknown): MentionCategory {
  if (!isMentionCategory(value)) {
    throw new CategoryInvariantError(
      "INVALID_CATEGORY",
      "Category name must be a non-empty string",
    )
  }

  return value.trim()
}

export function isCategorySystemKey(
  value: unknown,
): value is CategorySystemKey {
  return (
    typeof value === "string" &&
    (CATEGORY_SYSTEM_KEYS as readonly string[]).includes(value)
  )
}

/**
 * Validates policy metadata without freezing display names or rejecting custom
 * categories. The stable `other` system key, not its mutable display label, is
 * what identifies the mandatory fallback.
 */
export function assertCategoryCatalog(
  categories: readonly CategoryPolicyRecord[],
): void {
  let activeOtherCount = 0

  for (const category of categories) {
    requireMentionCategory(category.name)

    if (category.isSystem) {
      if (!isCategorySystemKey(category.systemKey)) {
        throw new CategoryInvariantError(
          "SYSTEM_CATEGORY_METADATA_INVALID",
          "System categories require a recognized system key",
        )
      }

      if (category.deletedAt !== undefined) {
        throw new CategoryInvariantError(
          "SYSTEM_CATEGORY_DELETE_FORBIDDEN",
          "System categories cannot be deleted",
        )
      }

      if (category.systemKey === "other") {
        activeOtherCount += 1
        if (category.name !== "Other" || !category.enabled) {
          throw new CategoryInvariantError(
            "OTHER_CATEGORY_IMMUTABLE",
            "Other cannot be renamed or disabled",
          )
        }
      }
    } else if (category.systemKey !== undefined) {
      throw new CategoryInvariantError(
        "SYSTEM_CATEGORY_METADATA_INVALID",
        "Custom categories cannot use a system key",
      )
    }
  }

  if (activeOtherCount !== 1) {
    throw new CategoryInvariantError(
      "OTHER_CATEGORY_REQUIRED",
      "Exactly one enabled Other system category is required",
    )
  }
}

export function assertCategoryDeletionAllowed(
  category: CategoryPolicyRecord,
): void {
  if (!category.isSystem) {
    return
  }

  if (category.systemKey === "other") {
    throw new CategoryInvariantError(
      "OTHER_CATEGORY_IMMUTABLE",
      "Other cannot be deleted",
    )
  }

  throw new CategoryInvariantError(
    "SYSTEM_CATEGORY_DELETE_FORBIDDEN",
    "Default categories cannot be deleted",
  )
}

export function assertCategoryUpdateAllowed(
  category: CategoryPolicyRecord,
  patch: {
    deletedAt?: number | undefined
    enabled?: boolean | undefined
    name?: string | undefined
  },
): void {
  if (patch.name !== undefined) {
    requireMentionCategory(patch.name)
  }

  if (patch.deletedAt !== undefined) {
    assertCategoryDeletionAllowed(category)
  }

  if (
    category.isSystem &&
    category.systemKey === "other" &&
    ((patch.name !== undefined && patch.name !== "Other") ||
      patch.enabled === false)
  ) {
    throw new CategoryInvariantError(
      "OTHER_CATEGORY_IMMUTABLE",
      "Other cannot be renamed or disabled",
    )
  }
}
