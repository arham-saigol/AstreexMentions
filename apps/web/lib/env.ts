const DEFAULT_SITE_URL = "https://astreex.com"

export type ConfigurationIssue = {
  variable: string
  reason: "missing" | "invalid"
}

export type ServiceConfiguration = {
  id: "clerk" | "convex"
  label: string
  configured: boolean
  description: string
  issues: ConfigurationIssue[]
}

export type RuntimeConfiguration = {
  clerk: ServiceConfiguration & {
    publishableKey: string | null
  }
  convex: ServiceConfiguration & {
    url: string | null
  }
}

function optionalValue(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function keyIssue(
  variable: string,
  value: string | null,
  expectedPrefix: string,
): ConfigurationIssue | null {
  if (!value) {
    return { variable, reason: "missing" }
  }

  if (!value.startsWith(expectedPrefix)) {
    return { variable, reason: "invalid" }
  }

  return null
}

function urlIssue(
  variable: string,
  value: string | null,
): ConfigurationIssue | null {
  if (!value) {
    return { variable, reason: "missing" }
  }

  try {
    const url = new URL(value)
    const isLocalDevelopment =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")

    if (url.protocol !== "https:" && !isLocalDevelopment) {
      return { variable, reason: "invalid" }
    }
  } catch {
    return { variable, reason: "invalid" }
  }

  return null
}

export function getRuntimeConfiguration(): RuntimeConfiguration {
  const publishableKey = optionalValue(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  )
  const secretKey = optionalValue(process.env.CLERK_SECRET_KEY)
  const convexUrl = optionalValue(process.env.NEXT_PUBLIC_CONVEX_URL)

  const clerkIssues = [
    keyIssue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishableKey, "pk_"),
    keyIssue("CLERK_SECRET_KEY", secretKey, "sk_"),
  ].filter((issue): issue is ConfigurationIssue => issue !== null)

  const convexIssues = [urlIssue("NEXT_PUBLIC_CONVEX_URL", convexUrl)].filter(
    (issue): issue is ConfigurationIssue => issue !== null,
  )

  return {
    clerk: {
      id: "clerk",
      label: "Clerk authentication",
      configured: clerkIssues.length === 0,
      description:
        "Authentication requires valid Clerk publishable and server keys before sign-in can be enabled.",
      issues: clerkIssues,
      publishableKey: clerkIssues.length === 0 ? publishableKey : null,
    },
    convex: {
      id: "convex",
      label: "Convex data service",
      configured: convexIssues.length === 0,
      description:
        "Account data requires a valid Convex deployment URL before live queries can be enabled.",
      issues: convexIssues,
      url: convexIssues.length === 0 ? convexUrl : null,
    },
  }
}

export function getSiteUrl(): URL {
  const configuredUrl = optionalValue(process.env.NEXT_PUBLIC_SITE_URL)

  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url
      }
    } catch {
      // Fall back to the canonical production URL.
    }
  }

  return new URL(DEFAULT_SITE_URL)
}
