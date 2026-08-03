import { describe, expect, it } from "vitest"

import {
  nextSparseMentionCursor,
  optimisticStatusHasSettled,
  visibleMentionStatus,
} from "./mentions"

describe("mentions view contracts", () => {
  it("advances across an empty bounded scan when filters remain active", () => {
    expect(
      nextSparseMentionCursor({
        filtered: true,
        itemCount: 0,
        nextCursor: "cursor-after-sparse-window",
      }),
    ).toBe("cursor-after-sparse-window")
    expect(
      nextSparseMentionCursor({
        filtered: false,
        itemCount: 0,
        nextCursor: "cursor-after-unfiltered-window",
      }),
    ).toBeUndefined()
    expect(
      nextSparseMentionCursor({
        filtered: true,
        itemCount: 1,
        nextCursor: "cursor-after-match",
      }),
    ).toBeUndefined()
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
