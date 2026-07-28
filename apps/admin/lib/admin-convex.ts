import { ConvexHttpClient } from "convex/browser"
import type { FunctionReference, FunctionReturnType } from "convex/server"

import {
  guardAdmin,
  type AdminAccessFailure,
  type AdminAccessGranted,
} from "@/lib/admin-auth"
import {
  getAdminDataConfigurationIssues,
  readAdminServerEnv,
  type ConfigurationIssue,
} from "@/lib/env"

export type AdminDataResult<T> =
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "access-denied"; access: AdminAccessFailure }>
  | Readonly<{ status: "configuration"; issues: ConfigurationIssue[] }>
  | Readonly<{ status: "unavailable" }>

async function createAdminConvexClient(
  grantedAccess?: AdminAccessGranted,
): Promise<
  | Readonly<{ status: "ready"; client: ConvexHttpClient }>
  | Exclude<AdminDataResult<never>, { status: "ready" }>
> {
  const access = grantedAccess ?? (await guardAdmin())

  if (!access.allowed) {
    return { status: "access-denied", access }
  }

  const env = readAdminServerEnv()
  const issues = getAdminDataConfigurationIssues(env)

  if (issues.length > 0 || !env.convexUrl) {
    return { status: "configuration", issues }
  }

  let token: string | null

  try {
    token = await access.auth.getToken({ template: "convex" })
  } catch {
    token = null
  }

  if (!token) {
    return {
      status: "configuration",
      issues: [
        {
          name: "Clerk Convex JWT template",
          reason:
            "Create the Clerk JWT template named convex for authenticated Convex requests.",
        },
      ],
    }
  }

  const client = new ConvexHttpClient(env.convexUrl)
  client.setAuth(token)

  return { status: "ready", client }
}

export async function runAdminQuery<
  Reference extends FunctionReference<"query", "public">,
>(
  reference: Reference,
  args: Reference["_args"],
): Promise<AdminDataResult<FunctionReturnType<Reference>>> {
  const connection = await createAdminConvexClient()

  if (connection.status !== "ready") {
    return connection
  }

  try {
    const data = await connection.client.query(reference, args)
    return { status: "ready", data }
  } catch {
    return { status: "unavailable" }
  }
}

export async function runAdminMutation<
  Reference extends FunctionReference<"mutation", "public">,
>(
  reference: Reference,
  args: Reference["_args"],
  access: AdminAccessGranted,
): Promise<AdminDataResult<FunctionReturnType<Reference>>> {
  const connection = await createAdminConvexClient(access)

  if (connection.status !== "ready") {
    return connection
  }

  try {
    const data = await connection.client.mutation(reference, args)
    return { status: "ready", data }
  } catch {
    return { status: "unavailable" }
  }
}
