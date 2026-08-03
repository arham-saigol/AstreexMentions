import type { Id } from "../_generated/dataModel"

import { readCreemApiConfiguration } from "../billing/config"
import {
  evaluateCompositeDeletionBillingGuard,
  PROVIDER_OPERATION_STALE_MS,
  type CompositeDeletionBillingGuardResult,
  type SubscriptionEntitlementForDeletion,
} from "../lib/billingDeletionGuard"
import { env, type DatabaseReader } from "../_generated/server"

type WorkspaceId = Id<"workspaces">

export type DeletionBillingSnapshot = {
  guard: CompositeDeletionBillingGuardResult
  subscriptions: Array<
    SubscriptionEntitlementForDeletion & {
      providerSubscriptionId: string
    }
  >
}

export async function readDeletionBillingSnapshot(
  db: DatabaseReader,
  workspaceId: WorkspaceId,
  checkedAt = Date.now(),
): Promise<DeletionBillingSnapshot> {
  const [
    subscriptionRows,
    openCheckoutRows,
    completeCheckoutRows,
    runningProviderRuns,
    pendingBillingEventRows,
    leasedBillingEventRows,
    activeEmailOutboxLeases,
  ] = await Promise.all([
    db
      .query("subscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
    db
      .query("billingCheckouts")
      .withIndex("by_workspace_status_and_expires_at", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("status", "open")
          .gte("expiresAt", checkedAt + 1),
      )
      .take(1),
    db
      .query("billingCheckouts")
      .withIndex("by_workspace_status_and_expires_at", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("status", "complete")
          .gte("expiresAt", checkedAt + 1),
      )
      .take(1),
    db
      .query("providerRuns")
      .withIndex("by_workspace_status_and_started_at", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("status", "running")
          .gte("startedAt", checkedAt - PROVIDER_OPERATION_STALE_MS + 1),
      )
      .take(1),
    db
      .query("billingEvents")
      .withIndex("by_workspace_status_and_received_at", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "pending"),
      )
      .take(1),
    db
      .query("billingEvents")
      .withIndex("by_workspace_status_and_received_at", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "leased"),
      )
      .take(1),
    db
      .query("emailOutbox")
      .withIndex("by_workspace_status_and_lease_expires_at", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("status", "leased")
          .gte("leaseExpiresAt", checkedAt + 1),
      )
      .take(1),
  ])

  const subscriptions = subscriptionRows.map((subscription) => ({
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd as boolean,
    entitlementStatus: subscription.entitlementStatus as string,
    providerSubscriptionId: subscription.providerSubscriptionId as string,
    status: subscription.status as string,
  }))
  const providerConfiguration = readCreemApiConfiguration(env)
  const guard = evaluateCompositeDeletionBillingGuard({
    activeSideEffectCount: activeEmailOutboxLeases.length,
    checkedAt,
    checkouts: [...openCheckoutRows, ...completeCheckoutRows].map(
      (checkout) => ({
        expiresAt: checkout.expiresAt as number,
        status: checkout.status as string,
      }),
    ),
    pendingBillingEventCount:
      pendingBillingEventRows.length + leasedBillingEventRows.length,
    providerConfigured: providerConfiguration.state === "configured",
    providerRuns: runningProviderRuns.map((run) => ({
      provider: run.provider as string,
      startedAt: run.startedAt as number,
      status: run.status as string,
    })),
    subscriptions,
  })

  return { guard, subscriptions }
}
