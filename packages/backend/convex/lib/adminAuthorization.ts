import { ConvexError } from "convex/values"

export function assertAdminClerkUserId(
  clerkUserId: string,
  configuredAdminClerkUserId: string | undefined,
): void {
  if (
    configuredAdminClerkUserId === undefined ||
    configuredAdminClerkUserId.trim().length === 0
  ) {
    throw new ConvexError({
      code: "ADMIN_NOT_CONFIGURED",
      message: "Administrative access is not configured",
    })
  }

  if (clerkUserId !== configuredAdminClerkUserId) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Administrative access is required",
    })
  }
}
