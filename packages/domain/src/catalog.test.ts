import { describe, expect, it } from "vitest"

import { PLAN_DEFINITIONS, PLANS, PLATFORMS, platformSchema } from "./index"

describe("product catalogs", () => {
  it("defines the supported platforms", () => {
    expect(PLATFORMS).toEqual(["x", "reddit", "hacker_news"])
    expect(platformSchema.parse("x")).toBe("x")
    expect(() => platformSchema.parse("twitter")).toThrow()
  })

  it("defines the shipped plans", () => {
    expect(PLAN_DEFINITIONS).toEqual([
      {
        id: "starter",
        keywordLimit: 3,
        monthlyMentionLimit: 2_000,
        name: "Starter",
        priceUsd: 19,
      },
      {
        id: "growth",
        keywordLimit: 6,
        monthlyMentionLimit: 20_000,
        name: "Growth",
        priceUsd: 99,
      },
      {
        id: "scale",
        keywordLimit: 10,
        monthlyMentionLimit: 50_000,
        name: "Scale",
        priceUsd: 199,
      },
    ])
    expect(PLANS).toEqual(
      Object.fromEntries(PLAN_DEFINITIONS.map((plan) => [plan.id, plan])),
    )
  })
})
