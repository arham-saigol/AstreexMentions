import { internal } from "../_generated/api"
import { ConvexError, v } from "convex/values"
import { z } from "zod"

import {
  createCreemClient,
  CreemIntegrationError,
  normalizeCreemSubscription,
} from "../integrations/creem"
import { customerAction, customerQuery } from "../lib/authorization"
import { env } from "../_generated/server"
import {
  readCreemApiConfiguration,
  readCreemCheckoutConfiguration,
  readCreemUpgradeConfiguration,
} from "./config"
import { subscriptionStatusAllowsCheckout } from "./lifecycle"
import { resolveWorkspaceAllowance } from "../lib/workspaceAccess"

const planIdValidator = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("scale"),
)
const planIdSchema = z.enum(["starter", "growth", "scale"])
const idempotencyKeySchema = z.string().trim().min(8).max(200)

const providerUnconfiguredValidator = v.object({
  missing: v.array(v.string()),
  state: v.literal("provider_unconfigured"),
})
const billingOverviewValidator = v.object({
  accessKind: v.union(v.literal("paid"), v.literal("free"), v.literal("none")),
  evaluation: v.union(
    v.object({
      keywordLimit: v.number(),
      mentionLimit: v.number(),
      mentionsUsed: v.number(),
    }),
    v.null(),
  ),
  missing: v.optional(v.array(v.string())),
  providerState: v.union(
    v.literal("configured"),
    v.literal("provider_unconfigured"),
  ),
  subscription: v.union(
    v.object({
      cancelAtPeriodEnd: v.boolean(),
      currentPeriodEnd: v.number(),
      currentPeriodStart: v.number(),
      entitlementStatus: v.union(v.literal("active"), v.literal("inactive")),
      planId: planIdValidator,
      status: v.string(),
    }),
    v.null(),
  ),
  usage: v.union(
    v.object({
      keywordLimit: v.number(),
      mentionLimit: v.number(),
      mentionsUsed: v.number(),
      periodEndAt: v.number(),
      periodStartAt: v.number(),
    }),
    v.null(),
  ),
})
const checkoutResultValidator = v.union(
  providerUnconfiguredValidator,
  v.object({
    checkoutId: v.string(),
    reused: v.boolean(),
    state: v.literal("configured"),
    status: v.string(),
    url: v.string(),
  }),
)
const billingPortalResultValidator = v.union(
  providerUnconfiguredValidator,
  v.object({
    state: v.literal("configured"),
    url: v.string(),
  }),
)
const upgradeResultValidator = v.union(
  providerUnconfiguredValidator,
  v.object({
    kind: v.string(),
    planId: planIdValidator,
    state: v.literal("configured"),
  }),
)

function billingError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function providerUnconfiguredResult(configuration: {
  missing: readonly string[]
}): {
  missing: string[]
  state: "provider_unconfigured"
} {
  return {
    missing: [...configuration.missing],
    state: "provider_unconfigured",
  }
}

function throwCreemError(error: unknown): never {
  if (error instanceof CreemIntegrationError) {
    throw new ConvexError({
      code: `CREEM_${error.code}`,
      message: error.message,
      retryable: error.retryable,
      ...(error.status === undefined ? {} : { status: error.status }),
    })
  }
  throw new ConvexError({
    code: "CREEM_REQUEST_FAILED",
    message: "Creem billing request failed",
    retryable: true,
  })
}

function providerErrorCode(error: unknown): string {
  if (error instanceof CreemIntegrationError) {
    return error.status === 429 ? "HTTP_429" : error.code
  }
  return "REQUEST_FAILED"
}

function providerErrorMessage(error: unknown): string {
  return error instanceof CreemIntegrationError
    ? error.message
    : "Creem billing request failed"
}

function providerErrorRetryable(error: unknown): boolean {
  return error instanceof CreemIntegrationError ? error.retryable : true
}

const PLAN_RANK = {
  starter: 0,
  growth: 1,
  scale: 2,
} as const

export const getBillingOverview = customerQuery({
  args: { now: v.number() },
  returns: billingOverviewValidator,
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.now) || args.now < 0) {
      billingError("INVALID_BILLING_INPUT", "Current time is invalid")
    }
    const [subscription, allowance] = await Promise.all([
      ctx.db
        .query("subscriptions")
        .withIndex("by_workspace_and_last_synced_at", (q) =>
          q.eq("workspaceId", ctx.workspace.id),
        )
        .order("desc")
        .first(),
      resolveWorkspaceAllowance(ctx, ctx.workspace.id, args.now),
    ])
    const providerConfiguration = readCreemApiConfiguration(env)
    const displayedSubscription =
      allowance.kind === "paid" ? allowance.subscription : subscription

    return {
      accessKind: allowance.kind,
      evaluation:
        allowance.kind === "free"
          ? {
              keywordLimit: allowance.keywordLimit,
              mentionLimit: allowance.mentionLimit,
              mentionsUsed: allowance.mentionsUsed,
            }
          : null,
      providerState: providerConfiguration.state,
      subscription: displayedSubscription
        ? {
            cancelAtPeriodEnd: displayedSubscription.cancelAtPeriodEnd,
            currentPeriodEnd: displayedSubscription.currentPeriodEnd,
            currentPeriodStart: displayedSubscription.currentPeriodStart,
            entitlementStatus: displayedSubscription.entitlementStatus as
              "active" | "inactive",
            planId: displayedSubscription.planId,
            status: displayedSubscription.status,
          }
        : null,
      usage:
        allowance.kind === "paid"
          ? {
              keywordLimit: allowance.keywordLimit,
              mentionLimit: allowance.mentionLimit,
              mentionsUsed: allowance.mentionsUsed,
              periodEndAt: allowance.cycle.periodEndAt,
              periodStartAt: allowance.cycle.periodStartAt,
            }
          : null,
      ...(providerConfiguration.state === "provider_unconfigured"
        ? { missing: [...providerConfiguration.missing] }
        : {}),
    }
  },
})

export const createCheckout = customerAction({
  args: {
    idempotencyKey: v.string(),
    planId: planIdValidator,
  },
  returns: checkoutResultValidator,
  handler: async (ctx, args) => {
    const planResult = planIdSchema.safeParse(args.planId)
    const idempotencyResult = idempotencyKeySchema.safeParse(
      args.idempotencyKey,
    )
    if (!planResult.success || !idempotencyResult.success) {
      billingError("INVALID_BILLING_INPUT", "Checkout input is invalid")
    }

    const configuration = readCreemCheckoutConfiguration(env, planResult.data)
    if (configuration.state === "provider_unconfigured") {
      return providerUnconfiguredResult(configuration)
    }

    const existing = await ctx.runQuery(
      internal.billing.internal.getCustomerBillingActionContext,
      {
        idempotencyKey: idempotencyResult.data,
        workspaceId: ctx.workspace.id,
      },
    )
    if (
      existing.subscription &&
      !subscriptionStatusAllowsCheckout(String(existing.subscription.status))
    ) {
      billingError(
        "BILLING_SUBSCRIPTION_ALREADY_EXISTS",
        "Use the billing portal or upgrade flow for an existing subscription",
      )
    }
    if (existing.checkout) {
      if (existing.checkout.workspaceId !== ctx.workspace.id) {
        billingError(
          "BILLING_IDEMPOTENCY_CONFLICT",
          "Checkout idempotency key is already in use",
        )
      }
      const existingUrl = existing.checkout.url
      if (typeof existingUrl === "string" && existingUrl.length > 0) {
        return {
          checkoutId: String(existing.checkout.providerCheckoutSessionId),
          reused: true,
          state: "configured" as const,
          status: String(existing.checkout.status),
          url: existingUrl,
        }
      }
    }
    if (existing.outstandingCheckout) {
      const outstandingUrl = existing.outstandingCheckout.url
      if (
        existing.outstandingCheckout.status === "open" &&
        typeof outstandingUrl === "string" &&
        outstandingUrl.length > 0
      ) {
        return {
          checkoutId: String(
            existing.outstandingCheckout.providerCheckoutSessionId,
          ),
          reused: true,
          state: "configured" as const,
          status: String(existing.outstandingCheckout.status),
          url: outstandingUrl,
        }
      }
      billingError(
        "BILLING_CHECKOUT_ALREADY_EXISTS",
        "Resume or wait for the outstanding checkout before starting another",
      )
    }

    const operationId = `checkout:${idempotencyResult.data}`
    const operation = await ctx.runMutation(
      internal.billing.internal.beginCreemProviderOperation,
      {
        idempotencyKey: operationId,
        operation: "checkout",
        workspaceId: ctx.workspace.id,
      },
    )
    if (operation.state !== "started") {
      billingError(
        "BILLING_RECONCILIATION_REQUIRED",
        "A previous checkout attempt requires reconciliation",
      )
    }

    const startedAt = Date.now()
    try {
      const client = createCreemClient(configuration)
      const checkout = await client.createCheckout({
        ...(ctx.viewer.email === undefined
          ? {}
          : { customerEmail: ctx.viewer.email }),
        metadata: { internal_customer_id: String(ctx.workspace.id) },
        productId: configuration.plan.productId,
        requestId: idempotencyResult.data,
        successUrl: configuration.successUrl,
      })
      await ctx.runMutation(internal.billing.internal.recordCheckout, {
        createdAt: Date.now(),
        idempotencyKey: idempotencyResult.data,
        planId: planResult.data,
        providerCheckoutSessionId: checkout.checkoutId,
        providerStatus: checkout.status,
        requestedByUserId: ctx.viewer.id,
        url: checkout.url,
        workspaceId: ctx.workspace.id,
      })
      await ctx.runMutation(
        internal.billing.internal.recordCreemProviderOperation,
        {
          actorClerkUserId: ctx.identity.subject,
          actorUserId: ctx.viewer.id,
          durationMs: Date.now() - startedAt,
          idempotencyKey: operationId,
          operation: "checkout",
          status: "succeeded",
          targetId: checkout.checkoutId,
          workspaceId: ctx.workspace.id,
        },
      )

      return {
        checkoutId: checkout.checkoutId,
        reused: false,
        state: "configured" as const,
        status: checkout.status,
        url: checkout.url,
      }
    } catch (error) {
      try {
        if (providerErrorRetryable(error)) {
          await ctx.runMutation(
            internal.billing.internal.markCreemProviderOperationUnresolved,
            {
              errorCode: providerErrorCode(error),
              errorMessage: providerErrorMessage(error),
              idempotencyKey: operationId,
              workspaceId: ctx.workspace.id,
            },
          )
        } else {
          await ctx.runMutation(
            internal.billing.internal.recordCreemProviderOperation,
            {
              actorClerkUserId: ctx.identity.subject,
              actorUserId: ctx.viewer.id,
              durationMs: Date.now() - startedAt,
              errorCode: providerErrorCode(error),
              errorMessage: providerErrorMessage(error),
              idempotencyKey: operationId,
              operation: "checkout",
              status: "failed",
              workspaceId: ctx.workspace.id,
            },
          )
        }
      } catch {
        // Preserve the typed provider failure rather than masking it with metrics.
      }
      throwCreemError(error)
    }
  },
})

export const createBillingPortal = customerAction({
  args: {},
  returns: billingPortalResultValidator,
  handler: async (ctx) => {
    const configuration = readCreemApiConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      return providerUnconfiguredResult(configuration)
    }

    const billingContext = await ctx.runQuery(
      internal.billing.internal.getCustomerBillingActionContext,
      { workspaceId: ctx.workspace.id },
    )
    const customerId = billingContext.subscription?.providerCustomerId
    if (typeof customerId !== "string" || customerId.length === 0) {
      billingError(
        "BILLING_CUSTOMER_NOT_FOUND",
        "No Creem billing customer exists for this workspace",
      )
    }

    const operationId = `portal:${String(ctx.workspace.id)}:${Date.now()}`
    const operation = await ctx.runMutation(
      internal.billing.internal.beginCreemProviderOperation,
      {
        idempotencyKey: operationId,
        operation: "portal",
        workspaceId: ctx.workspace.id,
      },
    )
    if (operation.state !== "started") {
      billingError(
        "BILLING_RECONCILIATION_REQUIRED",
        "A previous billing portal request requires reconciliation",
      )
    }
    const startedAt = Date.now()
    try {
      const portal = await createCreemClient(configuration).createBillingPortal(
        {
          customerId,
        },
      )
      await ctx.runMutation(
        internal.billing.internal.recordCreemProviderOperation,
        {
          actorClerkUserId: ctx.identity.subject,
          actorUserId: ctx.viewer.id,
          durationMs: Date.now() - startedAt,
          idempotencyKey: operationId,
          operation: "portal",
          status: "succeeded",
          targetId: customerId,
          workspaceId: ctx.workspace.id,
        },
      )
      return { state: "configured" as const, url: portal.url }
    } catch (error) {
      try {
        if (providerErrorRetryable(error)) {
          await ctx.runMutation(
            internal.billing.internal.markCreemProviderOperationUnresolved,
            {
              errorCode: providerErrorCode(error),
              errorMessage: providerErrorMessage(error),
              idempotencyKey: operationId,
              workspaceId: ctx.workspace.id,
            },
          )
        } else {
          await ctx.runMutation(
            internal.billing.internal.recordCreemProviderOperation,
            {
              actorClerkUserId: ctx.identity.subject,
              actorUserId: ctx.viewer.id,
              durationMs: Date.now() - startedAt,
              errorCode: providerErrorCode(error),
              errorMessage: providerErrorMessage(error),
              idempotencyKey: operationId,
              operation: "portal",
              status: "failed",
              workspaceId: ctx.workspace.id,
            },
          )
        }
      } catch {
        // Preserve the typed provider failure rather than masking it with metrics.
      }
      throwCreemError(error)
    }
  },
})

export const upgradeSubscription = customerAction({
  args: { planId: planIdValidator },
  returns: upgradeResultValidator,
  handler: async (ctx, args) => {
    const planResult = planIdSchema.safeParse(args.planId)
    if (!planResult.success) {
      billingError("INVALID_BILLING_INPUT", "Upgrade plan is invalid")
    }

    const configuration = readCreemUpgradeConfiguration(env, planResult.data)
    if (configuration.state === "provider_unconfigured") {
      return providerUnconfiguredResult(configuration)
    }

    const billingContext = await ctx.runQuery(
      internal.billing.internal.getCustomerBillingActionContext,
      { workspaceId: ctx.workspace.id },
    )
    const subscription = billingContext.subscription
    if (!subscription) {
      billingError(
        "BILLING_SUBSCRIPTION_NOT_FOUND",
        "No Creem subscription exists for this workspace",
      )
    }
    const currentPlan = planIdSchema.safeParse(subscription.planId)
    if (!currentPlan.success) {
      billingError("BILLING_STATE_INVALID", "Current billing plan is invalid")
    }
    if (PLAN_RANK[planResult.data] <= PLAN_RANK[currentPlan.data]) {
      billingError(
        "INVALID_PLAN_CHANGE",
        "Subscription upgrades must move to a higher plan",
      )
    }

    const providerSubscriptionId = subscription.providerSubscriptionId
    if (
      typeof providerSubscriptionId !== "string" ||
      providerSubscriptionId.length === 0
    ) {
      billingError(
        "BILLING_STATE_INVALID",
        "Current Creem subscription identifier is invalid",
      )
    }
    const subscriptionVersion = subscription.lastSyncedAt
    if (
      typeof subscriptionVersion !== "number" ||
      !Number.isSafeInteger(subscriptionVersion) ||
      subscriptionVersion < 0
    ) {
      billingError(
        "BILLING_STATE_INVALID",
        "Current Creem subscription version is invalid",
      )
    }

    const operationId =
      `upgrade:${providerSubscriptionId}:${currentPlan.data}:` +
      `${planResult.data}:${subscriptionVersion}`
    const operation = await ctx.runMutation(
      internal.billing.internal.beginCreemProviderOperation,
      {
        idempotencyKey: operationId,
        operation: "upgrade",
        workspaceId: ctx.workspace.id,
      },
    )
    if (operation.state !== "started") {
      billingError(
        "BILLING_RECONCILIATION_REQUIRED",
        "A previous subscription upgrade requires reconciliation",
      )
    }
    const startedAt = Date.now()
    try {
      const upgraded = await createCreemClient(
        configuration,
      ).upgradeSubscription({
        productId: configuration.plan.productId,
        subscriptionId: providerSubscriptionId,
      })
      const normalized = normalizeCreemSubscription(upgraded)
      const applied = await ctx.runMutation(
        internal.billing.internal.applyUpgradeResponse,
        {
          incompleteReconciliation: {
            actorClerkUserId: ctx.identity.subject,
            actorUserId: ctx.viewer.id,
            attempt: 1,
            delayMs: 0,
            idempotencyKey: operationId,
          },
          providerCreatedAt: normalized.updatedAt,
          rawSubscriptionJson: JSON.stringify(upgraded),
          workspaceId: ctx.workspace.id,
        },
      )
      if (applied.state === "provider_unconfigured") {
        await ctx.runMutation(
          internal.billing.internal.markCreemProviderOperationUnresolved,
          {
            errorCode: "PROVIDER_UNCONFIGURED",
            errorMessage:
              "Creem product configuration changed during upgrade completion",
            idempotencyKey: operationId,
            workspaceId: ctx.workspace.id,
          },
        )
        return {
          missing: [
            "CREEM_PRODUCT_ID_GROWTH",
            "CREEM_PRODUCT_ID_SCALE",
            "CREEM_PRODUCT_ID_STARTER",
          ],
          state: "provider_unconfigured" as const,
        }
      }
      if (applied.kind === "incomplete_period") {
        return {
          kind: "reconciliation_pending",
          planId: planResult.data,
          state: "configured" as const,
        }
      }
      await ctx.runMutation(
        internal.billing.internal.recordCreemProviderOperation,
        {
          actorClerkUserId: ctx.identity.subject,
          actorUserId: ctx.viewer.id,
          durationMs: Date.now() - startedAt,
          idempotencyKey: operationId,
          operation: "upgrade",
          status: "succeeded",
          targetId: providerSubscriptionId,
          workspaceId: ctx.workspace.id,
        },
      )
      return {
        kind: applied.kind ?? "applied",
        planId: planResult.data,
        state: "configured" as const,
      }
    } catch (error) {
      try {
        if (providerErrorRetryable(error)) {
          await ctx.runMutation(
            internal.billing.internal.markCreemProviderOperationUnresolved,
            {
              errorCode: providerErrorCode(error),
              errorMessage: providerErrorMessage(error),
              idempotencyKey: operationId,
              workspaceId: ctx.workspace.id,
            },
          )
        } else {
          await ctx.runMutation(
            internal.billing.internal.recordCreemProviderOperation,
            {
              actorClerkUserId: ctx.identity.subject,
              actorUserId: ctx.viewer.id,
              durationMs: Date.now() - startedAt,
              errorCode: providerErrorCode(error),
              errorMessage: providerErrorMessage(error),
              idempotencyKey: operationId,
              operation: "upgrade",
              status: "failed",
              targetId: providerSubscriptionId,
              workspaceId: ctx.workspace.id,
            },
          )
        }
      } catch {
        // Preserve the typed provider failure rather than masking it with metrics.
      }
      throwCreemError(error)
    }
  },
})
