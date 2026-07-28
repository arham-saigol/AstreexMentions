import { httpRouter } from "convex/server"

import { creemWebhook } from "./billing/creemHttp"
import { resendWebhook } from "./email/resendHttp"

export const CREEM_WEBHOOK_PATH = "/webhooks/creem"
export const RESEND_WEBHOOK_PATH = "/webhooks/resend"

const http = httpRouter()

// The router only delegates the untouched Request. Each provider handler reads
// request.text() exactly once before signature verification and parsing.
http.route({
  handler: creemWebhook,
  method: "POST",
  path: CREEM_WEBHOOK_PATH,
})

http.route({
  handler: resendWebhook,
  method: "POST",
  path: RESEND_WEBHOOK_PATH,
})

export default http
