"use node"

import { v } from "convex/values"

import { createCreemClient } from "../integrations/creem"
import { env, internalAction } from "../server"
import { readCreemApiConfiguration } from "./config"
import {
  applyIncompleteCreemBillingEventReference,
  loadIncompleteCreemBillingEventReference,
} from "./internal"

export const reconcileIncompleteCreemBillingEvent = internalAction({
  args: { billingEventId: v.id("billingEvents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      loadIncompleteCreemBillingEventReference,
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
      return await ctx.runMutation(applyIncompleteCreemBillingEventReference, {
        ...args,
        authoritativeSubscriptionJson: JSON.stringify(subscription),
        receivedAt: Date.now(),
      })
    } catch {
      return { state: "retry" as const }
    }
  },
})
