import { describe, expect, it, vi } from "vitest"

import {
  canReconcileBillingWorkspace,
  createUsagePlanSnapshot,
  entitlementForCreemSubscriptionStatus,
  insertCreemBillingEventIdempotently,
  KNOWN_CREEM_SUBSCRIPTION_STATUSES,
  normalizeCreemSubscriptionStatus,
} from "../convex/lib/creemBilling"

describe("Creem billing contract", () => {
  it("continues webhook reconciliation while deletion is pending", () => {
    expect(
      canReconcileBillingWorkspace({ deletionPendingAt: Date.now() }),
    ).toBe(true)
    expect(canReconcileBillingWorkspace({ deletedAt: Date.now() })).toBe(false)
    expect(canReconcileBillingWorkspace(null)).toBe(false)
  })

  it("retains every documented state and future non-empty states", () => {
    expect(KNOWN_CREEM_SUBSCRIPTION_STATUSES).toEqual([
      "active",
      "canceled",
      "unpaid",
      "paused",
      "trialing",
      "scheduled_cancel",
      "past_due",
      "expired",
    ])
    expect(normalizeCreemSubscriptionStatus("future_state")).toBe(
      "future_state",
    )
  })

  it("never turns provider trialing or payment failure into entitlement", () => {
    expect(entitlementForCreemSubscriptionStatus("trialing")).toBe("inactive")
    expect(entitlementForCreemSubscriptionStatus("past_due")).toBe("inactive")
    expect(entitlementForCreemSubscriptionStatus("unpaid")).toBe("inactive")
    expect(entitlementForCreemSubscriptionStatus("active")).toBe("active")
    expect(entitlementForCreemSubscriptionStatus("scheduled_cancel")).toBe(
      "active",
    )
  })

  it("deduplicates Creem webhook events by provider event id", async () => {
    const insert = vi.fn().mockResolvedValue("event-row-1")
    const duplicateStore = {
      findByProviderEventId: vi.fn().mockResolvedValue("event-row-1"),
      insert,
    }

    await expect(
      insertCreemBillingEventIdempotently(duplicateStore, "evt_123"),
    ).resolves.toEqual({ eventId: "event-row-1", kind: "duplicate" })
    expect(insert).not.toHaveBeenCalled()

    const newStore = {
      findByProviderEventId: vi.fn().mockResolvedValue(null),
      insert,
    }
    await expect(
      insertCreemBillingEventIdempotently(newStore, " evt_456 "),
    ).resolves.toEqual({ eventId: "event-row-1", kind: "inserted" })
    expect(insert).toHaveBeenCalledWith({
      provider: "creem",
      providerEventId: "evt_456",
    })
  })

  it("captures an immutable exact plan snapshot", () => {
    const snapshot = createUsagePlanSnapshot({
      keywordLimit: 10,
      mentionLimit: 5_000,
      planId: "growth",
    })

    expect(snapshot).toEqual({
      keywordLimit: 10,
      mentionLimit: 5_000,
      planId: "growth",
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
  })
})
