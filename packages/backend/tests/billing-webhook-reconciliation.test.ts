import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { afterEach, describe, expect, it } from "vitest"

import schema from "../convex/schema"

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./billing/internal.ts": async () =>
    await import("../convex/billing/internal"),
  "./billing/reconciliation.ts": async () =>
    await import("../convex/billing/reconciliation"),
}

const ingestWebhook = makeFunctionReference<
  "mutation",
  { rawBody: string; receivedAt: number },
  { kind: string }
>("billing/internal:ingestCreemWebhook")

const applyIncompleteWebhook = makeFunctionReference<
  "mutation",
  {
    authoritativeSubscriptionJson: string
    billingEventId: GenericId<"billingEvents">
    receivedAt: number
  },
  { kind: string }
>("billing/internal:applyIncompleteCreemBillingEvent")

const originalAllowlist = process.env.CREEM_PRODUCT_ALLOWLIST_JSON

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env.CREEM_PRODUCT_ALLOWLIST_JSON
  } else {
    process.env.CREEM_PRODUCT_ALLOWLIST_JSON = originalAllowlist
  }
})

describe("Creem webhook reconciliation", () => {
  it("settles and redacts subscription events for already-purged workspaces", async () => {
    delete process.env.CREEM_PRODUCT_ALLOWLIST_JSON
    const paidEvent = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("./fixtures/creem/subscription-paid.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as Record<string, any>
    paidEvent.id = "evt_after_workspace_purge"
    paidEvent.object.id = "sub_after_workspace_purge"

    const t = convexTest({ modules, schema })
    const workspaceId = await t.run(async (ctx) => {
      const now = paidEvent.created_at as number
      const userId = await ctx.db.insert("users", {
        clerkUserId: "purged-billing-user",
        createdAt: now,
        tokenIdentifier: "issuer|purged-billing-user",
        updatedAt: now,
      })
      const purgedWorkspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Purged billing",
        normalizedName: "purged billing",
        ownerUserId: userId,
        updatedAt: now,
      })
      await ctx.db.insert("deletionJobs", {
        accountUserId: userId,
        attempts: 1,
        billingGuardStatus: "confirmed_inactive",
        createdAt: now - 1,
        idempotencyKey: "delete-purged-billing-workspace",
        kind: "account",
        maxAttempts: 10,
        phase: "purge",
        purgeStage: "user_tombstone",
        requestedByUserId: userId,
        scheduledAt: now - 1,
        status: "leased",
        updatedAt: now,
        workspaceId: purgedWorkspaceId,
      })
      await ctx.db.delete("workspaces", purgedWorkspaceId)
      return purgedWorkspaceId
    })
    paidEvent.object.metadata.internal_customer_id = String(workspaceId)

    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(paidEvent),
        receivedAt: paidEvent.created_at,
      }),
    ).resolves.toEqual({ kind: "ignored" })

    const state = await t.run(async (ctx) => ({
      auditEvents: await ctx.db.query("auditEvents").collect(),
      billingEvents: await ctx.db.query("billingEvents").collect(),
      providerRuns: await ctx.db.query("providerRuns").collect(),
      subscriptions: await ctx.db.query("subscriptions").collect(),
    }))
    expect(state.billingEvents).toEqual([
      expect.objectContaining({
        payloadJson: "{}",
        redactedAt: paidEvent.created_at,
        status: "processed",
      }),
    ])
    expect(state.billingEvents[0]).not.toHaveProperty("objectId")
    expect(state.billingEvents[0]).not.toHaveProperty("workspaceId")
    expect(state.subscriptions).toEqual([])
    expect(state.providerRuns).toEqual([
      expect.objectContaining({ status: "succeeded" }),
    ])
    expect(state.providerRuns[0]).not.toHaveProperty("workspaceId")
    expect(state.auditEvents).toHaveLength(1)
    expect(state.auditEvents[0]).not.toHaveProperty("workspaceId")
  })

  it("finalizes in-flight tracking runs before billing pauses their sources", async () => {
    process.env.CREEM_PRODUCT_ALLOWLIST_JSON = JSON.stringify({
      prod_growth: {
        keywordLimit: 6,
        mentionLimit: 20_000,
        planId: "growth",
      },
    })
    const paidEvent = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("./fixtures/creem/subscription-paid.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as Record<string, any>
    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const now = paidEvent.created_at as number
      const userId = await ctx.db.insert("users", {
        clerkUserId: "billing-pause-user",
        createdAt: now,
        tokenIdentifier: "issuer|billing-pause-user",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing pause",
        normalizedName: "billing pause",
        ownerUserId: userId,
        updatedAt: now,
      })
      await ctx.db.insert("billingCheckouts", {
        createdAt: now,
        expiresAt: now + 86_400_000,
        idempotencyKey: "billing-pause-checkout",
        planId: "growth",
        provider: "creem",
        providerCheckoutSessionId: "checkout_billing_pause",
        requestedByUserId: userId,
        status: "complete",
        updatedAt: now,
        workspaceId,
      })
      return { userId, workspaceId }
    })
    paidEvent.id = "evt_paid_billing_pause"
    paidEvent.object.id = "sub_billing_pause"
    paidEvent.object.metadata.internal_customer_id = String(seeded.workspaceId)
    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(paidEvent),
        receivedAt: paidEvent.created_at,
      }),
    ).resolves.toEqual({ kind: "applied" })

    const sourceId = await t.run(async (ctx) => {
      const now = paidEvent.created_at as number
      const keywordId = await ctx.db.insert("keywords", {
        createdAt: now,
        createdByUserId: seeded.userId,
        normalizedPhrase: "billing pause",
        phrase: "Billing pause",
        platforms: ["x"],
        status: "active",
        updatedAt: now,
        workspaceId: seeded.workspaceId,
      })
      const trackingSourceId = await ctx.db.insert("trackingSources", {
        backoffMs: 0,
        checkpointVersion: 1,
        consecutiveFailures: 0,
        createdAt: now,
        intervalMs: 300_000,
        keywordId,
        leaseExpiresAt: now + 60_000,
        leaseToken: "billing-pause-lease",
        leaseVersion: 4,
        nextRunAt: now,
        providerQuery: "Billing pause",
        sourceType: "x",
        status: "active",
        totalFailures: 0,
        updatedAt: now,
        workspaceId: seeded.workspaceId,
      })
      await ctx.db.insert("providerRuns", {
        attempt: 1,
        createdAt: now,
        idempotencyKey: `tracking:${String(trackingSourceId)}:4`,
        inputCount: 1,
        operation: "tweets.search",
        outputCount: 0,
        provider: "x",
        startedAt: now,
        status: "running",
        trackingSourceId,
        trigger: "scheduled",
        updatedAt: now,
        workspaceId: seeded.workspaceId,
      })
      return trackingSourceId
    })

    const canceledEvent = structuredClone(paidEvent)
    canceledEvent.id = "evt_canceled_billing_pause"
    canceledEvent.eventType = "subscription.canceled"
    canceledEvent.created_at += 1
    canceledEvent.object.status = "canceled"
    canceledEvent.object.canceled_at = "2026-07-01T00:00:01.000Z"
    canceledEvent.object.updated_at = "2026-07-01T00:00:01.000Z"
    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(canceledEvent),
        receivedAt: canceledEvent.created_at,
      }),
    ).resolves.toEqual({ kind: "applied" })

    const state = await t.run(async (ctx) => ({
      run: await ctx.db
        .query("providerRuns")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", `tracking:${String(sourceId)}:4`),
        )
        .unique(),
      source: await ctx.db.get("trackingSources", sourceId),
    }))
    expect(state.source).toMatchObject({
      pauseReason: "paid",
      status: "paused",
    })
    expect(state.source).not.toHaveProperty("leaseToken")
    expect(state.run).toMatchObject({
      errorCode: "source_paused",
      status: "failed",
    })
    expect(state.run?.finishedAt).toEqual(expect.any(Number))
  })

  it("pauses excess keywords when a subscription is downgraded", async () => {
    process.env.CREEM_PRODUCT_ALLOWLIST_JSON = JSON.stringify({
      prod_scale: {
        keywordLimit: 10,
        mentionLimit: 50_000,
        planId: "scale",
      },
      prod_starter: {
        keywordLimit: 3,
        mentionLimit: 2_000,
        planId: "starter",
      },
    })
    const scaleEvent = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("./fixtures/creem/subscription-paid.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as Record<string, any>
    scaleEvent.id = "evt_scale_before_downgrade"
    scaleEvent.object.product.id = "prod_scale"
    scaleEvent.object.items[0].product_id = "prod_scale"
    scaleEvent.object.items[0].price_id = "price_scale_monthly"

    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const now = scaleEvent.created_at as number
      const userId = await ctx.db.insert("users", {
        clerkUserId: "billing-downgrade-user",
        createdAt: now,
        tokenIdentifier: "issuer|billing-downgrade-user",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing downgrade",
        normalizedName: "billing downgrade",
        ownerUserId: userId,
        updatedAt: now,
      })
      await ctx.db.insert("billingCheckouts", {
        createdAt: now,
        expiresAt: now + 86_400_000,
        idempotencyKey: "billing-downgrade-checkout",
        planId: "scale",
        provider: "creem",
        providerCheckoutSessionId: "checkout_billing_downgrade",
        requestedByUserId: userId,
        status: "complete",
        updatedAt: now,
        workspaceId,
      })
      for (let index = 0; index < 5; index += 1) {
        const keywordId = await ctx.db.insert("keywords", {
          createdAt: now + index,
          createdByUserId: userId,
          normalizedPhrase: `downgrade keyword ${index}`,
          phrase: `Downgrade keyword ${index}`,
          platforms: ["x"],
          status: "active",
          updatedAt: now + index,
          workspaceId,
        })
        await ctx.db.insert("trackingSources", {
          backoffMs: 0,
          checkpointVersion: 0,
          consecutiveFailures: 0,
          createdAt: now + index,
          intervalMs: 300_000,
          keywordId,
          leaseVersion: 0,
          nextRunAt: now,
          providerQuery: `Downgrade keyword ${index}`,
          sourceType: "x",
          status: "active",
          totalFailures: 0,
          updatedAt: now + index,
          workspaceId,
        })
      }
      return { workspaceId }
    })
    scaleEvent.object.metadata.internal_customer_id = String(seeded.workspaceId)
    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(scaleEvent),
        receivedAt: scaleEvent.created_at,
      }),
    ).resolves.toEqual({ kind: "applied" })

    const starterEvent = structuredClone(scaleEvent)
    starterEvent.id = "evt_starter_downgrade"
    starterEvent.created_at += 1
    starterEvent.object.product.id = "prod_starter"
    starterEvent.object.items[0].product_id = "prod_starter"
    starterEvent.object.items[0].price_id = "price_starter_monthly"
    starterEvent.object.updated_at = "2026-07-01T00:00:00.001Z"
    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(starterEvent),
        receivedAt: starterEvent.created_at,
      }),
    ).resolves.toEqual({ kind: "applied" })

    const state = await t.run(async (ctx) => ({
      keywords: await ctx.db
        .query("keywords")
        .withIndex("by_workspace_status_and_created_at", (q) =>
          q.eq("workspaceId", seeded.workspaceId).eq("status", "paused"),
        )
        .collect(),
      sources: await ctx.db
        .query("trackingSources")
        .withIndex("by_workspace_status_and_created_at", (q) =>
          q.eq("workspaceId", seeded.workspaceId).eq("status", "paused"),
        )
        .collect(),
      usage: await ctx.db
        .query("usageCycles")
        .withIndex("by_workspace_status_and_period_end", (q) =>
          q.eq("workspaceId", seeded.workspaceId).eq("status", "open"),
        )
        .unique(),
    }))
    expect(state.keywords.map(({ phrase }) => phrase)).toEqual([
      "Downgrade keyword 3",
      "Downgrade keyword 4",
    ])
    expect(state.sources).toHaveLength(2)
    expect(
      state.sources.every(({ pauseReason }) => pauseReason === "user"),
    ).toBe(true)
    expect(state.usage).toMatchObject({ keywordLimit: 3 })
  })

  it("orders reconciled incomplete periods by the authoritative subscription version", async () => {
    process.env.CREEM_PRODUCT_ALLOWLIST_JSON = JSON.stringify({
      prod_growth: {
        keywordLimit: 6,
        mentionLimit: 20_000,
        planId: "growth",
      },
      prod_scale: {
        keywordLimit: 10,
        mentionLimit: 50_000,
        planId: "scale",
      },
      prod_starter: {
        keywordLimit: 3,
        mentionLimit: 2_000,
        planId: "starter",
      },
    })
    const paidEvent = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("./fixtures/creem/subscription-paid.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as Record<string, any>
    const t = convexTest({ modules, schema })
    const seeded = await t.run(async (ctx) => {
      const now = paidEvent.created_at as number
      const userId = await ctx.db.insert("users", {
        clerkUserId: "billing-reconciliation-user",
        createdAt: now,
        tokenIdentifier: "issuer|billing-reconciliation-user",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing reconciliation",
        normalizedName: "billing reconciliation",
        ownerUserId: userId,
        updatedAt: now,
      })
      await ctx.db.insert("billingCheckouts", {
        createdAt: now,
        expiresAt: now + 86_400_000,
        idempotencyKey: "billing-reconciliation-checkout",
        planId: "growth",
        provider: "creem",
        providerCheckoutSessionId: "checkout_reconciliation",
        requestedByUserId: userId,
        status: "complete",
        updatedAt: now,
        workspaceId,
      })
      return { workspaceId }
    })

    paidEvent.object.metadata.internal_customer_id = String(seeded.workspaceId)
    const authoritativeSubscription = structuredClone(paidEvent.object)
    const authoritativeUpdatedAt = Date.parse("2026-07-03T00:00:00.000Z")
    authoritativeSubscription.updated_at = new Date(
      authoritativeUpdatedAt,
    ).toISOString()
    delete paidEvent.object.current_period_start_date
    delete paidEvent.object.current_period_end_date

    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(paidEvent),
        receivedAt: paidEvent.created_at,
      }),
    ).resolves.toEqual({ kind: "pending" })

    const pending = await t.run(
      async (ctx) =>
        await ctx.db
          .query("billingEvents")
          .withIndex("by_provider_event", (q) =>
            q.eq("provider", "creem").eq("providerEventId", paidEvent.id),
          )
          .unique(),
    )
    expect(pending).toMatchObject({
      lastError: "INCOMPLETE_SUBSCRIPTION_PERIOD",
      status: "pending",
      workspaceId: seeded.workspaceId,
    })

    await expect(
      t.mutation(applyIncompleteWebhook, {
        authoritativeSubscriptionJson: JSON.stringify(
          authoritativeSubscription,
        ),
        billingEventId: pending!._id,
        receivedAt: paidEvent.created_at + 1,
      }),
    ).resolves.toEqual({ kind: "applied" })

    const delayedEvent = structuredClone(paidEvent)
    const delayedCreatedAt = Date.parse("2026-07-02T00:00:00.000Z")
    delayedEvent.id = "evt_delayed_after_reconciliation"
    delayedEvent.created_at = delayedCreatedAt
    delayedEvent.object = structuredClone(authoritativeSubscription)
    delayedEvent.object.product.id = "prod_starter"
    delayedEvent.object.items[0].product_id = "prod_starter"
    delayedEvent.object.updated_at = new Date(delayedCreatedAt).toISOString()

    await expect(
      t.mutation(ingestWebhook, {
        rawBody: JSON.stringify(delayedEvent),
        receivedAt: authoritativeUpdatedAt + 1,
      }),
    ).resolves.toEqual({ kind: "stale" })

    const state = await t.run(async (ctx) => ({
      event: await ctx.db.get("billingEvents", pending!._id),
      subscriptions: await ctx.db.query("subscriptions").collect(),
    }))
    expect(state.event).toMatchObject({ status: "processed" })
    expect(state.subscriptions).toEqual([
      expect.objectContaining({
        entitlementStatus: "active",
        lastSyncedAt: authoritativeUpdatedAt,
        planId: "growth",
        workspaceId: seeded.workspaceId,
      }),
    ])
  })
})
