import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import { describe, expect, it } from "vitest"

import schema from "../convex/schema"

const modules = {
  "./_generated/server.ts": async () => ({}),
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

describe("Resend webhook deletion fencing", () => {
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
