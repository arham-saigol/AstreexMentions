import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_DAILY_DIGEST_TIME,
  dailyDigestPeriod,
  digestPeriodForLocalDate,
  digestTimeSchema,
  isValidLocalDate,
  isValidTimeZone,
  isWithinDigestPeriod,
  localDateSchema,
  nextDailyDigestAt,
  timeZoneSchema,
} from "./index"

const epoch = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds

describe("time zones and daily digest scheduling", () => {
  it("validates IANA time zones and the 09:00 product default", () => {
    expect(DEFAULT_DAILY_DIGEST_TIME).toBe("09:00")
    expect(isValidTimeZone("America/New_York")).toBe(true)
    expect(isValidTimeZone("Not/A_Zone")).toBe(false)
    expect(timeZoneSchema.parse(" Europe/London ")).toBe("Europe/London")
    expect(() => timeZoneSchema.parse("Mars/Olympus")).toThrow()
    expect(digestTimeSchema.parse("09:00")).toBe("09:00")
    expect(() => digestTimeSchema.parse("9:00")).toThrow()
    expect(() => digestTimeSchema.parse("24:00")).toThrow()
    expect(localDateSchema.parse("2026-07-25")).toBe("2026-07-25")
    expect(isValidLocalDate("2026-02-29")).toBe(false)
    expect(() => localDateSchema.parse("2026-02-30")).toThrow(
      "valid calendar date",
    )
  })

  it("finds the next 09:00 occurrence strictly after an instant", () => {
    expect(
      nextDailyDigestAt(epoch("2026-01-15T13:59:59Z"), "America/New_York"),
    ).toBe(epoch("2026-01-15T14:00:00Z"))
    expect(
      nextDailyDigestAt(epoch("2026-01-15T14:00:00Z"), "America/New_York"),
    ).toBe(epoch("2026-01-16T14:00:00Z"))
  })

  it("uses local calendar boundaries across spring DST", () => {
    const period = digestPeriodForLocalDate("2026-03-08", "America/New_York")
    expect(period.startAt).toBe(epoch("2026-03-08T05:00:00Z"))
    expect(period.endAt).toBe(epoch("2026-03-09T04:00:00Z"))
    expect(period.endAt - period.startAt).toBe(23 * 60 * 60 * 1_000)
    expect(isWithinDigestPeriod(period.startAt, period)).toBe(true)
    expect(isWithinDigestPeriod(period.endAt - 1, period)).toBe(true)
    expect(isWithinDigestPeriod(period.endAt, period)).toBe(false)
  })

  it("returns the previous local day for a scheduled digest", () => {
    const scheduledFor = epoch("2026-11-02T14:00:00Z")
    const period = dailyDigestPeriod(scheduledFor, "America/New_York")
    expect(period.localDate).toBe("2026-11-01")
    expect(period.startAt).toBe(epoch("2026-11-01T04:00:00Z"))
    expect(period.endAt).toBe(epoch("2026-11-02T05:00:00Z"))
    expect(period.endAt - period.startAt).toBe(25 * 60 * 60 * 1_000)
  })
})
