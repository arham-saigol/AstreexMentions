import { z } from "zod"

const idSchema = z.string().trim().min(1)

const accountDeletionAcceptedSchema = z.object({
  code: z.enum(["ACCOUNT_DELETION_ACCEPTED", "ACCOUNT_DELETION_IN_PROGRESS"]),
  deletionJobId: idSchema,
  message: z.string().trim().min(1),
  state: z.enum(["accepted", "in_progress"]),
  status: z.string().trim().min(1).optional(),
})
const accountDeletionPortalRequiredSchema = z.object({
  code: z.literal("BILLING_PORTAL_REQUIRED"),
  deletionJobId: idSchema.optional(),
  message: z.string().trim().min(1),
  state: z.literal("portal_required"),
})
const accountDeletionSupportRequiredSchema = z.object({
  code: z.string().trim().min(1),
  deletionJobId: idSchema.optional(),
  message: z.string().trim().min(1),
  state: z.literal("support_required"),
})

/** Validates the separate HTTP account-deletion action response. */
export const accountDeletionResponseSchema = z.union([
  accountDeletionAcceptedSchema.extend({ deleted: z.literal(false) }),
  accountDeletionPortalRequiredSchema.extend({ deleted: z.literal(false) }),
  accountDeletionSupportRequiredSchema.extend({ deleted: z.literal(false) }),
  z.object({
    code: z.string().trim().min(1),
    deleted: z.literal(false),
    message: z.string().trim().min(1),
  }),
])
