const required = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_ADMIN_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_ISSUER_DOMAIN",
  "ADMIN_CLERK_USER_ID",
  "APP_URL",
  "ADMIN_URL",
  "CREEM_API_KEY",
  "CREEM_MODE",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_CHECKOUT_SUCCESS_URL",
  "CREEM_PRODUCT_ALLOWLIST_JSON",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "RESEND_FROM_EMAIL",
  "FETCHLAYER_API_KEY",
  "XQUIK_API_KEY",
  "DEEPSEEK_API_KEY",
]

const missing = required.filter((name) => !process.env[name]?.trim())

if (missing.length > 0) {
  console.error("Release environment validation failed. Missing variables:")
  for (const name of missing) console.error(`- ${name}`)
  process.exit(1)
}

if (process.env.CREEM_MODE !== "production") {
  console.error("CREEM_MODE must be production for a release deployment.")
  process.exit(1)
}

for (const name of [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_ADMIN_URL",
  "APP_URL",
  "ADMIN_URL",
  "CREEM_CHECKOUT_SUCCESS_URL",
]) {
  const url = new URL(process.env[name])
  if (url.protocol !== "https:") {
    console.error(`${name} must use HTTPS for a release deployment.`)
    process.exit(1)
  }
}

const expectedPlans = {
  starter: { mentionLimit: 2_000, keywordLimit: 3 },
  growth: { mentionLimit: 20_000, keywordLimit: 6 },
  scale: { mentionLimit: 50_000, keywordLimit: 10 },
}

let products
try {
  products = JSON.parse(process.env.CREEM_PRODUCT_ALLOWLIST_JSON)
} catch {
  console.error("CREEM_PRODUCT_ALLOWLIST_JSON must be valid JSON.")
  process.exit(1)
}

const configuredPlans = new Set()
for (const [productId, value] of Object.entries(products)) {
  if (!productId.trim() || !value || typeof value !== "object") {
    console.error(
      "Every Creem product mapping must have a product ID and object value.",
    )
    process.exit(1)
  }
  const expected = expectedPlans[value.planId]
  if (
    !expected ||
    value.mentionLimit !== expected.mentionLimit ||
    value.keywordLimit !== expected.keywordLimit
  ) {
    console.error(
      `Creem product ${productId} does not match an Astreex plan limit.`,
    )
    process.exit(1)
  }
  configuredPlans.add(value.planId)
}

if (configuredPlans.size !== 3) {
  console.error(
    "Creem product mapping must contain Starter, Growth, and Scale exactly once.",
  )
  process.exit(1)
}

console.log("Release environment validation passed.")
