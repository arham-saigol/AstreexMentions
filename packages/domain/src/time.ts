import { Temporal } from "@js-temporal/polyfill"
import { z } from "zod"

export const DEFAULT_DAILY_DIGEST_TIME = "09:00"

export type DigestPeriod = {
  endAt: number
  localDate: string
  startAt: number
  timeZone: string
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Temporal.Now.zonedDateTimeISO(timeZone)
    return true
  } catch {
    return false
  }
}

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTimeZone, "Must be a valid IANA time zone")

export const digestTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use 24-hour HH:mm format")

const ISO_LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseLocalDate(localDate: string): Temporal.PlainDate {
  if (!ISO_LOCAL_DATE_PATTERN.test(localDate)) {
    throw new RangeError("localDate must use YYYY-MM-DD format")
  }

  let date: Temporal.PlainDate
  try {
    date = Temporal.PlainDate.from(localDate)
  } catch (error) {
    throw new RangeError("localDate must be a valid calendar date", {
      cause: error,
    })
  }

  if (date.toString() !== localDate) {
    throw new RangeError("localDate must use YYYY-MM-DD format")
  }
  return date
}

export function isValidLocalDate(localDate: string): boolean {
  try {
    parseLocalDate(localDate)
    return true
  } catch {
    return false
  }
}

export const localDateSchema = z
  .string()
  .regex(ISO_LOCAL_DATE_PATTERN, "Date must use YYYY-MM-DD format")
  .refine(isValidLocalDate, "Date must be a valid calendar date")

function assertEpochMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Timestamp must be a safe integer in milliseconds")
  }
}

function parseTimeZone(timeZone: string): string {
  return timeZoneSchema.parse(timeZone)
}

function startOfLocalDate(
  date: Temporal.PlainDate,
  timeZone: string,
): Temporal.ZonedDateTime {
  return date.toZonedDateTime({
    plainTime: Temporal.PlainTime.from("00:00"),
    timeZone,
  })
}

function digestPeriodFromDate(
  date: Temporal.PlainDate,
  timeZone: string,
): DigestPeriod {
  return {
    startAt: startOfLocalDate(date, timeZone).epochMilliseconds,
    endAt: startOfLocalDate(date.add({ days: 1 }), timeZone).epochMilliseconds,
    localDate: date.toString(),
    timeZone,
  }
}

export function digestPeriodForLocalDate(
  localDate: string,
  timeZone: string,
): DigestPeriod {
  const parsedTimeZone = parseTimeZone(timeZone)
  return digestPeriodFromDate(parseLocalDate(localDate), parsedTimeZone)
}

/** Returns the previous local calendar day for a scheduled digest occurrence. */
export function dailyDigestPeriod(
  scheduledFor: number,
  timeZone: string,
): DigestPeriod {
  assertEpochMilliseconds(scheduledFor)
  const parsedTimeZone = parseTimeZone(timeZone)
  const scheduledDate = Temporal.Instant.fromEpochMilliseconds(scheduledFor)
    .toZonedDateTimeISO(parsedTimeZone)
    .toPlainDate()
  return digestPeriodFromDate(
    scheduledDate.subtract({ days: 1 }),
    parsedTimeZone,
  )
}

export const dailyDigestWindow = dailyDigestPeriod

/** Returns the configured local wall-clock occurrence strictly after afterAt. */
export function nextDailyDigestAt(
  afterAt: number,
  timeZone: string,
  localTime = DEFAULT_DAILY_DIGEST_TIME,
): number {
  assertEpochMilliseconds(afterAt)
  const parsedTimeZone = parseTimeZone(timeZone)
  const parsedTime = Temporal.PlainTime.from(digestTimeSchema.parse(localTime))
  const after = Temporal.Instant.fromEpochMilliseconds(afterAt)
  const local = after.toZonedDateTimeISO(parsedTimeZone)
  let date = local.toPlainDate()

  const candidateFor = (candidateDate: Temporal.PlainDate) =>
    Temporal.ZonedDateTime.from(
      {
        year: candidateDate.year,
        month: candidateDate.month,
        day: candidateDate.day,
        hour: parsedTime.hour,
        minute: parsedTime.minute,
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
        timeZone: parsedTimeZone,
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

export const nextDailyDigestRunAt = nextDailyDigestAt

export function isWithinDigestPeriod(
  timestamp: number,
  period: DigestPeriod,
): boolean {
  assertEpochMilliseconds(timestamp)
  return timestamp >= period.startAt && timestamp < period.endAt
}
