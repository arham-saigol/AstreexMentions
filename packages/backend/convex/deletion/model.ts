import { createJobLeaseToken } from "../lib/jobRuntime"

export const ACCOUNT_DELETION_WORKFLOW_VERSION = 2
export const ACCOUNT_DELETION_LEASE_MS = 5 * 60_000
export const ACCOUNT_DELETION_BATCH_SIZE = 50
export const ACCOUNT_DELETION_MAX_ATTEMPTS = 10
export const DEFAULT_IDENTITY_SECURITY_FENCE_MS = 24 * 60 * 60_000

export const ACCOUNT_DELETION_PHASES = [
  "billing_check",
  "purge",
  "verify_data",
  "identity_delete",
  "security_fence",
  "done",
] as const

export type AccountDeletionPhase = (typeof ACCOUNT_DELETION_PHASES)[number]

export const ACCOUNT_DELETION_PURGE_STAGES = [
  "email_webhook_events",
  "digest_runs",
  "email_outbox",
  "digest_preferences",
  "mention_keyword_matches",
  "categorization_jobs",
  "saved_views",
  "feature_requests",
  "mentions",
  "tracking_provider_pages",
  "tracking_sources",
  "keywords",
  "categories",
  "usage_cycles",
  "billing_checkouts",
  "subscriptions",
  "provider_runs",
  "system_metric_buckets",
  "billing_events",
  "audit_events",
  "workspace_members",
  "workspace",
  "user_tombstone",
] as const

export type AccountDeletionPurgeStage =
  (typeof ACCOUNT_DELETION_PURGE_STAGES)[number]

export type AccountDeletionJobStatus =
  | "billing_check"
  | "blocked"
  | "canceled"
  | "completed"
  | "dead"
  | "failed"
  | "leased"
  | "pending"
  | "running"

export type DeletionLease = {
  attempts: number
  expiresAt: number
  token: string
  version: number
}

export type DeletionFailurePlan =
  | {
      nextAttemptAt: number
      status: "failed"
    }
  | {
      status: "dead"
    }

const MAX_RETRY_DELAY_MS = 6 * 60 * 60_000
const BASE_RETRY_DELAY_MS = 30_000

export function accountDeletionResourceKey(accountUserId: string): string {
  const normalized = accountUserId.trim()
  if (!normalized) {
    throw new TypeError("Account deletion resource id must be non-empty")
  }
  return `account:${normalized}`
}

export function accountDeletionOperationId(
  accountUserId: string,
  generation: number,
): string {
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new RangeError("Account deletion generation must be positive")
  }
  return `${accountDeletionResourceKey(accountUserId)}:${generation}`
}

export function isTerminalDeletionStatus(
  status: AccountDeletionJobStatus,
): boolean {
  return status === "canceled" || status === "completed" || status === "dead"
}

export function canClaimDeletionJob(input: {
  leaseExpiresAt?: number | undefined
  nextAttemptAt?: number | undefined
  now: number
  status: AccountDeletionJobStatus
}): boolean {
  if (!Number.isSafeInteger(input.now) || input.now < 0) {
    return false
  }
  if (input.status === "pending" || input.status === "failed") {
    return (input.nextAttemptAt ?? 0) <= input.now
  }
  if (input.status === "leased" || input.status === "running") {
    return (input.leaseExpiresAt ?? Number.POSITIVE_INFINITY) <= input.now
  }
  return false
}

export function createDeletionLease(input: {
  attempts: number
  jobId: string
  leaseVersion: number
  now: number
}): DeletionLease {
  const attempts = input.attempts + 1
  const version = input.leaseVersion + 1
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new RangeError("Account deletion attempts are invalid")
  }
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError("Account deletion lease version is invalid")
  }

  return {
    attempts,
    expiresAt: input.now + ACCOUNT_DELETION_LEASE_MS,
    token: createJobLeaseToken({
      attempt: attempts,
      jobId: input.jobId,
      namespace: "account-deletion",
      now: input.now,
    }),
    version,
  }
}

export function createDeletionContinuationLease(input: {
  attempts: number
  jobId: string
  leaseVersion: number
  now: number
}): DeletionLease {
  const version = input.leaseVersion + 1
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1) {
    throw new RangeError("Account deletion attempts are invalid")
  }
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError("Account deletion lease version is invalid")
  }

  return {
    attempts: input.attempts,
    expiresAt: input.now + ACCOUNT_DELETION_LEASE_MS,
    token: createJobLeaseToken({
      attempt: input.attempts,
      jobId: input.jobId,
      namespace: `account-deletion-continuation:${version}`,
      now: input.now,
    }),
    version,
  }
}

export function deletionRetryDelayMs(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new RangeError("Account deletion attempts must be positive")
  }
  return Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** Math.min(30, attempts - 1),
  )
}

export function planDeletionFailure(input: {
  attempts: number
  maxAttempts: number
  now: number
  retryable: boolean
}): DeletionFailurePlan {
  if (
    !input.retryable ||
    input.attempts >= input.maxAttempts ||
    input.maxAttempts < 1
  ) {
    return { status: "dead" }
  }
  return {
    nextAttemptAt: input.now + deletionRetryDelayMs(input.attempts),
    status: "failed",
  }
}

export function nextPurgeStage(
  stage: AccountDeletionPurgeStage,
): AccountDeletionPurgeStage | null {
  const index = ACCOUNT_DELETION_PURGE_STAGES.indexOf(stage)
  if (index < 0) {
    throw new TypeError("Account deletion purge stage is invalid")
  }
  return ACCOUNT_DELETION_PURGE_STAGES[index + 1] ?? null
}

export function safeDeletionErrorCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 80)
  return normalized || "ACCOUNT_DELETION_FAILED"
}
