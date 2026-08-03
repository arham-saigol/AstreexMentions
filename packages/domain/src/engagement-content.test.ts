import { describe, expect, it } from "vitest"

import { engagementScore, rankMentionsDeterministically } from "./index"

describe("deterministic engagement ranking", () => {
  it("uses platform-specific product weights", () => {
    expect(
      engagementScore({
        source: "x",
        likes: 10,
        replies: 2,
        quotes: 1,
        reposts: 3,
      }),
    ).toBe(31)
    expect(engagementScore({ source: "reddit", score: 10, comments: 2 })).toBe(
      16,
    )
    expect(
      engagementScore({ source: "hacker_news", points: 10, comments: 2 }),
    ).toBe(16)
    expect(
      engagementScore({ source: "reddit", score: -5, comments: 1.9 }),
    ).toBe(3)
  })

  it("ranks by score, interactions, recency, source, and stable id", () => {
    const mentions = [
      {
        stableId: "b",
        publishedAt: 100,
        engagement: { source: "reddit", score: 10, comments: 0 } as const,
      },
      {
        stableId: "a",
        publishedAt: 100,
        engagement: {
          source: "hacker_news",
          points: 7,
          comments: 1,
        } as const,
      },
      {
        stableId: "top",
        publishedAt: 50,
        engagement: { source: "reddit", score: 11, comments: 0 } as const,
      },
      {
        stableId: "newer",
        publishedAt: 101,
        engagement: { source: "reddit", score: 10, comments: 0 } as const,
      },
    ]
    const ranked = rankMentionsDeterministically(mentions)
    expect(ranked.map(({ stableId }) => stableId)).toEqual([
      "top",
      "a",
      "newer",
      "b",
    ])
    expect(ranked.map(({ rank }) => rank)).toEqual([1, 2, 3, 4])
    expect(ranked.map(({ engagementScore: score }) => score)).toEqual([
      11, 10, 10, 10,
    ])
    expect(mentions.map(({ stableId }) => stableId)).toEqual([
      "b",
      "a",
      "top",
      "newer",
    ])
    expect(rankMentionsDeterministically(mentions, 2)).toHaveLength(2)
  })

  it("rejects unstable ranking inputs", () => {
    expect(() =>
      rankMentionsDeterministically([
        {
          stableId: "",
          publishedAt: 1,
          engagement: { source: "reddit", score: 1, comments: 0 },
        },
      ]),
    ).toThrow(TypeError)
    expect(() => rankMentionsDeterministically([], -1)).toThrow(RangeError)
  })
})
