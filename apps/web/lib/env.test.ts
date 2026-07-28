import { afterEach, describe, expect, it, vi } from "vitest"

import { getRuntimeConfiguration, getSiteUrl } from "./env"

const environmentVariables = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const

function clearConfiguration() {
  for (const variable of environmentVariables) {
    vi.stubEnv(variable, "")
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getRuntimeConfiguration", () => {
  it("reports missing Clerk and Convex configuration without fallback values", () => {
    clearConfiguration()

    const configuration = getRuntimeConfiguration()

    expect(configuration.clerk.configured).toBe(false)
    expect(configuration.clerk.publishableKey).toBeNull()
    expect(configuration.clerk.issues).toEqual([
      { variable: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", reason: "missing" },
      { variable: "CLERK_SECRET_KEY", reason: "missing" },
    ])
    expect(configuration.convex.configured).toBe(false)
    expect(configuration.convex.url).toBeNull()
    expect(configuration.convex.issues).toEqual([
      { variable: "NEXT_PUBLIC_CONVEX_URL", reason: "missing" },
    ])
  })

  it("accepts explicitly configured service values", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_configured")
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_configured")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud")

    const configuration = getRuntimeConfiguration()

    expect(configuration.clerk.configured).toBe(true)
    expect(configuration.clerk.publishableKey).toBe("pk_test_configured")
    expect(configuration.convex.configured).toBe(true)
    expect(configuration.convex.url).toBe("https://example.convex.cloud")
  })

  it("rejects malformed keys and insecure non-local service URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "publishable-key")
    vi.stubEnv("CLERK_SECRET_KEY", "secret-key")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://convex.example.com")

    const configuration = getRuntimeConfiguration()

    expect(configuration.clerk.configured).toBe(false)
    expect(
      configuration.clerk.issues.every((issue) => issue.reason === "invalid"),
    ).toBe(true)
    expect(configuration.convex.configured).toBe(false)
    expect(configuration.convex.issues).toEqual([
      { variable: "NEXT_PUBLIC_CONVEX_URL", reason: "invalid" },
    ])
  })
})

describe("getSiteUrl", () => {
  it("uses the production origin when the site URL is missing or unsafe", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "javascript:alert(1)")

    expect(getSiteUrl().toString()).toBe("https://astreex.com/")
  })

  it("uses an explicit HTTP or HTTPS site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.astreex.com")

    expect(getSiteUrl().toString()).toBe("https://preview.astreex.com/")
  })
})
