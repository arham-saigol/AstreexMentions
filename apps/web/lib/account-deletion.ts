import { api } from "@astreex/backend/api"
import "server-only"

import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { z } from "zod"

import { getRuntimeConfiguration } from "@/lib/env"

const deletionMutationResultSchema = z.discriminatedUnion("state", [
  z.object({
    code: z.literal("ACCOUNT_DELETION_ACCEPTED"),
    deletionJobId: z.string().trim().min(1),
    message: z.string().trim().min(1),
    state: z.literal("accepted"),
  }),
  z.object({
    code: z.literal("ACCOUNT_DELETION_IN_PROGRESS"),
    deletionJobId: z.string().trim().min(1),
    message: z.string().trim().min(1),
    state: z.literal("in_progress"),
    status: z.string().trim().min(1),
  }),
  z.object({
    code: z.literal("BILLING_PORTAL_REQUIRED"),
    deletionJobId: z.string().trim().min(1),
    message: z.string().trim().min(1),
    state: z.literal("portal_required"),
  }),
  z.object({
    code: z.string().trim().min(1),
    deletionJobId: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1),
    state: z.literal("support_required"),
  }),
])

export type AccountDeletionResult =
  | {
      code: "ACCOUNT_DELETION_ACCEPTED" | "ACCOUNT_DELETION_IN_PROGRESS"
      deleted: false
      deletionJobId: string
      message: string
      state: "accepted" | "in_progress"
      status: 202
    }
  | {
      code: string
      deleted: false
      deletionJobId?: string
      message: string
      state?: "portal_required" | "support_required"
      status: 400 | 401 | 409 | 500 | 503
    }

export async function deleteCurrentAccount(
  confirmation: "DELETE",
): Promise<AccountDeletionResult> {
  const configuration = getRuntimeConfiguration()
  if (
    !configuration.clerk.configured ||
    !configuration.convex.configured ||
    !configuration.convex.url
  ) {
    return {
      code: "CONFIGURATION_REQUIRED",
      deleted: false,
      message:
        "Clerk and Convex must be configured before account deletion can be requested.",
      status: 503,
    }
  }

  let session: Awaited<ReturnType<typeof auth>>
  try {
    session = await auth()
  } catch {
    return {
      code: "AUTHENTICATION_UNAVAILABLE",
      deleted: false,
      message: "The configured Clerk session could not be verified.",
      status: 503,
    }
  }

  if (!session.userId) {
    return {
      code: "AUTHENTICATION_REQUIRED",
      deleted: false,
      message: "Sign in before deleting this account.",
      status: 401,
    }
  }

  let token: string | null
  try {
    token = await session.getToken({ template: "convex" })
  } catch {
    token = null
  }
  if (!token) {
    return {
      code: "CONVEX_AUTH_REQUIRED",
      deleted: false,
      message: "The Clerk Convex JWT integration is unavailable.",
      status: 503,
    }
  }

  const convex = new ConvexHttpClient(configuration.convex.url, {
    logger: false,
  })
  convex.setAuth(token)

  let deletionValue: unknown
  try {
    deletionValue = await convex.mutation(api.workspaces.deleteAccount, {
      confirmation,
    })
  } catch {
    return {
      code: "ACCOUNT_DELETE_REJECTED",
      deleted: false,
      message:
        "Convex did not authorize account deletion. No deletion was assumed.",
      status: 409,
    }
  }

  const parsed = deletionMutationResultSchema.safeParse(deletionValue)
  if (!parsed.success) {
    return {
      code: "ACCOUNT_DELETE_RESULT_INVALID",
      deleted: false,
      message: "Convex returned an unexpected account deletion result.",
      status: 500,
    }
  }

  switch (parsed.data.state) {
    case "accepted":
    case "in_progress":
      return {
        code: parsed.data.code,
        deleted: false,
        deletionJobId: parsed.data.deletionJobId,
        message: parsed.data.message,
        state: parsed.data.state,
        status: 202,
      }
    case "portal_required":
      return {
        code: parsed.data.code,
        deleted: false,
        deletionJobId: parsed.data.deletionJobId,
        message: parsed.data.message,
        state: parsed.data.state,
        status: 409,
      }
    case "support_required":
      return {
        code: parsed.data.code,
        deleted: false,
        message: parsed.data.message,
        state: parsed.data.state,
        status: 503,
        ...(parsed.data.deletionJobId === undefined
          ? {}
          : { deletionJobId: parsed.data.deletionJobId }),
      }
  }
}
