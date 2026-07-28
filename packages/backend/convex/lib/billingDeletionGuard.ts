import { ConvexError } from "convex/values"

export type SubscriptionEntitlementForDeletion = {
  cancelAtPeriodEnd?: boolean | undefined
  entitlementStatus: string
  status?: string | undefined
}

export type InactiveBillingGuardConfirmation = {
  checkedAt: number
  status: "confirmed_inactive"
  subscriptionCount: number
}

export type DeletionBillingGuardResult =
  | InactiveBillingGuardConfirmation
  | {
      checkedAt: number
      status: "blocked_active"
      subscriptionCount: number
    }

export type CompositeDeletionBillingGuardResult =
  | InactiveBillingGuardConfirmation
  | {
      checkedAt: number
      code: "BILLING_PORTAL_REQUIRED" | "BILLING_RECONCILIATION_REQUIRED"
      status: "blocked_active"
      subscriptionCount: number
    }
  | {
      checkedAt: number
      code: "BILLING_CONFIGURATION_REQUIRED"
      status: "unavailable"
      subscriptionCount: number
    }

export type CheckoutForDeletion = {
  expiresAt: number
  status: string
}

export type ProviderRunForDeletion = {
  provider: string
  startedAt?: number | undefined
  status: string
}

export const PROVIDER_OPERATION_STALE_MS = 15 * 60 * 1_000

export function providerRunIsStale(
  run: { startedAt?: unknown; status?: unknown },
  checkedAt = Date.now(),
): boolean {
  return (
    run.status === "running" &&
    typeof run.startedAt === "number" &&
    Number.isFinite(run.startedAt) &&
    run.startedAt <= checkedAt - PROVIDER_OPERATION_STALE_MS
  )
}

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "expired",
  "inactive",
])

/**
 * Classifies persisted Creem state for a staged deletion request. Scheduled
 * cancellation remains active until Creem reports a terminal subscription.
 */
export function evaluateDeletionBillingGuard(
  subscriptions: readonly SubscriptionEntitlementForDeletion[],
  checkedAt = Date.now(),
): DeletionBillingGuardResult {
  const blocked = subscriptions.some((subscription) => {
    const status = subscription.status?.trim().toLocaleLowerCase("en")
    return (
      subscription.entitlementStatus !== "inactive" ||
      subscription.cancelAtPeriodEnd === true ||
      status === undefined ||
      !TERMINAL_SUBSCRIPTION_STATUSES.has(status)
    )
  })

  return {
    checkedAt,
    status: blocked ? "blocked_active" : "confirmed_inactive",
    subscriptionCount: subscriptions.length,
  }
}

/**
 * Produces the separate billing confirmation required before destructive
 * account or workspace deletion. Unknown and active entitlements fail closed;
 * no subscription rows means there is no entitlement to retain.
 */
export function evaluateCompositeDeletionBillingGuard(input: {
  activeSideEffectCount: number
  checkouts: readonly CheckoutForDeletion[]
  checkedAt?: number
  pendingBillingEventCount: number
  providerConfigured: boolean
  providerRuns: readonly ProviderRunForDeletion[]
  subscriptions: readonly SubscriptionEntitlementForDeletion[]
}): CompositeDeletionBillingGuardResult {
  const checkedAt = input.checkedAt ?? Date.now()
  const subscriptionGuard = evaluateDeletionBillingGuard(
    input.subscriptions,
    checkedAt,
  )
  if (subscriptionGuard.status === "blocked_active") {
    return {
      ...subscriptionGuard,
      code: "BILLING_PORTAL_REQUIRED",
    }
  }
  if (!input.providerConfigured) {
    return {
      checkedAt,
      code: "BILLING_CONFIGURATION_REQUIRED",
      status: "unavailable",
      subscriptionCount: input.subscriptions.length,
    }
  }

  const unresolvedCheckout = input.checkouts.some(
    (checkout) =>
      checkout.expiresAt > checkedAt &&
      (checkout.status === "open" || checkout.status === "complete"),
  )
  const runningProviderOperation = input.providerRuns.some(
    (run) => run.status === "running" && !providerRunIsStale(run, checkedAt),
  )
  if (
    unresolvedCheckout ||
    runningProviderOperation ||
    input.activeSideEffectCount > 0 ||
    input.pendingBillingEventCount > 0
  ) {
    return {
      checkedAt,
      code: "BILLING_RECONCILIATION_REQUIRED",
      status: "blocked_active",
      subscriptionCount: input.subscriptions.length,
    }
  }

  return subscriptionGuard
}

export function confirmFullyInactiveEntitlement(
  subscriptions: readonly SubscriptionEntitlementForDeletion[],
  checkedAt = Date.now(),
): InactiveBillingGuardConfirmation {
  const result = evaluateDeletionBillingGuard(subscriptions, checkedAt)
  if (result.status !== "confirmed_inactive") {
    throw new ConvexError({
      code: "BILLING_ENTITLEMENT_ACTIVE",
      message: "Billing must be fully inactive before deletion",
    })
  }

  return result
}

export function assertInactiveBillingGuardConfirmation(
  confirmation: InactiveBillingGuardConfirmation | undefined,
): asserts confirmation is InactiveBillingGuardConfirmation {
  if (confirmation?.status !== "confirmed_inactive") {
    throw new ConvexError({
      code: "BILLING_GUARD_REQUIRED",
      message: "A successful billing inactivity check is required",
    })
  }
}
