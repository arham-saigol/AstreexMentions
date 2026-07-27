import { z } from "zod"

import type {
  ChangelogStatus,
  DeletionJobStatus,
  FeatureRequestStatus,
} from "@/lib/convex-references"

const finiteNumber = z.number().finite()
const timestamp = finiteNumber.nonnegative()

const metricsOverviewSchema = z.object({
  stats: z.object({
    activeWorkspaces: finiteNumber.nonnegative(),
    emailsDelivered: finiteNumber.nonnegative(),
    mentions: finiteNumber.nonnegative(),
    workspaces: finiteNumber.nonnegative(),
  }),
  mentionVolume: z.array(
    z.object({
      count: finiteNumber.nonnegative(),
      timestamp,
    }),
  ),
  categoryBreakdown: z.array(
    z.object({
      category: z.string().min(1),
      count: finiteNumber.nonnegative(),
    }),
  ),
  providerHealth: z.array(
    z.object({
      averageLatencyMs: finiteNumber.nonnegative(),
      failureCount: finiteNumber.nonnegative(),
      provider: z.string().min(1),
      requestCount: finiteNumber.nonnegative(),
      successCount: finiteNumber.nonnegative(),
    }),
  ),
})

const featureRequestStatusSchema = z.enum([
  "new",
  "planned",
  "in_progress",
  "completed",
  "declined",
])

const optionalMetadataValue = z.string().trim().min(1).optional()
const featureRequestUserSchema = z
  .object({
    id: optionalMetadataValue,
    userId: optionalMetadataValue,
    clerkUserId: optionalMetadataValue,
    name: optionalMetadataValue,
    email: optionalMetadataValue,
  })
  .nullish()
const featureRequestWorkspaceSchema = z
  .object({
    id: optionalMetadataValue,
    workspaceId: optionalMetadataValue,
    name: optionalMetadataValue,
    slug: optionalMetadataValue,
  })
  .nullish()
const featureRequestSubmissionSchema = z
  .object({
    source: optionalMetadataValue,
  })
  .nullish()

const featureRequestSchema = z
  .object({
    id: z.string().min(1),
    adminNote: z.string().optional(),
    body: z.string(),
    createdAt: timestamp,
    status: featureRequestStatusSchema,
    title: z.string().min(1),
    updatedAt: timestamp,
    user: featureRequestUserSchema,
    submitter: featureRequestUserSchema,
    submittedBy: featureRequestUserSchema,
    userId: optionalMetadataValue,
    clerkUserId: optionalMetadataValue,
    userName: optionalMetadataValue,
    userEmail: optionalMetadataValue,
    submitterUserId: optionalMetadataValue,
    submitterName: optionalMetadataValue,
    submitterEmail: optionalMetadataValue,
    workspace: featureRequestWorkspaceSchema,
    workspaceId: optionalMetadataValue,
    workspaceName: optionalMetadataValue,
    workspaceSlug: optionalMetadataValue,
    submission: featureRequestSubmissionSchema,
    submissionSource: optionalMetadataValue,
    source: optionalMetadataValue,
  })
  .transform((request) => ({
    id: request.id,
    adminNote: request.adminNote,
    body: request.body,
    createdAt: request.createdAt,
    status: request.status,
    title: request.title,
    updatedAt: request.updatedAt,
    user: {
      id:
        request.user?.id ??
        request.user?.userId ??
        request.user?.clerkUserId ??
        request.submitter?.id ??
        request.submitter?.userId ??
        request.submitter?.clerkUserId ??
        request.submittedBy?.id ??
        request.submittedBy?.userId ??
        request.submittedBy?.clerkUserId ??
        request.userId ??
        request.submitterUserId ??
        request.clerkUserId,
      name:
        request.user?.name ??
        request.submitter?.name ??
        request.submittedBy?.name ??
        request.userName ??
        request.submitterName,
      email:
        request.user?.email ??
        request.submitter?.email ??
        request.submittedBy?.email ??
        request.userEmail ??
        request.submitterEmail,
    },
    workspace: {
      id:
        request.workspace?.id ??
        request.workspace?.workspaceId ??
        request.workspaceId,
      name: request.workspace?.name ?? request.workspaceName,
      slug: request.workspace?.slug ?? request.workspaceSlug,
    },
    submission: {
      source:
        request.submission?.source ??
        request.submissionSource ??
        request.source,
    },
  }))
const featureRequestPageSchema = z.object({
  items: z.array(featureRequestSchema),
  nextCursor: z.string().min(1).optional(),
})

const changelogStatusSchema = z.enum(["draft", "published"])

const changelogEntrySchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  label: z.string().optional(),
  publishedAt: timestamp.optional(),
  slug: z.string().min(1),
  status: changelogStatusSchema,
  summary: z.string(),
  title: z.string().min(1),
  updatedAt: timestamp,
})

const deletionJobStatusSchema = z.enum([
  "pending",
  "billing_check",
  "blocked",
  "leased",
  "running",
  "completed",
  "failed",
  "dead",
  "canceled",
])
const deletionJobSchema = z.object({
  attempts: z.number().int().nonnegative(),
  billingGuardStatus: z.string().trim().min(1),
  completedAt: timestamp.optional(),
  createdAt: timestamp,
  dataDeletionVerifiedAt: timestamp.optional(),
  generation: z.number().int().positive().optional(),
  id: z.string().trim().min(1),
  identityDeletionVerifiedAt: timestamp.optional(),
  lastErrorCode: z.string().trim().min(1).max(80).optional(),
  leaseExpiresAt: timestamp.optional(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: timestamp.optional(),
  operationId: z.string().trim().min(1).optional(),
  phase: z.string().trim().min(1).optional(),
  purgeStage: z.string().trim().min(1).optional(),
  quiescedAt: timestamp.optional(),
  scheduledAt: timestamp,
  securityFenceExpiresAt: timestamp.optional(),
  status: deletionJobStatusSchema,
  supersedesJobId: z.string().trim().min(1).optional(),
  updatedAt: timestamp,
  workflowVersion: z.number().int().positive().optional(),
  workspaceId: z.string().trim().min(1),
})
const deletionAuditEventSchema = z.object({
  action: z.string().trim().min(1),
  createdAt: timestamp,
  metadataJson: z.string().optional(),
  outcome: z.enum(["success", "denied", "failure"]),
})
const deletionJobDetailSchema = z.object({
  events: z.array(deletionAuditEventSchema),
  job: deletionJobSchema,
})

export type MetricsOverview = z.infer<typeof metricsOverviewSchema>
export type FeatureRequest = z.infer<typeof featureRequestSchema>
export type FeatureRequestPage = z.infer<typeof featureRequestPageSchema>
export type ChangelogEntry = z.infer<typeof changelogEntrySchema>
export type DeletionJob = z.infer<typeof deletionJobSchema>
export type DeletionJobDetail = z.infer<typeof deletionJobDetailSchema>

export const featureRequestStatuses =
  featureRequestStatusSchema.options satisfies readonly FeatureRequestStatus[]
export const changelogStatuses =
  changelogStatusSchema.options satisfies readonly ChangelogStatus[]
export const deletionJobStatuses =
  deletionJobStatusSchema.options satisfies readonly DeletionJobStatus[]

export function parseMetricsOverview(value: unknown): MetricsOverview | null {
  const parsed = metricsOverviewSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseFeatureRequestPage(
  value: unknown,
): FeatureRequestPage | null {
  const parsed = featureRequestPageSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseChangelogEntries(value: unknown): ChangelogEntry[] | null {
  const parsed = z.array(changelogEntrySchema).safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseDeletionJobs(value: unknown): DeletionJob[] | null {
  const parsed = z.array(deletionJobSchema).safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseDeletionJobDetail(
  value: unknown,
): DeletionJobDetail | null {
  const parsed = deletionJobDetailSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
