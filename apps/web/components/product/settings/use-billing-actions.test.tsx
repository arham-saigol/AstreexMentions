// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { useAction } from "convex/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { customerConvex } from "@/lib/customer-convex"

import { useBillingActions } from "./use-billing-actions"

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}))

describe("useBillingActions", () => {
  const createCheckout = vi.fn()
  const createPortal = vi.fn()
  const upgradeSubscription = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAction).mockImplementation((reference) => {
      if (reference === customerConvex.billing.createCheckout) {
        return createCheckout
      }
      if (reference === customerConvex.billing.createPortal) {
        return createPortal
      }
      if (reference === customerConvex.billing.upgradeSubscription) {
        return upgradeSubscription
      }
      throw new TypeError("Unexpected billing action reference")
    })
  })

  it("reuses the checkout key after a failed provider attempt", async () => {
    createCheckout
      .mockRejectedValueOnce(new Error("Provider request timed out"))
      .mockResolvedValueOnce({ state: "provider_unconfigured" })
    const { result } = renderHook(() => useBillingActions())

    await act(async () => {
      await result.current.startCheckout("growth")
    })
    await act(async () => {
      await result.current.startCheckout("growth")
    })

    expect(createCheckout).toHaveBeenCalledTimes(2)
    const firstKey = createCheckout.mock.calls[0]?.[0]?.idempotencyKey
    expect(firstKey).toMatch(/^web-/)
    expect(createCheckout.mock.calls[1]?.[0]).toEqual({
      idempotencyKey: firstKey,
      planId: "growth",
    })
  })
})
