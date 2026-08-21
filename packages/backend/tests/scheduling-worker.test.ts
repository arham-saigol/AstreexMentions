import { readFileSync } from "node:fs"

import { convexTest } from "convex-test"
import { defineSchema, defineTable, makeFunctionReference } from "convex/server"
import { type GenericId, v } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createAlgoliaHackerNewsAdapter } from "../convex/integrations/providers/algoliaHackerNews"
import schema from "../convex/schema"

const NOW = Date.parse("2026-07-26T12:00:00.000Z")
const LEASE_EXPIRES_AT = NOW + 60_000
const LEASE_TOKEN = "tracking:hacker-news-fixture:1"
const modules = {
  "./_generated/server.ts": async () => ({}),
  "./scheduling/actions.ts": async () =>
    await import("../convex/scheduling/actions"),
  "./scheduling/internal.ts": async () =>
    await import("../convex/scheduling/internal"),
}

const dispatchTrackingSources = makeFunctionReference<
  "mutation",
  { now?: number },
  {
    circuits: Record<string, "closed" | "open">
    claims: Record<string, number>
    state: string
  }
>("scheduling/internal:dispatchDueTrackingSources")

const executeTrackingSource = makeFunctionReference<
  "action",
  {
    leaseExpiresAt: number
    leaseToken: string
    leaseVersion: number
    trackingSourceId: GenericId<"trackingSources">
  },
  unknown
>("scheduling/actions:executeTrackingSource")

type SeededTrackingSource = {
  trackingSourceId: GenericId<"trackingSources">
  workspaceId: GenericId<"workspaces">
}

function createSchedulingHarness() {
  const t = convexTest({ modules, schema })

  return {
    async commitProviderPage(seeded: SeededTrackingSource, resultJson: string) {
      await t.run(async (ctx) => {
        await ctx.db.insert("providerRuns", {
          attempt: 1,
          createdAt: NOW - 1_000,
          idempotencyKey: `tracking:${String(seeded.trackingSourceId)}:1`,
          inputCount: 1,
          operation: "search_by_date",
          outputCount: 0,
          provider: "hacker_news",
          startedAt: NOW - 1_000,
          status: "running",
          trackingSourceId: seeded.trackingSourceId,
          trigger: "scheduled",
          updatedAt: NOW - 1_000,
          workspaceId: seeded.workspaceId,
        })
        await ctx.db.insert("trackingProviderPages", {
          batchIndex: 0,
          createdAt: NOW - 500,
          durationMs: 25,
          finalize: true,
          generation: 1,
          providerOutputCount: 2,
          providerQuery: "Astreex",
          ready: true,
          resultJson,
          startPosition: 0,
          trackingSourceId: seeded.trackingSourceId,
          updatedAt: NOW - 500,
          workspaceId: seeded.workspaceId,
        })
      })
    },
    async readPersistedState(seeded: SeededTrackingSource) {
      return await t.run(async (ctx) => ({
        jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
        matches: await ctx.db.query("mentionKeywordMatches").collect(),
        mentions: await ctx.db.query("mentions").collect(),
        pages: await ctx.db.query("trackingProviderPages").collect(),
        runs: await ctx.db.query("providerRuns").collect(),
        source: await ctx.db.get("trackingSources", seeded.trackingSourceId),
        grant: await ctx.db
          .query("freeEvaluationGrants")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", seeded.workspaceId),
          )
          .unique(),
        usage: await ctx.db
          .query("usageCycles")
          .withIndex("by_workspace_status_and_period_end", (q) =>
            q.eq("workspaceId", seeded.workspaceId).eq("status", "open"),
          )
          .unique(),
      }))
    },
    async seedLeasedHackerNewsSource(
      access: "free" | "paid" = "paid",
      providerQuery = "Astreex",
    ) {
      return await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          clerkUserId: "user_scheduling_worker",
          createdAt: NOW - 10_000,
          tokenIdentifier: "issuer|user_scheduling_worker",
          updatedAt: NOW - 10_000,
        })
        const workspaceId = await ctx.db.insert("workspaces", {
          createdAt: NOW - 9_000,
          kind: "personal",
          name: "Scheduling worker fixture",
          normalizedName: "scheduling worker fixture",
          ownerUserId: userId,
          updatedAt: NOW - 9_000,
        })
        const keywordId = await ctx.db.insert("keywords", {
          createdAt: NOW - 8_000,
          createdByUserId: userId,
          normalizedPhrase: "astreex",
          phrase: "Astreex",
          platforms: ["hacker_news"],
          status: "active",
          updatedAt: NOW - 8_000,
          workspaceId,
        })
        if (access === "free") {
          await ctx.db.insert("freeEvaluationGrants", {
            activatedAt: NOW - 7_000,
            createdAt: NOW - 7_000,
            mentionLimit: 100,
            mentionsUsed: 0,
            updatedAt: NOW - 7_000,
            workspaceId,
          })
        } else {
          const subscriptionId = await ctx.db.insert("subscriptions", {
            cancelAtPeriodEnd: false,
            createdAt: NOW - 7_000,
            currentPeriodEnd: NOW + 30 * 24 * 60 * 60_000,
            currentPeriodStart: NOW - 60_000,
            entitlementStatus: "active",
            lastSyncedAt: NOW - 7_000,
            planId: "growth",
            provider: "creem",
            providerCustomerId: "customer_scheduling_worker",
            providerSubscriptionId: "subscription_scheduling_worker",
            status: "active",
            updatedAt: NOW - 7_000,
            workspaceId,
          })
          await ctx.db.insert("usageCycles", {
            createdAt: NOW - 6_000,
            idempotencyKey: "usage:scheduling-worker",
            keywordLimit: 6,
            mentionLimit: 100,
            mentionsUsed: 0,
            periodEndAt: NOW + 30 * 24 * 60 * 60_000,
            periodStartAt: NOW - 60_000,
            planSnapshot: {
              keywordLimit: 6,
              mentionLimit: 100,
              planId: "growth",
            },
            status: "open",
            subscriptionId,
            updatedAt: NOW - 6_000,
            workspaceId,
          })
        }
        const trackingSourceId = await ctx.db.insert("trackingSources", {
          backoffMs: 0,
          checkpointVersion: 0,
          consecutiveFailures: 0,
          createdAt: NOW - 5_000,
          inProgressWindowEndAt: NOW,
          inProgressWindowStartAt: NOW - 4 * 60 * 60_000,
          intervalMs: 10 * 60_000,
          keywordId,
          leaseExpiresAt: LEASE_EXPIRES_AT,
          leaseToken: LEASE_TOKEN,
          leaseVersion: 1,
          nextRunAt: NOW,
          providerQuery,
          sourceType: "hacker_news",
          status: "active",
          totalFailures: 0,
          updatedAt: NOW - 5_000,
          workspaceId,
        })

        return { trackingSourceId, workspaceId }
      })
    },
    t,
  }
}

const actionArguments = (seeded: SeededTrackingSource) => ({
  leaseExpiresAt: LEASE_EXPIRES_AT,
  leaseToken: LEASE_TOKEN,
  leaseVersion: 1,
  trackingSourceId: seeded.trackingSourceId,
})

const providerResponse = readFileSync(
  new URL("./fixtures/providers/algolia-hn-search.json", import.meta.url),
  "utf8",
)

async function normalizedProviderResultJson(): Promise<string> {
  const adapter = createAlgoliaHackerNewsAdapter({
    fetch: async () => Response.json(JSON.parse(providerResponse) as unknown),
  })
  const result = await adapter.search({
    hitsPerPage: 100,
    page: 0,
    query: "Astreex",
    tags: "(story,comment)",
  })
  return JSON.stringify(result)
}

function expectCompletedIngestion(
  persisted: Awaited<
    ReturnType<ReturnType<typeof createSchedulingHarness>["readPersistedState"]>
  >,
): void {
  expect(persisted.mentions).toHaveLength(2)
  expect(
    persisted.mentions.map(({ canonicalUrl }) => canonicalUrl).sort(),
  ).toEqual([
    "https://news.ycombinator.com/item?id=49000001",
    "https://news.ycombinator.com/item?id=49000002",
  ])
  expect(persisted.matches).toHaveLength(2)
  expect(persisted.jobs).toHaveLength(2)
  expect(persisted.pages).toEqual([])
  expect(persisted.usage?.mentionsUsed).toBe(2)
  expect(persisted.runs).toEqual([
    expect.objectContaining({
      inputCount: 1,
      outputCount: 2,
      provider: "hacker_news",
      status: "succeeded",
    }),
  ])
  expect(persisted.source).toMatchObject({
    checkpointVersion: 1,
    inProgressPage: 1,
    status: "active",
  })
  expect(persisted.source).not.toHaveProperty("leaseToken")
  expect(persisted.source).not.toHaveProperty("leaseExpiresAt")
}

let previousFromEmail: string | undefined

beforeEach(() => {
  previousFromEmail = process.env.RESEND_FROM_EMAIL
  process.env.RESEND_FROM_EMAIL = "Astreex <notifications@example.com>"
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  if (previousFromEmail === undefined) {
    delete process.env.RESEND_FROM_EMAIL
  } else {
    process.env.RESEND_FROM_EMAIL = previousFromEmail
  }
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("durable tracking action", () => {
  it("skips provider telemetry reads when no tracking source is due", async () => {
    const idleSchema = defineSchema({
      trackingSources: defineTable(v.any()).index(
        "by_source_type_status_and_next_run_at",
        ["sourceType", "status", "nextRunAt"],
      ),
    })
    const t = convexTest({
      modules: {
        "./_generated/server.ts": async () => ({}),
        "./scheduling/internal.ts": async () =>
          await import("../convex/scheduling/internal"),
      },
      schema: idleSchema,
    })

    await expect(
      t.mutation(dispatchTrackingSources, { now: NOW }),
    ).resolves.toEqual({
      circuits: {
        algolia_hacker_news: "closed",
        fetchlayer_reddit: "closed",
        xquik: "closed",
      },
      claims: {
        algolia_hacker_news: 0,
        fetchlayer_reddit: 0,
        xquik: 0,
      },
      state: "dispatched",
    })
  })

  it("fetches, stages, and atomically ingests one leased provider page", async () => {
    const { readPersistedState, seedLeasedHackerNewsSource, t } =
      createSchedulingHarness()
    const seeded = await seedLeasedHackerNewsSource()
    const fetchMock = vi.fn(async () =>
      Response.json(JSON.parse(providerResponse) as unknown),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      t.action(executeTrackingSource, actionArguments(seeded)),
    ).resolves.toEqual({
      associationsAdded: 2,
      mentionAnalysisJobsEnqueued: 2,
      inserted: 2,
      rediscovered: 0,
      state: "applied",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expectCompletedIngestion(await readPersistedState(seeded))
  })

  it("executes scheduled collection against the free evaluation allowance", async () => {
    const { readPersistedState, seedLeasedHackerNewsSource, t } =
      createSchedulingHarness()
    const seeded = await seedLeasedHackerNewsSource("free")
    vi.stubGlobal("fetch", async () =>
      Response.json(JSON.parse(providerResponse) as unknown),
    )

    await expect(
      t.action(executeTrackingSource, actionArguments(seeded)),
    ).resolves.toMatchObject({ inserted: 2, state: "applied" })

    const persisted = await readPersistedState(seeded)
    expect(persisted.usage).toBeNull()
    expect(persisted.grant?.mentionsUsed).toBe(2)
    expect(
      persisted.mentions.every(
        (mention) =>
          mention.retentionExpiresAt === NOW + 60 * 24 * 60 * 60 * 1_000,
      ),
    ).toBe(true)
    expect(persisted.source).toMatchObject({ status: "active" })
  })

  it("sends the keyword as a sanitized exact-phrase query to the provider", async () => {
    const { readPersistedState, seedLeasedHackerNewsSource, t } =
      createSchedulingHarness()
    const seeded = await seedLeasedHackerNewsSource("paid", 'Stalk"r OR free')
    const fetchMock = vi.fn(async () =>
      Response.json(JSON.parse(providerResponse) as unknown),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      t.action(executeTrackingSource, actionArguments(seeded)),
    ).resolves.toMatchObject({ state: "applied" })

    // Bare phrases match fuzzy variants (Algolia typo tolerance matched
    // "stalkr" against "stalker"), so the phrase must arrive quoted with any
    // embedded quotes neutralized.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestedUrl.searchParams.get("query")).toBe('"Stalk r OR free"')
    expect(await readPersistedState(seeded)).toMatchObject({
      source: { providerQuery: 'Stalk"r OR free' },
    })
  })

  it("resumes committed provider pages without fetching or duplicating work", async () => {
    const {
      commitProviderPage,
      readPersistedState,
      seedLeasedHackerNewsSource,
      t,
    } = createSchedulingHarness()
    const seeded = await seedLeasedHackerNewsSource()
    await commitProviderPage(seeded, await normalizedProviderResultJson())
    const fetchMock = vi.fn(async () => {
      throw new Error("committed pages must resume without provider I/O")
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      t.action(executeTrackingSource, actionArguments(seeded)),
    ).resolves.toEqual({
      associationsAdded: 2,
      mentionAnalysisJobsEnqueued: 2,
      inserted: 2,
      rediscovered: 0,
      state: "applied",
    })
    await expect(
      t.action(executeTrackingSource, actionArguments(seeded)),
    ).resolves.toEqual({ state: "stale_lease" })

    expect(fetchMock).not.toHaveBeenCalled()
    expectCompletedIngestion(await readPersistedState(seeded))
  })
})
