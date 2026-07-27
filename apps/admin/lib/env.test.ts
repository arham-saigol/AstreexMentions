import { afterEach, describe, expect, it } from "vitest"

import {
  getAdminAuthConfigurationIssues,
  getAdminDataConfigurationIssues,
  hasExactAdminClerkUserId,
  readAdminServerEnv,
} from "./env"

const names = [
  "ADMIN_CLERK_USER_ID",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CONVEX_URL",
] as const

const original = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
) as Record<(typeof names)[number], string | undefined>

afterEach(() => {
  for (const name of names) {
    const value = original[name]

    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

describe("admin environment authorization", () => {
  it("treats a missing or blank admin ID as unconfigured", () => {
    delete process.env.ADMIN_CLERK_USER_ID
    expect(readAdminServerEnv().adminClerkUserId).toBeUndefined()

    process.env.ADMIN_CLERK_USER_ID = "   "
    const env = readAdminServerEnv()

    expect(env.adminClerkUserId).toBeUndefined()
    expect(
      getAdminAuthConfigurationIssues(env).map((issue) => issue.name),
    ).toContain("ADMIN_CLERK_USER_ID")
  })

  it("requires an exact Clerk user ID match", () => {
    expect(hasExactAdminClerkUserId("user_123", "user_123")).toBe(true)
    expect(hasExactAdminClerkUserId("user_123", " user_123 ")).toBe(false)
    expect(hasExactAdminClerkUserId("USER_123", "user_123")).toBe(false)
    expect(hasExactAdminClerkUserId("user_123", "")).toBe(false)
    expect(hasExactAdminClerkUserId("user_123", undefined)).toBe(false)
  })

  it("preserves a non-blank configured ID for fail-closed comparison", () => {
    process.env.ADMIN_CLERK_USER_ID = " user_123 "

    expect(readAdminServerEnv().adminClerkUserId).toBe(" user_123 ")
  })

  it("rejects cleartext non-local Convex URLs but permits local development", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.example.com"

    const insecure = readAdminServerEnv()
    expect(insecure.convexUrl).toBeUndefined()
    expect(getAdminDataConfigurationIssues(insecure)).toEqual([
      expect.objectContaining({ name: "NEXT_PUBLIC_CONVEX_URL" }),
    ])

    process.env.NEXT_PUBLIC_CONVEX_URL = "http://127.0.0.1:3210"
    expect(readAdminServerEnv().convexUrl).toBe("http://127.0.0.1:3210")
  })
})
