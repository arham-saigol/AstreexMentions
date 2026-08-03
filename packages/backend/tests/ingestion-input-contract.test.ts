import { describe, expect, it } from "vitest"

import { assertPersistableSavedViewName } from "../convex/lib/customerInputContract"
import { buildMentionRediscoveryPatch } from "../convex/lib/mentionIngestion"

describe("customer input contract", () => {
  it("keeps All Mentions synthetic instead of storing it as a saved view", () => {
    expect(assertPersistableSavedViewName("Important bugs")).toBe(
      "Important bugs",
    )
    expect(() => assertPersistableSavedViewName(" all mentions ")).toThrowError(
      "synthetic view",
    )
  })
})

describe("mention rediscovery", () => {
  it("builds a patch containing metrics and timestamps only", () => {
    expect(
      buildMentionRediscoveryPatch(
        {
          commentCount: 4,
          engagementScore: 20,
          likeCount: 10,
          replyCount: 2,
        },
        200,
      ),
    ).toEqual({
      commentCount: 4,
      engagementScore: 20,
      lastMatchedAt: 200,
      likeCount: 10,
      replyCount: 2,
      updatedAt: 200,
    })
  })
})
