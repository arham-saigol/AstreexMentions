import { internal } from "../_generated/api"
import {
  CreemIntegrationError,
  parseCreemWebhookEvent,
  verifyCreemWebhookSignature,
} from "../integrations/creem"
import { env, httpAction } from "../_generated/server"
import { readCreemWebhookConfiguration } from "./config"

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Mount this handler from the root Convex HTTP router at the Creem webhook URL. */
export const creemWebhook = httpAction(async (ctx, request) => {
  const configuration = readCreemWebhookConfiguration(env)
  if (configuration.state === "provider_unconfigured") {
    return jsonResponse(503, {
      missing: configuration.missing,
      state: "provider_unconfigured",
    })
  }

  const rawBody = await request.text()
  const signature = request.headers.get("creem-signature") ?? ""
  const verified = await verifyCreemWebhookSignature({
    rawBody,
    secret: configuration.webhookSecret,
    signature,
  })
  if (!verified) {
    return jsonResponse(401, {
      code: "INVALID_SIGNATURE",
      state: "rejected",
    })
  }

  try {
    parseCreemWebhookEvent(rawBody)
  } catch (error) {
    const code =
      error instanceof CreemIntegrationError ? error.code : "INVALID_RESPONSE"
    return jsonResponse(400, { code, state: "rejected" })
  }

  try {
    const result = await ctx.runMutation(
      internal.billing.internal.ingestCreemWebhook,
      {
        rawBody,
        receivedAt: Date.now(),
      },
    )
    if (result.kind === "pending" || result.kind === "provider_unconfigured") {
      return jsonResponse(503, {
        ...(result.missing === undefined ? {} : { missing: result.missing }),
        state:
          result.kind === "provider_unconfigured"
            ? "provider_unconfigured"
            : "retry",
      })
    }

    return jsonResponse(200, { state: "accepted" })
  } catch {
    return jsonResponse(500, {
      code: "WEBHOOK_PROCESSING_FAILED",
      state: "retry",
    })
  }
})
