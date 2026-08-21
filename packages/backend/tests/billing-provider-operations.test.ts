import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PROVIDER_OPERATION_STALE_MS } from "../convex/lib/billingDeletionGuard"
import schema from "../convex/schema"

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./billing/internal.ts": async () =>
    await import("../convex/billing/internal"),
}

const beginOperation = makeFunctionReference<
  "mutation",
  {
    idempotencyKey: string
    operation: string
    workspaceId: GenericId<"workspaces">
  },
  { state: string }
>("billing/internal:beginCreemProviderOperation")

const getBillingContext = makeFunctionReference<
  "query",
  {
    idempotencyKey?: string
    workspaceId: GenericId<"workspaces">
  },
  {
    checkout: Record<string, unknown> | null
    outstandingCheckout: Record<string, unknown> | null
    subscription: Record<string, unknown> | null
  }
>("billing/internal:getCustomerBillingActionContext")

const markRetryable = makeFunctionReference<
  "mutation",
  {
    errorCode: string
    errorMessage: string
    idempotencyKey: string
    workspaceId: GenericId<"workspaces">
  },
  { state: string }
>("billing/internal:markCreemProviderOperationUnresolved")

const dispatchBilling = makeFunctionReference<
  "mutation",
  { now?: number },
  { expiredOperations: number; state: string }
>("billing/internal:dispatchPendingCreemBillingEvents")

afterEach(() => {
  vi.useRealTimers()
})

describe("Creem provider operation retries", () => {
  it("uses stale wake-ups without failing a newer operation attempt", async () => {
    const now = Date.parse("2026-07-26T12:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const t = convexTest({ modules, schema })
    const workspaceId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_billing_wakeup",
        createdAt: now,
        tokenIdentifier: "issuer|user_billing_wakeup",
        updatedAt: now,
      })
      return await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing wake-up",
        normalizedName: "billing wake-up",
        ownerUserId: userId,
        updatedAt: now,
      })
    })
    const args = {
      idempotencyKey: "portal:wakeup",
      operation: "portal",
      workspaceId,
    }

    await expect(t.mutation(beginOperation, args)).resolves.toEqual({
      state: "started",
    })
    await expect(
      t.mutation(markRetryable, {
        errorCode: "HTTP_503",
        errorMessage: "Retry operation",
        idempotencyKey: args.idempotencyKey,
        workspaceId,
      }),
    ).resolves.toEqual({ state: "retryable" })
    vi.setSystemTime(now + 1)
    await expect(t.mutation(beginOperation, args)).resolves.toEqual({
      state: "started",
    })

    await vi.advanceTimersByTimeAsync(PROVIDER_OPERATION_STALE_MS - 1)
    await t.finishInProgressScheduledFunctions()
    const beforeNewTimeout = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerRuns")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", args.idempotencyKey),
          )
          .unique(),
    )
    expect(beforeNewTimeout).toMatchObject({ attempt: 2, status: "running" })

    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    const expired = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerRuns")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", args.idempotencyKey),
          )
          .unique(),
    )
    expect(expired).toMatchObject({
      errorCode: "operation_abandoned",
      status: "failed",
    })
  })

  it("keeps completed checkout payment blocked until subscription reconciliation", async () => {
    const t = convexTest({ modules, schema })
    const now = Date.now()
    const completedAt = now - 10_000
    const { checkoutId, workspaceId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_completed_checkout_guard",
        createdAt: now,
        tokenIdentifier: "issuer|user_completed_checkout_guard",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Completed checkout guard",
        normalizedName: "completed checkout guard",
        ownerUserId: userId,
        updatedAt: now,
      })
      const checkoutId = await ctx.db.insert("billingCheckouts", {
        completedAt,
        createdAt: completedAt - 86_400_000,
        expiresAt: now - 1,
        idempotencyKey: "completed-checkout",
        planId: "growth",
        provider: "creem",
        providerCheckoutSessionId: "checkout_completed_fixture",
        requestedByUserId: userId,
        status: "complete",
        updatedAt: completedAt,
        workspaceId,
      })
      return { checkoutId, workspaceId }
    })

    await expect(
      t.query(getBillingContext, { workspaceId }),
    ).resolves.toMatchObject({
      outstandingCheckout: { _id: checkoutId },
      subscription: null,
    })
    await expect(
      t.mutation(beginOperation, {
        idempotencyKey: "checkout:before-reconciliation",
        operation: "checkout",
        workspaceId,
      }),
    ).resolves.toEqual({ state: "outstanding" })

    const subscriptionId = await t.run(async (ctx) => {
      const subscriptionId = await ctx.db.insert("subscriptions", {
        cancelAtPeriodEnd: false,
        canceledAt: completedAt - 1,
        createdAt: completedAt - 20_000,
        currentPeriodEnd: completedAt - 1,
        currentPeriodStart: completedAt - 30_000,
        endedAt: completedAt - 1,
        entitlementStatus: "inactive",
        lastSyncedAt: completedAt - 1,
        planId: "growth",
        provider: "creem",
        providerCustomerId: "customer_completed_fixture",
        providerSubscriptionId: "subscription_completed_fixture",
        status: "canceled",
        updatedAt: completedAt - 1,
        workspaceId,
      })
      await ctx.db.insert("subscriptions", {
        cancelAtPeriodEnd: false,
        canceledAt: completedAt + 1,
        createdAt: completedAt - 20_000,
        currentPeriodEnd: completedAt + 1,
        currentPeriodStart: completedAt - 30_000,
        endedAt: completedAt + 1,
        entitlementStatus: "inactive",
        lastSyncedAt: completedAt + 1,
        planId: "scale",
        provider: "creem",
        providerCustomerId: "customer_unrelated_fixture",
        providerSubscriptionId: "subscription_unrelated_fixture",
        status: "canceled",
        updatedAt: completedAt + 1,
        workspaceId,
      })
      return subscriptionId
    })
    await expect(
      t.mutation(beginOperation, {
        idempotencyKey: "checkout:stale-subscription",
        operation: "checkout",
        workspaceId,
      }),
    ).resolves.toEqual({ state: "outstanding" })

    await t.run(
      async (ctx) =>
        await ctx.db.patch("subscriptions", subscriptionId, {
          lastSyncedAt: completedAt,
          updatedAt: completedAt,
        }),
    )
    await expect(
      t.query(getBillingContext, { workspaceId }),
    ).resolves.toMatchObject({
      outstandingCheckout: null,
      subscription: { planId: "scale" },
    })
    await expect(
      t.mutation(beginOperation, {
        idempotencyKey: "checkout:after-reconciliation",
        operation: "checkout",
        workspaceId,
      }),
    ).resolves.toEqual({ state: "started" })
  })

  it("permits only one outstanding checkout per workspace", async () => {
    const t = convexTest({ modules, schema })
    const { userId, workspaceId } = await t.run(async (ctx) => {
      const now = Date.now()
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_checkout_guard",
        createdAt: now,
        tokenIdentifier: "issuer|user_checkout_guard",
        updatedAt: now,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Checkout guard",
        normalizedName: "checkout guard",
        ownerUserId: userId,
        updatedAt: now,
      })
      return { userId, workspaceId }
    })

    await expect(
      t.mutation(beginOperation, {
        idempotencyKey: "checkout:first",
        operation: "checkout",
        workspaceId,
      }),
    ).resolves.toEqual({ state: "started" })
    await expect(
      t.mutation(beginOperation, {
        idempotencyKey: "checkout:second",
        operation: "checkout",
        workspaceId,
      }),
    ).resolves.toEqual({ state: "running" })

    await t.run(async (ctx) => {
      const first = await ctx.db
        .query("providerRuns")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", "checkout:first"),
        )
        .unique()
      await ctx.db.patch("providerRuns", first!._id, {
        finishedAt: Date.now(),
        status: "failed",
      })
      await ctx.db.insert("billingCheckouts", {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        idempotencyKey: "persisted-checkout",
        planId: "growth",
        provider: "creem",
        providerCheckoutSessionId: "checkout_fixture",
        requestedByUserId: userId,
        status: "open",
        updatedAt: Date.now(),
        url: "https://checkout.example.test/fixture",
        workspaceId,
      })
    })
    await expect(
      t.mutation(beginOperation, {
        idempotencyKey: "checkout:third",
        operation: "checkout",
        workspaceId,
      }),
    ).resolves.toEqual({ state: "outstanding" })
    await expect(
      t.query(getBillingContext, {
        idempotencyKey: "new-browser-checkout-key",
        workspaceId,
      }),
    ).resolves.toMatchObject({
      checkout: null,
      outstandingCheckout: {
        providerCheckoutSessionId: "checkout_fixture",
        url: "https://checkout.example.test/fixture",
      },
    })

    const runs = await t.run(
      async (ctx) => await ctx.db.query("providerRuns").collect(),
    )
    expect(runs).toHaveLength(1)
  })

  it("moves retryable failures out of running and permits another attempt", async () => {
    const t = convexTest({ modules, schema })
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now()
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_billing_retry",
        createdAt: now,
        tokenIdentifier: "issuer|user_billing_retry",
        updatedAt: now,
      })
      return await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing retry",
        normalizedName: "billing retry",
        ownerUserId: userId,
        updatedAt: now,
      })
    })
    const args = {
      idempotencyKey: "upgrade:sub_fixture:growth",
      operation: "upgrade",
      workspaceId,
    }

    await expect(t.mutation(beginOperation, args)).resolves.toEqual({
      state: "started",
    })
    await expect(
      t.mutation(markRetryable, {
        errorCode: "HTTP_503",
        errorMessage: "Creem is temporarily unavailable",
        idempotencyKey: args.idempotencyKey,
        workspaceId: args.workspaceId,
      }),
    ).resolves.toEqual({ state: "retryable" })

    const failed = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerRuns")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", args.idempotencyKey),
          )
          .unique(),
    )
    expect(failed).toMatchObject({
      attempt: 1,
      errorCode: "HTTP_503",
      status: "failed",
    })
    expect(failed?.finishedAt).toEqual(expect.any(Number))

    await expect(t.mutation(beginOperation, args)).resolves.toEqual({
      state: "started",
    })
    const retried = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerRuns")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", args.idempotencyKey),
          )
          .unique(),
    )
    expect(retried).toMatchObject({
      attempt: 2,
      status: "running",
    })
    expect(retried?.errorCode).toBeUndefined()
    expect(retried?.finishedAt).toBeUndefined()
  })

  it("reclaims stale operations on retry and expires abandoned rows in the dispatcher", async () => {
    const t = convexTest({ modules, schema })
    const now = Date.now()
    const workspaceId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_billing_stale",
        createdAt: now,
        tokenIdentifier: "issuer|user_billing_stale",
        updatedAt: now,
      })
      return await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing stale recovery",
        normalizedName: "billing stale recovery",
        ownerUserId: userId,
        updatedAt: now,
      })
    })
    const retryArgs = {
      idempotencyKey: "portal:stale-retry",
      operation: "portal",
      workspaceId,
    }
    await expect(t.mutation(beginOperation, retryArgs)).resolves.toEqual({
      state: "started",
    })
    await expect(t.mutation(beginOperation, retryArgs)).resolves.toEqual({
      state: "running",
    })
    await t.run(async (ctx) => {
      const run = await ctx.db
        .query("providerRuns")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", retryArgs.idempotencyKey),
        )
        .unique()
      await ctx.db.patch("providerRuns", run!._id, {
        startedAt: now - PROVIDER_OPERATION_STALE_MS,
      })
    })
    await expect(t.mutation(beginOperation, retryArgs)).resolves.toEqual({
      state: "started",
    })

    await t.run(async (ctx) => {
      await ctx.db.insert("providerRuns", {
        attempt: 1,
        createdAt: now - PROVIDER_OPERATION_STALE_MS,
        idempotencyKey: "checkout:abandoned",
        inputCount: 1,
        operation: "checkout",
        outputCount: 0,
        provider: "creem",
        startedAt: now - PROVIDER_OPERATION_STALE_MS,
        status: "running",
        trigger: "manual",
        updatedAt: now - PROVIDER_OPERATION_STALE_MS,
        workspaceId,
      })
    })
    await expect(t.mutation(dispatchBilling, { now })).resolves.toMatchObject({
      expiredOperations: 1,
      state: "dispatched",
    })

    const runs = await t.run(async (ctx) => {
      return await ctx.db.query("providerRuns").collect()
    })
    expect(
      runs.find((run) => run.idempotencyKey === retryArgs.idempotencyKey),
    ).toMatchObject({ attempt: 2, status: "running" })
    expect(
      runs.find((run) => run.idempotencyKey === "checkout:abandoned"),
    ).toMatchObject({
      errorCode: "operation_abandoned",
      status: "failed",
    })
  })

  it("drains stale operations across continuations when exceeding batch limit without due billing events", async () => {
    vi.useFakeTimers()
    const now = Date.parse("2026-07-26T12:00:00.000Z")
    vi.setSystemTime(now)
    const t = convexTest({ modules, schema })
    const workspaceId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: "user_billing_stale_continuation",
        createdAt: now,
        tokenIdentifier: "issuer|user_billing_stale_continuation",
        updatedAt: now,
      })
      return await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Billing stale continuation",
        normalizedName: "billing stale continuation",
        ownerUserId: userId,
        updatedAt: now,
      })
    })

    await t.run(async (ctx) => {
      for (let i = 0; i < 17; i += 1) {
        await ctx.db.insert("providerRuns", {
          attempt: 1,
          createdAt: now - PROVIDER_OPERATION_STALE_MS,
          idempotencyKey: `checkout:stale_batch_${i}`,
          inputCount: 1,
          operation: "checkout",
          outputCount: 0,
          provider: "creem",
          startedAt: now - PROVIDER_OPERATION_STALE_MS,
          status: "running",
          trigger: "manual",
          updatedAt: now - PROVIDER_OPERATION_STALE_MS,
          workspaceId,
        })
      }
    })

    const first = await t.mutation(dispatchBilling, { now })
    expect(first).toMatchObject({
      expiredOperations: 16,
      state: "dispatched",
    })

    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()

    const runs = await t.run(async (ctx) => {
      return await ctx.db.query("providerRuns").collect()
    })
    expect(runs).toHaveLength(17)
    expect(runs.every((run) => run.status === "failed")).toBe(true)
  })
})
