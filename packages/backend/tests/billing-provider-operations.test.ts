import { readFileSync } from "node:fs"

import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import type { GenericId } from "convex/values"
import { describe, expect, it } from "vitest"

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

describe("Creem provider operation retries", () => {
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
})
