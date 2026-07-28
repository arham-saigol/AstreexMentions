import { describe, expect, it } from "vitest"

import {
  categoryListResultSchema,
  checkoutResultSchema,
  keywordListResultSchema,
} from "./onboarding-convex"

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

describe("onboarding category contracts", () => {
  it("requires an enabled immutable Other category", () => {
    expect(categoryListResultSchema.safeParse([otherCategory]).success).toBe(
      true,
    )
    expect(categoryListResultSchema.safeParse([]).success).toBe(false)
    expect(
      categoryListResultSchema.safeParse([{ ...otherCategory, enabled: false }])
        .success,
    ).toBe(false)
    expect(
      categoryListResultSchema.safeParse([
        { ...otherCategory, name: "Miscellaneous" },
      ]).success,
    ).toBe(false)
    expect(
      categoryListResultSchema.safeParse([
        otherCategory,
        { ...otherCategory, id: "category_other_duplicate" },
      ]).success,
    ).toBe(false)
  })

  it("rejects server keywords without a selected platform", () => {
    expect(
      keywordListResultSchema.safeParse([
        {
          id: "keyword_1",
          phrase: "Astreex",
          platforms: [],
          status: "active",
        },
      ]).success,
    ).toBe(false)
  })

  it("rejects non-HTTPS checkout redirects", () => {
    expect(
      checkoutResultSchema.safeParse({
        checkoutId: "checkout_unsafe",
        reused: false,
        state: "configured",
        status: "pending",
        url: "javascript:alert(document.domain)",
      }).success,
    ).toBe(false)
  })
})
