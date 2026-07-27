import type { AuthConfig } from "convex/server"

const clerkJwtIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim()

if (!clerkJwtIssuerDomain) {
  throw new Error("CLERK_JWT_ISSUER_DOMAIN must be configured")
}

export default {
  providers: [
    {
      applicationID: "convex",
      domain: clerkJwtIssuerDomain,
    },
  ],
} satisfies AuthConfig
