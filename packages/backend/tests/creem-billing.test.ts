import { describe, expect, it } from "vitest"

import {
  canReconcileBillingWorkspace,
  entitlementForCreemSubscriptionStatus,
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
})
