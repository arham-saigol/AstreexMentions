"use node"

import { v } from "convex/values"

import { readCreemApiConfiguration } from "../billing/config"
import {
  ClerkIntegrationError,
  createClerkAdminClient,
  DEFAULT_CLERK_TIMEOUT_MS,
} from "../integrations/clerk"
import {
  createCreemClient,
  CreemIntegrationError,
  normalizeCreemSubscription,
} from "../integrations/creem"
import { evaluateDeletionBillingGuard } from "../lib/billingDeletionGuard"
import { env, internalAction, type ActionCtx } from "../server"
import {
  beginAccountDeletionPurgeReference,
  blockAccountDeletionForBillingReference,
  completeIdentityDeletionReference,
  continueAccountDeletionReference,
  failAccountDeletionAttemptReference,
  finalizeSecurityTombstoneReference,
  loadIdentityDeletionContextReference,
  purgeAccountDeletionBatchReference,
  startAccountDeletionAttemptReference,
  verifyAccountDeletionDataReference,
  type AccountDeletionLeaseArguments,
} from "./internal"
import { type AccountDeletionPhase } from "./model"

const MAX_PURGE_BATCHES_PER_ACTION = 20
const TERMINAL_CREEM_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "expired",
  "inactive",
])

type SafeDeletionFailure = {
  code: string
  retryable: boolean
}

function safeFailure(error: unknown): SafeDeletionFailure {
  if (
    error instanceof ClerkIntegrationError ||
    error instanceof CreemIntegrationError
  ) {
    return { code: error.code, retryable: error.retryable }
  }
  return { code: "ACCOUNT_DELETION_EXECUTION_FAILED", retryable: true }
}

function positiveEnvironmentNumber(
  value: string | undefined,
  fallback: number,
): number | null {
  if (value === undefined || value.trim().length === 0) {
    return fallback
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

async function fail(
  ctx: ActionCtx,
  args: AccountDeletionLeaseArguments,
  failure: SafeDeletionFailure,
) {
  return await ctx.runMutation(failAccountDeletionAttemptReference, {
    ...args,
    code: failure.code,
    retryable: failure.retryable,
  })
}

export const runAccountDeletion = internalAction({
  args: {
    deletionJobId: v.id("deletionJobs"),
    leaseToken: v.string(),
    leaseVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runMutation(
      startAccountDeletionAttemptReference,
      args,
    )
    if (context.state === "stale_lease") {
      return context
    }

    let phase: AccountDeletionPhase = context.phase

    if (phase === "billing_check") {
      if (context.billingGuard.status === "unavailable") {
        return await fail(ctx, args, {
          code: context.billingGuard.code,
          retryable: true,
        })
      }
      if (context.billingGuard.status === "blocked_active") {
        if (context.billingGuard.code === "BILLING_PORTAL_REQUIRED") {
          return await ctx.runMutation(
            blockAccountDeletionForBillingReference,
            { ...args, code: context.billingGuard.code },
          )
        }
        return await fail(ctx, args, {
          code: context.billingGuard.code,
          retryable: true,
        })
      }

      const configuration = readCreemApiConfiguration(env)
      if (configuration.state === "provider_unconfigured") {
        return await fail(ctx, args, {
          code: "BILLING_CONFIGURATION_REQUIRED",
          retryable: true,
        })
      }

      try {
        const client = createCreemClient(configuration)
        const providerSubscriptions = await Promise.all(
          context.subscriptions.map(async (subscription) =>
            normalizeCreemSubscription(
              await client.getSubscription(subscription.providerSubscriptionId),
            ),
          ),
        )
        const authoritativeGuard = evaluateDeletionBillingGuard(
          providerSubscriptions.map((subscription) => {
            const status = subscription.status.trim().toLocaleLowerCase("en")
            const inactive = TERMINAL_CREEM_SUBSCRIPTION_STATUSES.has(status)
            return {
              cancelAtPeriodEnd: false,
              entitlementStatus: inactive ? "inactive" : "active",
              status,
            }
          }),
        )
        if (authoritativeGuard.status !== "confirmed_inactive") {
          return await ctx.runMutation(
            blockAccountDeletionForBillingReference,
            { ...args, code: "BILLING_PORTAL_REQUIRED" },
          )
        }
      } catch (error) {
        return await fail(ctx, args, safeFailure(error))
      }

      const providerVerifiedAt = Date.now()
      const started = (await ctx.runMutation(
        beginAccountDeletionPurgeReference,
        { ...args, providerVerifiedAt },
      )) as {
        code?: string
        state:
          | "account_state_invalid"
          | "billing_blocked"
          | "provider_verification_expired"
          | "ready"
          | "stale_lease"
      }
      if (started.state === "billing_blocked") {
        if (started.code === "BILLING_PORTAL_REQUIRED") {
          return await ctx.runMutation(
            blockAccountDeletionForBillingReference,
            { ...args, code: started.code },
          )
        }
        return await fail(ctx, args, {
          code: started.code ?? "BILLING_RECONCILIATION_REQUIRED",
          retryable: true,
        })
      }
      if (started.state !== "ready") {
        return await fail(ctx, args, {
          code:
            started.state === "account_state_invalid"
              ? "ACCOUNT_DELETION_STATE_INVALID"
              : "ACCOUNT_DELETION_LEASE_EXPIRED",
          retryable: started.state !== "account_state_invalid",
        })
      }
      phase = "purge"
    }

    if (phase === "purge") {
      for (let batch = 0; batch < MAX_PURGE_BATCHES_PER_ACTION; batch += 1) {
        const result = (await ctx.runMutation(
          purgeAccountDeletionBatchReference,
          args,
        )) as {
          phase?: "purge" | "verify_data"
          state: "advanced" | "stale_lease"
        }
        if (result.state !== "advanced") {
          return result
        }
        if (result.phase === "verify_data") {
          phase = "verify_data"
          break
        }
      }
      if (phase === "purge") {
        return await ctx.runMutation(continueAccountDeletionReference, args)
      }
    }

    if (phase === "verify_data") {
      const verified = (await ctx.runMutation(
        verifyAccountDeletionDataReference,
        args,
      )) as {
        state: "data_remaining" | "stale_lease" | "verified"
      }
      if (verified.state === "data_remaining") {
        return await fail(ctx, args, {
          code: "ACCOUNT_DELETION_DATA_REMAINING",
          retryable: true,
        })
      }
      if (verified.state !== "verified") {
        return verified
      }
      phase = "identity_delete"
    }

    if (phase === "identity_delete") {
      const identityContext = await ctx.runQuery(
        loadIdentityDeletionContextReference,
        args,
      )
      if (identityContext.state !== "ready") {
        return await fail(ctx, args, {
          code: "IDENTITY_DELETION_NOT_READY",
          retryable: false,
        })
      }
      const secretKey = env.CLERK_SECRET_KEY?.trim()
      const timeoutMs = positiveEnvironmentNumber(
        env.CLERK_TIMEOUT_MS,
        DEFAULT_CLERK_TIMEOUT_MS,
      )
      const configuredFence = env.DELETION_IDENTITY_FENCE_MS?.trim()
      const fenceMs = configuredFence
        ? positiveEnvironmentNumber(configuredFence, 0)
        : null
      if (!secretKey || timeoutMs === null || fenceMs === null) {
        return await fail(ctx, args, {
          code: "CLERK_DELETION_CONFIGURATION_REQUIRED",
          retryable: false,
        })
      }

      try {
        const client = createClerkAdminClient({ secretKey, timeoutMs })
        const initial = await client.getUserState(identityContext.clerkUserId)
        if (initial === "present") {
          await client.deleteUser(identityContext.clerkUserId)
          const final = await client.getUserState(identityContext.clerkUserId)
          if (final !== "absent") {
            return await fail(ctx, args, {
              code: "CLERK_IDENTITY_STILL_PRESENT",
              retryable: true,
            })
          }
        }
        const now = Date.now()
        return await ctx.runMutation(completeIdentityDeletionReference, {
          ...args,
          fenceExpiresAt: now + fenceMs,
          now,
        })
      } catch (error) {
        return await fail(ctx, args, safeFailure(error))
      }
    }

    if (phase === "security_fence") {
      return await ctx.runMutation(finalizeSecurityTombstoneReference, args)
    }

    return { state: "completed" as const }
  },
})
