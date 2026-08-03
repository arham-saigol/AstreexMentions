import { describe, expect, it } from "vitest"

import { PLAN_DEFINITIONS, PLANS, PLATFORMS, platformSchema } from "./index"

describe("product catalogs", () => {
  it("defines the supported platforms", () => {
    expect(PLATFORMS).toEqual(["x", "reddit", "hacker_news"])
    expect(platformSchema.parse("x")).toBe("x")
    expect(() => platformSchema.parse("twitter")).toThrow()
  })

  it("defines the shipped plans", () => {
    expect(PLAN_DEFINITIONS.map(({ id }) => id)).toEqual([
      "starter",
      "growth",
      "scale",
    ])
    expect(PLANS.starter.monthlyMentionLimit).toBe(2_000)
    expect(PLANS.scale.keywordLimit).toBe(10)
    expect(Object.isFrozen(PLANS)).toBe(true)
  })
})
