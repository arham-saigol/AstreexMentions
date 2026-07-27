import type { GenericId } from "convex/values"

import { readCreemApiConfiguration } from "../billing/config"
import {
  evaluateCompositeDeletionBillingGuard,
  PROVIDER_OPERATION_STALE_MS,
  type CompositeDeletionBillingGuardResult,
  type SubscriptionEntitlementForDeletion,
} from "../lib/billingDeletionGuard"
import {
  env,
  indexEquals,
  indexGreaterThanOrEqual,
  type DatabaseReader,
} from "../server"

type WorkspaceId = GenericId<"workspaces">

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
    checkoutRows,
    runningProviderRuns,
    billingEventRows,
    activeEmailOutboxLeases,
  ] = await Promise.all([
    db
      .query("subscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
    db
      .query("billingCheckouts")
      .withIndex("by_workspace_and_created_at", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect(),
    db
      .query("providerRuns")
      .withIndex("by_workspace_status_and_started_at", (q) =>
        indexGreaterThanOrEqual(
          indexEquals(q, ["workspaceId", workspaceId], ["status", "running"]),
          "startedAt",
          checkedAt - PROVIDER_OPERATION_STALE_MS + 1,
        ),
      )
      .take(1),
    db
      .query("billingEvents")
      .withIndex("by_workspace_and_received_at", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect(),
    db
      .query("emailOutbox")
      .withIndex("by_workspace_status_and_lease_expires_at", (q) =>
        indexGreaterThanOrEqual(
          indexEquals(q, ["workspaceId", workspaceId], ["status", "leased"]),
          "leaseExpiresAt",
          checkedAt + 1,
        ),
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
    checkouts: checkoutRows.map((checkout) => ({
      expiresAt: checkout.expiresAt as number,
      status: checkout.status as string,
    })),
    pendingBillingEventCount: billingEventRows.filter(
      (event) => event.status === "pending" || event.status === "leased",
    ).length,
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
