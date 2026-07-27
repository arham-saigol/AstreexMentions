export type AdminServerEnv = Readonly<{
  adminClerkUserId: string | undefined
  clerkPublishableKey: string | undefined
  clerkSecretKey: string | undefined
  convexUrl: string | undefined
}>

export type AdminPublicEnv = Readonly<{
  clerkPublishableKey: string | undefined
  convexUrl: string | undefined
}>

export type ConfigurationIssue = Readonly<{
  name: keyof NodeJS.ProcessEnv | "Clerk Convex JWT template"
  reason: string
}>

function nonBlank(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function validUrl(value: string | undefined): string | undefined {
  const candidate = nonBlank(value)

  if (!candidate) {
    return undefined
  }

  try {
    const url = new URL(candidate)
    return url.protocol === "https:" || url.protocol === "http:"
      ? candidate
      : undefined
  } catch {
    return undefined
  }
}

export function hasExactAdminClerkUserId(
  actualUserId: string | null | undefined,
  configuredUserId: string | undefined,
): configuredUserId is string {
  return (
    configuredUserId !== undefined &&
    configuredUserId.trim().length > 0 &&
    actualUserId === configuredUserId
  )
}

export function readAdminServerEnv(): AdminServerEnv {
  const configuredAdminClerkUserId = process.env.ADMIN_CLERK_USER_ID

  return {
    // Preserve the configured value so authorization is an exact comparison.
    adminClerkUserId:
      configuredAdminClerkUserId === undefined ||
      configuredAdminClerkUserId.trim().length === 0
        ? undefined
        : configuredAdminClerkUserId,
    clerkPublishableKey: nonBlank(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    ),
    clerkSecretKey: nonBlank(process.env.CLERK_SECRET_KEY),
    convexUrl: validUrl(process.env.NEXT_PUBLIC_CONVEX_URL),
  }
}

export function readAdminPublicEnv(): AdminPublicEnv {
  const env = readAdminServerEnv()

  return {
    clerkPublishableKey: env.clerkPublishableKey,
    convexUrl: env.convexUrl,
  }
}

export function getAdminAuthConfigurationIssues(
  env: AdminServerEnv = readAdminServerEnv(),
): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = []

  if (!env.adminClerkUserId) {
    issues.push({
      name: "ADMIN_CLERK_USER_ID",
      reason: "Set the one Clerk user ID allowed to access this application.",
    })
  }

  if (!env.clerkPublishableKey) {
    issues.push({
      name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      reason: "Set a non-blank Clerk publishable key.",
    })
  }

  if (!env.clerkSecretKey) {
    issues.push({
      name: "CLERK_SECRET_KEY",
      reason: "Set a non-blank Clerk secret key.",
    })
  }

  return issues
}

export function getAdminDataConfigurationIssues(
  env: AdminServerEnv = readAdminServerEnv(),
): ConfigurationIssue[] {
  if (env.convexUrl) {
    return []
  }

  return [
    {
      name: "NEXT_PUBLIC_CONVEX_URL",
      reason: "Set a valid HTTP(S) Convex deployment URL.",
    },
  ]
}
