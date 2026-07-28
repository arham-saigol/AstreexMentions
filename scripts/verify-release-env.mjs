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
  "CREEM_PRODUCT_ID_STARTER",
  "CREEM_PRODUCT_ID_GROWTH",
  "CREEM_PRODUCT_ID_SCALE",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "RESEND_FROM_EMAIL",
  "FETCHLAYER_API_KEY",
  "XQUIK_API_KEY",
  "DEEPSEEK_API_KEY",
  "DELETION_IDENTITY_FENCE_MS",
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

for (const [name, prefix] of [
  ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_"],
  ["CLERK_SECRET_KEY", "sk_"],
]) {
  if (!process.env[name].startsWith(prefix)) {
    console.error(`${name} must start with ${prefix}.`)
    process.exit(1)
  }
}

const adminClerkUserId = process.env.ADMIN_CLERK_USER_ID
if (
  adminClerkUserId !== adminClerkUserId.trim() ||
  !/^user_[A-Za-z0-9]+$/.test(adminClerkUserId)
) {
  console.error(
    "ADMIN_CLERK_USER_ID must be an exact Clerk user ID without surrounding whitespace.",
  )
  process.exit(1)
}

const deletionIdentityFenceMs = Number(process.env.DELETION_IDENTITY_FENCE_MS)
if (
  !Number.isSafeInteger(deletionIdentityFenceMs) ||
  deletionIdentityFenceMs <= 0
) {
  console.error("DELETION_IDENTITY_FENCE_MS must be a positive integer.")
  process.exit(1)
}

for (const name of [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_ADMIN_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "APP_URL",
  "ADMIN_URL",
  "CREEM_CHECKOUT_SUCCESS_URL",
]) {
  let url
  try {
    url = new URL(process.env[name])
  } catch {
    console.error(`${name} must be a valid HTTPS URL for a release deployment.`)
    process.exit(1)
  }
  if (url.protocol !== "https:") {
    console.error(`${name} must use HTTPS for a release deployment.`)
    process.exit(1)
  }
}

const creemProductIds = [
  process.env.CREEM_PRODUCT_ID_STARTER,
  process.env.CREEM_PRODUCT_ID_GROWTH,
  process.env.CREEM_PRODUCT_ID_SCALE,
]
if (new Set(creemProductIds).size !== creemProductIds.length) {
  console.error(
    "Creem Starter, Growth, and Scale product IDs must be distinct.",
  )
  process.exit(1)
}

console.log("Release environment validation passed.")
