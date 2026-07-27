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

  it("keeps incomplete periods pending and applies authoritative subscription data", async () => {
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

    const state = await t.run(async (ctx) => ({
      event: await ctx.db.get("billingEvents", pending!._id),
      subscriptions: await ctx.db.query("subscriptions").collect(),
    }))
    expect(state.event).toMatchObject({ status: "processed" })
    expect(state.subscriptions).toEqual([
      expect.objectContaining({
        entitlementStatus: "active",
        planId: "growth",
        workspaceId: seeded.workspaceId,
      }),
    ])
  })
})
