import { z } from "zod"

import type { EmailDeliveryStatus, SentEmailOutbox } from "./emailOutbox"

export const RESEND_EMAIL_EVENT_TYPES = [
  "email.scheduled",
  "email.sent",
  "email.delivery_delayed",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.complained",
  "email.bounced",
  "email.failed",
  "email.suppressed",
] as const

export type ResendEmailEventType = (typeof RESEND_EMAIL_EVENT_TYPES)[number]

export type VerifiedResendEmailEvent = {
  createdAt: number
  eventId: string
  providerMessageId: string
  type: ResendEmailEventType
}

export type ResendWebhookVerifier = {
  webhooks: {
    verify(input: {
      headers: { id: string; signature: string; timestamp: string }
      payload: string
      webhookSecret: string
    }): unknown
  }
}

export type ResendWebhookPlan =
  | { kind: "duplicate"; event: VerifiedResendEmailEvent }
  | { kind: "pending_match"; event: VerifiedResendEmailEvent }
  | {
      kind: "applied" | "ignored_stale"
      event: VerifiedResendEmailEvent
      outbox: SentEmailOutbox
    }

export const resendVerifiedEmailEventSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    data: z
      .object({
        email_id: z.string().trim().min(1),
      })
      .passthrough(),
    type: z.enum(RESEND_EMAIL_EVENT_TYPES),
  })
  .passthrough()

/**
 * Signature verification must run before parsing or persistence. The Svix id
 * becomes the durable webhook idempotency key.
 */
export function verifyResendEmailWebhook(input: {
  eventId: string
  payload: string
  signature: string
  timestamp: string
  verifier: ResendWebhookVerifier
  webhookSecret: string
}): VerifiedResendEmailEvent | null {
  if (
    input.eventId.length === 0 ||
    input.signature.length === 0 ||
    input.timestamp.length === 0 ||
    input.webhookSecret.length === 0
  ) {
    throw new TypeError(
      "Resend webhook signature headers and secret are required",
    )
  }

  const verified = input.verifier.webhooks.verify({
    headers: {
      id: input.eventId,
      signature: input.signature,
      timestamp: input.timestamp,
    },
    payload: input.payload,
    webhookSecret: input.webhookSecret,
  })
  const parsed = resendVerifiedEmailEventSchema.safeParse(verified)
  if (!parsed.success) {
    return null
  }

  return {
    createdAt: Date.parse(parsed.data.created_at),
    eventId: input.eventId,
    providerMessageId: parsed.data.data.email_id,
    type: parsed.data.type,
  }
}

const EVENT_STATUS: Record<ResendEmailEventType, EmailDeliveryStatus> = {
  "email.scheduled": "scheduled",
  "email.sent": "sent",
  "email.delivery_delayed": "delivery_delayed",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.complained": "complained",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
}

const EVENT_TIE_PRECEDENCE: Record<ResendEmailEventType, number> = {
  "email.scheduled": 10,
  "email.sent": 20,
  "email.delivery_delayed": 30,
  "email.delivered": 40,
  "email.opened": 50,
  "email.clicked": 60,
  "email.failed": 70,
  "email.suppressed": 80,
  "email.bounced": 90,
  "email.complained": 100,
}

function eventTypeForStatus(status: EmailDeliveryStatus): ResendEmailEventType {
  return `email.${status}` as ResendEmailEventType
}

function isNewerProviderEvent(
  outbox: SentEmailOutbox,
  event: VerifiedResendEmailEvent,
): boolean {
  if (outbox.lastProviderEventId === event.eventId) {
    return false
  }
  if (outbox.lastProviderEventAt === undefined) {
    return true
  }
  if (event.createdAt !== outbox.lastProviderEventAt) {
    return event.createdAt > outbox.lastProviderEventAt
  }

  const currentType = eventTypeForStatus(outbox.deliveryStatus)
  const precedenceDifference =
    EVENT_TIE_PRECEDENCE[event.type] - EVENT_TIE_PRECEDENCE[currentType]
  if (precedenceDifference !== 0) {
    return precedenceDifference > 0
  }

  return event.eventId.localeCompare(outbox.lastProviderEventId ?? "", "en") > 0
}

export function applyResendEmailEvent(
  outbox: SentEmailOutbox,
  event: VerifiedResendEmailEvent,
): { applied: boolean; outbox: SentEmailOutbox } {
  if (outbox.providerMessageId !== event.providerMessageId) {
    throw new TypeError("Resend event does not belong to this outbox row")
  }

  if (!isNewerProviderEvent(outbox, event)) {
    return { applied: false, outbox }
  }

  return {
    applied: true,
    outbox: {
      ...outbox,
      deliveryStatus: EVENT_STATUS[event.type],
      lastProviderEventAt: event.createdAt,
      lastProviderEventId: event.eventId,
      updatedAt: Math.max(outbox.updatedAt, event.createdAt),
    },
  }
}

/**
 * The adapter inserts each eventId once. pending_match is intentionally not
 * discarded: a webhook can race the send-completion mutation, so an internal
 * retry should reconcile it by providerMessageId later.
 */
export function planResendWebhook(input: {
  alreadyRecorded: boolean
  event: VerifiedResendEmailEvent
  outbox: SentEmailOutbox | null
}): ResendWebhookPlan {
  if (input.alreadyRecorded) {
    return { event: input.event, kind: "duplicate" }
  }
  if (!input.outbox) {
    return { event: input.event, kind: "pending_match" }
  }

  const result = applyResendEmailEvent(input.outbox, input.event)
  return {
    event: input.event,
    kind: result.applied ? "applied" : "ignored_stale",
    outbox: result.outbox,
  }
}
