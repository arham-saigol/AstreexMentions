import { internal } from "../_generated/api"
import { v } from "convex/values"

import {
  claimEmail,
  completeEmailSend,
  failEmailSend,
  type EmailDeliveryStatus,
  type EmailOutbox,
  type LeasedEmailOutbox,
} from "../lib/emailOutbox"
import { createJobLeaseToken } from "../lib/jobRuntime"
import { recordProviderMetricBuckets } from "../lib/providerMetricBuckets"
import { env, internalMutation, type MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { readResendDeliveryConfiguration } from "./config"

const MAX_EMAIL_CLAIMS = 32
const BLOCKED_CONFIG_RETRY_MS = 5 * 60_000

type EmailOutboxId = Id<"emailOutbox">
type DigestRunId = Id<"digestRuns">

async function scheduleEmailDispatchAt(
  ctx: MutationCtx,
  at: number,
): Promise<void> {
  await ctx.scheduler.runAt(
    at,
    internal.email.internal.dispatchPendingEmails,
    {},
  )
}

export function outboxFromRow(row: Doc<"emailOutbox">): EmailOutbox {
  const payload = {
    from: row.from as string,
    html: row.html as string,
    subject: row.subject as string,
    to: row.to as string[],
    ...(row.replyTo === undefined ? {} : { replyTo: row.replyTo as string }),
    ...(row.text === undefined ? {} : { text: row.text as string }),
  }
  const common = {
    attempts: row.attempts as number,
    createdAt: row.createdAt as number,
    idempotencyKey: row.idempotencyKey as string,
    payload,
    payloadFingerprint: row.payloadFingerprint as string,
    updatedAt: row.updatedAt as number,
  }
  const optionalLastError =
    row.lastError === undefined ? {} : { lastError: row.lastError as string }

  switch (row.status) {
    case "pending":
      return {
        ...common,
        ...optionalLastError,
        nextAttemptAt: row.nextAttemptAt as number,
        status: "pending",
      }
    case "leased":
      return {
        ...common,
        ...optionalLastError,
        leaseExpiresAt: row.leaseExpiresAt as number,
        leaseToken: row.leaseToken as string,
        nextAttemptAt: row.nextAttemptAt as number,
        status: "leased",
      }
    case "sent":
      return {
        ...common,
        deliveryStatus: row.deliveryStatus as EmailDeliveryStatus,
        providerMessageId: row.providerMessageId as string,
        sentAt: row.sentAt as number,
        status: "sent",
        ...(row.lastProviderEventAt === undefined
          ? {}
          : { lastProviderEventAt: row.lastProviderEventAt as number }),
        ...(row.lastProviderEventId === undefined
          ? {}
          : { lastProviderEventId: row.lastProviderEventId as string }),
      }
    case "dead":
      return {
        ...common,
        deadAt: row.deadAt as number,
        lastError: row.lastError as string,
        status: "dead",
      }
    default:
      throw new TypeError("Email outbox row has an invalid status")
  }
}

async function patchOutboxState(
  ctx: MutationCtx,
  outboxId: EmailOutboxId,
  state: EmailOutbox,
): Promise<void> {
  await ctx.db.patch("emailOutbox", outboxId, {
    attempts: state.attempts,
    deadAt: state.status === "dead" ? state.deadAt : undefined,
    deliveryStatus: state.status === "sent" ? state.deliveryStatus : undefined,
    lastError:
      state.status === "pending" ||
      state.status === "leased" ||
      state.status === "dead"
        ? state.lastError
        : undefined,
    lastProviderEventAt:
      state.status === "sent" ? state.lastProviderEventAt : undefined,
    lastProviderEventId:
      state.status === "sent" ? state.lastProviderEventId : undefined,
    leaseExpiresAt:
      state.status === "leased" ? state.leaseExpiresAt : undefined,
    leaseToken: state.status === "leased" ? state.leaseToken : undefined,
    nextAttemptAt:
      state.status === "pending" || state.status === "leased"
        ? state.nextAttemptAt
        : undefined,
    providerMessageId:
      state.status === "sent" ? state.providerMessageId : undefined,
    sentAt: state.status === "sent" ? state.sentAt : undefined,
    status: state.status,
    updatedAt: state.updatedAt,
  })
}

async function emailOwnerIsUnavailable(
  ctx: MutationCtx,
  row: Doc<"emailOutbox">,
): Promise<boolean> {
  const [workspace, user] = await Promise.all([
    ctx.db.get("workspaces", row.workspaceId),
    ctx.db.get("users", row.userId),
  ])
  return (
    !workspace ||
    workspace.deletedAt !== undefined ||
    workspace.deletionPendingAt !== undefined ||
    !user ||
    user.deletedAt !== undefined ||
    user.disabledAt !== undefined
  )
}

async function deadLetterUnavailableEmail(
  ctx: MutationCtx,
  row: Doc<"emailOutbox">,
  now: number,
): Promise<void> {
  await ctx.db.patch("emailOutbox", row._id as EmailOutboxId, {
    deadAt: now,
    lastError: "workspace_or_user_unavailable",
    leaseExpiresAt: undefined,
    leaseToken: undefined,
    nextAttemptAt: undefined,
    status: "dead",
    updatedAt: now,
  })
}

async function recordSendAttempt(
  ctx: MutationCtx,
  input: {
    attempts: number
    durationMs: number
    errorCode?: string | undefined
    errorMessage?: string | undefined
    outboxId: EmailOutboxId
    status: "failed" | "succeeded"
    workspaceId: Id<"workspaces">
  },
  now: number,
): Promise<void> {
  const idempotencyKey = `resend:email:${String(input.outboxId)}:${input.attempts}`
  const existing = await ctx.db
    .query("providerRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", idempotencyKey),
    )
    .unique()
  if (existing) {
    return
  }

  const durationMs = Math.max(0, Math.round(input.durationMs))
  const succeeded = input.status === "succeeded" ? 1 : 0
  const failed = input.status === "failed" ? 1 : 0
  const retry = input.attempts > 1 ? 1 : 0
  const rateLimited = input.errorCode === "HTTP_429" ? 1 : 0
  await ctx.db.insert("providerRuns", {
    attempt: input.attempts,
    createdAt: now,
    durationMs,
    finishedAt: now,
    idempotencyKey,
    inputCount: 1,
    operation: "emails.send",
    outputCount: succeeded,
    provider: "resend",
    startedAt: now - durationMs,
    status: input.status,
    trigger: input.attempts > 1 ? "retry" : "scheduled",
    updatedAt: now,
    workspaceId: input.workspaceId,
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.errorMessage === undefined
      ? {}
      : { errorMessage: input.errorMessage }),
  })

  await recordProviderMetricBuckets(
    ctx,
    {
      durationMs,
      failureCount: failed,
      inputItemCount: 1,
      operation: "emails.send",
      outputItemCount: succeeded,
      provider: "resend",
      rateLimitedCount: rateLimited,
      retryCount: retry,
      successCount: succeeded,
    },
    now,
  )
}

export const dispatchPendingEmails = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const configuration = readResendDeliveryConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      return {
        missing: configuration.missing,
        state: "blocked_config" as const,
      }
    }

    const [pending, expired] = await Promise.all([
      ctx.db
        .query("emailOutbox")
        .withIndex("by_status_and_next_attempt_at", (q) =>
          q.eq("status", "pending").lte("nextAttemptAt", now),
        )
        .take(MAX_EMAIL_CLAIMS),
      ctx.db
        .query("emailOutbox")
        .withIndex("by_status_and_lease_expires_at", (q) =>
          q.eq("status", "leased").lte("leaseExpiresAt", now),
        )
        .take(MAX_EMAIL_CLAIMS),
    ])
    const claimable = [...pending, ...expired]
      .sort(
        (left, right) =>
          ((left.nextAttemptAt ?? left.leaseExpiresAt) as number) -
            ((right.nextAttemptAt ?? right.leaseExpiresAt) as number) ||
          String(left._id).localeCompare(String(right._id), "en"),
      )
      .slice(0, MAX_EMAIL_CLAIMS)

    let claimed = 0
    let suppressed = 0
    const leaseRecoveryAt = new Set<number>()
    for (const row of claimable) {
      if (await emailOwnerIsUnavailable(ctx, row)) {
        await deadLetterUnavailableEmail(ctx, row, now)
        suppressed += 1
        continue
      }
      const outboxId = row._id as EmailOutboxId
      const leaseToken = createJobLeaseToken({
        attempt: (row.attempts as number) + 1,
        jobId: String(outboxId),
        namespace: "email",
        now,
      })
      const leased = claimEmail({
        leaseToken,
        now,
        outbox: outboxFromRow(row),
      })
      await patchOutboxState(ctx, outboxId, leased)
      leaseRecoveryAt.add(leased.leaseExpiresAt)
      await ctx.scheduler.runAfter(0, internal.email.actions.deliverEmail, {
        leaseToken,
        outboxId,
      })
      claimed += 1
    }

    for (const at of leaseRecoveryAt) {
      await scheduleEmailDispatchAt(ctx, at)
    }
    if (claimable.length === MAX_EMAIL_CLAIMS) {
      await ctx.scheduler.runAfter(
        0,
        internal.email.internal.dispatchPendingEmails,
        {},
      )
    }

    return { claimed, state: "dispatched" as const, suppressed }
  },
})

export const loadLeasedEmail = internalMutation({
  args: {
    leaseToken: v.string(),
    outboxId: v.id("emailOutbox"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("emailOutbox", args.outboxId)
    if (
      !row ||
      row.status !== "leased" ||
      row.leaseToken !== args.leaseToken ||
      (row.leaseExpiresAt as number) <= Date.now()
    ) {
      return { state: "stale_lease" as const }
    }
    const [workspace, user] = await Promise.all([
      ctx.db.get("workspaces", row.workspaceId),
      ctx.db.get("users", row.userId),
    ])
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined ||
      !user ||
      user.deletedAt !== undefined ||
      user.disabledAt !== undefined
    ) {
      await deadLetterUnavailableEmail(ctx, row, Date.now())
      return { state: "stale_lease" as const }
    }

    return {
      attempts: row.attempts as number,
      idempotencyKey: row.idempotencyKey as string,
      payload: {
        from: row.from as string,
        html: row.html as string,
        subject: row.subject as string,
        to: row.to as string[],
        ...(row.replyTo === undefined
          ? {}
          : { replyTo: row.replyTo as string }),
        ...(row.text === undefined ? {} : { text: row.text as string }),
      },
      state: "ready" as const,
    }
  },
})

export const releaseEmailBlockedConfig = internalMutation({
  args: {
    leaseToken: v.string(),
    outboxId: v.id("emailOutbox"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("emailOutbox", args.outboxId)
    if (!row || row.status !== "leased" || row.leaseToken !== args.leaseToken) {
      return { state: "stale_lease" as const }
    }
    const now = Date.now()
    const nextAttemptAt = now + BLOCKED_CONFIG_RETRY_MS
    await ctx.db.patch("emailOutbox", args.outboxId, {
      attempts: Math.max(0, (row.attempts as number) - 1),
      lastError: "blocked_config",
      leaseExpiresAt: undefined,
      leaseToken: undefined,
      nextAttemptAt,
      status: "pending",
      updatedAt: now,
    })
    await scheduleEmailDispatchAt(ctx, nextAttemptAt)
    return { state: "blocked_config" as const }
  },
})

export const completeEmailDelivery = internalMutation({
  args: {
    durationMs: v.number(),
    leaseToken: v.string(),
    outboxId: v.id("emailOutbox"),
    providerMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("emailOutbox", args.outboxId)
    if (!row) {
      return { state: "stale_lease" as const }
    }
    const outbox = outboxFromRow(row)
    if (outbox.status !== "leased" && outbox.status !== "sent") {
      return { state: "stale_lease" as const }
    }
    const now = Date.now()
    const sent = completeEmailSend({
      leaseToken: args.leaseToken,
      now,
      outbox,
      providerMessageId: args.providerMessageId,
    })
    await patchOutboxState(ctx, args.outboxId, sent)
    if (row.digestRunId !== undefined) {
      const digestRunId = row.digestRunId as DigestRunId
      const run = await ctx.db.get("digestRuns", digestRunId)
      if (run && run.status !== "sent") {
        await ctx.db.patch("digestRuns", digestRunId, {
          completedAt: now,
          status: "sent",
          updatedAt: now,
        })
      }
    }
    await recordSendAttempt(
      ctx,
      {
        attempts: sent.attempts,
        durationMs: args.durationMs,
        outboxId: args.outboxId,
        status: "succeeded",
        workspaceId: row.workspaceId,
      },
      now,
    )
    return { providerMessageId: sent.providerMessageId, state: "sent" as const }
  },
})

export const failEmailDelivery = internalMutation({
  args: {
    durationMs: v.number(),
    errorCode: v.string(),
    errorMessage: v.string(),
    leaseToken: v.string(),
    outboxId: v.id("emailOutbox"),
    retryable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("emailOutbox", args.outboxId)
    if (!row || row.status !== "leased") {
      return { state: "stale_lease" as const }
    }
    const leased = outboxFromRow(row) as LeasedEmailOutbox
    const now = Date.now()
    const failed = failEmailSend({
      error: `${args.errorCode}:${args.errorMessage}`,
      jitterUnit: 0.5,
      leaseToken: args.leaseToken,
      now,
      outbox: leased,
      retryable: args.retryable,
    })
    await patchOutboxState(ctx, args.outboxId, failed)
    if (failed.status === "pending") {
      await scheduleEmailDispatchAt(ctx, failed.nextAttemptAt)
    }
    if (failed.status === "dead" && row.digestRunId !== undefined) {
      const digestRunId = row.digestRunId as DigestRunId
      const run = await ctx.db.get("digestRuns", digestRunId)
      if (run && run.status !== "sent") {
        await ctx.db.patch("digestRuns", digestRunId, {
          completedAt: now,
          error: "email_delivery_failed",
          status: "failed",
          updatedAt: now,
        })
      }
    }
    await recordSendAttempt(
      ctx,
      {
        attempts: leased.attempts,
        durationMs: args.durationMs,
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
        outboxId: args.outboxId,
        status: "failed",
        workspaceId: row.workspaceId,
      },
      now,
    )
    return {
      state:
        failed.status === "pending" ? ("retry" as const) : ("dead" as const),
      ...(failed.status === "pending"
        ? { nextAttemptAt: failed.nextAttemptAt }
        : {}),
    }
  },
})
