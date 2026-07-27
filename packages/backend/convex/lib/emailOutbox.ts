export const DEFAULT_EMAIL_LEASE_MS = 60_000
export const DEFAULT_EMAIL_MAX_ATTEMPTS = 8
export const MAX_EMAIL_RETRY_DELAY_MS = 6 * 60 * 60 * 1_000

export type EmailPayload = {
  from: string
  html: string
  replyTo?: string
  subject: string
  text?: string
  to: readonly string[]
}

export type EmailDeliveryStatus =
  | "scheduled"
  | "sent"
  | "delivery_delayed"
  | "delivered"
  | "opened"
  | "clicked"
  | "complained"
  | "bounced"
  | "failed"
  | "suppressed"

export type PendingEmailOutbox = {
  attempts: number
  createdAt: number
  idempotencyKey: string
  lastError?: string
  nextAttemptAt: number
  payload: EmailPayload
  payloadFingerprint: string
  status: "pending"
  updatedAt: number
}

export type LeasedEmailOutbox = Omit<PendingEmailOutbox, "status"> & {
  leaseExpiresAt: number
  leaseToken: string
  status: "leased"
}

export type SentEmailOutbox = Omit<
  PendingEmailOutbox,
  "lastError" | "nextAttemptAt" | "status"
> & {
  deliveryStatus: EmailDeliveryStatus
  lastProviderEventAt?: number
  lastProviderEventId?: string
  providerMessageId: string
  sentAt: number
  status: "sent"
}

export type DeadEmailOutbox = Omit<
  PendingEmailOutbox,
  "nextAttemptAt" | "status"
> & {
  deadAt: number
  lastError: string
  status: "dead"
}

export type EmailOutbox =
  DeadEmailOutbox | LeasedEmailOutbox | PendingEmailOutbox | SentEmailOutbox

export class EmailOutboxInvariantError extends Error {
  readonly code:
    | "IDEMPOTENCY_COLLISION"
    | "INVALID_LEASE"
    | "INVALID_OUTBOX_STATE"
    | "PROVIDER_ID_MISMATCH"

  constructor(code: EmailOutboxInvariantError["code"], message: string) {
    super(message)
    this.name = "EmailOutboxInvariantError"
    this.code = code
  }
}

function validatePayload(payload: EmailPayload): void {
  if (
    payload.from.length === 0 ||
    payload.subject.length === 0 ||
    payload.html.length === 0 ||
    payload.to.length === 0 ||
    payload.to.some((recipient) => recipient.length === 0)
  ) {
    throw new TypeError(
      "Email payload requires from, at least one recipient, subject, and html",
    )
  }
}

function canonicalPayload(payload: EmailPayload): string {
  return JSON.stringify({
    from: payload.from,
    html: payload.html,
    replyTo: payload.replyTo ?? null,
    subject: payload.subject,
    text: payload.text ?? null,
    to: [...payload.to],
  })
}

/** Stable non-cryptographic fingerprint used only to detect key/payload collisions. */
export function emailPayloadFingerprint(payload: EmailPayload): string {
  validatePayload(payload)
  const canonical = canonicalPayload(payload)
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn

  for (const character of canonical) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = (hash * prime) & mask
  }

  return hash.toString(16).padStart(16, "0")
}

export function createPendingEmail(input: {
  idempotencyKey: string
  now: number
  payload: EmailPayload
}): PendingEmailOutbox {
  if (input.idempotencyKey.length === 0 || input.idempotencyKey.length > 256) {
    throw new RangeError(
      "Email idempotencyKey must contain between 1 and 256 characters",
    )
  }
  validatePayload(input.payload)

  return {
    attempts: 0,
    createdAt: input.now,
    idempotencyKey: input.idempotencyKey,
    nextAttemptAt: input.now,
    payload: {
      ...input.payload,
      to: [...input.payload.to],
    },
    payloadFingerprint: emailPayloadFingerprint(input.payload),
    status: "pending",
    updatedAt: input.now,
  }
}

/**
 * Models the result of a Convex mutation indexed by idempotencyKey. A duplicate
 * key is a no-op only when it represents the exact same immutable payload.
 */
export function enqueueEmailIdempotently(
  existing: EmailOutbox | null,
  input: { idempotencyKey: string; now: number; payload: EmailPayload },
):
  | { kind: "created"; outbox: PendingEmailOutbox }
  | { kind: "duplicate"; outbox: EmailOutbox } {
  const candidateFingerprint = emailPayloadFingerprint(input.payload)

  if (existing) {
    if (
      existing.idempotencyKey !== input.idempotencyKey ||
      existing.payloadFingerprint !== candidateFingerprint
    ) {
      throw new EmailOutboxInvariantError(
        "IDEMPOTENCY_COLLISION",
        "An email idempotency key cannot be reused for a different payload",
      )
    }

    return { kind: "duplicate", outbox: existing }
  }

  return { kind: "created", outbox: createPendingEmail(input) }
}

export function canClaimEmail(outbox: EmailOutbox, now: number): boolean {
  return (
    (outbox.status === "pending" && outbox.nextAttemptAt <= now) ||
    (outbox.status === "leased" && outbox.leaseExpiresAt <= now)
  )
}

export function claimEmail(input: {
  leaseMs?: number
  leaseToken: string
  now: number
  outbox: EmailOutbox
}): LeasedEmailOutbox {
  const leaseMs = input.leaseMs ?? DEFAULT_EMAIL_LEASE_MS
  if (input.leaseToken.length === 0) {
    throw new TypeError("leaseToken cannot be empty")
  }
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new RangeError("leaseMs must be positive")
  }
  if (!canClaimEmail(input.outbox, input.now)) {
    throw new EmailOutboxInvariantError(
      "INVALID_OUTBOX_STATE",
      "Email is not ready to be claimed",
    )
  }

  let claimable: Omit<PendingEmailOutbox, "status">
  if (input.outbox.status === "pending") {
    const { status: _status, ...pending } = input.outbox
    claimable = pending
  } else if (input.outbox.status === "leased") {
    const {
      leaseExpiresAt: _leaseExpiresAt,
      leaseToken: _leaseToken,
      status: _status,
      ...expiredLease
    } = input.outbox
    claimable = expiredLease
  } else {
    throw new EmailOutboxInvariantError(
      "INVALID_OUTBOX_STATE",
      "Email is not claimable",
    )
  }

  return {
    ...claimable,
    attempts: input.outbox.attempts + 1,
    leaseExpiresAt: input.now + leaseMs,
    leaseToken: input.leaseToken,
    status: "leased",
    updatedAt: input.now,
  }
}

function assertLease(outbox: LeasedEmailOutbox, leaseToken: string): void {
  if (outbox.leaseToken !== leaseToken) {
    throw new EmailOutboxInvariantError(
      "INVALID_LEASE",
      "Only the worker holding the current lease can complete this send",
    )
  }
}

export function completeEmailSend(input: {
  leaseToken: string
  now: number
  outbox: EmailOutbox
  providerMessageId: string
}): SentEmailOutbox {
  if (input.outbox.status === "sent") {
    if (input.outbox.providerMessageId !== input.providerMessageId) {
      throw new EmailOutboxInvariantError(
        "PROVIDER_ID_MISMATCH",
        "A sent email cannot be rebound to a different provider message",
      )
    }
    return input.outbox
  }

  if (input.outbox.status !== "leased") {
    throw new EmailOutboxInvariantError(
      "INVALID_OUTBOX_STATE",
      "Only a leased email can be completed",
    )
  }
  assertLease(input.outbox, input.leaseToken)
  if (input.providerMessageId.length === 0) {
    throw new TypeError("providerMessageId cannot be empty")
  }

  const {
    lastError: _lastError,
    leaseExpiresAt: _leaseExpiresAt,
    leaseToken: _leaseToken,
    nextAttemptAt: _nextAttemptAt,
    status: _status,
    ...sent
  } = input.outbox

  return {
    ...sent,
    deliveryStatus: "sent",
    providerMessageId: input.providerMessageId,
    sentAt: input.now,
    status: "sent",
    updatedAt: input.now,
  }
}

export function emailRetryDelayMs(attempts: number, jitterUnit = 0.5): number {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError("attempts must be a positive integer")
  }

  const exponential = Math.min(
    MAX_EMAIL_RETRY_DELAY_MS,
    30_000 * 2 ** Math.min(attempts - 1, 20),
  )
  const normalizedJitter = Math.min(1, Math.max(0, jitterUnit))
  return Math.round(exponential * (0.75 + normalizedJitter * 0.5))
}

export function failEmailSend(input: {
  error: string
  jitterUnit?: number
  leaseToken: string
  maxAttempts?: number
  now: number
  outbox: LeasedEmailOutbox
  retryable: boolean
}): DeadEmailOutbox | PendingEmailOutbox {
  assertLease(input.outbox, input.leaseToken)
  const maxAttempts = input.maxAttempts ?? DEFAULT_EMAIL_MAX_ATTEMPTS
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer")
  }

  const {
    leaseExpiresAt: _leaseExpiresAt,
    leaseToken: _leaseToken,
    status: _status,
    ...released
  } = input.outbox
  const shouldRetry = input.retryable && input.outbox.attempts < maxAttempts

  if (shouldRetry) {
    return {
      ...released,
      lastError: input.error,
      nextAttemptAt:
        input.now + emailRetryDelayMs(input.outbox.attempts, input.jitterUnit),
      status: "pending",
      updatedAt: input.now,
    }
  }

  const { nextAttemptAt: _nextAttemptAt, ...dead } = released
  return {
    ...dead,
    deadAt: input.now,
    lastError: input.error,
    status: "dead",
    updatedAt: input.now,
  }
}

export function isRetryableResendFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true
  }

  if (typeof error !== "object" || error === null) {
    return false
  }

  const candidate = error as { status?: unknown; statusCode?: unknown }
  const status =
    typeof candidate.statusCode === "number"
      ? candidate.statusCode
      : typeof candidate.status === "number"
        ? candidate.status
        : undefined

  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    (status === undefined && error instanceof Error)
  )
}
