import { auth } from "@clerk/nextjs/server"

import {
  getAdminAuthConfigurationIssues,
  hasExactAdminClerkUserId,
  readAdminServerEnv,
  type ConfigurationIssue,
} from "@/lib/env"

type ClerkAuth = Awaited<ReturnType<typeof auth>>

export type AdminAccessFailure =
  | Readonly<{
      allowed: false
      kind: "configuration"
      issues: ConfigurationIssue[]
    }>
  | Readonly<{
      allowed: false
      kind: "signed-out"
    }>
  | Readonly<{
      allowed: false
      kind: "unauthorized"
    }>

export type AdminAccessGranted = Readonly<{
  allowed: true
  auth: ClerkAuth
  userId: string
}>

export type AdminAccess = AdminAccessFailure | AdminAccessGranted

export class AdminAccessError extends Error {
  readonly access: AdminAccessFailure

  constructor(access: AdminAccessFailure) {
    super("Administrative access denied")
    this.name = "AdminAccessError"
    this.access = access
  }
}

export async function guardAdmin(): Promise<AdminAccess> {
  const env = readAdminServerEnv()
  const issues = getAdminAuthConfigurationIssues(env)

  if (issues.length > 0 || !env.adminClerkUserId) {
    return { allowed: false, kind: "configuration", issues }
  }

  let clerkAuth: ClerkAuth

  try {
    clerkAuth = await auth()
  } catch {
    return {
      allowed: false,
      kind: "configuration",
      issues: [
        {
          name: "CLERK_SECRET_KEY",
          reason: "Clerk could not initialize for this request.",
        },
      ],
    }
  }

  if (!clerkAuth.userId) {
    return { allowed: false, kind: "signed-out" }
  }

  if (!hasExactAdminClerkUserId(clerkAuth.userId, env.adminClerkUserId)) {
    return { allowed: false, kind: "unauthorized" }
  }

  return {
    allowed: true,
    auth: clerkAuth,
    userId: clerkAuth.userId,
  }
}

export async function requireAdminAccess(): Promise<AdminAccessGranted> {
  const access = await guardAdmin()

  if (!access.allowed) {
    throw new AdminAccessError(access)
  }

  return access
}
