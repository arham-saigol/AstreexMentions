import type { api } from "@astreex/backend/api"
import type { FunctionReturnType } from "convex/server"

export type BillingOverviewResult = FunctionReturnType<
  typeof api.billing.customer.getBillingOverview
>
export type CurrentWorkspaceResult = FunctionReturnType<
  typeof api.workspaces.getCurrentWorkspace
>

export type ProductAccess = {
  billingSetupRequired: boolean
  destination: "/app/mentions" | "/onboarding"
  mode: "active" | "onboarding" | "preview"
  planId: "starter" | "growth" | "scale" | null
}

export function decideProductAccess(
  workspace: CurrentWorkspaceResult,
  billing: BillingOverviewResult,
): ProductAccess {
  const subscription = billing.subscription
  const paidActive = billing.accessKind === "paid" && subscription !== null

  if (paidActive) {
    return {
      billingSetupRequired: false,
      destination: "/app/mentions",
      mode: "active",
      planId: subscription.planId,
    }
  }

  if (billing.evaluation && workspace.onboardingComplete) {
    return {
      billingSetupRequired: false,
      destination: "/app/mentions",
      mode: "active",
      planId: null,
    }
  }

  if (!workspace.onboardingComplete) {
    return {
      billingSetupRequired: billing.providerState === "provider_unconfigured",
      destination: "/onboarding",
      mode: "onboarding",
      planId: subscription?.planId ?? null,
    }
  }

  return {
    billingSetupRequired: billing.providerState === "provider_unconfigured",
    destination: "/app/mentions",
    mode: "preview",
    planId: subscription?.planId ?? null,
  }
}

export function productRedirectForPath(
  pathname: string,
  access: ProductAccess,
): ProductAccess["destination"] | null {
  if (pathname === "/app") {
    return access.destination
  }

  if (pathname === "/onboarding") {
    return access.mode === "active" ? "/app/mentions" : null
  }

  if (
    (pathname === "/app" || pathname.startsWith("/app/")) &&
    access.mode === "onboarding"
  ) {
    return "/onboarding"
  }

  return null
}
