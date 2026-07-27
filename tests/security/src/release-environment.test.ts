import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const scriptPath = fileURLToPath(
  new URL("../../../scripts/verify-release-env.mjs", import.meta.url),
)

const baseEnvironment = {
  ADMIN_CLERK_USER_ID: "user_release",
  ADMIN_URL: "https://admin.example.com",
  APP_URL: "https://app.example.com",
  CLERK_JWT_ISSUER_DOMAIN: "https://clerk.example.com",
  CLERK_SECRET_KEY: "sk_release",
  CREEM_API_KEY: "creem_release",
  CREEM_CHECKOUT_SUCCESS_URL: "https://app.example.com/billing/success",
  CREEM_MODE: "production",
  CREEM_WEBHOOK_SECRET: "creem_webhook_release",
  DEEPSEEK_API_KEY: "deepseek_release",
  DELETION_IDENTITY_FENCE_MS: "60000",
  FETCHLAYER_API_KEY: "fetchlayer_release",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.example.com",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_release",
  NEXT_PUBLIC_CONVEX_URL: "https://release.convex.cloud",
  NEXT_PUBLIC_SITE_URL: "https://example.com",
  RESEND_API_KEY: "resend_release",
  RESEND_FROM_EMAIL: "Astreex <notifications@example.com>",
  RESEND_WEBHOOK_SECRET: "resend_webhook_release",
  XQUIK_API_KEY: "xquik_release",
}

function runReleaseValidation(products: Record<string, unknown>) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...baseEnvironment,
      CREEM_PRODUCT_ALLOWLIST_JSON: JSON.stringify(products),
    },
  })
}

const plans = {
  growth: {
    keywordLimit: 6,
    mentionLimit: 20_000,
    planId: "growth",
  },
  scale: {
    keywordLimit: 10,
    mentionLimit: 50_000,
    planId: "scale",
  },
  starter: {
    keywordLimit: 3,
    mentionLimit: 2_000,
    planId: "starter",
  },
}

describe("release environment validation", () => {
  it("accepts exactly one product mapping for every plan", () => {
    const result = runReleaseValidation({
      prod_growth: plans.growth,
      prod_scale: plans.scale,
      prod_starter: plans.starter,
    })
    expect(result.status).toBe(0)
  })

  it.each([
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "publishable_release", "pk_"],
    ["CLERK_SECRET_KEY", "secret_release", "sk_"],
  ])("rejects an invalid %s format", (name, value, prefix) => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        ...baseEnvironment,
        [name]: value,
        CREEM_PRODUCT_ALLOWLIST_JSON: JSON.stringify({
          prod_growth: plans.growth,
          prod_scale: plans.scale,
          prod_starter: plans.starter,
        }),
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${name} must start with ${prefix}.`)
  })

  it("rejects an extra product mapped to a duplicate plan", () => {
    const result = runReleaseValidation({
      prod_growth: plans.growth,
      prod_growth_duplicate: plans.growth,
      prod_scale: plans.scale,
      prod_starter: plans.starter,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      "Creem product mapping must contain exactly three products.",
    )
  })
})
