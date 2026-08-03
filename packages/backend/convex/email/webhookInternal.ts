import { internal } from "../_generated/api"
import { v } from "convex/values"

import {
  applyResendEmailEvent,
  type ResendEmailEventType,
  type VerifiedResendEmailEvent,
} from "../lib/resendWebhook"
import { incrementDailySystemMetric } from "../lib/systemMetricBuckets"
import { internalMutation, type MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { outboxFromRow } from "./internal"

const WEBHOOK_RETRY_DELAY_MS = 30_000
const MAX_WEBHOOK_MATCH_ATTEMPTS = 8

type EmailWebhookEventId = Id<"emailWebhookEvents">

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
  outboxRow: Doc<"emailOutbox">,
  now: number,
): Promise<"applied" | "ignored_stale"> {
  const outbox = outboxFromRow(outboxRow)
  if (outbox.status !== "sent") {
    throw new TypeError("Matched Resend outbox row is not sent")
  }
  const application = applyResendEmailEvent(outbox, event)
  const status = application.applied ? "applied" : "ignored_stale"
  if (application.applied) {
    await ctx.db.patch("emailOutbox", outboxRow._id, {
      deliveryStatus: application.outbox.deliveryStatus,
      lastProviderEventAt: application.outbox.lastProviderEventAt,
      lastProviderEventId: application.outbox.lastProviderEventId,
      updatedAt: application.outbox.updatedAt,
    })
    await incrementDailySystemMetric(ctx, {
      bucketAt: now,
      metric: `email_delivery_${application.outbox.deliveryStatus}`,
      updatedAt: now,
      workspaceId: outboxRow.workspaceId,
    })
  }
  await ctx.db.patch("emailWebhookEvents", eventRowId, {
    nextAttemptAt: undefined,
    outboxId: outboxRow._id,
    processedAt: now,
    status,
    updatedAt: now,
    workspaceId: outboxRow.workspaceId,
  })
  return status
}

async function findOutboxByProviderMessage(
  ctx: MutationCtx,
  providerMessageId: string,
): Promise<Doc<"emailOutbox"> | null> {
  return await ctx.db
    .query("emailOutbox")
    .withIndex("by_provider_message", (q) =>
      q.eq("provider", "resend").eq("providerMessageId", providerMessageId),
    )
    .unique()
}

async function workspaceRejectsDeliveryEvents(
  ctx: MutationCtx,
  outbox: Doc<"emailOutbox">,
): Promise<boolean> {
  const workspace = await ctx.db.get("workspaces", outbox.workspaceId)
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
        q.eq("provider", "resend").eq("eventId", args.eventId),
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
    const eventRowId = await ctx.db.insert("emailWebhookEvents", {
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
        : { workspaceId: outbox.workspaceId }),
    })

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
      internal.email.webhookInternal.reconcileResendWebhookEvent,
      { eventRowId },
    )
    return { state: "pending_match" as const }
  },
})

export const reconcileResendWebhookEvent = internalMutation({
  args: { eventRowId: v.id("emailWebhookEvents") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("emailWebhookEvents", args.eventRowId)
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
      internal.email.webhookInternal.reconcileResendWebhookEvent,
      args,
    )
    return { state: "pending_match" as const }
  },
})
