"use client"

import { api } from "@astreex/backend/api"
import type { PlanId } from "@astreex/domain"
import type { FunctionReturnType } from "convex/server"
import { useAction } from "convex/react"
import { useCallback, useRef, useState } from "react"

type BillingAction = "portal" | `checkout:${PlanId}` | `upgrade:${PlanId}`
type BillingRedirectResult =
  | FunctionReturnType<typeof api.billing.customer.createBillingPortal>
  | FunctionReturnType<typeof api.billing.customer.createCheckout>
type BillingUpgradeResult = FunctionReturnType<
  typeof api.billing.customer.upgradeSubscription
>

function checkoutIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web-${crypto.randomUUID()}`
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useBillingActions() {
  const createCheckout = useAction(api.billing.customer.createCheckout)
  const createPortal = useAction(api.billing.customer.createBillingPortal)
  const upgradeSubscription = useAction(
    api.billing.customer.upgradeSubscription,
  )
  const checkoutIntentKeys = useRef<Partial<Record<PlanId, string>>>({})
  const [pending, setPending] = useState<BillingAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const followBillingRedirect = useCallback((value: BillingRedirectResult) => {
    if (value.state === "provider_unconfigured") {
      setError("Creem billing is not configured for this deployment.")
      return false
    }

    window.location.assign(value.url)
    return true
  }, [])

  const handleBillingUpgrade = useCallback((value: BillingUpgradeResult) => {
    if (value.state === "provider_unconfigured") {
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
