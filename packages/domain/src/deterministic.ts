const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** Browser-safe FNV-1a hash over JavaScript UTF-16 code units. */
export function deterministicHash32(value: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

export const deterministicHash = deterministicHash32

export function deterministicFraction(key: string): number {
  return deterministicHash32(key) / 0x1_0000_0000
}

/** Returns a stable integer in [0, rangeMs). */
export function deterministicStaggerMs(key: string, rangeMs: number): number {
  if (!Number.isSafeInteger(rangeMs) || rangeMs < 0) {
    throw new RangeError("rangeMs must be a non-negative safe integer")
  }
  if (rangeMs === 0) {
    return 0
  }
  return deterministicHash32(key) % rangeMs
}

export type BackoffOptions = {
  attempt: number
  baseDelayMs?: number
  jitterRatio?: number
  key: string
  maxDelayMs?: number
}

/**
 * Deterministic exponential retry delay. Attempt 1 uses baseDelayMs; jitter is
 * stable for the same key and attempt, making retries testable and repeatable.
 */
export function deterministicBackoffMs({
  attempt,
  baseDelayMs = 1_000,
  jitterRatio = 0.2,
  key,
  maxDelayMs = 60_000,
}: BackoffOptions): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError("attempt must be a positive integer")
  }
  if (!Number.isSafeInteger(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError("baseDelayMs must be a non-negative safe integer")
  }
  if (!Number.isSafeInteger(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new RangeError(
      "maxDelayMs must be a safe integer at least baseDelayMs",
    )
  }
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new RangeError("jitterRatio must be between 0 and 1")
  }

  const exponent = Math.min(attempt - 1, 52)
  const uncappedDelay = baseDelayMs * 2 ** exponent
  const cappedDelay = Math.min(maxDelayMs, uncappedDelay)
  const jitter =
    (deterministicFraction(`${key}:${attempt}`) * 2 - 1) * jitterRatio
  return Math.min(
    maxDelayMs,
    Math.max(0, Math.round(cappedDelay * (1 + jitter))),
  )
}

export function exponentialBackoffMs(
  attempt: number,
  baseDelayMs = 1_000,
  maxDelayMs = 60_000,
): number {
  return deterministicBackoffMs({
    attempt,
    baseDelayMs,
    jitterRatio: 0,
    key: "",
    maxDelayMs,
  })
}
