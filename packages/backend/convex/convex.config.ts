import { defineApp } from "convex/server"
import { v } from "convex/values"

export default defineApp({
  env: {
    ADMIN_CLERK_USER_ID: v.string(),
  },
})
