import { describe, expect, it, vi } from "vitest"

import {
  assertCategoryCatalog,
  assertCategoryDeletionAllowed,
  assertCategoryUpdateAllowed,
  CategoryInvariantError,
  DEFAULT_CATEGORIES,
  MENTION_CATEGORIES,
  requireMentionCategory,
} from "../convex/lib/categories"
import {
  dailyDigestWindow,
  nextDailyDigestRunAt,
  planDailyDigest,
} from "../convex/lib/dailyDigest"
import {
  claimEmail,
  completeEmailSend,
  createPendingEmail,
  EmailOutboxInvariantError,
  enqueueEmailIdempotently,
  failEmailSend,
  type EmailPayload,
} from "../convex/lib/emailOutbox"
import type { RankableMention } from "@astreex/domain"
import { sendLeasedEmailWithResend } from "../convex/lib/resendDelivery"
import {
  applyResendEmailEvent,
  planResendWebhook,
  verifyResendEmailWebhook,
} from "../convex/lib/resendWebhook"

describe("workspace category invariants", () => {
  const systemCategories = DEFAULT_CATEGORIES.map((category) => ({
    enabled: category.enabled,
    isSystem: category.isSystem,
    name: category.name,
    systemKey: category.systemKey,
  }))

  it("keeps exact defaults while allowing custom string names", () => {
    expect(MENTION_CATEGORIES).toEqual([
      "Question",
      "Complaint",
      "Praise",
      "Bug",
      "Feature Request",
      "Competitor Mention",
      "Other",
    ])
    expect(requireMentionCategory("Sales Lead")).toBe("Sales Lead")
    expect(() =>
      assertCategoryCatalog([
        ...systemCategories,
        { enabled: true, isSystem: false, name: "Sales Lead" },
      ]),
    ).not.toThrow()
  })

  it("allows default rename/disable and only custom deletion", () => {
    const question = systemCategories[0]!
    const custom = { enabled: true, isSystem: false, name: "Sales Lead" }

    expect(() =>
      assertCategoryUpdateAllowed(question, {
        enabled: false,
        name: "Pre-sales Question",
      }),
    ).not.toThrow()
    expect(() => assertCategoryDeletionAllowed(custom)).not.toThrow()
    expect(() => assertCategoryDeletionAllowed(question)).toThrowError(
      expect.objectContaining({
        code: "SYSTEM_CATEGORY_DELETE_FORBIDDEN",
      }),
    )
  })

  it("keeps Other named, enabled, and undeletable by stable system key", () => {
    const other = systemCategories.at(-1)!

    expect(() => assertCategoryCatalog(systemCategories)).not.toThrow()
    expect(() =>
      assertCategoryUpdateAllowed(other, { enabled: false }),
    ).toThrowError(CategoryInvariantError)
    expect(() =>
      assertCategoryUpdateAllowed(other, { name: "Miscellaneous" }),
    ).toThrowError(
      expect.objectContaining({ code: "OTHER_CATEGORY_IMMUTABLE" }),
    )
    expect(() => assertCategoryDeletionAllowed(other)).toThrowError(
      expect.objectContaining({ code: "OTHER_CATEGORY_IMMUTABLE" }),
    )
  })
})

type DigestMention = RankableMention & { title: string }

const digestTimeZone = "UTC"
const scheduledFor = Date.parse("2026-07-26T09:00:00.000Z")
const digestMention = (input: Partial<DigestMention> = {}): DigestMention => ({
  engagement: {
    comments: 2,
    score: 5,
    source: "reddit",
  },
  publishedAt: Date.parse("2026-07-25T12:00:00.000Z"),
  stableId: "reddit:1",
  title: "Astreex thread",
  ...input,
})

describe("daily timezone digest", () => {
  it("uses local calendar windows across 23-hour and 25-hour DST days", () => {
    const springWindow = dailyDigestWindow(
      Date.parse("2026-03-09T13:00:00.000Z"),
      "America/New_York",
    )
    const fallWindow = dailyDigestWindow(
      Date.parse("2026-11-02T14:00:00.000Z"),
      "America/New_York",
    )

    expect(springWindow.localDate).toBe("2026-03-08")
    expect(springWindow.endAt - springWindow.startAt).toBe(23 * 60 * 60 * 1_000)
    expect(fallWindow.localDate).toBe("2026-11-01")
    expect(fallWindow.endAt - fallWindow.startAt).toBe(25 * 60 * 60 * 1_000)
  })

  it("always schedules the next 9:00 AM local run across DST", () => {
    expect(
      nextDailyDigestRunAt(
        Date.parse("2026-03-08T00:00:00.000Z"),
        "America/New_York",
      ),
    ).toBe(Date.parse("2026-03-08T13:00:00.000Z"))
  })

  it("records an idempotent skipped run and never enqueues an empty digest", () => {
    const plan = planDailyDigest<DigestMention>({
      alreadyRecorded: false,
      mentions: [],
      scheduledFor,
      timeZone: digestTimeZone,
      workspaceId: "workspace-1",
    })

    expect(plan).toMatchObject({
      idempotencyKey: "daily-digest:workspace-1:2026-07-25",
      kind: "skipped_empty",
      runStatus: "skipped_empty",
    })
    expect(plan).not.toHaveProperty("outboxIdempotencyKey")
  })

  it("never permits a non-empty run to be truncated into an empty email", () => {
    expect(() =>
      planDailyDigest({
        alreadyRecorded: false,
        mentionLimit: 0,
        mentions: [digestMention()],
        scheduledFor,
        timeZone: digestTimeZone,
        workspaceId: "workspace-1",
      }),
    ).toThrowError("mentionLimit must be a positive integer")
  })

  it("treats an existing local-date run as a no-op", () => {
    expect(
      planDailyDigest({
        alreadyRecorded: true,
        mentions: [digestMention()],
        scheduledFor,
        timeZone: digestTimeZone,
        workspaceId: "workspace-1",
      }),
    ).toMatchObject({ kind: "duplicate" })
  })

  it("filters the exact window and deterministically ranks a non-empty digest", () => {
    const lowerEngagement = digestMention({
      engagement: { comments: 0, points: 1, source: "hacker_news" },
      stableId: "hn:1",
    })
    const outsideWindow = digestMention({
      publishedAt: Date.parse("2026-07-26T00:00:00.000Z"),
      stableId: "reddit:outside",
    })
    const plan = planDailyDigest({
      alreadyRecorded: false,
      mentions: [lowerEngagement, outsideWindow, digestMention()],
      scheduledFor,
      timeZone: digestTimeZone,
      workspaceId: "workspace-1",
    })

    expect(plan.kind).toBe("enqueue")
    if (plan.kind !== "enqueue") {
      throw new Error("Expected an enqueued digest")
    }
    expect(plan.outboxIdempotencyKey).toBe(
      "email:daily-digest:workspace-1:2026-07-25",
    )
    expect(plan.rankedMentions.map(({ stableId }) => stableId)).toEqual([
      "reddit:1",
      "hn:1",
    ])
  })
})

const emailPayload: EmailPayload = {
  from: "Astreex <digest@example.com>",
  html: "<p>Digest</p>",
  subject: "Daily digest",
  text: "Digest",
  to: ["customer@example.com"],
}

describe("Resend outbox", () => {
  it("deduplicates the same immutable payload and rejects key collisions", () => {
    const pending = createPendingEmail({
      idempotencyKey: "email:digest-1",
      now: 100,
      payload: emailPayload,
    })

    expect(
      enqueueEmailIdempotently(pending, {
        idempotencyKey: "email:digest-1",
        now: 200,
        payload: emailPayload,
      }),
    ).toEqual({ kind: "duplicate", outbox: pending })
    expect(() =>
      enqueueEmailIdempotently(pending, {
        idempotencyKey: "email:digest-1",
        now: 200,
        payload: { ...emailPayload, subject: "Different" },
      }),
    ).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_COLLISION" }))
  })

  it("uses leases, bounded exponential retry, and terminal dead-letter state", () => {
    const pending = createPendingEmail({
      idempotencyKey: "email:digest-1",
      now: 0,
      payload: emailPayload,
    })
    const leased = claimEmail({
      leaseToken: "lease-1",
      now: 1_000,
      outbox: pending,
    })

    expect(leased.attempts).toBe(1)
    expect(() =>
      failEmailSend({
        error: "timeout",
        leaseToken: "wrong-lease",
        now: 2_000,
        outbox: leased,
        retryable: true,
      }),
    ).toThrowError(EmailOutboxInvariantError)

    const retry = failEmailSend({
      error: "timeout",
      jitterUnit: 0.5,
      leaseToken: "lease-1",
      now: 2_000,
      outbox: leased,
      retryable: true,
    })
    expect(retry).toMatchObject({
      nextAttemptAt: 32_000,
      status: "pending",
    })

    if (retry.status !== "pending") {
      throw new Error("Expected a retryable email")
    }
    const finalLease = claimEmail({
      leaseToken: "lease-2",
      now: retry.nextAttemptAt,
      outbox: retry,
    })
    expect(
      failEmailSend({
        error: "invalid sender",
        leaseToken: "lease-2",
        maxAttempts: 2,
        now: 40_000,
        outbox: finalLease,
        retryable: false,
      }),
    ).toMatchObject({ status: "dead" })
  })

  it("reclaims expired leases and completes a provider response idempotently", () => {
    const firstLease = claimEmail({
      leaseMs: 100,
      leaseToken: "lease-1",
      now: 0,
      outbox: createPendingEmail({
        idempotencyKey: "email:digest-1",
        now: 0,
        payload: emailPayload,
      }),
    })
    const replacementLease = claimEmail({
      leaseToken: "lease-2",
      now: 100,
      outbox: firstLease,
    })
    const sent = completeEmailSend({
      leaseToken: "lease-2",
      now: 200,
      outbox: replacementLease,
      providerMessageId: "resend-email-1",
    })

    expect(replacementLease.attempts).toBe(2)
    expect(
      completeEmailSend({
        leaseToken: "stale-token-is-irrelevant-after-success",
        now: 300,
        outbox: sent,
        providerMessageId: "resend-email-1",
      }),
    ).toBe(sent)
  })

  it("passes the durable outbox key to Resend as Idempotency-Key", async () => {
    const leased = claimEmail({
      leaseToken: "lease-1",
      now: 0,
      outbox: createPendingEmail({
        idempotencyKey: "email:digest-1",
        now: 0,
        payload: emailPayload,
      }),
    })
    const send = vi.fn().mockResolvedValue({
      data: { id: "resend-email-1" },
      error: null,
    })

    await expect(
      sendLeasedEmailWithResend({ emails: { send } }, leased),
    ).resolves.toBe("resend-email-1")
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Daily digest" }),
      { idempotencyKey: "email:digest-1" },
    )
  })
})

describe("Resend webhook projection", () => {
  const sentOutbox = completeEmailSend({
    leaseToken: "lease-1",
    now: 100,
    outbox: claimEmail({
      leaseToken: "lease-1",
      now: 0,
      outbox: createPendingEmail({
        idempotencyKey: "email:digest-1",
        now: 0,
        payload: emailPayload,
      }),
    }),
    providerMessageId: "resend-email-1",
  })

  it("verifies the raw body before projecting a minimal email event", () => {
    const verify = vi.fn().mockReturnValue({
      created_at: "2026-07-26T10:00:00.000Z",
      data: { email_id: "resend-email-1", ignoredPii: "not persisted" },
      type: "email.delivered",
    })

    expect(
      verifyResendEmailWebhook({
        eventId: "svix-event-1",
        payload: "raw request body",
        signature: "v1,signature",
        timestamp: "1753524000",
        verifier: { webhooks: { verify } },
        webhookSecret: "whsec_test",
      }),
    ).toEqual({
      createdAt: Date.parse("2026-07-26T10:00:00.000Z"),
      eventId: "svix-event-1",
      providerMessageId: "resend-email-1",
      type: "email.delivered",
    })
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ payload: "raw request body" }),
    )
  })

  it("keeps unmatched verified events pending for race-safe reconciliation", () => {
    const event = {
      createdAt: 200,
      eventId: "svix-event-1",
      providerMessageId: "resend-email-1",
      type: "email.sent" as const,
    }

    expect(
      planResendWebhook({
        alreadyRecorded: false,
        event,
        outbox: null,
      }),
    ).toEqual({ event, kind: "pending_match" })
    expect(
      planResendWebhook({
        alreadyRecorded: true,
        event,
        outbox: sentOutbox,
      }),
    ).toEqual({ event, kind: "duplicate" })
  })

  it("applies newer events and ignores stale out-of-order delivery events", () => {
    const delivered = applyResendEmailEvent(sentOutbox, {
      createdAt: 300,
      eventId: "svix-delivered",
      providerMessageId: "resend-email-1",
      type: "email.delivered",
    }).outbox
    const stale = applyResendEmailEvent(delivered, {
      createdAt: 200,
      eventId: "svix-sent",
      providerMessageId: "resend-email-1",
      type: "email.sent",
    })
    const bounced = applyResendEmailEvent(delivered, {
      createdAt: 400,
      eventId: "svix-bounced",
      providerMessageId: "resend-email-1",
      type: "email.bounced",
    })

    expect(delivered.deliveryStatus).toBe("delivered")
    expect(stale).toEqual({ applied: false, outbox: delivered })
    expect(bounced.outbox.deliveryStatus).toBe("bounced")
  })
})
