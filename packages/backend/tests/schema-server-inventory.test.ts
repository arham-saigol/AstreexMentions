import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import schema from "../convex/schema"

const REQUIRED_TABLES = [
  "users",
  "workspaces",
  "workspaceMembers",
  "subscriptions",
  "billingCheckouts",
  "billingEvents",
  "usageCycles",
  "keywords",
  "trackingSources",
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
const schemaSource = readFileSync(
  fileURLToPath(new URL("../convex/schema.ts", import.meta.url)),
  "utf8",
)
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

  it("matches the Creem-only product and exact persisted contract", () => {
    expect(schemaSource).toContain(
      'export const workspaceKindValidator = v.literal("personal")',
    )
    expect(schemaSource).toContain(
      'export const workspaceRoleValidator = v.literal("owner")',
    )
    expect(schemaSource).toContain(
      "export const subscriptionStatusValidator = v.string()",
    )
    expect(schemaSource).toContain('provider: v.literal("creem")')
    expect(schemaSource).not.toContain("stripe")
    expect(schemaSource).not.toContain('v.literal("grace")')
    expect(schemaSource).not.toContain("trialEndsAt")
    expect(schemaSource).not.toContain('v.literal("incomplete")')
    expect(schemaSource).not.toContain('v.literal("incomplete_expired")')

    for (const field of [
      "warning80SentAt",
      "warning100SentAt",
      "mentionsUsed",
      "mentionLimit",
      "keywordLimit",
      "planSnapshot",
      "periodStartAt",
      "periodEndAt",
    ]) {
      expect(schemaSource).toContain(field)
    }
    for (const prohibitedField of [
      "categorizationsUsed",
      "emailLimit",
      "emailsSent",
      "providerRunLimit",
      "providerRunsUsed",
      "mentionsIngested",
    ]) {
      expect(schemaSource).not.toContain(prohibitedField)
    }

    for (const field of [
      "colorToken",
      "enabled",
      "isSystem",
      "systemKey",
      "deletedAt",
      "icon",
      "position",
      "platforms",
      "sourceType",
      "pauseReason",
      "leaseVersion",
      "checkpointVersion",
      "contentType",
      "providerItemId",
      "fallbackKey",
      "analysisState",
      "firstSeenAt",
      "lastMatchedAt",
      "requestedPublicationAt",
    ]) {
      expect(schemaSource).toContain(field)
    }

    expect(schemaSource).toContain('v.literal("reddit_posts")')
    expect(schemaSource).toContain('v.literal("reddit_comments")')
    expect(schemaSource).toContain('v.literal("creem")')
    expect(schemaSource).toContain('v.literal("new")')
    expect(schemaSource).toContain('v.literal("completed")')
    expect(schemaSource).not.toContain('v.literal("shipped")')
    expect(schemaSource).not.toContain('v.literal("archived")')
    expect(schemaSource).not.toContain("shippedAt")

    const categorizationJobsSource = schemaSource.slice(
      schemaSource.indexOf("  categorizationJobs: defineTable("),
      schemaSource.indexOf("  digestPreferences: defineTable("),
    )
    expect(categorizationJobsSource).toContain('mentionId: v.id("mentions")')
    expect(categorizationJobsSource).not.toContain("mentionIds")
    expect(schemaSource).toContain('accountUserId: v.id("users")')
  })

  it("defines the tenant-filtered full-text search index", () => {
    expect(tableByName.get("mentions")?.searchIndexes).toEqual([
      expect.objectContaining({ indexDescriptor: "search_body" }),
    ])
    expect(tableByName.get("featureRequests")?.searchIndexes).toEqual([
      expect.objectContaining({ indexDescriptor: "search_content" }),
    ])
  })
})

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      return typescriptFiles(path)
    }
    return entry.name.endsWith(".ts") ? [path] : []
  })
}

describe("pre-codegen server boundary", () => {
  const convexDirectory = fileURLToPath(new URL("../convex/", import.meta.url))

  it("uses every official generic constructor without fake generated imports", () => {
    const sources = typescriptFiles(convexDirectory).map((path) => ({
      path,
      source: readFileSync(path, "utf8"),
    }))
    const serverSource = readFileSync(`${convexDirectory}/server.ts`, "utf8")

    for (const constructor of [
      "queryGeneric",
      "mutationGeneric",
      "actionGeneric",
      "internalQueryGeneric",
      "internalMutationGeneric",
      "internalActionGeneric",
      "httpActionGeneric",
    ]) {
      expect(serverSource).toContain(constructor)
    }

    expect(
      sources
        .filter(({ source }) => source.includes("/_generated/"))
        .map(({ path }) => path),
    ).toEqual([])
  })

  it("routes public mutations through authenticated policy builders", () => {
    const usersSource = readFileSync(`${convexDirectory}/users.ts`, "utf8")
    const workspacesSource = readFileSync(
      `${convexDirectory}/workspaces.ts`,
      "utf8",
    )

    expect(usersSource).toContain("authenticatedMutation")
    expect(usersSource).toContain("DEFAULT_CATEGORIES")
    expect(usersSource).toContain("digestPreferences")
    expect(workspacesSource).toContain("authenticatedMutation")
    expect(workspacesSource).toContain("resolveCurrentCustomer")
    expect(workspacesSource).toContain("readDeletionBillingSnapshot")
  })
})
