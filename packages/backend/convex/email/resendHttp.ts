import { internal } from "../_generated/api"
import { createResendWebhookVerifier } from "../integrations/resend"
import { verifyResendEmailWebhook } from "../lib/resendWebhook"
import { env, httpAction } from "../_generated/server"
import { readResendWebhookConfiguration } from "./config"

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Mount this handler from the root Convex HTTP router at the Resend webhook URL. */
export const resendWebhook = httpAction(async (ctx, request) => {
  const configuration = readResendWebhookConfiguration(env)
  if (configuration.state === "provider_unconfigured") {
    return jsonResponse(503, {
      missing: configuration.missing,
      state: "provider_unconfigured",
    })
  }

  const eventId = request.headers.get("svix-id") ?? ""
  const timestamp = request.headers.get("svix-timestamp") ?? ""
  const signature = request.headers.get("svix-signature") ?? ""
  if (!eventId || !timestamp || !signature) {
    return jsonResponse(400, {
      code: "MISSING_SVIX_HEADERS",
      state: "rejected",
    })
  }

  const payload = await request.text()
  let event
  try {
    event = verifyResendEmailWebhook({
      eventId,
      payload,
      signature,
      timestamp,
      verifier: { webhooks: createResendWebhookVerifier() },
      webhookSecret: configuration.webhookSecret,
    })
  } catch {
    return jsonResponse(401, {
      code: "INVALID_SIGNATURE",
      state: "rejected",
    })
  }
  if (event === null) {
    return jsonResponse(202, { state: "ignored" })
  }

  try {
    const result = (await ctx.runMutation(
      internal.email.webhookInternal.ingestResendWebhookEvent,
      {
        ...event,
        receivedAt: Date.now(),
      },
    )) as { state: string }
    return jsonResponse(200, { state: result.state })
  } catch {
    return jsonResponse(500, {
      code: "WEBHOOK_PROCESSING_FAILED",
      state: "retry",
    })
  }
})
