import { defineApp } from "convex/server"
import { v } from "convex/values"

export default defineApp({
  env: {
    ADMIN_CLERK_USER_ID: v.optional(v.string()),
    CLERK_SECRET_KEY: v.optional(v.string()),
    CLERK_TIMEOUT_MS: v.optional(v.string()),
    DELETION_IDENTITY_FENCE_MS: v.optional(v.string()),
  },
})
