import { describe, expect, it } from "vitest"

import {
  optimisticStatusHasSettled,
  savedViewsResultSchema,
  visibleMentionStatus,
} from "./mentions"

describe("mentions view contracts", () => {
  it("keeps the synthetic All Mentions view out of custom saved views", () => {
    const result = savedViewsResultSchema.parse([
      {
        id: "all-mentions",
        filters: {},
        icon: "funnel",
        name: "All Mentions",
        position: 0,
        sort: "newest",
      },
      {
        id: "saved_view_1",
        filters: { platforms: ["reddit"] },
        icon: "funnel",
        name: "Reddit",
        position: 1,
        sort: "newest",
      },
    ])

    expect(result.map((view) => view.id)).toEqual(["saved_view_1"])
  })

  it("holds an optimistic status until the server result catches up", () => {
    const optimistic = { base: "new" as const, target: "saved" as const }

    expect(visibleMentionStatus("new", optimistic)).toBe("saved")
    expect(optimisticStatusHasSettled("new", optimistic)).toBe(false)
    expect(optimisticStatusHasSettled("saved", optimistic)).toBe(true)
    expect(visibleMentionStatus("saved", optimistic)).toBe("saved")
  })

  it("settles optimistic state when a filtered result leaves the page", () => {
    const optimistic = { base: "new" as const, target: "dismissed" as const }

    expect(optimisticStatusHasSettled(undefined, optimistic)).toBe(true)
  })
})
