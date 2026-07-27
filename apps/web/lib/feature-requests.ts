import { z } from "zod"

export const FEATURE_REQUEST_TITLE_MAX_LENGTH = 120
export const FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH = 2_000

const normalizedTitleSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(3, "Use at least 3 characters for the title.")
      .max(
        FEATURE_REQUEST_TITLE_MAX_LENGTH,
        `Keep the title to ${FEATURE_REQUEST_TITLE_MAX_LENGTH} characters or fewer.`,
      ),
  )

const normalizedDescriptionSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(10, "Describe the idea in at least 10 characters.")
      .max(
        FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH,
        `Keep the description to ${FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
      ),
  )

export const featureRequestInputSchema = z.object({
  description: normalizedDescriptionSchema,
  title: normalizedTitleSchema,
})

const idSchema = z.string().trim().min(1)

const featureRequestIdObjectSchema = z
  .object({
    _id: idSchema.optional(),
    featureRequestId: idSchema.optional(),
    id: idSchema.optional(),
  })
  .passthrough()
  .transform((value, context) => {
    const id = value.featureRequestId ?? value.id ?? value._id

    if (!id) {
      context.addIssue({
        code: "custom",
        message: "Feature request confirmation is missing an id.",
      })
      return z.NEVER
    }

    return { id }
  })

export const featureRequestCreateResultSchema = z.union([
  idSchema.transform((id) => ({ id })),
  featureRequestIdObjectSchema,
])

export type FeatureRequestInput = z.infer<typeof featureRequestInputSchema>
export type FeatureRequestCreateResult = z.infer<
  typeof featureRequestCreateResultSchema
>
