import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  readProviderRuntimeConfiguration,
  readSchedulingDispatchConfiguration,
} from "../convex/scheduling/config"
import { parseProviderSearchResultJson } from "../convex/scheduling/contracts"
import { createProviderApplyBatches } from "../convex/scheduling/ingestion"
import {
  HOUR_MS,
  MAX_FETCHLAYER_CUMULATIVE_PAGES,
  MAX_DISPATCH_DELAY_MS,
  MINUTE_MS,
  TrackingSchedulingError,
  advanceTrackingRunAt,
  assertCurrentTrackingLease,
  canClaimTrackingSource,
  createInitialTrackingSchedule,
  createTrackingLease,
  initialCheckpointWindow,
  initialTrackingRunAt,
  planCheckpointTransition,
  providerDispatchState,
  trackingDispatchDelayMs,
  trackingIntervalMs,
  trackingRetryDelayMs,
  type PlanId,
  type TrackingSourceSchedule,
  type TrackingSourceType,
} from "../convex/scheduling/model"

type SchedulerFixture = {
  backoff: Array<{
    consecutiveFailures: number
    expectedDelayMs: number
    retryAfterMs?: number
    sourceKey: string
  }>
  intervals: Array<{
    expectedMs: number
    planId: PlanId
    sourceType: TrackingSourceType
  }>
  now: number
  stagger: Array<{
    expectedDispatchDelayMs: number
    expectedInitialRunAt: number
    leaseVersion: number
    sourceKey: string
  }>
}

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/scheduling/scheduler-cases.json", import.meta.url),
    "utf8",
  ),
) as SchedulerFixture

function source(
  patch: Partial<TrackingSourceSchedule> = {},
): TrackingSourceSchedule {
  return {
    checkpointVersion: 0,
    intervalMs: 5 * MINUTE_MS,
    leaseVersion: 0,
    nextRunAt: fixture.now,
    sourceType: "x",
    status: "active",
    ...patch,
  } as TrackingSourceSchedule
}

describe("persisted tracking schedules", () => {
  it("uses the exact product polling intervals from fixtures", () => {
    for (const testCase of fixture.intervals) {
      expect(trackingIntervalMs(testCase.sourceType, testCase.planId)).toBe(
        testCase.expectedMs,
      )
    }
  })

  it("deterministically staggers initial work and leased actions below one minute", () => {
    for (const testCase of fixture.stagger) {
      expect(initialTrackingRunAt(fixture.now, testCase.sourceKey)).toBe(
        testCase.expectedInitialRunAt,
      )
      expect(
        createInitialTrackingSchedule({
          now: fixture.now,
          planId: "starter",
          sourceKey: testCase.sourceKey,
          sourceType: "x",
        }),
      ).toMatchObject({
        intervalMs: 5 * MINUTE_MS,
        nextRunAt: testCase.expectedInitialRunAt,
      })
      const delay = trackingDispatchDelayMs(
        testCase.sourceKey,
        testCase.leaseVersion,
      )
      expect(delay).toBe(testCase.expectedDispatchDelayMs)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(MAX_DISPATCH_DELAY_MS)
    }
  })

  it("preserves the persisted schedule phase when runs finish late", () => {
    expect(
      advanceTrackingRunAt(
        fixture.now,
        5 * MINUTE_MS,
        fixture.now + 12 * MINUTE_MS,
      ),
    ).toBe(fixture.now + 15 * MINUTE_MS)
    expect(
      advanceTrackingRunAt(
        fixture.now + 5 * MINUTE_MS,
        5 * MINUTE_MS,
        fixture.now,
      ),
    ).toBe(fixture.now + 5 * MINUTE_MS)
  })
})

describe("versioned tracking leases", () => {
  it("claims due work with a token, version, and expiry", () => {
    const schedule = source()
    expect(canClaimTrackingSource(schedule, fixture.now)).toBe(true)

    const lease = createTrackingLease({
      now: fixture.now,
      source: schedule,
      sourceId: "source-a",
    })

    expect(lease.version).toBe(1)
    expect(lease.token).toBe(`tracking:source-a:1:${fixture.now}`)
    expect(lease.expiresAt).toBeGreaterThan(fixture.now)
  })

  it("reclaims only expired leases and increments their fencing version", () => {
    const live = source({
      leaseExpiresAt: fixture.now + 1,
      leaseToken: "live",
      leaseVersion: 4,
    })
    expect(canClaimTrackingSource(live, fixture.now)).toBe(false)

    const expired = source({
      leaseExpiresAt: fixture.now,
      leaseToken: "expired",
      leaseVersion: 4,
    })
    expect(canClaimTrackingSource(expired, fixture.now)).toBe(true)
    expect(
      createTrackingLease({
        now: fixture.now,
        source: expired,
        sourceId: "source-a",
      }).version,
    ).toBe(5)
  })

  it("rejects stale versions, tokens, expiries, and expired holders", () => {
    const expected = {
      expiresAt: fixture.now + MINUTE_MS,
      token: "current-token",
      version: 3,
    }
    const actual = source({
      leaseExpiresAt: expected.expiresAt,
      leaseToken: expected.token,
      leaseVersion: expected.version,
    })
    expect(() =>
      assertCurrentTrackingLease(actual, expected, fixture.now),
    ).not.toThrow()

    for (const stale of [
      { ...actual, leaseVersion: 2 },
      { ...actual, leaseToken: "old-token" },
      { ...actual, leaseExpiresAt: expected.expiresAt + 1 },
    ]) {
      expect(() =>
        assertCurrentTrackingLease(stale, expected, fixture.now),
      ).toThrowError(TrackingSchedulingError)
    }
    expect(() =>
      assertCurrentTrackingLease(actual, expected, expected.expiresAt),
    ).toThrowError(expect.objectContaining({ code: "STALE_LEASE" }))
  })

  it("preserves an in-progress checkpoint window across lease reclaim", () => {
    expect(
      initialCheckpointWindow({
        now: fixture.now,
        source: source({
          inProgressWindowEndAt: fixture.now - MINUTE_MS,
          inProgressWindowStartAt: fixture.now - 2 * MINUTE_MS,
        }),
      }),
    ).toEqual({
      endAt: fixture.now - MINUTE_MS,
      startAt: fixture.now - 2 * MINUTE_MS,
    })
  })
})

describe("provider budgets and circuits", () => {
  it("bounds claims by both the provider minute cap and hourly budget", () => {
    const policy = {
      circuitCooldownMs: 5 * MINUTE_MS,
      circuitFailureThreshold: 3,
      hourlyRequestBudget: 10,
      maxClaimsPerMinute: 4,
      provider: "xquik" as const,
    }
    expect(
      providerDispatchState({
        hourlyRequests: 3,
        now: fixture.now,
        policy,
        recentRuns: [],
      }),
    ).toEqual({
      availableClaims: 4,
      circuit: "closed",
      remainingHourlyRequests: 7,
    })
    expect(
      providerDispatchState({
        hourlyRequests: 9,
        now: fixture.now,
        policy,
        recentRuns: [],
      }),
    ).toEqual({
      availableClaims: 1,
      circuit: "closed",
      remainingHourlyRequests: 1,
    })
  })

  it("opens on recent consecutive provider failures and closes after success", () => {
    const policy = {
      circuitCooldownMs: 5 * MINUTE_MS,
      circuitFailureThreshold: 3,
      hourlyRequestBudget: 100,
      maxClaimsPerMinute: 10,
      provider: "fetchlayer_reddit" as const,
    }
    const failures = [1, 2, 3].map((minutesAgo) => ({
      startedAt: fixture.now - minutesAgo * MINUTE_MS,
      status: "failed" as const,
    }))
    expect(
      providerDispatchState({
        hourlyRequests: 0,
        now: fixture.now,
        policy,
        recentRuns: failures,
      }),
    ).toMatchObject({ availableClaims: 0, circuit: "open" })

    expect(
      providerDispatchState({
        hourlyRequests: 0,
        now: fixture.now,
        policy,
        recentRuns: [
          { startedAt: fixture.now - 30_000, status: "succeeded" },
          ...failures,
        ],
      }),
    ).toMatchObject({ availableClaims: 10, circuit: "closed" })
  })

  it("derives bounded provider policies from validated environment contracts", () => {
    const defaults = readSchedulingDispatchConfiguration({})
    expect(defaults).toMatchObject({ state: "configured" })
    if (defaults.state !== "configured") {
      throw new Error("Expected default scheduling policies")
    }
    expect(defaults.policies.fetchlayer_reddit.maxClaimsPerMinute).toBe(30)
    expect(defaults.policies.xquik.maxClaimsPerMinute).toBe(60)

    const configuration = readSchedulingDispatchConfiguration({
      FETCHLAYER_REQUESTS_PER_MINUTE: "7",
      XQUIK_REQUESTS_PER_SECOND: "2",
    })
    expect(configuration).toMatchObject({ state: "configured" })
    if (configuration.state !== "configured") {
      throw new Error("Expected configured scheduling policies")
    }
    expect(configuration.policies.fetchlayer_reddit).toMatchObject({
      hourlyRequestBudget: 420,
      maxClaimsPerMinute: 7,
    })
    expect(configuration.policies.xquik).toMatchObject({
      hourlyRequestBudget: 7_200,
      maxClaimsPerMinute: 60,
    })
    expect(configuration.policies.algolia_hacker_news.maxClaimsPerMinute).toBe(
      12,
    )
    expect(
      readSchedulingDispatchConfiguration({
        FETCHLAYER_REQUESTS_PER_MINUTE: "not-a-number",
      }),
    ).toEqual({
      invalid: ["FETCHLAYER_REQUESTS_PER_MINUTE"],
      state: "provider_unconfigured",
    })
  })
})

describe("deterministic retry and checkpoint transitions", () => {
  it("uses fixture-backed exponential delays with stable jitter", () => {
    for (const testCase of fixture.backoff) {
      expect(
        trackingRetryDelayMs({
          consecutiveFailures: testCase.consecutiveFailures,
          retryAfterMs: testCase.retryAfterMs,
          sourceKey: testCase.sourceKey,
        }),
      ).toBe(testCase.expectedDelayMs)
    }
  })

  it("continues cursor and page checkpoints without advancing cadence", () => {
    expect(
      planCheckpointTransition({
        checkpointVersion: 2,
        completedAt: fixture.now,
        intervalMs: 5 * MINUTE_MS,
        observation: {},
        pagination: {
          hasMore: true,
          kind: "cursor",
          nextCursor: "cursor-2",
        },
        scheduledFor: fixture.now - MINUTE_MS,
        windowEndAt: fixture.now,
      }),
    ).toEqual({
      checkpointVersion: 3,
      inProgressCursor: "cursor-2",
      kind: "continue",
      nextRunAt: fixture.now - MINUTE_MS,
    })

    expect(
      planCheckpointTransition({
        checkpointVersion: 3,
        completedAt: fixture.now,
        intervalMs: 10 * MINUTE_MS,
        observation: {},
        pagination: { hasMore: true, kind: "page", nextPage: 2 },
        scheduledFor: fixture.now - MINUTE_MS,
        windowEndAt: fixture.now,
      }),
    ).toMatchObject({
      checkpointVersion: 4,
      inProgressPage: 2,
      kind: "continue",
    })
  })

  it("continues provider-managed pages by increasing the requested depth", () => {
    expect(
      planCheckpointTransition({
        checkpointVersion: 4,
        completedAt: fixture.now,
        intervalMs: HOUR_MS,
        observation: {},
        pagination: {
          hasMore: true,
          kind: "provider_pages",
          pagesRequested: 2,
        },
        scheduledFor: fixture.now - MINUTE_MS,
        windowEndAt: fixture.now,
      }),
    ).toEqual({
      checkpointVersion: 5,
      inProgressPage: 3,
      kind: "continue",
      nextRunAt: fixture.now - MINUTE_MS,
    })
  })

  it("settles a FetchLayer window at the cumulative page ceiling", () => {
    expect(
      planCheckpointTransition({
        checkpointVersion: 4,
        completedAt: fixture.now,
        intervalMs: HOUR_MS,
        observation: {
          newestProviderItemId: "reddit-limit",
          newestPublishedAt: fixture.now - 1_000,
        },
        pagination: {
          hasMore: true,
          kind: "provider_pages",
          pagesRequested: MAX_FETCHLAYER_CUMULATIVE_PAGES,
        },
        scheduledFor: fixture.now,
        windowEndAt: fixture.now,
      }),
    ).toEqual({
      checkpointVersion: 5,
      kind: "settled",
      nextRunAt: fixture.now + HOUR_MS,
      settledWatermarkAt: fixture.now,
      settledWatermarkItemId: "reddit-limit",
    })
  })

  it("settles terminal pages, clears work in persistence, and advances exactly", () => {
    const transition = planCheckpointTransition({
      checkpointVersion: 4,
      completedAt: fixture.now + MINUTE_MS,
      intervalMs: HOUR_MS,
      observation: {
        newestProviderItemId: "reddit-42",
        newestPublishedAt: fixture.now - 10_000,
      },
      pagination: {
        hasMore: false,
        kind: "provider_pages",
        pagesRequested: 2,
      },
      scheduledFor: fixture.now,
      settledWatermarkAt: fixture.now - HOUR_MS,
      windowEndAt: fixture.now,
    })
    expect(transition).toEqual({
      checkpointVersion: 5,
      kind: "settled",
      nextRunAt: fixture.now + HOUR_MS,
      settledWatermarkAt: fixture.now,
      settledWatermarkItemId: "reddit-42",
    })
  })
})

describe("configuration and normalized result contracts", () => {
  it("splits cumulative provider results into bounded durable apply batches", () => {
    const result = parseProviderSearchResultJson(
      JSON.stringify({
        checkpoint: {},
        items: Array.from({ length: 53 }, (_, index) => ({
          body: `Mention ${index}`,
          canonicalUrl: `https://example.com/mentions/${index}`,
          contentType: "post",
          engagementScore: 0,
          platform: "reddit",
          providerItemId: `reddit-${index}`,
          publishedAt: fixture.now - index,
          searchText: `Mention ${index}`,
        })),
        pagination: {
          hasMore: true,
          kind: "provider_pages",
          pagesRequested: 3,
        },
        state: "ok",
      }),
    )

    const batches = createProviderApplyBatches(result)

    expect(batches.map(({ result: batch }) => batch.items.length)).toEqual([
      25, 25, 3,
    ])
    expect(batches.map(({ finalize }) => finalize)).toEqual([
      false,
      false,
      true,
    ])
    expect(
      batches.flatMap(({ result: batch }) =>
        batch.items.map(({ providerItemId }) => providerItemId),
      ),
    ).toEqual(result.items.map(({ providerItemId }) => providerItemId))
    expect(
      batches.every(
        ({ result: batch }) => batch.checkpoint === result.checkpoint,
      ),
    ).toBe(true)
  })

  it("reports honest provider_unconfigured states without exposing secrets", () => {
    expect(readProviderRuntimeConfiguration({}, "x")).toEqual({
      missing: ["XQUIK_API_KEY"],
      provider: "xquik",
      state: "provider_unconfigured",
    })
    expect(readProviderRuntimeConfiguration({}, "reddit_posts")).toEqual({
      missing: ["FETCHLAYER_API_KEY"],
      provider: "fetchlayer_reddit",
      state: "provider_unconfigured",
    })
    expect(readProviderRuntimeConfiguration({}, "hacker_news")).toMatchObject({
      provider: "algolia_hacker_news",
      state: "configured",
    })
  })

  it("rejects normalized provider payloads with invented fields", () => {
    expect(() =>
      parseProviderSearchResultJson(
        JSON.stringify({
          checkpoint: {},
          items: [],
          inventedProviderField: true,
          pagination: { hasMore: false, kind: "cursor" },
          state: "ok",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_RESULT" }))
  })

  it("requires provider-managed pagination to identify its requested depth", () => {
    expect(() =>
      parseProviderSearchResultJson(
        JSON.stringify({
          checkpoint: {},
          items: [],
          pagination: { hasMore: true, kind: "provider_pages" },
          state: "ok",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_RESULT" }))
  })
})

describe("Convex dispatcher boundary", () => {
  const schedulingDirectory = fileURLToPath(
    new URL("../convex/scheduling/", import.meta.url),
  )
  const internalSource = readFileSync(
    `${schedulingDirectory}/internal.ts`,
    "utf8",
  )
  const actionsSource = readFileSync(
    `${schedulingDirectory}/actions.ts`,
    "utf8",
  )
  const cronSource = readFileSync(
    fileURLToPath(new URL("../convex/crons.ts", import.meta.url)),
    "utf8",
  )

  it("runs the persisted dispatcher every minute and only schedules actions", () => {
    expect(cronSource).toContain("{ minutes: 1 }")
    const dispatcher = internalSource.slice(
      internalSource.indexOf("export const dispatchDueTrackingSources"),
      internalSource.indexOf("export const loadTrackingExecutionContext"),
    )
    const claimant = internalSource.slice(
      internalSource.indexOf("async function claimProviderSources"),
      internalSource.indexOf("export const dispatchDueTrackingSources"),
    )
    expect(internalSource).toContain("ctx.scheduler.runAfter")
    expect(dispatcher).not.toContain("createXquikAdapter")
    expect(dispatcher).not.toContain("createFetchLayerRedditAdapter")
    expect(dispatcher).not.toContain("createAlgoliaHackerNewsAdapter")
    expect(claimant).toContain('errorCode: "lease_expired"')
    expect(claimant.indexOf("findProviderRun")).toBeLessThan(
      claimant.indexOf("createTrackingLease"),
    )
  })

  it("rechecks persisted eligibility and configuration before provider calls", () => {
    const contextRead = actionsSource.indexOf(
      "loadTrackingExecutionContextReference",
      actionsSource.indexOf("handler:"),
    )
    const configRead = actionsSource.indexOf(
      "readProviderRuntimeConfiguration",
      contextRead,
    )
    const providerCall = actionsSource.indexOf(
      "searchProvider(context",
      configRead,
    )
    expect(contextRead).toBeGreaterThan(-1)
    expect(configRead).toBeGreaterThan(contextRead)
    expect(providerCall).toBeGreaterThan(configRead)
    expect(actionsSource).toContain("pages: Math.min(")
    expect(actionsSource).toContain("MAX_FETCHLAYER_CUMULATIVE_PAGES")

    for (const guard of [
      'keyword.status !== "active"',
      'subscription.entitlementStatus !== "active"',
      "remainingMentions === 0",
      "workspace.deletedAt !== undefined",
    ]) {
      expect(internalSource).toContain(guard)
    }
  })
})
