import { readFileSync } from "node:fs"

import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { describe, expect, it } from "vitest"

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

describe("Creem provider operation retries", () => {
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

  it("keeps incomplete upgrades unresolved until authoritative reconciliation", () => {
    const customerSource = readFileSync(
      new URL("../convex/billing/customer.ts", import.meta.url),
      "utf8",
    )
    const reconciliationSchedule = customerSource.indexOf(
      "incompleteReconciliation:",
    )
    const incompleteGuard = customerSource.indexOf(
      'applied.kind === "incomplete_period"',
      reconciliationSchedule,
    )
    const successRecord = customerSource.indexOf(
      "recordCreemProviderOperationReference",
      incompleteGuard,
    )
    expect(reconciliationSchedule).toBeGreaterThan(-1)
    expect(incompleteGuard).toBeGreaterThan(reconciliationSchedule)
    expect(successRecord).toBeGreaterThan(incompleteGuard)

    const reconciliationSource = readFileSync(
      new URL("../convex/billing/reconciliation.ts", import.meta.url),
      "utf8",
    )
    expect(reconciliationSource).toContain(
      ".getSubscription(args.providerSubscriptionId)",
    )
    expect(reconciliationSource).toContain(
      'applied.kind === "incomplete_period"',
    )
    expect(reconciliationSource).toContain(
      "markCreemProviderOperationUnresolvedReference",
    )
    const internalSource = readFileSync(
      new URL("../convex/billing/internal.ts", import.meta.url),
      "utf8",
    )
    expect(internalSource).toContain(
      'kind === "incomplete_period" && args.incompleteReconciliation',
    )
    expect(internalSource).toContain("reconcileIncompleteCreemUpgradeReference")
  })

  it("versions upgrade idempotency by the current subscription state", () => {
    const customerSource = readFileSync(
      new URL("../convex/billing/customer.ts", import.meta.url),
      "utf8",
    )
    const upgradeStart = customerSource.indexOf(
      "export const upgradeSubscription",
    )
    const operationStart = customerSource.indexOf(
      "const operationId =",
      upgradeStart,
    )
    const operationEnd = customerSource.indexOf(
      "beginCreemProviderOperationReference",
      operationStart,
    )
    const operationId = customerSource.slice(operationStart, operationEnd)
    expect(operationId).toContain("currentPlan.data")
    expect(operationId).toContain("planResult.data")
    expect(operationId).toContain("subscriptionVersion")
  })
})
