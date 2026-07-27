import { describe, expect, it } from "vitest"

import {
  accountDeletionReadinessSchema,
  accountDeletionResponseSchema,
  settingsCategoriesResultSchema,
} from "./settings-convex"

const otherCategory = {
  id: "category_other",
  colorToken: "gray",
  description: "Fallback category",
  enabled: true,
  isSystem: true,
  name: "Other",
  sortOrder: 99,
  systemKey: "other",
}

describe("settings category contracts", () => {
  it("accepts one enabled immutable Other category", () => {
    const result = settingsCategoriesResultSchema.safeParse([otherCategory])

    expect(result.success).toBe(true)
  })

  it("rejects missing, disabled, renamed, or custom Other categories", () => {
    expect(settingsCategoriesResultSchema.safeParse([]).success).toBe(false)
    expect(
      settingsCategoriesResultSchema.safeParse([
        { ...otherCategory, enabled: false },
      ]).success,
    ).toBe(false)
    expect(
      settingsCategoriesResultSchema.safeParse([
        { ...otherCategory, name: "Miscellaneous" },
      ]).success,
    ).toBe(false)
    expect(
      settingsCategoriesResultSchema.safeParse([
        { ...otherCategory, isSystem: false },
      ]).success,
    ).toBe(false)
    expect(
      settingsCategoriesResultSchema.safeParse([
        otherCategory,
        { ...otherCategory, id: "category_other_duplicate" },
      ]).success,
    ).toBe(false)
  })
})

describe("settings account deletion states", () => {
  it.each([
    { state: "available" },
    {
      code: "ACCOUNT_DELETION_IN_PROGRESS",
      deletionJobId: "job_running",
      message: "Deletion is running.",
      state: "in_progress",
      status: "running",
    },
    {
      code: "BILLING_PORTAL_REQUIRED",
      deletionJobId: "job_billing",
      message: "Cancel billing first.",
      state: "portal_required",
    },
    {
      code: "DELETION_REVIEW_REQUIRED",
      deletionJobId: "job_legacy",
      message: "Operator review is required.",
      state: "support_required",
    },
  ])("accepts the $state readiness state", (value) => {
    expect(accountDeletionReadinessSchema.safeParse(value).success).toBe(true)
  })

  it("accepts request acknowledgement but never a completed-erasure claim", () => {
    expect(
      accountDeletionResponseSchema.safeParse({
        code: "ACCOUNT_DELETION_ACCEPTED",
        deleted: false,
        deletionJobId: "job_accepted",
        message: "Accepted.",
        state: "accepted",
      }).success,
    ).toBe(true)
    expect(
      accountDeletionResponseSchema.safeParse({
        code: "ACCOUNT_DELETION_ACCEPTED",
        deleted: true,
        deletionJobId: "job_accepted",
        message: "Deleted.",
        state: "accepted",
      }).success,
    ).toBe(false)
  })
})
