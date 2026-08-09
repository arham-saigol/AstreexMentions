import { describe, expect, it } from "vitest"

import crons from "../convex/crons"
import schema from "../convex/schema"

const REQUIRED_TABLES = [
  "users",
  "workspaces",
  "workspaceMembers",
  "subscriptions",
  "billingCheckouts",
  "billingEvents",
  "usageCycles",
  "freeEvaluationGrants",
  "onboardingResearch",
  "keywords",
  "trackingSources",
  "trackingProviderPages",
  "mentions",
  "mentionKeywordMatches",
  "categories",
  "savedViews",
  "categorizationJobs",
  "digestPreferences",
  "digestRuns",
  "emailOutbox",
  "emailWebhookEvents",
  "featureRequests",
  "changelogEntries",
  "providerRuns",
  "providerMetricBuckets",
  "systemMetricBuckets",
  "deletionJobs",
  "auditEvents",
] as const

type ExportedTable = {
  indexes: Array<{ fields: string[]; indexDescriptor: string }>
  searchIndexes: Array<{ indexDescriptor: string }>
  tableName: string
}

type ExportedSchema = {
  schemaValidation: boolean
  tables: ExportedTable[]
}

const exportedSchema = JSON.parse(schema.export()) as ExportedSchema
const tableByName = new Map(
  exportedSchema.tables.map((table) => [table.tableName, table]),
)

function expectIndex(
  tableName: string,
  indexDescriptor: string,
  fields: string[],
): void {
  const table = tableByName.get(tableName)
  expect(table, `missing table ${tableName}`).toBeDefined()
  expect(
    table?.indexes.find((index) => index.indexDescriptor === indexDescriptor),
  ).toEqual({ fields, indexDescriptor })
}

describe("complete Convex schema", () => {
  it("exports every approved Astreex table with validation enabled", () => {
    expect(exportedSchema.schemaValidation).toBe(true)
    expect(
      exportedSchema.tables.map(({ tableName }) => tableName).sort(),
    ).toEqual([...REQUIRED_TABLES].sort())
  })

  it("keeps authorization, dedupe, due-work, billing, and rollup indexes", () => {
    expectIndex("users", "by_token_identifier", ["tokenIdentifier"])
    expectIndex("workspaceMembers", "by_workspace_and_user", [
      "workspaceId",
      "userId",
    ])
    expectIndex("subscriptions", "by_workspace_and_entitlement", [
      "workspaceId",
      "entitlementStatus",
    ])
    expectIndex(
      "subscriptions",
      "by_entitlement_reconciled_at_and_period_end",
      ["entitlementStatus", "monitoringAccessReconciledAt", "currentPeriodEnd"],
    )
    expectIndex("billingEvents", "by_provider_event", [
      "provider",
      "providerEventId",
    ])
    expectIndex("billingEvents", "by_status_and_next_attempt_at", [
      "status",
      "nextAttemptAt",
    ])
    expectIndex("trackingSources", "by_status_and_next_run_at", [
      "status",
      "nextRunAt",
    ])
    expectIndex("trackingSources", "by_status_and_lease_expires_at", [
      "status",
      "leaseExpiresAt",
    ])
    expectIndex("trackingSources", "by_source_type_status_and_next_run_at", [
      "sourceType",
      "status",
      "nextRunAt",
    ])
    expectIndex("trackingProviderPages", "by_source_ready_and_batch", [
      "trackingSourceId",
      "ready",
      "batchIndex",
    ])
    expectIndex("keywords", "by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    expectIndex("mentions", "by_workspace_platform_content_provider_item", [
      "workspaceId",
      "platform",
      "contentType",
      "providerItemId",
    ])
    expectIndex("mentions", "by_workspace_platform_content_fallback", [
      "workspaceId",
      "platform",
      "contentType",
      "fallbackKey",
    ])
    expectIndex("mentions", "by_workspace_status_and_published_at", [
      "workspaceId",
      "status",
      "publishedAt",
    ])
    expectIndex("mentions", "by_workspace_engagement_and_published_at", [
      "workspaceId",
      "engagementScore",
      "publishedAt",
    ])
    expectIndex("mentions", "by_workspace_status_and_engagement", [
      "workspaceId",
      "status",
      "engagementScore",
    ])
    expectIndex("mentionKeywordMatches", "by_mention_and_keyword", [
      "mentionId",
      "keywordId",
    ])
    expectIndex("categories", "by_workspace_and_system_key", [
      "workspaceId",
      "systemKey",
    ])
    expectIndex("keywords", "by_workspace_phrase_and_deleted_at", [
      "workspaceId",
      "normalizedPhrase",
      "deletedAt",
    ])
    expectIndex("categories", "by_workspace_normalized_name_and_deleted_at", [
      "workspaceId",
      "normalizedName",
      "deletedAt",
    ])
    expectIndex(
      "categories",
      "by_workspace_deleted_at_and_deletion_pending_at_and_sort_order",
      ["workspaceId", "deletedAt", "deletionPendingAt", "sortOrder"],
    )
    expectIndex("categories", "by_workspace_deleted_enabled_and_sort_order", [
      "workspaceId",
      "deletedAt",
      "enabled",
      "sortOrder",
    ])
    expectIndex("savedViews", "by_workspace_user_deleted_and_position", [
      "workspaceId",
      "userId",
      "deletedAt",
      "position",
    ])
    expectIndex("savedViews", "by_workspace_deleted_and_updated_at", [
      "workspaceId",
      "deletedAt",
      "updatedAt",
    ])
    expectIndex("categorizationJobs", "by_mention", ["mentionId"])
    expectIndex("categorizationJobs", "by_idempotency_key", ["idempotencyKey"])
    expectIndex("digestPreferences", "by_enabled_and_next_run_at", [
      "enabled",
      "nextRunAt",
    ])
    expectIndex("digestRuns", "by_idempotency_key", ["idempotencyKey"])
    expectIndex("emailOutbox", "by_status_and_next_attempt_at", [
      "status",
      "nextAttemptAt",
    ])
    expectIndex("emailOutbox", "by_workspace_status_and_lease_expires_at", [
      "workspaceId",
      "status",
      "leaseExpiresAt",
    ])
    expectIndex("emailWebhookEvents", "by_provider_event", [
      "provider",
      "eventId",
    ])
    expectIndex("changelogEntries", "by_status_and_requested_publication_at", [
      "status",
      "requestedPublicationAt",
    ])
    expectIndex("changelogEntries", "by_updated_at", ["updatedAt"])
    expectIndex(
      "providerMetricBuckets",
      "by_provider_operation_granularity_and_bucket",
      ["provider", "operation", "granularity", "bucketStartAt"],
    )
    expectIndex("billingEvents", "by_workspace_status_and_received_at", [
      "workspaceId",
      "status",
      "receivedAt",
    ])
    expectIndex("billingCheckouts", "by_workspace_status_and_expires_at", [
      "workspaceId",
      "status",
      "expiresAt",
    ])
    expectIndex(
      "billingCheckouts",
      "by_workspace_status_plan_and_completed_at",
      ["workspaceId", "status", "planId", "completedAt"],
    )
    expectIndex("subscriptions", "by_workspace_and_last_synced_at", [
      "workspaceId",
      "lastSyncedAt",
    ])
    expectIndex("subscriptions", "by_workspace_plan_and_last_synced_at", [
      "workspaceId",
      "planId",
      "lastSyncedAt",
    ])
    expectIndex("featureRequests", "by_workspace_creator_and_created_at", [
      "workspaceId",
      "createdByUserId",
      "createdAt",
    ])
    expectIndex(
      "providerRuns",
      "by_workspace_provider_operation_status_and_started_at",
      ["workspaceId", "provider", "operation", "status", "startedAt"],
    )
    expectIndex(
      "systemMetricBuckets",
      "by_metric_scope_workspace_granularity_and_bucket",
      ["metric", "scope", "workspaceId", "granularity", "bucketStartAt"],
    )
    expectIndex("deletionJobs", "by_billing_guard_status_and_created_at", [
      "billingGuardStatus",
      "createdAt",
    ])
    expectIndex("deletionJobs", "by_account_user_and_created_at", [
      "accountUserId",
      "createdAt",
    ])
    expectIndex("deletionJobs", "by_account_user_kind_and_created_at", [
      "accountUserId",
      "kind",
      "createdAt",
    ])
    expectIndex("deletionJobs", "by_workspace_and_created_at", [
      "workspaceId",
      "createdAt",
    ])
    expectIndex("auditEvents", "by_created_at", ["createdAt"])
  })

  it("defines the tenant-filtered full-text search index", () => {
    expect(tableByName.get("mentions")?.searchIndexes).toEqual([
      expect.objectContaining({ indexDescriptor: "search_body" }),
    ])
    expect(tableByName.get("featureRequests")?.searchIndexes).toEqual([
      expect.objectContaining({ indexDescriptor: "search_content" }),
    ])
  })

  it("registers every durable dispatcher at a one-minute interval", () => {
    expect(JSON.parse(crons.export())).toEqual({
      "dispatch daily digest schedules": expect.objectContaining({
        name: "digest/internal:dispatchDueDailyDigests",
        schedule: { minutes: 1, type: "interval" },
      }),
      "dispatch durable account deletions": expect.objectContaining({
        name: "deletion/internal:dispatchDueAccountDeletions",
        schedule: { minutes: 1, type: "interval" },
      }),
      "dispatch durable email outbox": expect.objectContaining({
        name: "email/internal:dispatchPendingEmails",
        schedule: { minutes: 1, type: "interval" },
      }),
      "dispatch mention categorization jobs": expect.objectContaining({
        name: "categorization/internal:dispatchDueCategorizationJobs",
        schedule: { minutes: 1, type: "interval" },
      }),
      "dispatch persisted tracking schedules": expect.objectContaining({
        name: "scheduling/internal:dispatchDueTrackingSources",
        schedule: { minutes: 1, type: "interval" },
      }),
      "purge expired free evaluation mentions": expect.objectContaining({
        name: "retention:purgeExpiredFreeMentions",
        schedule: { hours: 1, type: "interval" },
      }),
      "reconcile expired monitoring access": expect.objectContaining({
        name: "billing/accessReconciliation:reconcileExpiredMonitoringAccess",
        schedule: { minutes: 5, type: "interval" },
      }),
      "retry persisted Creem billing events": expect.objectContaining({
        name: "billing/internal:dispatchPendingCreemBillingEvents",
        schedule: { minutes: 1, type: "interval" },
      }),
    })
  })
})
