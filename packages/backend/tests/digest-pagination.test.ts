import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { describe, expect, it } from "vitest"

import schema from "../convex/schema"

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./digest/actions.ts": async () => await import("../convex/digest/actions"),
  "./digest/internal.ts": async () => await import("../convex/digest/internal"),
}

const aggregatePage = makeFunctionReference<
  "mutation",
  { digestRunId: GenericId<"digestRuns"> },
  { mentionCount?: number; state: string }
>("digest/internal:aggregateDailyDigestPage")

describe("daily digest pagination", () => {
  it("ranks and counts the complete window across bounded pages", async () => {
    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "digest-pagination-user",
        createdAt: 1,
        tokenIdentifier: "issuer|digest-pagination-user",
        updatedAt: 1,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: 1,
        kind: "personal",
        name: "Digest pagination",
        normalizedName: "digest pagination",
        ownerUserId: userId,
        updatedAt: 1,
      })
      const digestPreferenceId = await ctx.db.insert("digestPreferences", {
        createdAt: 1,
        enabled: true,
        hour: 9,
        mentionLimit: 5,
        minute: 0,
        nextRunAt: 20_000,
        timeZone: "UTC",
        updatedAt: 1,
        userId,
        workspaceId,
      })
      let oldestHighEngagementId: GenericId<"mentions"> | undefined
      for (let index = 0; index < 600; index += 1) {
        const mentionId = await ctx.db.insert("mentions", {
          analysisState: "completed",
          body: `Digest mention ${index}`,
          canonicalUrl: `https://www.reddit.com/r/test/comments/${index}`,
          commentCount: 0,
          contentType: "post",
          engagementScore: index === 0 ? 1_000_000 : index,
          firstSeenAt: 9_000 + index,
          lastMatchedAt: 9_000 + index,
          platform: "reddit",
          publishedAt: 1_000 + index,
          searchText: `digest mention ${index}`,
          status: "new",
          updatedAt: 9_000 + index,
          workspaceId,
        })
        if (index === 0) {
          oldestHighEngagementId = mentionId
        }
      }
      if (!oldestHighEngagementId) {
        throw new TypeError("Oldest digest mention was not seeded")
      }
      const digestRunId = await ctx.db.insert("digestRuns", {
        createdAt: 10_000,
        digestCountsJson: JSON.stringify({
          categories: {},
          platforms: { hacker_news: 0, reddit: 0, x: 0 },
          total: 0,
        }),
        digestPreferenceId,
        idempotencyKey: "digest-pagination",
        localDate: "1970-01-01",
        mentionCount: 0,
        mentionIds: [],
        mentionLimit: 5,
        scheduledFor: 20_000,
        status: "processing",
        updatedAt: 10_000,
        userId,
        windowEndAt: 2_000,
        windowStartAt: 0,
        workspaceId,
      })
      return { digestRunId, oldestHighEngagementId }
    })

    for (let page = 0; page < 10; page += 1) {
      const result = await t.mutation(aggregatePage, {
        digestRunId: seeded.digestRunId,
      })
      if (result.state === "ready") {
        break
      }
    }

    const run = await t.run(
      async (ctx) => await ctx.db.get("digestRuns", seeded.digestRunId),
    )
    expect(run).toMatchObject({ mentionCount: 600 })
    expect(run?.aggregationCompletedAt).toEqual(expect.any(Number))
    expect(run?.mentionIds).toContain(seeded.oldestHighEngagementId)
    expect(JSON.parse(run?.digestCountsJson ?? "")).toEqual({
      categories: { uncategorized: 600 },
      platforms: { hacker_news: 0, reddit: 600, x: 0 },
      total: 600,
    })
  }, 10_000)
})
