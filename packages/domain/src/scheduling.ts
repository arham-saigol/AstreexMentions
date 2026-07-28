import { type Platform } from "./enums"

export const SECOND_MS = 1_000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

export const PROVIDER_POLL_INTERVAL_MS = Object.freeze({
  x: 15 * MINUTE_MS,
  reddit: 10 * MINUTE_MS,
  hacker_news: 5 * MINUTE_MS,
} satisfies Readonly<Record<Platform, number>>)

export function getProviderPollingIntervalMs(platform: Platform): number {
  return PROVIDER_POLL_INTERVAL_MS[platform]
}

export const providerSchedulingIntervalMs = getProviderPollingIntervalMs

function assertEpochMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Timestamp must be a non-negative safe integer in milliseconds",
    )
  }
}

/** Returns the next interval boundary strictly after the supplied timestamp. */
export function nextProviderIntervalAt(
  afterAt: number,
  platform: Platform,
): number {
  assertEpochMilliseconds(afterAt)
  const interval = getProviderPollingIntervalMs(platform)
  const boundary = Math.floor(afterAt / interval) * interval + interval
  if (!Number.isSafeInteger(boundary)) {
    throw new RangeError(
      "Next provider interval exceeds the safe timestamp range",
    )
  }
  return boundary
}

export function providerIntervalsElapsed(
  earlierAt: number,
  laterAt: number,
  platform: Platform,
): number {
  assertEpochMilliseconds(earlierAt)
  assertEpochMilliseconds(laterAt)
  if (laterAt < earlierAt) {
    throw new RangeError("laterAt must be greater than or equal to earlierAt")
  }
  return Math.floor(
    (laterAt - earlierAt) / getProviderPollingIntervalMs(platform),
  )
}
