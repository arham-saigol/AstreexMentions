import { describe, expect, it } from "vitest"

import {
  DEFAULT_CATEGORIES,
  MENTION_CATEGORIES,
  MENTION_SORTS,
  MENTION_STATUSES,
  PLAN_DEFINITIONS,
  PLANS,
  PLATFORMS,
  assertDefaultCategoryCatalog,
  getDefaultCategory,
  isMentionCategory,
  isMentionSort,
  isMentionStatus,
  isPermanentCategory,
  isPlatform,
  isWithinPlanKeywordLimit,
  isWithinPlanMentionLimit,
  mentionCategorySchema,
  mentionSortSchema,
  mentionStatusSchema,
  platformSchema,
} from "./index"

describe("product enums", () => {
  it("exposes only the supported platform, status, and sort values", () => {
    expect(PLATFORMS).toEqual(["x", "reddit", "hacker_news"])
    expect(MENTION_STATUSES).toEqual(["new", "saved", "dismissed"])
    expect(MENTION_SORTS).toEqual(["newest", "oldest", "most_engaged"])
    expect(platformSchema.parse("x")).toBe("x")
    expect(mentionStatusSchema.parse("saved")).toBe("saved")
    expect(mentionSortSchema.parse("most_engaged")).toBe("most_engaged")
    expect(() => platformSchema.parse("twitter")).toThrow()
    expect(() => mentionStatusSchema.parse("archived")).toThrow()
    expect(() => mentionSortSchema.parse("popular")).toThrow()
    expect(isPlatform("reddit")).toBe(true)
    expect(isPlatform("threads")).toBe(false)
    expect(isMentionStatus("new")).toBe(true)
    expect(isMentionStatus(null)).toBe(false)
    expect(isMentionSort("oldest")).toBe(true)
    expect(isMentionSort("engaged")).toBe(false)
  })
})

describe("plans", () => {
  it("matches the product prices and limits", () => {
    expect(PLAN_DEFINITIONS).toEqual([
      {
        id: "starter",
        name: "Starter",
        priceUsd: 19,
        monthlyMentionLimit: 2_000,
        keywordLimit: 3,
      },
      {
        id: "growth",
        name: "Growth",
        priceUsd: 99,
        monthlyMentionLimit: 20_000,
        keywordLimit: 6,
      },
      {
        id: "scale",
        name: "Scale",
        priceUsd: 199,
        monthlyMentionLimit: 50_000,
        keywordLimit: 10,
      },
    ])
  })

  it("checks inclusive plan limits and rejects invalid counts", () => {
    expect(isWithinPlanMentionLimit("starter", 2_000)).toBe(true)
    expect(isWithinPlanMentionLimit("starter", 2_001)).toBe(false)
    expect(isWithinPlanKeywordLimit("scale", 10)).toBe(true)
    expect(isWithinPlanKeywordLimit("scale", 11)).toBe(false)
    expect(isWithinPlanKeywordLimit("growth", -1)).toBe(false)
    expect(Object.isFrozen(PLANS)).toBe(true)
  })
})

describe("default categories", () => {
  it("keeps the fixed taxonomy and permanent Other fallback", () => {
    expect(DEFAULT_CATEGORIES.map(({ name }) => name)).toEqual(
      MENTION_CATEGORIES,
    )
    expect(
      DEFAULT_CATEGORIES.every(({ color }) => /^#[0-9A-F]{6}$/.test(color)),
    ).toBe(true)
    expect(getDefaultCategory("Bug").description).toContain("broken")
    expect(isPermanentCategory("Other")).toBe(true)
    expect(isPermanentCategory("Praise")).toBe(false)
    expect(isMentionCategory("Feature Request")).toBe(true)
    expect(isMentionCategory("Spam")).toBe(false)
    expect(mentionCategorySchema.parse("Other")).toBe("Other")
    expect(() => mentionCategorySchema.parse("Uncategorized")).toThrow()
    expect(() => assertDefaultCategoryCatalog(DEFAULT_CATEGORIES)).not.toThrow()
  })

  it("rejects reordered or incorrectly permanent catalogs", () => {
    const reordered = [...DEFAULT_CATEGORIES].reverse()
    expect(() => assertDefaultCategoryCatalog(reordered)).toThrow()

    const withoutPermanentOther = DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      permanent: false,
    }))
    expect(() => assertDefaultCategoryCatalog(withoutPermanentOther)).toThrow()
  })
})
