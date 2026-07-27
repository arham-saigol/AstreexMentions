import { describe, expect, it } from "vitest"

import { subscriptionAllowsNewCheckout } from "./billing-status"

describe("billing subscription actions", () => {
  it("offers checkout only without a subscription or after a terminal state", () => {
    expect(subscriptionAllowsNewCheckout(null)).toBe(true)
    expect(subscriptionAllowsNewCheckout("canceled")).toBe(true)
    expect(subscriptionAllowsNewCheckout("expired")).toBe(true)

    for (const status of [
      "active",
      "past_due",
      "paused",
      "scheduled_cancel",
      "trialing",
      "unpaid",
    ]) {
      expect(subscriptionAllowsNewCheckout(status)).toBe(false)
    }
  })
})
