import {
  MAX_MENTION_ANALYSIS_BATCH_SIZE,
  MENTION_ANALYSIS_VERSION,
  normalizeMentionAnalysisMentionText,
  validateMentionAnalysisBatch,
  validateMentionAnalysisCatalog,
  validateMentionAnalysisOutput,
  type MentionAnalysisCategory,
  type MentionAnalysisContext,
  type MentionAnalysisMention,
  type MentionAnalysisResult,
} from "../lib/deepseekMentionAnalysis"

export const MENTION_ANALYSIS_LEASE_MS = 4 * 60_000
export const MENTION_ANALYSIS_RETRY_BASE_MS = 30_000
export const MAX_MENTION_ANALYSIS_RETRY_DELAY_MS = 30 * 60_000

export type MentionAnalysisJobForClaim = {
  attempts: number
  id: string
  maxAttempts: number
  nextAttemptAt?: number | undefined
  status: "completed" | "dead" | "leased" | "pending"
  workspaceId: string
}

export type MentionAnalysisFailurePlan =
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

export class MentionAnalysisOrchestrationError extends Error {
  readonly code: "INVALID_APPLICATION" | "INVALID_JOB" | "INVALID_SNAPSHOT"

  constructor(
    code: MentionAnalysisOrchestrationError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "MentionAnalysisOrchestrationError"
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

export function canonicalCategoryCatalog(
  categories: readonly MentionAnalysisCategory[],
): MentionAnalysisCategory[] {
  return validateMentionAnalysisCatalog(categories)
    .map((category) => ({
      description: category.description,
      id: category.id,
      name: category.name,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
}

export function analysisSnapshotJson(
  categories: readonly MentionAnalysisCategory[],
  context: MentionAnalysisContext,
): string {
  return JSON.stringify({
    analysisVersion: MENTION_ANALYSIS_VERSION,
    categories: canonicalCategoryCatalog(categories),
    filteringContext: context.filteringContext,
    filteringGuidelines: context.filteringGuidelines ?? "",
  })
}

export function mentionText(input: { body: string; title?: string }): string {
  const body = input.body.trim()
  const title = input.title?.trim()
  if (body.length === 0) {
    throw new MentionAnalysisOrchestrationError(
      "INVALID_APPLICATION",
      "Mention body must be non-empty",
    )
  }
  return normalizeMentionAnalysisMentionText(
    title ? `${title}\n\n${body}` : body,
  )
}

export function canClaimMentionAnalysisJob(
  job: MentionAnalysisJobForClaim,
  now: number,
): boolean {
  assertTimestamp(now, "now")
  if (
    !Number.isInteger(job.attempts) ||
    job.attempts < 0 ||
    !Number.isInteger(job.maxAttempts) ||
    job.maxAttempts < 1
  ) {
    throw new MentionAnalysisOrchestrationError(
      "INVALID_JOB",
      "Mention analysis job attempts are invalid",
    )
  }
  return (
    job.status === "pending" &&
    job.attempts < job.maxAttempts &&
    (job.nextAttemptAt === undefined || job.nextAttemptAt <= now)
  )
}

export function createMentionAnalysisLease(input: {
  jobs: readonly MentionAnalysisJobForClaim[]
  now: number
  snapshotJson: string
}): { expiresAt: number; token: string } {
  assertTimestamp(input.now, "now")
  if (
    input.jobs.length === 0 ||
    input.jobs.length > MAX_MENTION_ANALYSIS_BATCH_SIZE
  ) {
    throw new MentionAnalysisOrchestrationError(
      "INVALID_JOB",
      `Mention analysis leases require 1-${MAX_MENTION_ANALYSIS_BATCH_SIZE} jobs`,
    )
  }
  if (input.snapshotJson.trim().length === 0) {
    throw new MentionAnalysisOrchestrationError(
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
        !canClaimMentionAnalysisJob(job, input.now),
    )
  ) {
    throw new MentionAnalysisOrchestrationError(
      "INVALID_JOB",
      "Mention analysis jobs must be due in one workspace",
    )
  }

  const jobKey = input.jobs
    .map(({ id }) => id)
    .sort()
    .join(",")
  const snapshotKey = deterministicHash(input.snapshotJson).toString(16)
  return {
    expiresAt: input.now + MENTION_ANALYSIS_LEASE_MS,
    token: `mention-analysis:${encodeURIComponent(workspaceId)}:${snapshotKey}:${deterministicHash(jobKey).toString(16)}:${input.now}`,
  }
}

export function mentionAnalysisRetryDelayMs(input: {
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
    MAX_MENTION_ANALYSIS_RETRY_DELAY_MS,
    MENTION_ANALYSIS_RETRY_BASE_MS * 2 ** Math.min(input.attempts - 1, 20),
  )
  const jitter =
    0.75 +
    (deterministicHash(`mention-analysis:${input.jobKey}:${input.attempts}`) /
      0x1_0000_0000) *
      0.5
  return Math.min(
    MAX_MENTION_ANALYSIS_RETRY_DELAY_MS,
    Math.max(
      Math.round(exponential * jitter),
      Math.ceil(input.retryAfterMs ?? 0),
    ),
  )
}

export function planMentionAnalysisFailure(input: {
  attempts: number
  errorCode: string
  maxAttempts: number
  now: number
  retryAfterMs?: number | undefined
  retryable: boolean
  stableJobKey: string
}): MentionAnalysisFailurePlan {
  assertTimestamp(input.now, "now")
  if (
    !Number.isInteger(input.attempts) ||
    input.attempts < 1 ||
    !Number.isInteger(input.maxAttempts) ||
    input.maxAttempts < 1
  ) {
    throw new MentionAnalysisOrchestrationError(
      "INVALID_JOB",
      "Mention analysis failure attempts are invalid",
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
      mentionAnalysisRetryDelayMs({
        attempts: input.attempts,
        jobKey: input.stableJobKey,
        retryAfterMs: input.retryAfterMs,
      }),
    status: "pending",
  }
}

/** Revalidates the whole assignment before any storage mutation can begin. */
export function validateMentionAnalysisApplication(input: {
  categories: readonly MentionAnalysisCategory[]
  mentions: readonly MentionAnalysisMention[]
  results: unknown
}): MentionAnalysisResult[] {
  try {
    return validateMentionAnalysisOutput(
      validateMentionAnalysisBatch(input.mentions),
      canonicalCategoryCatalog(input.categories),
      input.results,
    )
  } catch (error) {
    throw new MentionAnalysisOrchestrationError(
      "INVALID_APPLICATION",
      "Mention analysis assignments failed total batch validation",
      { cause: error },
    )
  }
}
