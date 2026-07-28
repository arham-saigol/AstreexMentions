import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { afterEach, describe, expect, it, vi } from "vitest"

import schema from "../convex/schema"

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./email/actions.ts": async () => await import("../convex/email/actions"),
  "./email/internal.ts": async () => await import("../convex/email/internal"),
  "./email/webhookInternal.ts": async () =>
    await import("../convex/email/webhookInternal"),
}

const ingestWebhook = makeFunctionReference<
  "mutation",
  {
    createdAt: number
    eventId: string
    providerMessageId: string
    receivedAt: number
    type: "email.delivered"
  },
  { state: string }
>("email/webhookInternal:ingestResendWebhookEvent")

const dispatchEmails = makeFunctionReference<
  "mutation",
  { now?: number },
  { claimed: number; state: string; suppressed: number }
>("email/internal:dispatchPendingEmails")

const loadLeasedEmail = makeFunctionReference<
  "mutation",
  { leaseToken: string; outboxId: GenericId<"emailOutbox"> },
  { state: string }
>("email/internal:loadLeasedEmail")

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Resend webhook deletion fencing", () => {
  it("dead-letters pending and expired email work for fenced accounts", async () => {
    const now = Date.parse("2026-07-27T12:00:00.000Z")
    vi.stubEnv("RESEND_API_KEY", "re_deletion_fence_fixture")
    const t = convexTest({ modules, schema })
    const outboxIds = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "resend-fenced-user",
        createdAt: now,
        tokenIdentifier: "issuer|resend-fenced-user",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        deletionPendingAt: now,
        kind: "personal",
        name: "Fenced email workspace",
        normalizedName: "fenced email workspace",
        ownerUserId: userId,
        updatedAt: now,
      })
      const common = {
        attempts: 0,
        createdAt: now,
        from: "Astreex <notifications@example.com>",
        html: "<p>Digest</p>",
        payloadFingerprint: "fixture-fingerprint",
        provider: "resend" as const,
        subject: "Digest",
        to: ["owner@example.com"],
        updatedAt: now,
        userId,
        workspaceId,
      }
      const pendingId = await ctx.db.insert("emailOutbox", {
        ...common,
        idempotencyKey: "email:fenced-pending",
        nextAttemptAt: now,
        status: "pending",
      })
      const leasedId = await ctx.db.insert("emailOutbox", {
        ...common,
        attempts: 1,
        idempotencyKey: "email:fenced-expired-lease",
        leaseExpiresAt: now,
        leaseToken: "expired-fixture-lease",
        nextAttemptAt: now,
        status: "leased",
      })
      return [pendingId, leasedId]
    })

    await expect(t.mutation(dispatchEmails, { now })).resolves.toEqual({
      claimed: 0,
      state: "dispatched",
      suppressed: 2,
    })
    const rows = await t.run(
      async (ctx) =>
        await Promise.all(outboxIds.map(async (id) => await ctx.db.get(id))),
    )
    expect(rows).toEqual([
      expect.objectContaining({
        deadAt: now,
        lastError: "workspace_or_user_unavailable",
        status: "dead",
      }),
      expect.objectContaining({
        deadAt: now,
        lastError: "workspace_or_user_unavailable",
        status: "dead",
      }),
    ])
    expect(rows.every((row) => row?.leaseExpiresAt === undefined)).toBe(true)
  })

  it("clears a lease when the workspace is fenced after dispatch", async () => {
    const now = Date.now()
    vi.stubEnv("RESEND_API_KEY", "re_deletion_race_fixture")
    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "resend-race-user",
        createdAt: now,
        tokenIdentifier: "issuer|resend-race-user",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Email fence race",
        normalizedName: "email fence race",
        ownerUserId: userId,
        updatedAt: now,
      })
      const outboxId = await ctx.db.insert("emailOutbox", {
        attempts: 0,
        createdAt: now,
        from: "Astreex <notifications@example.com>",
        html: "<p>Digest</p>",
        idempotencyKey: "email:fence-race",
        nextAttemptAt: now,
        payloadFingerprint: "fixture-fingerprint",
        provider: "resend",
        status: "pending",
        subject: "Digest",
        to: ["owner@example.com"],
        updatedAt: now,
        userId,
        workspaceId,
      })
      return { outboxId, workspaceId }
    })
    await expect(t.mutation(dispatchEmails, { now })).resolves.toMatchObject({
      claimed: 1,
    })
    const lease = await t.run(async (ctx) => {
      const row = await ctx.db.get(seeded.outboxId)
      await ctx.db.patch("workspaces", seeded.workspaceId, {
        deletionPendingAt: now + 1,
      })
      return row
    })
    await expect(
      t.mutation(loadLeasedEmail, {
        leaseToken: lease!.leaseToken!,
        outboxId: seeded.outboxId,
      }),
    ).resolves.toEqual({ state: "stale_lease" })
    await expect(
      t.run(async (ctx) => await ctx.db.get(seeded.outboxId)),
    ).resolves.toMatchObject({
      lastError: "workspace_or_user_unavailable",
      status: "dead",
    })
  })

  it("settles late delivery events without recreating workspace-scoped rows", async () => {
    const now = Date.parse("2026-07-27T12:00:00.000Z")
    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "resend-deleting-user",
        createdAt: now,
        tokenIdentifier: "issuer|resend-deleting-user",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        deletionPendingAt: now,
        kind: "personal",
        name: "Deleting email workspace",
        normalizedName: "deleting email workspace",
        ownerUserId: userId,
        updatedAt: now,
      })
      const outboxId = await ctx.db.insert("emailOutbox", {
        attempts: 1,
        createdAt: now,
        from: "Astreex <notifications@example.com>",
        html: "<p>Digest</p>",
        idempotencyKey: "email:deleting-workspace",
        payloadFingerprint: "fixture-fingerprint",
        provider: "resend",
        providerMessageId: "resend-deleting-message",
        sentAt: now,
        status: "sent",
        subject: "Digest",
        to: ["owner@example.com"],
        updatedAt: now,
        userId,
        workspaceId,
      })
      return { outboxId }
    })

    await expect(
      t.mutation(ingestWebhook, {
        createdAt: now + 1,
        eventId: "resend-event-after-delete-fence",
        providerMessageId: "resend-deleting-message",
        receivedAt: now + 2,
        type: "email.delivered",
      }),
    ).resolves.toEqual({ state: "ignored_stale" })

    const state = await t.run(async (ctx) => ({
      event: await ctx.db
        .query("emailWebhookEvents")
        .withIndex("by_provider_event", (q) =>
          q
            .eq("provider", "resend")
            .eq("eventId", "resend-event-after-delete-fence"),
        )
        .unique(),
      outbox: await ctx.db.get("emailOutbox", seeded.outboxId),
      workspaceMetrics: await ctx.db.query("systemMetricBuckets").collect(),
    }))
    expect(state.event).toMatchObject({
      lastError: "workspace_deleting",
      processedAt: now + 2,
      status: "ignored_stale",
    })
    expect(state.event).not.toHaveProperty("outboxId")
    expect(state.event).not.toHaveProperty("workspaceId")
    expect(state.outbox).not.toHaveProperty("deliveryStatus")
    expect(state.workspaceMetrics).toEqual([])
  })
})
