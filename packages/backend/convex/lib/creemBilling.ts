export const KNOWN_CREEM_SUBSCRIPTION_STATUSES = [
  "active",
  "canceled",
  "unpaid",
  "paused",
  "trialing",
  "scheduled_cancel",
  "past_due",
  "expired",
] as const

export type KnownCreemSubscriptionStatus =
  (typeof KNOWN_CREEM_SUBSCRIPTION_STATUSES)[number]
export type AstreexEntitlementStatus = "active" | "inactive"
export type AstreexPlanId = "starter" | "growth" | "scale"

export function canReconcileBillingWorkspace(
  workspace: Readonly<{
    deletedAt?: number
    deletionPendingAt?: number
  }> | null,
): boolean {
  return workspace !== null && workspace.deletedAt === undefined
}

export function normalizeCreemSubscriptionStatus(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Creem subscription status must be a non-empty string")
  }
  return value.trim()
}

/** Provider states grant access only through the explicit entitlement mapping. */
export function entitlementForCreemSubscriptionStatus(
  status: string,
): AstreexEntitlementStatus {
  const normalized = normalizeCreemSubscriptionStatus(status)
  return normalized === "active" || normalized === "scheduled_cancel"
    ? "active"
    : "inactive"
}

export type UsagePlanSnapshot = Readonly<{
  keywordLimit: number
  mentionLimit: number
  planId: AstreexPlanId
}>

export function createUsagePlanSnapshot(input: {
  keywordLimit: number
  mentionLimit: number
  planId: AstreexPlanId
}): UsagePlanSnapshot {
  if (!Number.isInteger(input.keywordLimit) || input.keywordLimit < 0) {
    throw new RangeError("keywordLimit must be a non-negative integer")
  }
  if (!Number.isInteger(input.mentionLimit) || input.mentionLimit < 0) {
    throw new RangeError("mentionLimit must be a non-negative integer")
  }
  if (!(["starter", "growth", "scale"] as const).includes(input.planId)) {
    throw new TypeError("Unknown Astreex plan")
  }

  return Object.freeze({
    keywordLimit: input.keywordLimit,
    mentionLimit: input.mentionLimit,
    planId: input.planId,
  })
}
