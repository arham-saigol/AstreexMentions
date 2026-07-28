"use client"

import { useAction } from "convex/react"
import { useCallback, useRef, useState } from "react"

import { customerConvex, type PlanId } from "@/lib/customer-convex"
import {
  billingRedirectResultSchema,
  billingUpgradeResultSchema,
} from "@/lib/settings-convex"

type BillingAction = "portal" | `checkout:${PlanId}` | `upgrade:${PlanId}`

function checkoutIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web-${crypto.randomUUID()}`
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useBillingActions() {
  const createCheckout = useAction(customerConvex.billing.createCheckout)
  const createPortal = useAction(customerConvex.billing.createPortal)
  const upgradeSubscription = useAction(
    customerConvex.billing.upgradeSubscription,
  )
  const checkoutIntentKeys = useRef<Partial<Record<PlanId, string>>>({})
  const [pending, setPending] = useState<BillingAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const followBillingRedirect = useCallback((value: unknown) => {
    const parsed = billingRedirectResultSchema.safeParse(value)
    if (!parsed.success) {
      setError("The billing provider returned an unexpected response.")
      return false
    }

    if (parsed.data.state === "provider_unconfigured") {
      setError("Creem billing is not configured for this deployment.")
      return false
    }

    window.location.assign(parsed.data.url)
    return true
  }, [])

  const handleBillingUpgrade = useCallback((value: unknown) => {
    const parsed = billingUpgradeResultSchema.safeParse(value)
    if (!parsed.success) {
      setError("The billing provider returned an unexpected response.")
      return false
    }

    if (parsed.data.state === "provider_unconfigured") {
      setError("Creem billing is not configured for this deployment.")
      return false
    }

    return true
  }, [])

  const openPortal = useCallback(async (): Promise<boolean> => {
    setError(null)
    setPending("portal")
    try {
      return followBillingRedirect(await createPortal({}))
    } catch {
      setError(
        "The Creem customer portal could not be opened. Try again shortly.",
      )
      return false
    } finally {
      setPending(null)
    }
  }, [createPortal, followBillingRedirect])

  const startCheckout = useCallback(
    async (planId: PlanId) => {
      setError(null)
      setPending(`checkout:${planId}`)
      const idempotencyKey =
        checkoutIntentKeys.current[planId] ?? checkoutIdempotencyKey()
      checkoutIntentKeys.current[planId] = idempotencyKey
      try {
        const redirected = followBillingRedirect(
          await createCheckout({
            idempotencyKey,
            planId,
          }),
        )
        if (redirected) {
          delete checkoutIntentKeys.current[planId]
        }
      } catch {
        setError("Checkout could not be started. Try again shortly.")
      } finally {
        setPending(null)
      }
    },
    [createCheckout, followBillingRedirect],
  )

  const upgrade = useCallback(
    async (planId: PlanId) => {
      setError(null)
      setPending(`upgrade:${planId}`)
      try {
        handleBillingUpgrade(await upgradeSubscription({ planId }))
      } catch {
        setError(
          "The subscription upgrade could not be started. Try again shortly.",
        )
      } finally {
        setPending(null)
      }
    },
    [handleBillingUpgrade, upgradeSubscription],
  )

  return {
    error,
    openPortal,
    pending,
    startCheckout,
    upgrade,
  }
}
