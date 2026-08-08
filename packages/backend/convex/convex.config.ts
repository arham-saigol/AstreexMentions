import rateLimiter from "@convex-dev/rate-limiter/convex.config"
import { defineApp } from "convex/server"
import { v } from "convex/values"

const app = defineApp({
  env: {
    ADMIN_CLERK_USER_ID: v.optional(v.string()),
    CLERK_SECRET_KEY: v.optional(v.string()),
    CLERK_TIMEOUT_MS: v.optional(v.string()),
    DELETION_IDENTITY_FENCE_MS: v.optional(v.string()),
    TINYFISH_API_KEY: v.optional(v.string()),
    TINYFISH_TIMEOUT_MS: v.optional(v.string()),
  },
})

app.use(rateLimiter)

export default app
