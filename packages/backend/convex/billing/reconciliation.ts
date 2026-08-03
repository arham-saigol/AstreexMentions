"use node"

import { internal } from "../_generated/api"

import { v } from "convex/values"

import {
  createCreemClient,
  normalizeCreemSubscription,
} from "../integrations/creem"
import { env, internalAction } from "../_generated/server"
import { readCreemApiConfiguration } from "./config"

const INCOMPLETE_UPGRADE_RETRY_DELAY_MS = 30_000
const MAX_INCOMPLETE_UPGRADE_ATTEMPTS = 5

export const reconcileIncompleteCreemBillingEvent = internalAction({
  args: { billingEventId: v.id("billingEvents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.billing.internal.loadIncompleteCreemBillingEvent,
      args,
    )
    if (context.state !== "ready") {
      return context
    }

    const configuration = readCreemApiConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      return configuration
    }

    try {
      const subscription = await createCreemClient(
        configuration,
      ).getSubscription(context.providerSubscriptionId)
      return await ctx.runMutation(
        internal.billing.internal.applyIncompleteCreemBillingEvent,
        {
          ...args,
          authoritativeSubscriptionJson: JSON.stringify(subscription),
          receivedAt: Date.now(),
        },
      )
    } catch {
      return { state: "retry" as const }
    }
  },
})

export const reconcileIncompleteCreemUpgrade = internalAction({
  args: {
    actorClerkUserId: v.string(),
    actorUserId: v.id("users"),
    attempt: v.number(),
    idempotencyKey: v.string(),
    providerSubscriptionId: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.attempt) ||
      args.attempt < 1 ||
      args.attempt > MAX_INCOMPLETE_UPGRADE_ATTEMPTS
    ) {
      await ctx.runMutation(
        internal.billing.internal.markCreemProviderOperationUnresolved,
        {
          errorCode: "INVALID_RECONCILIATION_ATTEMPT",
          errorMessage: "Creem upgrade reconciliation attempt is invalid",
          idempotencyKey: args.idempotencyKey,
          workspaceId: args.workspaceId,
        },
      )
      return { state: "invalid_attempt" as const }
    }

    const retryOrRelease = async (errorCode: string, errorMessage: string) => {
      if (args.attempt < MAX_INCOMPLETE_UPGRADE_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          INCOMPLETE_UPGRADE_RETRY_DELAY_MS,
          internal.billing.reconciliation.reconcileIncompleteCreemUpgrade,
          { ...args, attempt: args.attempt + 1 },
        )
        return { state: "retry_scheduled" as const }
      }
      await ctx.runMutation(
        internal.billing.internal.markCreemProviderOperationUnresolved,
        {
          errorCode,
          errorMessage,
          idempotencyKey: args.idempotencyKey,
          workspaceId: args.workspaceId,
        },
      )
      return { state: "unresolved" as const }
    }

    const configuration = readCreemApiConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      return await retryOrRelease(
        "PROVIDER_UNCONFIGURED",
        "Creem configuration is unavailable during upgrade reconciliation",
      )
    }

    const startedAt = Date.now()
    try {
      const subscription = await createCreemClient(
        configuration,
      ).getSubscription(args.providerSubscriptionId)
      const applied = await ctx.runMutation(
        internal.billing.internal.applyUpgradeResponse,
        {
          ...(args.attempt < MAX_INCOMPLETE_UPGRADE_ATTEMPTS
            ? {
                incompleteReconciliation: {
                  actorClerkUserId: args.actorClerkUserId,
                  actorUserId: args.actorUserId,
                  attempt: args.attempt + 1,
                  delayMs: INCOMPLETE_UPGRADE_RETRY_DELAY_MS,
                  idempotencyKey: args.idempotencyKey,
                },
              }
            : {}),
          providerCreatedAt: normalizeCreemSubscription(subscription).updatedAt,
          rawSubscriptionJson: JSON.stringify(subscription),
          workspaceId: args.workspaceId,
        },
      )
      if (applied.state === "provider_unconfigured") {
        return await retryOrRelease(
          "INCOMPLETE_SUBSCRIPTION_PERIOD",
          "Creem subscription period remained incomplete after reconciliation",
        )
      }
      if (applied.kind === "incomplete_period") {
        return args.attempt < MAX_INCOMPLETE_UPGRADE_ATTEMPTS
          ? { state: "retry_scheduled" as const }
          : await retryOrRelease(
              "INCOMPLETE_SUBSCRIPTION_PERIOD",
              "Creem subscription period remained incomplete after reconciliation",
            )
      }

      await ctx.runMutation(
        internal.billing.internal.recordCreemProviderOperation,
        {
          actorClerkUserId: args.actorClerkUserId,
          actorUserId: args.actorUserId,
          durationMs: Date.now() - startedAt,
          idempotencyKey: args.idempotencyKey,
          operation: "upgrade",
          status: "succeeded",
          targetId: args.providerSubscriptionId,
          workspaceId: args.workspaceId,
        },
      )
      return { kind: applied.kind, state: "applied" as const }
    } catch {
      return await retryOrRelease(
        "UPGRADE_RECONCILIATION_FAILED",
        "Creem upgrade reconciliation failed",
      )
    }
  },
})
