import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ConvexError } from "convex/values"
import { describe, expect, it, vi } from "vitest"

import { confirmFullyInactiveEntitlement } from "../convex/lib/billingDeletionGuard"
import { insertCreemBillingEventIdempotently } from "../convex/lib/creemBilling"
import {
  isCreemSubscriptionWebhookEvent,
  normalizeCreemSubscription,
  parseCreemWebhookEvent,
} from "../convex/integrations/creem"
import type { CreemPlanMapping } from "../convex/billing/config"
import {
  completeCheckoutWithoutEntitlement,
  effectiveEntitlementStatus,
  planCreemSubscriptionTransition,
  type BillingUsageCycleState,
  type SubscriptionTransition,
} from "../convex/billing/lifecycle"

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/creem/${name}`, import.meta.url)),
    "utf8",
  )
}

function subscriptionFixture(name: string) {
  const event = parseCreemWebhookEvent(fixture(name))
  if (!isCreemSubscriptionWebhookEvent(event)) {
    throw new TypeError(`${name} is not a subscription fixture`)
  }
  return event
}

function requireApplied(
  transition: SubscriptionTransition,
): Extract<SubscriptionTransition, { kind: "applied" }> {
  if (transition.kind !== "applied") {
    throw new TypeError(
      `Expected applied transition, received ${transition.kind}`,
    )
  }
  return transition
}

const growthPlan: CreemPlanMapping = {
  keywordLimit: 10,
  mentionLimit: 100,
  planId: "growth",
  productId: "prod_growth",
}
const scalePlan: CreemPlanMapping = {
  keywordLimit: 50,
  mentionLimit: 1_000,
  planId: "scale",
  productId: "prod_scale",
}

function initialPaidState() {
  const event = subscriptionFixture("subscription-paid.json")
  return requireApplied(
    planCreemSubscriptionTransition({
      currentUsageCycle: null,
      existingSubscription: null,
      plan: growthPlan,
      providerCreatedAt: event.created_at,
      subscription: normalizeCreemSubscription(event.object),
      subscriptionId: "subscription_row_1",
      workspaceId: "workspace_fixture_1",
    }),
  )
}

describe("Creem subscription lifecycle", () => {
  it.each([
    {
      label: "80 percent",
      mentionsUsed: 80,
      oneHundredWarning: undefined,
      oneHundredWarningExpected: undefined,
      eightyWarning: 1783987200000,
    },
    {
      label: "100 percent",
      mentionsUsed: 100,
      oneHundredWarning: 1784070000000,
      oneHundredWarningExpected: 1784070000000,
      eightyWarning: 1783987200000,
    },
  ])(
    "preserves $label usage and warning state during an upgrade",
    ({
      mentionsUsed,
      oneHundredWarning,
      oneHundredWarningExpected,
      eightyWarning,
    }) => {
      const initial = initialPaidState()
      const upgrade = subscriptionFixture("subscription-upgrade.json")
      const currentUsageCycle: BillingUsageCycleState = {
        ...initial.usageCycle,
        mentionsUsed,
        warning80SentAt: eightyWarning,
        ...(oneHundredWarning === undefined
          ? {}
          : { warning100SentAt: oneHundredWarning }),
      }

      const result = requireApplied(
        planCreemSubscriptionTransition({
          currentUsageCycle,
          existingSubscription: initial.subscription,
          plan: scalePlan,
          providerCreatedAt: upgrade.created_at,
          subscription: normalizeCreemSubscription(upgrade.object),
          subscriptionId: "subscription_row_1",
          workspaceId: "workspace_fixture_1",
        }),
      )

      expect(result.usageKind).toBe("preserved")
      expect(result.subscription.planId).toBe("scale")
      expect(result.usageCycle).toMatchObject({
        keywordLimit: 50,
        mentionLimit: 1_000,
        mentionsUsed,
        planSnapshot: {
          keywordLimit: 50,
          mentionLimit: 1_000,
          planId: "scale",
        },
        warning80SentAt: eightyWarning,
      })
      expect(result.usageCycle.warning100SentAt).toBe(oneHundredWarningExpected)
    },
  )

  it("resets usage only when a paid event opens a new cycle", () => {
    const initial = initialPaidState()
    const upgrade = subscriptionFixture("subscription-upgrade.json")
    const upgraded = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: {
          ...initial.usageCycle,
          mentionsUsed: 100,
          warning80SentAt: 1783987200000,
          warning100SentAt: 1784070000000,
        },
        existingSubscription: initial.subscription,
        plan: scalePlan,
        providerCreatedAt: upgrade.created_at,
        subscription: normalizeCreemSubscription(upgrade.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )
    const renewal = subscriptionFixture("subscription-renewed.json")

    const renewed = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: upgraded.usageCycle,
        existingSubscription: upgraded.subscription,
        plan: scalePlan,
        providerCreatedAt: renewal.created_at,
        subscription: normalizeCreemSubscription(renewal.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )

    expect(renewed.usageKind).toBe("reset")
    expect(renewed.closedUsageCycle).toMatchObject({
      mentionsUsed: 100,
      status: "closed",
    })
    expect(renewed.usageCycle).toMatchObject({
      mentionsUsed: 0,
      periodStartAt: Date.parse("2026-08-01T00:00:00.000Z"),
      status: "open",
    })
    expect(renewed.usageCycle.warning80SentAt).toBeUndefined()
    expect(renewed.usageCycle.warning100SentAt).toBeUndefined()
  })

  it("ignores stale out-of-order events without rolling state backward", () => {
    const initial = initialPaidState()
    const stale = subscriptionFixture("subscription-stale-canceled.json")

    expect(
      planCreemSubscriptionTransition({
        currentUsageCycle: initial.usageCycle,
        existingSubscription: initial.subscription,
        plan: growthPlan,
        providerCreatedAt: stale.created_at,
        subscription: normalizeCreemSubscription(stale.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    ).toEqual({ kind: "stale" })
  })

  it("keeps scheduled cancellation paid through period end", () => {
    const initial = initialPaidState()
    const upgrade = subscriptionFixture("subscription-upgrade.json")
    const upgraded = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: initial.usageCycle,
        existingSubscription: initial.subscription,
        plan: scalePlan,
        providerCreatedAt: upgrade.created_at,
        subscription: normalizeCreemSubscription(upgrade.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )
    const scheduled = subscriptionFixture("subscription-scheduled-cancel.json")
    const result = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: upgraded.usageCycle,
        existingSubscription: upgraded.subscription,
        plan: scalePlan,
        providerCreatedAt: scheduled.created_at,
        subscription: normalizeCreemSubscription(scheduled.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )

    expect(result.subscription).toMatchObject({
      cancelAtPeriodEnd: true,
      entitlementStatus: "active",
      status: "scheduled_cancel",
    })
    expect(
      effectiveEntitlementStatus(
        result.subscription,
        result.subscription.currentPeriodEnd - 1,
      ),
    ).toBe("active")
    expect(
      effectiveEntitlementStatus(
        result.subscription,
        result.subscription.currentPeriodEnd,
      ),
    ).toBe("inactive")
  })

  it("resumes the same paid cycle without resetting usage", () => {
    const initial = initialPaidState()
    const upgrade = subscriptionFixture("subscription-upgrade.json")
    const upgraded = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: {
          ...initial.usageCycle,
          mentionsUsed: 80,
          warning80SentAt: 1783987200000,
        },
        existingSubscription: initial.subscription,
        plan: scalePlan,
        providerCreatedAt: upgrade.created_at,
        subscription: normalizeCreemSubscription(upgrade.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )
    const scheduled = subscriptionFixture("subscription-scheduled-cancel.json")
    const canceledLater = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: upgraded.usageCycle,
        existingSubscription: upgraded.subscription,
        plan: scalePlan,
        providerCreatedAt: scheduled.created_at,
        subscription: normalizeCreemSubscription(scheduled.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )
    const active = subscriptionFixture("subscription-active.json")
    const resumed = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: canceledLater.usageCycle,
        existingSubscription: canceledLater.subscription,
        plan: scalePlan,
        providerCreatedAt: active.created_at,
        subscription: normalizeCreemSubscription(active.object),
        subscriptionId: "subscription_row_1",
        workspaceId: "workspace_fixture_1",
      }),
    )

    expect(resumed.usageKind).toBe("preserved")
    expect(resumed.subscription).toMatchObject({
      cancelAtPeriodEnd: false,
      entitlementStatus: "active",
      status: "active",
    })
    expect(resumed.usageCycle).toMatchObject({
      mentionsUsed: 80,
      warning80SentAt: 1783987200000,
    })
  })

  it("never grants trial entitlement", () => {
    const trial = subscriptionFixture("subscription-trialing.json")
    const result = requireApplied(
      planCreemSubscriptionTransition({
        currentUsageCycle: null,
        existingSubscription: null,
        plan: growthPlan,
        providerCreatedAt: trial.created_at,
        subscription: normalizeCreemSubscription(trial.object),
        subscriptionId: "subscription_trial_row",
        workspaceId: "workspace_fixture_trial",
      }),
    )

    expect(result.subscription.entitlementStatus).toBe("inactive")
    expect(result.subscription.status).toBe("trialing")
  })
})

describe("Creem billing safety boundaries", () => {
  it("deduplicates the fixture event id before insertion", async () => {
    const providerEventId = parseCreemWebhookEvent(
      fixture("subscription-paid.json"),
    ).id
    const insert = vi.fn().mockResolvedValue("billing_event_row")

    await expect(
      insertCreemBillingEventIdempotently(
        {
          findByProviderEventId: vi.fn().mockResolvedValue("billing_event_row"),
          insert,
        },
        providerEventId,
      ),
    ).resolves.toEqual({
      eventId: "billing_event_row",
      kind: "duplicate",
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it("treats checkout completion as bookkeeping, never entitlement", () => {
    const checkout = parseCreemWebhookEvent(fixture("checkout-completed.json"))
    const transition = completeCheckoutWithoutEntitlement(checkout.created_at)

    expect(transition).toEqual({
      completedAt: checkout.created_at,
      status: "complete",
      updatedAt: checkout.created_at,
    })
    expect(transition).not.toHaveProperty("entitlementStatus")
    expect(transition).not.toHaveProperty("subscription")
  })

  it("blocks account deletion while active or paid-through-period", () => {
    const active = initialPaidState().subscription
    expect(() =>
      confirmFullyInactiveEntitlement([
        { entitlementStatus: active.entitlementStatus },
      ]),
    ).toThrow(ConvexError)

    try {
      confirmFullyInactiveEntitlement([{ entitlementStatus: "active" }])
    } catch (error) {
      expect(error).toMatchObject({
        data: { code: "BILLING_ENTITLEMENT_ACTIVE" },
      })
    }
  })
})
