"use client"

import {
  ArrowSquareOutIcon,
  CheckIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"

import { useProductContext } from "@/components/product/product-context"
import { useBillingActions } from "@/components/product/settings/use-billing-actions"
import { subscriptionAllowsNewCheckout } from "@/lib/billing-status"
import type { PlanId } from "@astreex/domain"

const plans = [
  { id: "starter", label: "Starter", price: "$19" },
  { id: "growth", label: "Growth", price: "$99" },
  { id: "scale", label: "Scale", price: "$199" },
] as const satisfies readonly { id: PlanId; label: string; price: string }[]

const planRank: Record<PlanId, number> = {
  starter: 0,
  growth: 1,
  scale: 2,
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp))
}

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function BillingSettings() {
  const { billing } = useProductContext()
  const { error, openPortal, pending, startCheckout, upgrade } =
    useBillingActions()
  const subscription = billing.subscription
  const usage = billing.usage
  const providerReady = billing.providerState === "configured"
  const activePlan = subscription?.planId ?? null
  const entitlementActive = subscription?.entitlementStatus === "active"
  const canStartCheckout = subscriptionAllowsNewCheckout(
    subscription?.status ?? null,
  )

  return (
    <div className="space-y-8">
      {!providerReady && (
        <div
          role="status"
          className="border-border bg-muted/35 flex gap-3 rounded-md border px-4 py-3"
        >
          <WarningCircleIcon
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
          />
          <div>
            <p className="text-foreground text-sm font-medium">
              Creem billing is not configured.
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Checkout, upgrades, and the customer portal remain unavailable. No
              paid access is being inferred.
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="current-plan-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h4
              id="current-plan-heading"
              className="text-foreground text-sm font-semibold"
            >
              Current plan
            </h4>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Provider state, entitlement, and the current billing period.
            </p>
          </div>
          {subscription && (
            <Button
              variant="outline"
              onClick={() => void openPortal()}
              disabled={!providerReady || pending === "portal"}
            >
              {pending === "portal" ? (
                <CircleNotchIcon className="animate-spin" />
              ) : (
                <ArrowSquareOutIcon />
              )}
              Creem portal
            </Button>
          )}
        </div>

        <dl className="border-border mt-5 grid border-y sm:grid-cols-2 sm:divide-x">
          <div className="py-4 sm:pr-5">
            <dt className="text-muted-foreground text-xs">Plan</dt>
            <dd className="text-foreground mt-1 flex items-center gap-2 text-sm font-medium">
              {subscription
                ? (plans.find((plan) => plan.id === subscription.planId)
                    ?.label ?? subscription.planId)
                : "No paid plan"}
              {subscription && (
                <Badge variant={entitlementActive ? "secondary" : "muted"}>
                  {subscription.cancelAtPeriodEnd
                    ? "Cancels at period end"
                    : entitlementActive
                      ? "Active"
                      : statusLabel(subscription.status)}
                </Badge>
              )}
            </dd>
          </div>
          <div className="border-border border-t py-4 sm:border-t-0 sm:pl-5">
            <dt className="text-muted-foreground text-xs">Billing period</dt>
            <dd className="text-foreground mt-1 text-sm font-medium">
              {subscription
                ? `${formatDate(subscription.currentPeriodStart)} – ${formatDate(subscription.currentPeriodEnd)}`
                : "Not available without a subscription"}
            </dd>
          </div>
          <div className="border-border border-t py-4 sm:pr-5">
            <dt className="text-muted-foreground text-xs">Mention allowance</dt>
            <dd className="text-foreground mt-1 text-sm font-medium">
              {usage ? usage.mentionLimit.toLocaleString() : "Not available"}
            </dd>
          </div>
          <div className="border-border border-t py-4 sm:pl-5">
            <dt className="text-muted-foreground text-xs">Keyword limit</dt>
            <dd className="text-foreground mt-1 text-sm font-medium">
              {usage ? usage.keywordLimit.toLocaleString() : "Not available"}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="plans-heading"
        className="border-border border-t pt-6"
      >
        <h4
          id="plans-heading"
          className="text-foreground text-sm font-semibold"
        >
          Plans and upgrades
        </h4>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Every plan includes the complete feature set. Current limits come
          directly from the active usage cycle; upgrade limits are applied by
          Creem after the provider change succeeds.
        </p>

        <div className="border-border mt-5 divide-y rounded-lg border">
          {plans.map((plan) => {
            const current = activePlan === plan.id && entitlementActive
            const canUpgrade =
              activePlan &&
              entitlementActive &&
              !subscription?.cancelAtPeriodEnd &&
              planRank[plan.id] > planRank[activePlan]
            const planPending =
              pending === `checkout:${plan.id}` ||
              pending === `upgrade:${plan.id}`

            return (
              <div
                key={plan.id}
                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                    {plan.label}
                    {current && (
                      <CheckIcon
                        aria-hidden="true"
                        className="text-primary size-4"
                        weight="bold"
                      />
                    )}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {plan.price} per month · all product features included
                  </p>
                </div>

                {current ? (
                  <Badge variant="outline">Current plan</Badge>
                ) : canUpgrade ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void upgrade(plan.id)}
                    disabled={!providerReady || pending !== null}
                  >
                    {planPending && (
                      <CircleNotchIcon className="animate-spin" />
                    )}
                    Upgrade to {plan.label}
                  </Button>
                ) : canStartCheckout ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void startCheckout(plan.id)}
                    disabled={!providerReady || pending !== null}
                  >
                    {planPending && (
                      <CircleNotchIcon className="animate-spin" />
                    )}
                    Choose {plan.label}
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {entitlementActive
                      ? "Manage plan changes in Creem"
                      : "Resume billing in the Creem portal above"}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
