import { Temporal } from "@js-temporal/polyfill"

import {
  rankMentionsDeterministically,
  type RankedMention,
  type RankableMention,
} from "@astreex/domain"

export const DEFAULT_DIGEST_MENTION_LIMIT = 20
export const DAILY_DIGEST_DELIVERY_TIME = { hour: 9, minute: 0 } as const

export type DailyDigestWindow = {
  endAt: number
  localDate: string
  startAt: number
}

export type DigestPlanBase = {
  idempotencyKey: string
  nextRunAt: number
  scheduledFor: number
  window: DailyDigestWindow
}

export type DuplicateDigestPlan = DigestPlanBase & {
  kind: "duplicate"
}

export type EmptyDigestPlan = DigestPlanBase & {
  kind: "skipped_empty"
  runStatus: "skipped_empty"
}

export type EnqueuedDigestPlan<T extends RankableMention> = DigestPlanBase & {
  kind: "enqueue"
  outboxIdempotencyKey: string
  rankedMentions: RankedMention<T>[]
  runStatus: "enqueued"
}

export type DailyDigestPlan<T extends RankableMention> =
  DuplicateDigestPlan | EmptyDigestPlan | EnqueuedDigestPlan<T>

export function validateDailyDigestTimeZone(timeZone: string): string {
  const normalized = timeZone.trim()
  if (normalized.length === 0 || normalized.length > 120) {
    throw new RangeError("Digest timezone must be a valid IANA timezone")
  }

  try {
    Temporal.Now.zonedDateTimeISO(normalized)
  } catch (error) {
    throw new RangeError(`Invalid IANA time zone: ${normalized}`, {
      cause: error,
    })
  }

  return normalized
}

function instant(milliseconds: number): Temporal.Instant {
  if (!Number.isSafeInteger(milliseconds)) {
    throw new RangeError("Timestamp must be a safe integer in milliseconds")
  }

  return Temporal.Instant.fromEpochMilliseconds(milliseconds)
}

function startOfDay(
  date: Temporal.PlainDate,
  timeZone: string,
): Temporal.ZonedDateTime {
  return date.toZonedDateTime({
    plainTime: Temporal.PlainTime.from("00:00"),
    timeZone,
  })
}

/**
 * Returns the previous local calendar day for one persisted scheduled run.
 * Calendar boundaries are converted with Temporal, so DST days correctly span
 * 23 or 25 hours rather than being forced into a 24-hour UTC window.
 */
export function dailyDigestWindow(
  scheduledFor: number,
  timeZone: string,
): DailyDigestWindow {
  const scheduled = instant(scheduledFor).toZonedDateTimeISO(timeZone)
  const endDate = scheduled.toPlainDate()
  const startDate = endDate.subtract({ days: 1 })

  return {
    endAt: startOfDay(endDate, timeZone).epochMilliseconds,
    localDate: startDate.toString(),
    startAt: startOfDay(startDate, timeZone).epochMilliseconds,
  }
}

/** Returns the next 9:00 AM local occurrence strictly after afterAt. */
export function nextDailyDigestRunAt(
  afterAt: number,
  timeZone: string,
): number {
  const normalizedTimeZone = validateDailyDigestTimeZone(timeZone)
  const after = instant(afterAt)
  const local = after.toZonedDateTimeISO(normalizedTimeZone)
  let date = local.toPlainDate()

  const candidateFor = (candidateDate: Temporal.PlainDate) =>
    Temporal.ZonedDateTime.from(
      {
        day: candidateDate.day,
        hour: DAILY_DIGEST_DELIVERY_TIME.hour,
        microsecond: 0,
        millisecond: 0,
        minute: DAILY_DIGEST_DELIVERY_TIME.minute,
        month: candidateDate.month,
        nanosecond: 0,
        second: 0,
        timeZone: normalizedTimeZone,
        year: candidateDate.year,
      },
      { disambiguation: "compatible" },
    ).toInstant()

  let candidate = candidateFor(date)
  if (Temporal.Instant.compare(candidate, after) <= 0) {
    date = date.add({ days: 1 })
    candidate = candidateFor(date)
  }

  return candidate.epochMilliseconds
}

function keyPart(value: string): string {
  if (value.length === 0) {
    throw new TypeError("Digest idempotency key parts cannot be empty")
  }

  return encodeURIComponent(value)
}

export function dailyDigestIdempotencyKey(input: {
  localDate: string
  workspaceId: string
}): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    throw new TypeError("Digest localDate must use YYYY-MM-DD")
  }

  return ["daily-digest", keyPart(input.workspaceId), input.localDate].join(":")
}

/**
 * Produces a storage-ready decision for a due persisted schedule. The caller
 * must insert the digest run (unique by idempotencyKey), enqueue the outbox row
 * when present (unique by outboxIdempotencyKey), and advance nextRunAt in one
 * Convex mutation. An empty run is still recorded as skipped_empty, preventing
 * repeated work without sending an empty message.
 */
export function planDailyDigest<T extends RankableMention>(input: {
  alreadyRecorded: boolean
  mentionLimit?: number
  mentions: readonly T[]
  scheduledFor: number
  timeZone: string
  workspaceId: string
}): DailyDigestPlan<T> {
  const timeZone = validateDailyDigestTimeZone(input.timeZone)
  const window = dailyDigestWindow(input.scheduledFor, timeZone)
  const idempotencyKey = dailyDigestIdempotencyKey({
    localDate: window.localDate,
    workspaceId: input.workspaceId,
  })
  const nextRunAt = nextDailyDigestRunAt(input.scheduledFor, timeZone)
  const base = {
    idempotencyKey,
    nextRunAt,
    scheduledFor: input.scheduledFor,
    window,
  }

  if (input.alreadyRecorded) {
    return { ...base, kind: "duplicate" }
  }

  const mentionsInWindow = input.mentions.filter(
    ({ publishedAt }) =>
      publishedAt >= window.startAt && publishedAt < window.endAt,
  )

  if (mentionsInWindow.length === 0) {
    return {
      ...base,
      kind: "skipped_empty",
      runStatus: "skipped_empty",
    }
  }

  const mentionLimit = input.mentionLimit ?? DEFAULT_DIGEST_MENTION_LIMIT
  if (!Number.isInteger(mentionLimit) || mentionLimit < 1) {
    throw new RangeError("mentionLimit must be a positive integer")
  }
  const rankedMentions = rankMentionsDeterministically(
    mentionsInWindow,
    mentionLimit,
  )

  return {
    ...base,
    kind: "enqueue",
    outboxIdempotencyKey: `email:${idempotencyKey}`,
    rankedMentions,
    runStatus: "enqueued",
  }
}
