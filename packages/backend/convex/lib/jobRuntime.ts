import type { IndexRange } from "convex/server"
import type { Value } from "convex/values"

type RuntimeIndexRange = IndexRange & {
  gte(fieldName: string, value: unknown): RuntimeIndexRange
  lt(fieldName: string, value: unknown): RuntimeIndexRange
  lte(fieldName: string, value: unknown): RuntimeIndexRange
}

export function indexAtMost(
  builder: IndexRange,
  fieldName: string,
  value: unknown,
): IndexRange {
  return (builder as RuntimeIndexRange).lte(fieldName, value)
}

export function indexWindow(
  builder: IndexRange,
  fieldName: string,
  startAt: number,
  endAt: number,
): IndexRange {
  if (!Number.isSafeInteger(startAt) || !Number.isSafeInteger(endAt)) {
    throw new RangeError("Index window timestamps must be safe integers")
  }
  if (endAt < startAt) {
    throw new RangeError("Index window end must not precede its start")
  }
  return (builder as RuntimeIndexRange)
    .gte(fieldName, startAt)
    .lt(fieldName, endAt)
}

export function withoutUndefinedValues(
  value: Record<string, unknown>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as Record<string, Value>
}

export function boundedDurationMs(
  startedAt: number,
  finishedAt: number,
): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) {
    throw new RangeError("Job timestamps must be finite")
  }
  return Math.max(0, Math.round(finishedAt - startedAt))
}

export function createJobLeaseToken(input: {
  attempt: number
  jobId: string
  namespace: string
  now: number
}): string {
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new RangeError("Job lease attempt must be a positive safe integer")
  }
  if (!Number.isSafeInteger(input.now) || input.now < 0) {
    throw new RangeError(
      "Job lease timestamp must be a non-negative safe integer",
    )
  }
  const namespace = input.namespace.trim()
  const jobId = input.jobId.trim()
  if (!namespace || !jobId) {
    throw new TypeError("Job lease namespace and id must be non-empty")
  }
  return `${encodeURIComponent(namespace)}:${encodeURIComponent(jobId)}:${input.attempt}:${input.now}`
}
