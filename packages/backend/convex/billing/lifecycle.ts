import {
  createUsagePlanSnapshot,
  entitlementForCreemSubscriptionStatus,
  normalizeCreemSubscriptionStatus,
  type AstreexEntitlementStatus,
  type AstreexPlanId,
} from "../lib/creemBilling"
import type { NormalizedCreemSubscription } from "../integrations/creem"
import type { CreemPlanMapping } from "./config"

export type BillingSubscriptionState = {
  cancelAtPeriodEnd: boolean
  canceledAt?: number | undefined
  createdAt: number
  currentPeriodEnd: number
  currentPeriodStart: number
  endedAt?: number | undefined
  entitlementStatus: AstreexEntitlementStatus
  lastSyncedAt: number
  planId: AstreexPlanId
  provider: "creem"
  providerCustomerId: string
  providerPriceId?: string | undefined
  providerSubscriptionId: string
  status: string
  updatedAt: number
  workspaceId: string
}

export type BillingUsageCycleState = {
  warning100SentAt?: number | undefined
  warning80SentAt?: number | undefined
  closedAt?: number | undefined
  createdAt: number
  idempotencyKey: string
  keywordLimit: number
  mentionLimit: number
  mentionsUsed: number
  periodEndAt: number
  periodStartAt: number
  planSnapshot: Readonly<{
    keywordLimit: number
    mentionLimit: number
    planId: AstreexPlanId
  }>
  status: "closed" | "open"
  subscriptionId?: string | undefined
  updatedAt: number
  workspaceId: string
}

export type SubscriptionTransition =
  | { kind: "incomplete_period" }
  | { kind: "stale" }
  | {
      kind: "applied"
      closedUsageCycle?: BillingUsageCycleState
      subscription: BillingSubscriptionState
      usageCycle: BillingUsageCycleState
      usageKind: "created" | "preserved" | "reset"
    }

function entitlementForStatusAtPeriod(
  status: string,
  providerCreatedAt: number,
  currentPeriodEnd: number,
): AstreexEntitlementStatus {
  const entitlement = entitlementForCreemSubscriptionStatus(status)
  if (status === "scheduled_cancel" && providerCreatedAt >= currentPeriodEnd) {
    return "inactive"
  }
  return entitlement
}

function usageCycleIdempotencyKey(
  providerSubscriptionId: string,
  periodStartAt: number,
): string {
  return `creem:${providerSubscriptionId}:${periodStartAt}`
}

function createOpenUsageCycle(input: {
  now: number
  periodEndAt: number
  periodStartAt: number
  plan: CreemPlanMapping
  providerSubscriptionId: string
  subscriptionId?: string | undefined
  workspaceId: string
}): BillingUsageCycleState {
  return {
    createdAt: input.now,
    idempotencyKey: usageCycleIdempotencyKey(
      input.providerSubscriptionId,
      input.periodStartAt,
    ),
    keywordLimit: input.plan.keywordLimit,
    mentionLimit: input.plan.mentionLimit,
    mentionsUsed: 0,
    periodEndAt: input.periodEndAt,
    periodStartAt: input.periodStartAt,
    planSnapshot: createUsagePlanSnapshot(input.plan),
    status: "open",
    ...(input.subscriptionId === undefined
      ? {}
      : { subscriptionId: input.subscriptionId }),
    updatedAt: input.now,
    workspaceId: input.workspaceId,
  }
}

/**
 * Plans one provider update without mutating storage. New billing periods reset
 * usage; upgrades and resumes inside the same period preserve usage and both
 * warning timestamps.
 */
export function planCreemSubscriptionTransition(input: {
  currentUsageCycle: BillingUsageCycleState | null
  existingSubscription: BillingSubscriptionState | null
  plan: CreemPlanMapping
  providerCreatedAt: number
  subscription: NormalizedCreemSubscription
  subscriptionId?: string | undefined
  workspaceId: string
}): SubscriptionTransition {
  const existing = input.existingSubscription
  if (existing && input.providerCreatedAt <= existing.lastSyncedAt) {
    return { kind: "stale" }
  }
  if (
    existing &&
    (existing.providerSubscriptionId !==
      input.subscription.providerSubscriptionId ||
      existing.workspaceId !== input.workspaceId)
  ) {
    throw new TypeError("Creem subscription update target does not match")
  }
  if (input.plan.productId !== input.subscription.productId) {
    throw new TypeError("Creem product is not mapped to the selected plan")
  }

  const currentPeriodStart =
    input.subscription.currentPeriodStart ?? existing?.currentPeriodStart
  const currentPeriodEnd =
    input.subscription.currentPeriodEnd ?? existing?.currentPeriodEnd
  if (currentPeriodStart === undefined || currentPeriodEnd === undefined) {
    return { kind: "incomplete_period" }
  }
  if (
    !Number.isFinite(currentPeriodStart) ||
    !Number.isFinite(currentPeriodEnd) ||
    currentPeriodEnd <= currentPeriodStart
  ) {
    throw new RangeError("Creem subscription period is invalid")
  }
  if (existing && currentPeriodStart < existing.currentPeriodStart) {
    return { kind: "stale" }
  }

  const status = normalizeCreemSubscriptionStatus(input.subscription.status)
  const entitlementStatus = entitlementForStatusAtPeriod(
    status,
    input.providerCreatedAt,
    currentPeriodEnd,
  )
  const endedAt =
    status === "canceled" || status === "expired"
      ? (input.subscription.canceledAt ?? input.providerCreatedAt)
      : undefined

  const subscription: BillingSubscriptionState = {
    cancelAtPeriodEnd: status === "scheduled_cancel",
    ...(input.subscription.canceledAt === undefined
      ? {}
      : { canceledAt: input.subscription.canceledAt }),
    createdAt: existing?.createdAt ?? input.providerCreatedAt,
    currentPeriodEnd,
    currentPeriodStart,
    ...(endedAt === undefined ? {} : { endedAt }),
    entitlementStatus,
    lastSyncedAt: input.providerCreatedAt,
    planId: input.plan.planId,
    provider: "creem",
    providerCustomerId: input.subscription.providerCustomerId,
    ...(input.subscription.providerPriceId === undefined
      ? existing?.providerPriceId === undefined
        ? {}
        : { providerPriceId: existing.providerPriceId }
      : { providerPriceId: input.subscription.providerPriceId }),
    providerSubscriptionId: input.subscription.providerSubscriptionId,
    status,
    updatedAt: input.providerCreatedAt,
    workspaceId: input.workspaceId,
  }

  const currentCycle = input.currentUsageCycle
  if (!currentCycle) {
    return {
      kind: "applied",
      subscription,
      usageCycle: createOpenUsageCycle({
        now: input.providerCreatedAt,
        periodEndAt: currentPeriodEnd,
        periodStartAt: currentPeriodStart,
        plan: input.plan,
        providerSubscriptionId: input.subscription.providerSubscriptionId,
        subscriptionId: input.subscriptionId,
        workspaceId: input.workspaceId,
      }),
      usageKind: "created",
    }
  }

  if (currentPeriodStart < currentCycle.periodStartAt) {
    return { kind: "stale" }
  }

  if (currentPeriodStart === currentCycle.periodStartAt) {
    return {
      kind: "applied",
      subscription,
      usageCycle: {
        ...currentCycle,
        closedAt: undefined,
        keywordLimit: input.plan.keywordLimit,
        mentionLimit: input.plan.mentionLimit,
        periodEndAt: currentPeriodEnd,
        planSnapshot: createUsagePlanSnapshot(input.plan),
        status: "open",
        ...(input.subscriptionId === undefined
          ? {}
          : { subscriptionId: input.subscriptionId }),
        updatedAt: input.providerCreatedAt,
      },
      usageKind: "preserved",
    }
  }

  return {
    kind: "applied",
    closedUsageCycle: {
      ...currentCycle,
      closedAt: input.providerCreatedAt,
      status: "closed",
      updatedAt: input.providerCreatedAt,
    },
    subscription,
    usageCycle: createOpenUsageCycle({
      now: input.providerCreatedAt,
      periodEndAt: currentPeriodEnd,
      periodStartAt: currentPeriodStart,
      plan: input.plan,
      providerSubscriptionId: input.subscription.providerSubscriptionId,
      subscriptionId: input.subscriptionId,
      workspaceId: input.workspaceId,
    }),
    usageKind: "reset",
  }
}

export function effectiveEntitlementStatus(
  subscription: Pick<
    BillingSubscriptionState,
    "currentPeriodEnd" | "entitlementStatus" | "status"
  >,
  now: number,
): AstreexEntitlementStatus {
  if (subscription.entitlementStatus !== "active") {
    return "inactive"
  }
  if (
    subscription.status === "scheduled_cancel" &&
    now >= subscription.currentPeriodEnd
  ) {
    return "inactive"
  }
  return "active"
}

export type CheckoutCompletionTransition = {
  completedAt: number
  status: "complete"
  updatedAt: number
}

/** Checkout completion is bookkeeping only and never creates entitlement. */
export function completeCheckoutWithoutEntitlement(
  providerCreatedAt: number,
): CheckoutCompletionTransition {
  return {
    completedAt: providerCreatedAt,
    status: "complete",
    updatedAt: providerCreatedAt,
  }
}
