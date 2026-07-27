import { describe, expect, it } from "vitest"

import {
  HOUR_MS,
  MINUTE_MS,
  PROVIDER_POLL_INTERVAL_MS,
  USAGE_NOTIFICATION_THRESHOLDS,
  deterministicBackoffMs,
  deterministicFraction,
  deterministicHash32,
  deterministicStaggerMs,
  exponentialBackoffMs,
  getProviderPollingIntervalMs,
  getUsageThresholdCrossings,
  nextProviderIntervalAt,
  providerIntervalsElapsed,
  usagePercentage,
} from "./index"

describe("provider scheduling", () => {
  it("provides product-owned polling intervals", () => {
    expect(PROVIDER_POLL_INTERVAL_MS).toEqual({
      x: 15 * MINUTE_MS,
      reddit: 10 * MINUTE_MS,
      hacker_news: 5 * MINUTE_MS,
    })
    expect(getProviderPollingIntervalMs("x")).toBe(15 * MINUTE_MS)
    expect(nextProviderIntervalAt(15 * MINUTE_MS, "x")).toBe(30 * MINUTE_MS)
    expect(nextProviderIntervalAt(15 * MINUTE_MS + 1, "x")).toBe(30 * MINUTE_MS)
    expect(providerIntervalsElapsed(0, HOUR_MS, "hacker_news")).toBe(12)
  })

  it("rejects invalid timestamps", () => {
    expect(() => nextProviderIntervalAt(-1, "reddit")).toThrow(RangeError)
    expect(() => providerIntervalsElapsed(2, 1, "reddit")).toThrow(RangeError)
  })
})

describe("deterministic helpers", () => {
  it("hashes, fractions, and staggers repeatably", () => {
    expect(deterministicHash32("workspace-1")).toBe(
      deterministicHash32("workspace-1"),
    )
    expect(deterministicHash32("workspace-1")).not.toBe(
      deterministicHash32("workspace-2"),
    )
    expect(deterministicFraction("workspace-1")).toBeGreaterThanOrEqual(0)
    expect(deterministicFraction("workspace-1")).toBeLessThan(1)
    const stagger = deterministicStaggerMs("workspace-1", 30_000)
    expect(stagger).toBe(deterministicStaggerMs("workspace-1", 30_000))
    expect(stagger).toBeGreaterThanOrEqual(0)
    expect(stagger).toBeLessThan(30_000)
    expect(deterministicStaggerMs("anything", 0)).toBe(0)
  })

  it("applies exponential backoff with stable bounded jitter", () => {
    expect(exponentialBackoffMs(1)).toBe(1_000)
    expect(exponentialBackoffMs(4)).toBe(8_000)
    expect(exponentialBackoffMs(20, 1_000, 60_000)).toBe(60_000)

    const options = {
      attempt: 3,
      baseDelayMs: 1_000,
      jitterRatio: 0.25,
      key: "reddit:workspace-1",
      maxDelayMs: 10_000,
    } as const
    const delay = deterministicBackoffMs(options)
    expect(delay).toBe(deterministicBackoffMs(options))
    expect(delay).toBeGreaterThanOrEqual(3_000)
    expect(delay).toBeLessThanOrEqual(5_000)
    expect(() => deterministicBackoffMs({ ...options, attempt: 0 })).toThrow(
      RangeError,
    )
  })
})

describe("usage threshold crossing", () => {
  it("only reports newly crossed 80 and 100 percent thresholds", () => {
    expect(USAGE_NOTIFICATION_THRESHOLDS).toEqual([80, 100])
    expect(
      getUsageThresholdCrossings({
        previousUsage: 79,
        currentUsage: 80,
        limit: 100,
      }),
    ).toEqual([80])
    expect(
      getUsageThresholdCrossings({
        previousUsage: 80,
        currentUsage: 100,
        limit: 100,
      }),
    ).toEqual([100])
    expect(
      getUsageThresholdCrossings({
        previousUsage: 0,
        currentUsage: 101,
        limit: 100,
      }),
    ).toEqual([80, 100])
    expect(
      getUsageThresholdCrossings({
        previousUsage: 100,
        currentUsage: 120,
        limit: 100,
      }),
    ).toEqual([])
    expect(
      getUsageThresholdCrossings({
        previousUsage: 90,
        currentUsage: 50,
        limit: 100,
      }),
    ).toEqual([])
    expect(usagePercentage(1, 4)).toBe(25)
  })

  it("rejects invalid usage snapshots", () => {
    expect(() => usagePercentage(1, 0)).toThrow(RangeError)
    expect(() =>
      getUsageThresholdCrossings({
        previousUsage: -1,
        currentUsage: 1,
        limit: 100,
      }),
    ).toThrow(RangeError)
  })
})
