import { z } from "zod"

export const FEATURE_REQUEST_TITLE_MAX_LENGTH = 120
export const FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH = 4_000
export const CHANGELOG_TITLE_MAX_LENGTH = 120
export const CHANGELOG_SUMMARY_MAX_LENGTH = 280
export const CHANGELOG_BODY_MAX_LENGTH = 50_000

export const featureRequestTitleSchema = z
  .string()
  .trim()
  .min(3)
  .max(FEATURE_REQUEST_TITLE_MAX_LENGTH)

export const featureRequestDescriptionSchema = z
  .string()
  .trim()
  .min(10)
  .max(FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH)

export const featureRequestSubmissionSchema = z.strictObject({
  title: featureRequestTitleSchema,
  description: featureRequestDescriptionSchema,
})
export type FeatureRequestSubmission = z.infer<
  typeof featureRequestSubmissionSchema
>

export const FEATURE_REQUEST_STATUSES = [
  "open",
  "planned",
  "in_progress",
  "completed",
  "declined",
] as const
export const featureRequestStatusSchema = z.enum(FEATURE_REQUEST_STATUSES)
export type FeatureRequestStatus = z.infer<typeof featureRequestStatusSchema>

export const CHANGELOG_KINDS = ["new", "improvement", "fix"] as const
export const changelogKindSchema = z.enum(CHANGELOG_KINDS)
export type ChangelogKind = z.infer<typeof changelogKindSchema>

export const changelogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const changelogTitleSchema = z
  .string()
  .trim()
  .min(3)
  .max(CHANGELOG_TITLE_MAX_LENGTH)

export const changelogSummarySchema = z
  .string()
  .trim()
  .min(10)
  .max(CHANGELOG_SUMMARY_MAX_LENGTH)

export const changelogBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(CHANGELOG_BODY_MAX_LENGTH)

const safeEpochMillisecondsSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const changelogEntrySchema = z.strictObject({
  slug: changelogSlugSchema,
  title: changelogTitleSchema,
  summary: changelogSummarySchema,
  body: changelogBodySchema,
  kind: changelogKindSchema,
  publishedAt: safeEpochMillisecondsSchema,
})
export type ChangelogEntry = z.infer<typeof changelogEntrySchema>

export function validateFeatureRequestSubmission(
  input: unknown,
): FeatureRequestSubmission {
  return featureRequestSubmissionSchema.parse(input)
}

export function validateChangelogEntry(input: unknown): ChangelogEntry {
  return changelogEntrySchema.parse(input)
}
