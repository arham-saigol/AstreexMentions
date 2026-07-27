"use node"

import { v } from "convex/values"

import {
  createResendClient,
  ResendIntegrationError,
} from "../integrations/resend"
import { env, internalAction } from "../server"
import { readResendDeliveryConfiguration } from "./config"
import {
  completeEmailDeliveryReference,
  failEmailDeliveryReference,
  loadLeasedEmailReference,
  releaseEmailBlockedConfigReference,
} from "./internal"

type LeasedEmailContext =
  | { state: "stale_lease" }
  | {
      attempts: number
      idempotencyKey: string
      payload: {
        from: string
        html: string
        replyTo?: string | undefined
        subject: string
        text?: string | undefined
        to: string[]
      }
      state: "ready"
    }

function safeFailure(error: unknown): {
  code: string
  message: string
  retryable: boolean
} {
  if (error instanceof ResendIntegrationError) {
    return {
      code: error.status === 429 ? "HTTP_429" : error.code,
      message: error.message,
      retryable: error.retryable,
    }
  }
  return {
    code: "REQUEST_FAILED",
    message: "Resend request failed",
    retryable: true,
  }
}

export const deliverEmail = internalAction({
  args: {
    leaseToken: v.string(),
    outboxId: v.id("emailOutbox"),
  },
  handler: async (ctx, args) => {
    const leased = (await ctx.runQuery(
      loadLeasedEmailReference,
      args,
    )) as LeasedEmailContext
    if (leased.state === "stale_lease") {
      return leased
    }

    const configuration = readResendDeliveryConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      await ctx.runMutation(releaseEmailBlockedConfigReference, args)
      return {
        missing: configuration.missing,
        state: "blocked_config" as const,
      }
    }

    const startedAt = Date.now()
    try {
      const response = await createResendClient({
        apiKey: configuration.apiKey,
        timeoutMs: configuration.timeoutMs,
      }).sendEmail({
        ...leased.payload,
        idempotencyKey: leased.idempotencyKey,
      })
      return await ctx.runMutation(completeEmailDeliveryReference, {
        ...args,
        durationMs: Math.max(0, Date.now() - startedAt),
        providerMessageId: response.id,
      })
    } catch (error) {
      const failure = safeFailure(error)
      return await ctx.runMutation(failEmailDeliveryReference, {
        ...args,
        durationMs: Math.max(0, Date.now() - startedAt),
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable: failure.retryable,
      })
    }
  },
})
