import { describe, expect, it } from "vitest"

import type {
  BillingOverviewResult,
  CurrentWorkspaceResult,
} from "./product-access"
import { decideProductAccess, productRedirectForPath } from "./product-access"

const workspace: CurrentWorkspaceResult = {
  keywordCount: 0,
  membership: { role: "owner" },
  onboardingComplete: false,
  user: {
    clerkUserId: "clerk_1",
    id: "user_1" as CurrentWorkspaceResult["user"]["id"],
  },
  workspace: {
    id: "workspace_1" as CurrentWorkspaceResult["workspace"]["id"],
    kind: "personal",
    name: "My Workspace",
  },
}

const billing: BillingOverviewResult = {
  providerState: "configured",
  subscription: null,
  usage: null,
}

describe("decideProductAccess", () => {
  it("routes incomplete unpaid workspaces to onboarding", () => {
    expect(decideProductAccess(workspace, billing)).toEqual({
      billingSetupRequired: false,
      destination: "/onboarding",
      mode: "onboarding",
      planId: null,
    })
  })

  it("routes completed unpaid workspaces to the honest mentions preview", () => {
    expect(
      decideProductAccess({ ...workspace, onboardingComplete: true }, billing),
    ).toMatchObject({
      destination: "/app/mentions",
      mode: "preview",
    })
  })

  it("routes active subscriptions to mentions", () => {
    const access = decideProductAccess(workspace, {
      ...billing,
      subscription: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: 2,
        currentPeriodStart: 1,
        entitlementStatus: "active",
        planId: "starter",
        status: "active",
      },
    })

    expect(access).toEqual({
      billingSetupRequired: false,
      destination: "/app/mentions",
      mode: "active",
      planId: "starter",
    })
  })

  it("surfaces unavailable billing without fabricating a subscription", () => {
    expect(
      decideProductAccess(
        { ...workspace, onboardingComplete: true },
        {
          ...billing,
          missing: ["CREEM_API_KEY"],
          providerState: "provider_unconfigured",
        },
      ),
    ).toMatchObject({
      billingSetupRequired: true,
      mode: "preview",
      planId: null,
    })
  })
})

describe("productRedirectForPath", () => {
  it("redirects every customer app route during incomplete onboarding", () => {
    const access = decideProductAccess(workspace, billing)

    expect(productRedirectForPath("/app", access)).toBe("/onboarding")
    expect(productRedirectForPath("/app/mentions", access)).toBe("/onboarding")
    expect(productRedirectForPath("/app/keywords", access)).toBe("/onboarding")
  })

  it("keeps configured unpaid workspaces in onboarding until billing is active", () => {
    const preview = decideProductAccess(
      { ...workspace, onboardingComplete: true },
      billing,
    )
    const active = decideProductAccess(workspace, {
      ...billing,
      subscription: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: 2,
        currentPeriodStart: 1,
        entitlementStatus: "active",
        planId: "starter",
        status: "active",
      },
    })

    expect(productRedirectForPath("/onboarding", preview)).toBeNull()
    expect(productRedirectForPath("/onboarding", active)).toBe("/app/mentions")
  })
})
