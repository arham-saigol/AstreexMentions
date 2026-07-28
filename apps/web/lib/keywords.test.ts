import { describe, expect, it } from "vitest"

import {
  displaySources,
  keywordListResultSchema,
  keywordSummaryResultSchema,
} from "./keywords"

describe("keyword result contracts", () => {
  it("counts one keyword once even when it has several platforms", () => {
    const result = keywordListResultSchema.parse({
      keywords: [
        {
          id: "keyword_1",
          phrase: "Astreex",
          platforms: ["x", "reddit", "hacker_news"],
          status: "active",
        },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.platforms).toEqual(["x", "reddit", "hacker_news"])
    expect(displaySources(result[0]!)).toHaveLength(4)
  })

  it("normalizes source schedule aliases without inventing timestamps", () => {
    const result = keywordListResultSchema.parse([
      {
        _id: "keyword_1",
        phrase: "customer signal",
        platforms: ["reddit"],
        trackingSources: [
          {
            _id: "source_1",
            sourceType: "reddit_posts",
            status: "error",
            lastRunAt: 1_700_000_000_000,
            nextRunAt: 1_700_003_600_000,
            lastError: "Provider unavailable",
          },
        ],
      },
    ])

    expect(result[0]?.sources[0]).toMatchObject({
      id: "source_1",
      lastCheckedAt: 1_700_000_000_000,
      nextExpectedAt: 1_700_003_600_000,
      lastError: "Provider unavailable",
    })
    expect(displaySources(result[0]!)[1]).toMatchObject({
      sourceType: "reddit_comments",
      configuredOnly: true,
      lastCheckedAt: null,
      nextExpectedAt: null,
    })
  })

  it("accepts customer summary aliases while preserving the backend limit", () => {
    const summary = keywordSummaryResultSchema.parse({
      totalCount: 4,
      keywordLimit: 5,
      remainingKeywordSlots: 1,
      canCreateKeyword: true,
      monitoringState: "active",
    })

    expect(summary).toEqual({
      count: 4,
      limit: 5,
      remaining: 1,
      limitReached: false,
      canCreate: true,
      activeCount: null,
      pausedCount: null,
      monitoringState: "active",
    })
  })
})
