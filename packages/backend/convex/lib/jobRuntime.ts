export function withoutUndefinedValues<T extends Record<string, unknown>>(
  value: T,
): { [Key in keyof T]: Exclude<T[Key], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as { [Key in keyof T]: Exclude<T[Key], undefined> }
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
