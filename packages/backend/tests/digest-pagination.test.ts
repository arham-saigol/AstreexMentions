import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { afterEach, describe, expect, it, vi } from "vitest"

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
const dispatchDueDailyDigests = makeFunctionReference<
  "mutation",
  { now?: number },
  { state: string }
>("digest/internal:dispatchDueDailyDigests")
const loadRenderContext = makeFunctionReference<
  "mutation",
  { digestRunId: GenericId<"digestRuns"> },
  { counts?: { total: number }; mentions?: unknown[]; state: string }
>("digest/internal:loadDailyDigestRenderContext")

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("daily digest pagination", () => {
  it("continues immediately after a full digest dispatch batch", async () => {
    const now = Date.parse("2026-07-26T09:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv("APP_URL", "https://app.astreex.test")
    vi.stubEnv("RESEND_FROM_EMAIL", "Astreex <digest@example.test>")
    const t = convexTest({ modules, schema })

    await t.run(async (ctx) => {
      for (let index = 0; index < 65; index += 1) {
        const userId = await ctx.db.insert("users", {
          clerkUserId: `digest-continuation-user-${index}`,
          createdAt: now,
          tokenIdentifier: `issuer|digest-continuation-user-${index}`,
          updatedAt: now,
        })
        const workspaceId = await ctx.db.insert("workspaces", {
          createdAt: now,
          kind: "personal",
          name: `Digest continuation ${index}`,
          normalizedName: `digest continuation ${index}`,
          ownerUserId: userId,
          updatedAt: now,
        })
        await ctx.db.insert("digestPreferences", {
          createdAt: now,
          enabled: true,
          mentionLimit: 5,
          nextRunAt: now,
          timeZone: "UTC",
          updatedAt: now,
          userId,
          workspaceId,
        })
      }
    })

    await t.mutation(dispatchDueDailyDigests, { now })
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()

    const preferences = await t.run(
      async (ctx) => await ctx.db.query("digestPreferences").collect(),
    )
    expect(preferences).toHaveLength(65)
    expect(
      preferences.every((preference) => preference.enabled === false),
    ).toBe(true)
  }, 10_000)

  it("continues immediately while a single digest preference remains overdue across multiple days", async () => {
    const now = Date.parse("2026-07-28T09:00:00.000Z")
    const threeDaysAgo = Date.parse("2026-07-25T09:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv("APP_URL", "https://app.astreex.test")
    vi.stubEnv("RESEND_FROM_EMAIL", "Astreex <digest@example.test>")
    const t = convexTest({ modules, schema })

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "digest-overdue-user",
        createdAt: threeDaysAgo,
        email: "overdue@example.test",
        tokenIdentifier: "issuer|digest-overdue-user",
        updatedAt: threeDaysAgo,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: threeDaysAgo,
        kind: "personal",
        name: "Overdue digest workspace",
        normalizedName: "overdue digest workspace",
        ownerUserId: userId,
        updatedAt: threeDaysAgo,
      })
      await ctx.db.insert("digestPreferences", {
        createdAt: threeDaysAgo,
        enabled: true,
        mentionLimit: 5,
        nextRunAt: threeDaysAgo,
        timeZone: "UTC",
        updatedAt: threeDaysAgo,
        userId,
        workspaceId,
      })
    })

    await t.mutation(dispatchDueDailyDigests, { now })
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()

    const runs = await t.run(
      async (ctx) => await ctx.db.query("digestRuns").collect(),
    )
    expect(runs.length).toBeGreaterThanOrEqual(3)

    const preference = await t.run(
      async (ctx) => await ctx.db.query("digestPreferences").unique(),
    )
    expect(preference!.nextRunAt).toBeGreaterThan(now)
  })

  it("ranks and counts the complete window across bounded pages", async () => {
    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "digest-pagination-user",
        createdAt: 1,
        email: "digest@example.test",
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
        mentionLimit: 5,
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
          feedState: "visible",
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
      for (const [index, feedState] of ["pending", "filtered"].entries()) {
        await ctx.db.insert("mentions", {
          analysisState: feedState === "pending" ? "pending" : "completed",
          body: `Excluded digest mention ${feedState}`,
          canonicalUrl: `https://example.com/excluded/${feedState}`,
          contentType: "post",
          engagementScore: 2_000_000 + index,
          feedState,
          firstSeenAt: 9_500,
          lastMatchedAt: 9_500,
          platform: "reddit",
          publishedAt: 1_500 + index,
          searchText: `excluded ${feedState}`,
          status: "new",
          updatedAt: 9_500,
          workspaceId,
        })
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
      categories: { unanalyzed: 600 },
      platforms: { hacker_news: 0, reddit: 600, x: 0 },
      total: 600,
    })

    const filteredMentionId = run!.mentionIds[0]!
    await t.run(
      async (ctx) =>
        await ctx.db.patch("mentions", filteredMentionId, {
          feedState: "filtered",
        }),
    )
    await expect(
      t.mutation(loadRenderContext, { digestRunId: seeded.digestRunId }),
    ).resolves.toMatchObject({
      counts: { total: 599 },
      mentions: expect.arrayContaining([]),
      state: "ready",
    })
    const refreshedRun = await t.run(
      async (ctx) => await ctx.db.get("digestRuns", seeded.digestRunId),
    )
    expect(refreshedRun).toMatchObject({ mentionCount: 599 })
    expect(refreshedRun?.mentionIds).not.toContain(filteredMentionId)
  }, 10_000)
})
