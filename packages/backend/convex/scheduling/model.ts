export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const TRACKING_LEASE_MS = 4 * MINUTE_MS
export const MAX_DISPATCH_DELAY_MS = 55_000
export const MAX_TRACKING_BACKOFF_MS = 6 * HOUR_MS
export const TRACKING_BACKOFF_BASE_MS = 30_000

export type PlanId = "starter" | "growth" | "scale"
export type TrackingSourceType =
  "x" | "reddit_posts" | "reddit_comments" | "hacker_news"
export type TrackingProvider =
  "xquik" | "fetchlayer_reddit" | "algolia_hacker_news"

export type TrackingSourceSchedule = {
  backoffUntil?: number | undefined
  inProgressCursor?: string | undefined
  inProgressPage?: number | undefined
  inProgressWindowEndAt?: number | undefined
  inProgressWindowStartAt?: number | undefined
  intervalMs: number
  leaseExpiresAt?: number | undefined
  leaseToken?: string | undefined
  leaseVersion: number
  nextRunAt: number
  settledWatermarkAt?: number | undefined
  sourceType: TrackingSourceType
  status: "active" | "paused" | "error" | "deleted"
}

export type TrackingLease = {
  expiresAt: number
  token: string
  version: number
}

export type ProviderCircuitRun = {
  startedAt: number
  status: "failed" | "succeeded"
}

export type ProviderDispatchPolicy = {
  circuitCooldownMs: number
  circuitFailureThreshold: number
  hourlyRequestBudget: number
  maxClaimsPerMinute: number
  provider: TrackingProvider
}

export type ProviderDispatchState =
  | {
      availableClaims: number
      circuit: "closed"
      remainingHourlyRequests: number
    }
  | {
      availableClaims: 0
      circuit: "open"
      openUntil: number
      remainingHourlyRequests: number
    }

export type CheckpointPagination =
  | {
      hasMore: boolean
      kind: "cursor"
      nextCursor?: string | undefined
    }
  | {
      hasMore: boolean
      kind: "page"
      nextPage?: number | undefined
    }
  | {
      hasMore: boolean
      kind: "provider_pages"
      pagesRequested: number
    }

export type CheckpointObservation = {
  newestProviderItemId?: string | undefined
  newestPublishedAt?: number | undefined
}

export type CheckpointTransition =
  | {
      checkpointVersion: number
      inProgressCursor?: string | undefined
      inProgressPage?: number | undefined
      kind: "continue"
      nextRunAt: number
    }
  | {
      checkpointVersion: number
      kind: "settled"
      nextRunAt: number
      settledWatermarkAt: number
      settledWatermarkItemId?: string | undefined
    }

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

function assertPositiveDuration(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
}

function requireKey(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return normalized
}

/** Stable FNV-1a hash used for scheduling distribution, never for security. */
export function deterministicHash(value: string): number {
  const normalized = requireKey(value, "deterministic hash input")
  let hash = 0x811c9dc5
  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function deterministicUnitInterval(value: string): number {
  return deterministicHash(value) / 0x1_0000_0000
}

export function trackingProviderForSourceType(
  sourceType: TrackingSourceType,
): TrackingProvider {
  switch (sourceType) {
    case "x":
      return "xquik"
    case "reddit_posts":
    case "reddit_comments":
      return "fetchlayer_reddit"
    case "hacker_news":
      return "algolia_hacker_news"
  }
}

export function trackingIntervalMs(
  sourceType: TrackingSourceType,
  planId: PlanId,
): number {
  if (sourceType === "x") {
    return 5 * MINUTE_MS
  }
  if (sourceType === "hacker_news") {
    return 10 * MINUTE_MS
  }

  switch (planId) {
    case "starter":
      return 6 * HOUR_MS
    case "growth":
      return 2 * HOUR_MS
    case "scale":
      return HOUR_MS
  }
}

/** First provider work is spread deterministically across the next minute. */
export function initialTrackingRunAt(now: number, sourceKey: string): number {
  assertTimestamp(now, "now")
  const offset =
    deterministicHash(`initial:${requireKey(sourceKey, "sourceKey")}`) %
    MINUTE_MS
  return now + offset
}

export function createInitialTrackingSchedule(input: {
  now: number
  planId: PlanId
  sourceKey: string
  sourceType: TrackingSourceType
}): {
  backoffMs: 0
  checkpointVersion: 0
  consecutiveFailures: 0
  intervalMs: number
  leaseVersion: 0
  nextRunAt: number
  totalFailures: 0
} {
  return {
    backoffMs: 0,
    checkpointVersion: 0,
    consecutiveFailures: 0,
    intervalMs: trackingIntervalMs(input.sourceType, input.planId),
    leaseVersion: 0,
    nextRunAt: initialTrackingRunAt(input.now, input.sourceKey),
    totalFailures: 0,
  }
}

/** Claimed actions are spread through the minute instead of bursting at cron time. */
export function trackingDispatchDelayMs(
  sourceKey: string,
  leaseVersion: number,
): number {
  if (!Number.isInteger(leaseVersion) || leaseVersion < 1) {
    throw new RangeError("leaseVersion must be a positive integer")
  }
  return (
    deterministicHash(
      `dispatch:${requireKey(sourceKey, "sourceKey")}:${leaseVersion}`,
    ) %
    (MAX_DISPATCH_DELAY_MS + 1)
  )
}

/** Preserves the persisted phase while skipping interval boundaries already missed. */
export function advanceTrackingRunAt(
  scheduledFor: number,
  intervalMs: number,
  completedAt: number,
): number {
  assertTimestamp(scheduledFor, "scheduledFor")
  assertPositiveDuration(intervalMs, "intervalMs")
  assertTimestamp(completedAt, "completedAt")

  if (scheduledFor > completedAt) {
    return scheduledFor
  }

  const intervalsElapsed =
    Math.floor((completedAt - scheduledFor) / intervalMs) + 1
  const nextRunAt = scheduledFor + intervalsElapsed * intervalMs
  assertTimestamp(nextRunAt, "nextRunAt")
  return nextRunAt
}

export function canClaimTrackingSource(
  source: TrackingSourceSchedule,
  now: number,
): boolean {
  assertTimestamp(now, "now")
  if (
    source.status !== "active" ||
    source.nextRunAt > now ||
    (source.backoffUntil !== undefined && source.backoffUntil > now)
  ) {
    return false
  }

  const hasLease =
    source.leaseToken !== undefined || source.leaseExpiresAt !== undefined
  if (!hasLease) {
    return true
  }

  return (
    source.leaseToken !== undefined &&
    source.leaseExpiresAt !== undefined &&
    source.leaseExpiresAt <= now
  )
}

export function createTrackingLease(input: {
  leaseMs?: number | undefined
  now: number
  sourceId: string
  source: TrackingSourceSchedule
}): TrackingLease {
  if (!canClaimTrackingSource(input.source, input.now)) {
    throw new TrackingSchedulingError(
      "SOURCE_NOT_CLAIMABLE",
      "Tracking source is not ready to be claimed",
    )
  }

  const leaseMs = input.leaseMs ?? TRACKING_LEASE_MS
  assertPositiveDuration(leaseMs, "leaseMs")
  const version = input.source.leaseVersion + 1
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError("leaseVersion exceeds the safe integer range")
  }
  const sourceId = requireKey(input.sourceId, "sourceId")

  return {
    expiresAt: input.now + leaseMs,
    token: `tracking:${encodeURIComponent(sourceId)}:${version}:${input.now}`,
    version,
  }
}

export function initialCheckpointWindow(input: {
  now: number
  source: TrackingSourceSchedule
}): { endAt: number; startAt: number } {
  assertTimestamp(input.now, "now")
  assertPositiveDuration(input.source.intervalMs, "intervalMs")

  if (
    input.source.inProgressWindowStartAt !== undefined &&
    input.source.inProgressWindowEndAt !== undefined
  ) {
    return {
      endAt: input.source.inProgressWindowEndAt,
      startAt: input.source.inProgressWindowStartAt,
    }
  }

  return {
    endAt: input.now,
    startAt:
      input.source.settledWatermarkAt ??
      Math.max(0, input.now - input.source.intervalMs),
  }
}

export function assertCurrentTrackingLease(
  actual: Pick<
    TrackingSourceSchedule,
    "leaseExpiresAt" | "leaseToken" | "leaseVersion"
  >,
  expected: TrackingLease,
  now: number,
): void {
  assertTimestamp(now, "now")
  if (
    actual.leaseVersion !== expected.version ||
    actual.leaseToken !== expected.token ||
    actual.leaseExpiresAt !== expected.expiresAt ||
    expected.expiresAt <= now
  ) {
    throw new TrackingSchedulingError(
      "STALE_LEASE",
      "Tracking lease is stale or expired",
    )
  }
}

export function trackingRetryDelayMs(input: {
  consecutiveFailures: number
  retryAfterMs?: number | undefined
  sourceKey: string
}): number {
  if (
    !Number.isInteger(input.consecutiveFailures) ||
    input.consecutiveFailures < 1
  ) {
    throw new RangeError("consecutiveFailures must be a positive integer")
  }
  if (
    input.retryAfterMs !== undefined &&
    (!Number.isFinite(input.retryAfterMs) || input.retryAfterMs < 0)
  ) {
    throw new RangeError("retryAfterMs must be non-negative")
  }

  const exponential = Math.min(
    MAX_TRACKING_BACKOFF_MS,
    TRACKING_BACKOFF_BASE_MS * 2 ** Math.min(input.consecutiveFailures - 1, 20),
  )
  const jitterUnit = deterministicUnitInterval(
    `backoff:${requireKey(input.sourceKey, "sourceKey")}:${input.consecutiveFailures}`,
  )
  const jittered = Math.round(exponential * (0.75 + jitterUnit * 0.5))
  return Math.min(
    MAX_TRACKING_BACKOFF_MS,
    Math.max(jittered, Math.ceil(input.retryAfterMs ?? 0)),
  )
}

function latestConsecutiveFailures(
  runs: readonly ProviderCircuitRun[],
  since: number,
): { count: number; latestFailureAt?: number | undefined } {
  const recent = runs
    .filter((run) => run.startedAt >= since)
    .sort((left, right) => right.startedAt - left.startedAt)
  let count = 0
  let latestFailureAt: number | undefined

  for (const run of recent) {
    if (run.status === "succeeded") {
      break
    }
    count += 1
    latestFailureAt ??= run.startedAt
  }

  return { count, latestFailureAt }
}

export function providerDispatchState(input: {
  hourlyRequests: number
  now: number
  policy: ProviderDispatchPolicy
  recentRuns: readonly ProviderCircuitRun[]
}): ProviderDispatchState {
  assertTimestamp(input.now, "now")
  if (!Number.isInteger(input.hourlyRequests) || input.hourlyRequests < 0) {
    throw new RangeError("hourlyRequests must be a non-negative integer")
  }
  for (const [label, value] of [
    ["hourlyRequestBudget", input.policy.hourlyRequestBudget],
    ["maxClaimsPerMinute", input.policy.maxClaimsPerMinute],
    ["circuitFailureThreshold", input.policy.circuitFailureThreshold],
    ["circuitCooldownMs", input.policy.circuitCooldownMs],
  ] as const) {
    assertPositiveDuration(value, label)
  }

  const remainingHourlyRequests = Math.max(
    0,
    input.policy.hourlyRequestBudget - input.hourlyRequests,
  )
  const circuit = latestConsecutiveFailures(
    input.recentRuns,
    input.now - input.policy.circuitCooldownMs,
  )
  if (
    circuit.count >= input.policy.circuitFailureThreshold &&
    circuit.latestFailureAt !== undefined
  ) {
    const openUntil = circuit.latestFailureAt + input.policy.circuitCooldownMs
    if (openUntil > input.now) {
      return {
        availableClaims: 0,
        circuit: "open",
        openUntil,
        remainingHourlyRequests,
      }
    }
  }

  return {
    availableClaims: Math.min(
      input.policy.maxClaimsPerMinute,
      remainingHourlyRequests,
    ),
    circuit: "closed",
    remainingHourlyRequests,
  }
}

export function planCheckpointTransition(input: {
  checkpointVersion: number
  completedAt: number
  intervalMs: number
  observation: CheckpointObservation
  pagination: CheckpointPagination
  scheduledFor: number
  settledWatermarkAt?: number | undefined
  windowEndAt: number
}): CheckpointTransition {
  if (
    !Number.isInteger(input.checkpointVersion) ||
    input.checkpointVersion < 0
  ) {
    throw new RangeError("checkpointVersion must be a non-negative integer")
  }
  assertTimestamp(input.completedAt, "completedAt")
  assertPositiveDuration(input.intervalMs, "intervalMs")
  assertTimestamp(input.scheduledFor, "scheduledFor")
  assertTimestamp(input.windowEndAt, "windowEndAt")
  const checkpointVersion = input.checkpointVersion + 1

  if (input.pagination.kind === "cursor" && input.pagination.hasMore) {
    const nextCursor = input.pagination.nextCursor?.trim()
    if (!nextCursor) {
      throw new TrackingSchedulingError(
        "INVALID_CHECKPOINT",
        "Cursor pagination must advance with a next cursor",
      )
    }
    return {
      checkpointVersion,
      inProgressCursor: nextCursor,
      kind: "continue",
      nextRunAt: input.scheduledFor,
    }
  }

  if (input.pagination.kind === "page" && input.pagination.hasMore) {
    if (
      input.pagination.nextPage === undefined ||
      !Number.isInteger(input.pagination.nextPage) ||
      input.pagination.nextPage < 0
    ) {
      throw new TrackingSchedulingError(
        "INVALID_CHECKPOINT",
        "Page pagination must advance with a next page",
      )
    }
    return {
      checkpointVersion,
      inProgressPage: input.pagination.nextPage,
      kind: "continue",
      nextRunAt: input.scheduledFor,
    }
  }

  if (input.pagination.kind === "provider_pages" && input.pagination.hasMore) {
    const pagesRequested = input.pagination.pagesRequested
    if (
      !Number.isSafeInteger(pagesRequested) ||
      pagesRequested <= 0 ||
      pagesRequested >= Number.MAX_SAFE_INTEGER
    ) {
      throw new TrackingSchedulingError(
        "INVALID_CHECKPOINT",
        "Provider-managed pagination must advance with a page count",
      )
    }
    return {
      checkpointVersion,
      inProgressPage: pagesRequested + 1,
      kind: "continue",
      nextRunAt: input.scheduledFor,
    }
  }

  const observedAt = input.observation.newestPublishedAt
  if (observedAt !== undefined) {
    assertTimestamp(observedAt, "newestPublishedAt")
  }
  const settledWatermarkAt = Math.max(
    input.settledWatermarkAt ?? 0,
    observedAt ?? 0,
    input.windowEndAt,
  )

  return {
    checkpointVersion,
    kind: "settled",
    nextRunAt: advanceTrackingRunAt(
      input.scheduledFor,
      input.intervalMs,
      input.completedAt,
    ),
    settledWatermarkAt,
    ...(input.observation.newestProviderItemId === undefined
      ? {}
      : {
          settledWatermarkItemId: input.observation.newestProviderItemId,
        }),
  }
}

export class TrackingSchedulingError extends Error {
  readonly code: "INVALID_CHECKPOINT" | "SOURCE_NOT_CLAIMABLE" | "STALE_LEASE"

  constructor(code: TrackingSchedulingError["code"], message: string) {
    super(message)
    this.name = "TrackingSchedulingError"
    this.code = code
  }
}
