import {
  MAX_CATEGORIZATION_BATCH_SIZE,
  validateCategorizationBatch,
  validateCategorizationCatalog,
  validateCategorizationOutput,
  type CategorizationCategory,
  type CategorizationMention,
  type CategorizationResult,
} from "../lib/deepseekCategorization"

export const CATEGORIZATION_LEASE_MS = 4 * 60_000
export const CATEGORIZATION_RETRY_BASE_MS = 30_000
export const MAX_CATEGORIZATION_RETRY_DELAY_MS = 30 * 60_000

export type CategorizationJobForClaim = {
  attempts: number
  id: string
  maxAttempts: number
  nextAttemptAt?: number | undefined
  status: "completed" | "dead" | "leased" | "pending"
  workspaceId: string
}

export type CategorizationFailurePlan =
  | {
      completedAt: number
      lastError: string
      status: "dead"
    }
  | {
      lastError: string
      nextAttemptAt: number
      status: "pending"
    }

export class CategorizationOrchestrationError extends Error {
  readonly code: "INVALID_APPLICATION" | "INVALID_JOB" | "INVALID_SNAPSHOT"

  constructor(
    code: CategorizationOrchestrationError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "CategorizationOrchestrationError"
    this.code = code
  }
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

function deterministicHash(value: string): number {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function canonicalCategorySnapshot(
  categories: readonly CategorizationCategory[],
): CategorizationCategory[] {
  return validateCategorizationCatalog(categories)
    .map((category) => ({
      description: category.description,
      id: category.id,
      name: category.name,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
}

export function categorySnapshotJson(
  categories: readonly CategorizationCategory[],
): string {
  return JSON.stringify({ categories: canonicalCategorySnapshot(categories) })
}

export function mentionText(input: { body: string; title?: string }): string {
  const body = input.body.trim()
  const title = input.title?.trim()
  if (body.length === 0) {
    throw new CategorizationOrchestrationError(
      "INVALID_APPLICATION",
      "Mention body must be non-empty",
    )
  }
  return title ? `${title}\n\n${body}` : body
}

export function canClaimCategorizationJob(
  job: CategorizationJobForClaim,
  now: number,
): boolean {
  assertTimestamp(now, "now")
  if (
    !Number.isInteger(job.attempts) ||
    job.attempts < 0 ||
    !Number.isInteger(job.maxAttempts) ||
    job.maxAttempts < 1
  ) {
    throw new CategorizationOrchestrationError(
      "INVALID_JOB",
      "Categorization job attempts are invalid",
    )
  }
  return (
    job.status === "pending" &&
    job.attempts < job.maxAttempts &&
    (job.nextAttemptAt === undefined || job.nextAttemptAt <= now)
  )
}

export function createCategorizationLease(input: {
  jobs: readonly CategorizationJobForClaim[]
  now: number
  snapshotJson: string
}): { expiresAt: number; token: string } {
  assertTimestamp(input.now, "now")
  if (
    input.jobs.length === 0 ||
    input.jobs.length > MAX_CATEGORIZATION_BATCH_SIZE
  ) {
    throw new CategorizationOrchestrationError(
      "INVALID_JOB",
      `Categorization leases require 1-${MAX_CATEGORIZATION_BATCH_SIZE} jobs`,
    )
  }
  if (input.snapshotJson.trim().length === 0) {
    throw new CategorizationOrchestrationError(
      "INVALID_SNAPSHOT",
      "Category snapshot must be non-empty",
    )
  }
  const workspaceId = input.jobs[0]!.workspaceId
  if (
    workspaceId.trim().length === 0 ||
    input.jobs.some(
      (job) =>
        job.workspaceId !== workspaceId ||
        !canClaimCategorizationJob(job, input.now),
    )
  ) {
    throw new CategorizationOrchestrationError(
      "INVALID_JOB",
      "Categorization jobs must be due in one workspace",
    )
  }

  const jobKey = input.jobs
    .map(({ id }) => id)
    .sort()
    .join(",")
  const snapshotKey = deterministicHash(input.snapshotJson).toString(16)
  return {
    expiresAt: input.now + CATEGORIZATION_LEASE_MS,
    token: `categorization:${encodeURIComponent(workspaceId)}:${snapshotKey}:${deterministicHash(jobKey).toString(16)}:${input.now}`,
  }
}

export function categorizationRetryDelayMs(input: {
  attempts: number
  jobKey: string
  retryAfterMs?: number | undefined
}): number {
  if (!Number.isInteger(input.attempts) || input.attempts < 1) {
    throw new RangeError("attempts must be a positive integer")
  }
  if (input.jobKey.trim().length === 0) {
    throw new TypeError("jobKey must be non-empty")
  }
  if (
    input.retryAfterMs !== undefined &&
    (!Number.isFinite(input.retryAfterMs) || input.retryAfterMs < 0)
  ) {
    throw new RangeError("retryAfterMs must be non-negative")
  }

  const exponential = Math.min(
    MAX_CATEGORIZATION_RETRY_DELAY_MS,
    CATEGORIZATION_RETRY_BASE_MS * 2 ** Math.min(input.attempts - 1, 20),
  )
  const jitter =
    0.75 +
    (deterministicHash(`categorization:${input.jobKey}:${input.attempts}`) /
      0x1_0000_0000) *
      0.5
  return Math.min(
    MAX_CATEGORIZATION_RETRY_DELAY_MS,
    Math.max(
      Math.round(exponential * jitter),
      Math.ceil(input.retryAfterMs ?? 0),
    ),
  )
}

export function planCategorizationFailure(input: {
  attempts: number
  errorCode: string
  maxAttempts: number
  now: number
  retryAfterMs?: number | undefined
  retryable: boolean
  stableJobKey: string
}): CategorizationFailurePlan {
  assertTimestamp(input.now, "now")
  if (
    !Number.isInteger(input.attempts) ||
    input.attempts < 1 ||
    !Number.isInteger(input.maxAttempts) ||
    input.maxAttempts < 1
  ) {
    throw new CategorizationOrchestrationError(
      "INVALID_JOB",
      "Categorization failure attempts are invalid",
    )
  }
  const errorCode = input.errorCode.trim()
  if (errorCode.length === 0) {
    throw new TypeError("errorCode must be non-empty")
  }

  if (!input.retryable || input.attempts >= input.maxAttempts) {
    return {
      completedAt: input.now,
      lastError: errorCode,
      status: "dead",
    }
  }

  return {
    lastError: errorCode,
    nextAttemptAt:
      input.now +
      categorizationRetryDelayMs({
        attempts: input.attempts,
        jobKey: input.stableJobKey,
        retryAfterMs: input.retryAfterMs,
      }),
    status: "pending",
  }
}

/** Revalidates the whole assignment before any storage mutation can begin. */
export function validateCategorizationApplication(input: {
  categories: readonly CategorizationCategory[]
  mentions: readonly CategorizationMention[]
  results: unknown
}): CategorizationResult[] {
  try {
    return validateCategorizationOutput(
      validateCategorizationBatch(input.mentions),
      canonicalCategorySnapshot(input.categories),
      input.results,
    )
  } catch (error) {
    throw new CategorizationOrchestrationError(
      "INVALID_APPLICATION",
      "Categorization assignments failed total batch validation",
      { cause: error },
    )
  }
}
