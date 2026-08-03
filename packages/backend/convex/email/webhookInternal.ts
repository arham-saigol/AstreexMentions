import { type GenericId, v } from "convex/values"

import {
  applyResendEmailEvent,
  type ResendEmailEventType,
  type VerifiedResendEmailEvent,
} from "../lib/resendWebhook"
import { internalMutationReference } from "../lib/functionReferences"
import { incrementDailySystemMetric } from "../lib/systemMetricBuckets"
import { indexEquals, internalMutation, type MutationCtx } from "../server"
import { outboxFromRow } from "./internal"

const WEBHOOK_RETRY_DELAY_MS = 30_000
const MAX_WEBHOOK_MATCH_ATTEMPTS = 8

type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type EmailOutboxId = GenericId<"emailOutbox">
type EmailWebhookEventId = GenericId<"emailWebhookEvents">
type WorkspaceId = GenericId<"workspaces">

const resendEmailEventTypeValidator = v.union(
  v.literal("email.scheduled"),
  v.literal("email.sent"),
  v.literal("email.delivery_delayed"),
  v.literal("email.delivered"),
  v.literal("email.opened"),
  v.literal("email.clicked"),
  v.literal("email.complained"),
  v.literal("email.bounced"),
  v.literal("email.failed"),
  v.literal("email.suppressed"),
)

function eventFromArguments(args: {
  createdAt: number
  eventId: string
  providerMessageId: string
  type: ResendEmailEventType
}): VerifiedResendEmailEvent {
  return args
}

async function applyEventToOutbox(
  ctx: MutationCtx,
  eventRowId: EmailWebhookEventId,
  event: VerifiedResendEmailEvent,
  outboxRow: GenericRow,
  now: number,
): Promise<"applied" | "ignored_stale"> {
  const outbox = outboxFromRow(outboxRow)
  if (outbox.status !== "sent") {
    throw new TypeError("Matched Resend outbox row is not sent")
  }
  const application = applyResendEmailEvent(outbox, event)
  const status = application.applied ? "applied" : "ignored_stale"
  if (application.applied) {
    await ctx.db.patch("emailOutbox", outboxRow._id as EmailOutboxId, {
      deliveryStatus: application.outbox.deliveryStatus,
      lastProviderEventAt: application.outbox.lastProviderEventAt,
      lastProviderEventId: application.outbox.lastProviderEventId,
      updatedAt: application.outbox.updatedAt,
    })
    await incrementDailySystemMetric(ctx, {
      bucketAt: now,
      metric: `email_delivery_${application.outbox.deliveryStatus}`,
      updatedAt: now,
      workspaceId: outboxRow.workspaceId as WorkspaceId,
    })
  }
  await ctx.db.patch("emailWebhookEvents", eventRowId, {
    nextAttemptAt: undefined,
    outboxId: outboxRow._id as EmailOutboxId,
    processedAt: now,
    status,
    updatedAt: now,
    workspaceId: outboxRow.workspaceId as WorkspaceId,
  })
  return status
}

async function findOutboxByProviderMessage(
  ctx: MutationCtx,
  providerMessageId: string,
): Promise<GenericRow | null> {
  return (await ctx.db
    .query("emailOutbox")
    .withIndex("by_provider_message", (q) =>
      indexEquals(
        q,
        ["provider", "resend"],
        ["providerMessageId", providerMessageId],
      ),
    )
    .unique()) as GenericRow | null
}

async function workspaceRejectsDeliveryEvents(
  ctx: MutationCtx,
  outbox: GenericRow,
): Promise<boolean> {
  const workspace = (await ctx.db.get(
    "workspaces",
    outbox.workspaceId as WorkspaceId,
  )) as GenericRow | null
  return (
    !workspace ||
    workspace.deletedAt !== undefined ||
    workspace.deletionPendingAt !== undefined
  )
}

async function discardEventForDeletingWorkspace(
  ctx: MutationCtx,
  eventRowId: EmailWebhookEventId,
  now: number,
): Promise<"ignored_stale"> {
  await ctx.db.patch("emailWebhookEvents", eventRowId, {
    lastError: "workspace_deleting",
    nextAttemptAt: undefined,
    outboxId: undefined,
    processedAt: now,
    status: "ignored_stale",
    updatedAt: now,
    workspaceId: undefined,
  })
  return "ignored_stale"
}

export const ingestResendWebhookEvent = internalMutation({
  args: {
    createdAt: v.number(),
    eventId: v.string(),
    providerMessageId: v.string(),
    receivedAt: v.number(),
    type: resendEmailEventTypeValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailWebhookEvents")
      .withIndex("by_provider_event", (q) =>
        indexEquals(q, ["provider", "resend"], ["eventId", args.eventId]),
      )
      .unique()
    if (existing) {
      return { state: "duplicate" as const }
    }

    const outbox = await findOutboxByProviderMessage(
      ctx,
      args.providerMessageId,
    )
    const now = args.receivedAt
    const event = eventFromArguments(args)
    const eventRowId = (await ctx.db.insert("emailWebhookEvents", {
      attempts: 1,
      eventId: args.eventId,
      provider: "resend",
      providerCreatedAt: args.createdAt,
      providerMessageId: args.providerMessageId,
      receivedAt: args.receivedAt,
      status: "pending_match",
      type: args.type,
      updatedAt: now,
      ...(outbox === null
        ? { nextAttemptAt: now + WEBHOOK_RETRY_DELAY_MS }
        : { workspaceId: outbox.workspaceId as WorkspaceId }),
    })) as EmailWebhookEventId

    if (outbox) {
      if (await workspaceRejectsDeliveryEvents(ctx, outbox)) {
        return {
          state: await discardEventForDeletingWorkspace(ctx, eventRowId, now),
        }
      }
      return {
        state: await applyEventToOutbox(ctx, eventRowId, event, outbox, now),
      }
    }

    await ctx.scheduler.runAfter(
      WEBHOOK_RETRY_DELAY_MS,
      reconcileResendWebhookEventReference,
      { eventRowId },
    )
    return { state: "pending_match" as const }
  },
})

export const reconcileResendWebhookEvent = internalMutation({
  args: { eventRowId: v.id("emailWebhookEvents") },
  handler: async (ctx, args) => {
    const row = (await ctx.db.get(
      "emailWebhookEvents",
      args.eventRowId,
    )) as GenericRow | null
    if (!row || row.status !== "pending_match") {
      return { state: "not_pending" as const }
    }

    const outbox = await findOutboxByProviderMessage(
      ctx,
      row.providerMessageId as string,
    )
    const now = Date.now()
    if (outbox) {
      if (await workspaceRejectsDeliveryEvents(ctx, outbox)) {
        return {
          state: await discardEventForDeletingWorkspace(
            ctx,
            args.eventRowId,
            now,
          ),
        }
      }
      const state = await applyEventToOutbox(
        ctx,
        args.eventRowId,
        {
          createdAt: row.providerCreatedAt as number,
          eventId: row.eventId as string,
          providerMessageId: row.providerMessageId as string,
          type: row.type as ResendEmailEventType,
        },
        outbox,
        now,
      )
      return { state }
    }

    const attempts = (row.attempts as number) + 1
    if (attempts >= MAX_WEBHOOK_MATCH_ATTEMPTS) {
      await ctx.db.patch("emailWebhookEvents", args.eventRowId, {
        attempts,
        lastError: "provider_message_not_found",
        nextAttemptAt: undefined,
        processedAt: now,
        status: "dead",
        updatedAt: now,
      })
      return { state: "dead" as const }
    }

    await ctx.db.patch("emailWebhookEvents", args.eventRowId, {
      attempts,
      lastError: "provider_message_not_found",
      nextAttemptAt: now + WEBHOOK_RETRY_DELAY_MS,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      WEBHOOK_RETRY_DELAY_MS,
      reconcileResendWebhookEventReference,
      args,
    )
    return { state: "pending_match" as const }
  },
})

export const ingestResendWebhookEventReference = internalMutationReference<{
  createdAt: number
  eventId: string
  providerMessageId: string
  receivedAt: number
  type: ResendEmailEventType
}>("email/webhookInternal:ingestResendWebhookEvent")

export const reconcileResendWebhookEventReference = internalMutationReference<{
  eventRowId: EmailWebhookEventId
}>("email/webhookInternal:reconcileResendWebhookEvent")
