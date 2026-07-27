import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export const workspaceKindValidator = v.literal("personal")
export const workspaceRoleValidator = v.literal("owner")

export const planIdValidator = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("scale"),
)

/** Customer-facing platform selections and mention platforms. */
export const platformValidator = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("hacker_news"),
)

/** Scheduler/provider work is split more finely than customer-facing platforms. */
export const trackingSourceTypeValidator = v.union(
  v.literal("x"),
  v.literal("reddit_posts"),
  v.literal("reddit_comments"),
  v.literal("hacker_news"),
)

export const trackingPauseReasonValidator = v.union(
  v.literal("paid"),
  v.literal("user"),
  v.literal("usage"),
  v.literal("config"),
)

export const mentionStatusValidator = v.union(
  v.literal("new"),
  v.literal("saved"),
  v.literal("dismissed"),
)
export const mentionSortValidator = v.union(
  v.literal("newest"),
  v.literal("oldest"),
  v.literal("most_engaged"),
)
export const mentionAnalysisStateValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("completed"),
  v.literal("failed"),
)

/**
 * Creem may add subscription states. Keep the original non-empty provider value
 * rather than rejecting a webhook solely because its state is newer than us.
 */
export const subscriptionStatusValidator = v.string()
export const entitlementStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
)
export const checkoutStatusValidator = v.union(
  v.literal("open"),
  v.literal("complete"),
  v.literal("expired"),
)
export const billingEventStatusValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("processed"),
  v.literal("dead"),
)
export const usageCycleStatusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
)
export const usagePlanSnapshotValidator = v.object({
  keywordLimit: v.number(),
  mentionLimit: v.number(),
  planId: planIdValidator,
})

export const keywordStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("deleted"),
)
export const trackingSourceStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("error"),
  v.literal("deleted"),
)
export const keywordMatchKindValidator = v.union(
  v.literal("exact"),
  v.literal("phrase"),
  v.literal("provider"),
)
export const jobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("completed"),
  v.literal("dead"),
)

export const categorySystemKeyValidator = v.union(
  v.literal("question"),
  v.literal("complaint"),
  v.literal("praise"),
  v.literal("bug"),
  v.literal("feature_request"),
  v.literal("competitor_mention"),
  v.literal("other"),
)
export const categoryColorTokenValidator = v.union(
  v.literal("blue"),
  v.literal("orange"),
  v.literal("green"),
  v.literal("red"),
  v.literal("purple"),
  v.literal("yellow"),
  v.literal("gray"),
  v.literal("pink"),
  v.literal("cyan"),
  v.literal("slate"),
)

export const digestRunStatusValidator = v.union(
  v.literal("processing"),
  v.literal("enqueued"),
  v.literal("sent"),
  v.literal("skipped_empty"),
  v.literal("failed"),
)
export const emailOutboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("sent"),
  v.literal("dead"),
)
export const emailDeliveryStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("sent"),
  v.literal("delivery_delayed"),
  v.literal("delivered"),
  v.literal("opened"),
  v.literal("clicked"),
  v.literal("complained"),
  v.literal("bounced"),
  v.literal("failed"),
  v.literal("suppressed"),
)
export const resendEmailEventTypeValidator = v.union(
  v.literal("email.scheduled"),
  v.literal("email.sent"),
  v.literal("email.delivery_delayed"),
  v.literal("email.delivered"),
  v.literal("email.opened"),
  v.literal("email.clicked"),
  v.literal("email.complained"),
  v.literal("email.bounced"),
  v.literal("email.failed"),
  v.literal("email.suppressed"),
)
export const emailWebhookStatusValidator = v.union(
  v.literal("pending_match"),
  v.literal("applied"),
  v.literal("ignored_stale"),
  v.literal("dead"),
)

export const featureRequestStatusValidator = v.union(
  v.literal("new"),
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("declined"),
)
export const changelogStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
)

export const providerValidator = v.union(
  v.literal("x"),
  v.literal("reddit_posts"),
  v.literal("reddit_comments"),
  v.literal("hacker_news"),
  v.literal("deepseek"),
  v.literal("resend"),
  v.literal("creem"),
)
export const providerRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
)
export const providerRunTriggerValidator = v.union(
  v.literal("scheduled"),
  v.literal("manual"),
  v.literal("webhook"),
  v.literal("retry"),
)
export const metricGranularityValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
)
export const metricScopeValidator = v.union(
  v.literal("global"),
  v.literal("workspace"),
)

export const deletionKindValidator = v.union(
  v.literal("workspace"),
  v.literal("account"),
)
export const deletionJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("billing_check"),
  v.literal("blocked"),
  v.literal("leased"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("dead"),
  v.literal("canceled"),
)
export const billingGuardStatusValidator = v.union(
  v.literal("pending"),
  v.literal("confirmed_inactive"),
  v.literal("blocked_active"),
  v.literal("failed"),
)
export const deletionPhaseValidator = v.union(
  v.literal("billing_check"),
  v.literal("purge"),
  v.literal("verify_data"),
  v.literal("identity_delete"),
  v.literal("security_fence"),
  v.literal("done"),
)
export const deletionPurgeStageValidator = v.union(
  v.literal("email_webhook_events"),
  v.literal("digest_runs"),
  v.literal("email_outbox"),
  v.literal("digest_preferences"),
  v.literal("mention_keyword_matches"),
  v.literal("categorization_jobs"),
  v.literal("saved_views"),
  v.literal("feature_requests"),
  v.literal("mentions"),
  v.literal("tracking_sources"),
  v.literal("keywords"),
  v.literal("categories"),
  v.literal("usage_cycles"),
  v.literal("billing_checkouts"),
  v.literal("subscriptions"),
  v.literal("provider_runs"),
  v.literal("system_metric_buckets"),
  v.literal("billing_events"),
  v.literal("audit_events"),
  v.literal("workspace_members"),
  v.literal("workspace"),
  v.literal("user_tombstone"),
)
export const auditActorTypeValidator = v.union(
  v.literal("user"),
  v.literal("admin"),
  v.literal("system"),
  v.literal("provider"),
)
export const auditOutcomeValidator = v.union(
  v.literal("success"),
  v.literal("denied"),
  v.literal("failure"),
)

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    disabledAt: v.optional(v.number()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    name: v.optional(v.string()),
    personalWorkspaceId: v.optional(v.id("workspaces")),
    tokenIdentifier: v.string(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_personal_workspace", ["personalWorkspaceId"])
    .index("by_created_at", ["createdAt"])
    .index("by_disabled_at", ["disabledAt"])
    .index("by_deleted_at", ["deletedAt"]),

  workspaces: defineTable({
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletionPendingAt: v.optional(v.number()),
    kind: workspaceKindValidator,
    lastMentionAt: v.optional(v.number()),
    name: v.string(),
    normalizedName: v.string(),
    ownerUserId: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_owner_and_kind", ["ownerUserId", "kind"])
    .index("by_owner_and_deleted_at", ["ownerUserId", "deletedAt"])
    .index("by_kind_and_created_at", ["kind", "createdAt"])
    .index("by_created_at", ["createdAt"])
    .index("by_last_mention_at", ["lastMentionAt"])
    .index("by_deletion_pending_at", ["deletionPendingAt"])
    .index("by_deleted_at", ["deletedAt"]),

  workspaceMembers: defineTable({
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
    role: workspaceRoleValidator,
    updatedAt: v.number(),
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"])
    .index("by_user_and_revoked_at", ["userId", "revokedAt"])
    .index("by_workspace_role_and_revoked_at", [
      "workspaceId",
      "role",
      "revokedAt",
    ]),

  subscriptions: defineTable({
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    createdAt: v.number(),
    currentPeriodEnd: v.number(),
    currentPeriodStart: v.number(),
    endedAt: v.optional(v.number()),
    entitlementStatus: entitlementStatusValidator,
    lastSyncedAt: v.number(),
    planId: planIdValidator,
    provider: v.literal("creem"),
    providerCustomerId: v.string(),
    providerPriceId: v.optional(v.string()),
    providerSubscriptionId: v.string(),
    status: subscriptionStatusValidator,
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_last_synced_at", ["workspaceId", "lastSyncedAt"])
    .index("by_workspace_plan_and_last_synced_at", [
      "workspaceId",
      "planId",
      "lastSyncedAt",
    ])
    .index("by_workspace_and_entitlement", ["workspaceId", "entitlementStatus"])
    .index("by_provider_customer", ["provider", "providerCustomerId"])
    .index("by_provider_subscription", ["provider", "providerSubscriptionId"])
    .index("by_status_and_period_end", ["status", "currentPeriodEnd"])
    .index("by_entitlement_and_period_end", [
      "entitlementStatus",
      "currentPeriodEnd",
    ])
    .index("by_plan_and_status", ["planId", "status"])
    .index("by_created_at", ["createdAt"]),

  billingCheckouts: defineTable({
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
    idempotencyKey: v.string(),
    planId: planIdValidator,
    provider: v.literal("creem"),
    providerCheckoutSessionId: v.string(),
    requestedByUserId: v.id("users"),
    status: checkoutStatusValidator,
    updatedAt: v.number(),
    url: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_provider_session", ["provider", "providerCheckoutSessionId"])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_workspace_plan_and_created_at", [
      "workspaceId",
      "planId",
      "createdAt",
    ])
    .index("by_workspace_status_and_expires_at", [
      "workspaceId",
      "status",
      "expiresAt",
    ])
    .index("by_workspace_status_plan_and_completed_at", [
      "workspaceId",
      "status",
      "planId",
      "completedAt",
    ])
    .index("by_user_and_created_at", ["requestedByUserId", "createdAt"])
    .index("by_status_and_expires_at", ["status", "expiresAt"])
    .index("by_status_and_created_at", ["status", "createdAt"]),

  billingEvents: defineTable({
    attempts: v.number(),
    createdAt: v.number(),
    eventType: v.string(),
    lastError: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    livemode: v.boolean(),
    nextAttemptAt: v.optional(v.number()),
    objectId: v.optional(v.string()),
    payloadJson: v.string(),
    processedAt: v.optional(v.number()),
    provider: v.literal("creem"),
    providerCreatedAt: v.number(),
    providerEventId: v.string(),
    receivedAt: v.number(),
    redactedAt: v.optional(v.number()),
    status: billingEventStatusValidator,
    updatedAt: v.number(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_provider_event", ["provider", "providerEventId"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_provider_object_and_received_at", [
      "provider",
      "objectId",
      "receivedAt",
    ])
    .index("by_event_type_and_received_at", ["eventType", "receivedAt"])
    .index("by_status_and_received_at", ["status", "receivedAt"])
    .index("by_workspace_and_received_at", ["workspaceId", "receivedAt"])
    .index("by_workspace_status_and_received_at", [
      "workspaceId",
      "status",
      "receivedAt",
    ])
    .index("by_workspace_redacted_and_received_at", [
      "workspaceId",
      "redactedAt",
      "receivedAt",
    ]),

  usageCycles: defineTable({
    warning100SentAt: v.optional(v.number()),
    warning80SentAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    idempotencyKey: v.string(),
    keywordLimit: v.number(),
    mentionLimit: v.number(),
    mentionsUsed: v.number(),
    periodEndAt: v.number(),
    periodStartAt: v.number(),
    planSnapshot: usagePlanSnapshotValidator,
    status: usageCycleStatusValidator,
    subscriptionId: v.optional(v.id("subscriptions")),
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_workspace_and_period_start", ["workspaceId", "periodStartAt"])
    .index("by_workspace_status_and_period_end", [
      "workspaceId",
      "status",
      "periodEndAt",
    ])
    .index("by_status_and_period_end", ["status", "periodEndAt"])
    .index("by_subscription_and_period_start", [
      "subscriptionId",
      "periodStartAt",
    ]),

  keywords: defineTable({
    createdAt: v.number(),
    createdByUserId: v.id("users"),
    deletedAt: v.optional(v.number()),
    normalizedPhrase: v.string(),
    pausedAt: v.optional(v.number()),
    phrase: v.string(),
    platforms: v.array(platformValidator),
    status: keywordStatusValidator,
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace_phrase_and_deleted_at", [
      "workspaceId",
      "normalizedPhrase",
      "deletedAt",
    ])
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_updated_at", ["workspaceId", "updatedAt"])
    .index("by_creator_and_created_at", ["createdByUserId", "createdAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"]),

  trackingSources: defineTable({
    backoffMs: v.number(),
    backoffUntil: v.optional(v.number()),
    checkpointVersion: v.number(),
    consecutiveFailures: v.number(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    inProgressCursor: v.optional(v.string()),
    inProgressPage: v.optional(v.number()),
    inProgressWindowEndAt: v.optional(v.number()),
    inProgressWindowStartAt: v.optional(v.number()),
    intervalMs: v.number(),
    keywordId: v.id("keywords"),
    lastError: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseVersion: v.number(),
    nextRunAt: v.number(),
    pauseReason: v.optional(trackingPauseReasonValidator),
    providerQuery: v.string(),
    settledWatermarkAt: v.optional(v.number()),
    settledWatermarkItemId: v.optional(v.string()),
    sourceType: trackingSourceTypeValidator,
    status: trackingSourceStatusValidator,
    totalFailures: v.number(),
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_keyword_and_source_type", ["keywordId", "sourceType"])
    .index("by_keyword_and_status", ["keywordId", "status"])
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_source_type_and_status", [
      "workspaceId",
      "sourceType",
      "status",
    ])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_status_and_next_run_at", ["status", "nextRunAt"])
    .index("by_source_type_status_and_next_run_at", [
      "sourceType",
      "status",
      "nextRunAt",
    ])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_source_type_status_and_lease_expires_at", [
      "sourceType",
      "status",
      "leaseExpiresAt",
    ])
    .index("by_status_and_updated_at", ["status", "updatedAt"]),

  mentions: defineTable({
    analysisState: mentionAnalysisStateValidator,
    authorDisplayName: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    body: v.string(),
    canonicalUrl: v.string(),
    categoryId: v.optional(v.id("categories")),
    commentCount: v.optional(v.number()),
    contentType: v.string(),
    engagementScore: v.number(),
    fallbackKey: v.optional(v.string()),
    firstSeenAt: v.number(),
    language: v.optional(v.string()),
    lastMatchedAt: v.number(),
    likeCount: v.optional(v.number()),
    platform: platformValidator,
    pointCount: v.optional(v.number()),
    providerItemId: v.optional(v.string()),
    publishedAt: v.number(),
    quoteCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    repostCount: v.optional(v.number()),
    searchText: v.string(),
    status: mentionStatusValidator,
    title: v.optional(v.string()),
    trackingSourceId: v.optional(v.id("trackingSources")),
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace_platform_content_provider_item", [
      "workspaceId",
      "platform",
      "contentType",
      "providerItemId",
    ])
    .index("by_workspace_platform_content_fallback", [
      "workspaceId",
      "platform",
      "contentType",
      "fallbackKey",
    ])
    .index("by_workspace_status_and_published_at", [
      "workspaceId",
      "status",
      "publishedAt",
    ])
    .index("by_workspace_status_and_engagement", [
      "workspaceId",
      "status",
      "engagementScore",
    ])
    .index("by_workspace_engagement_and_published_at", [
      "workspaceId",
      "engagementScore",
      "publishedAt",
    ])
    .index("by_workspace_and_published_at", ["workspaceId", "publishedAt"])
    .index("by_workspace_category_and_published_at", [
      "workspaceId",
      "categoryId",
      "publishedAt",
    ])
    .index("by_workspace_platform_and_published_at", [
      "workspaceId",
      "platform",
      "publishedAt",
    ])
    .index("by_tracking_source_and_published_at", [
      "trackingSourceId",
      "publishedAt",
    ])
    .index("by_status_and_published_at", ["status", "publishedAt"])
    .searchIndex("search_body", {
      searchField: "searchText",
      filterFields: ["workspaceId", "status", "platform", "categoryId"],
    }),

  mentionKeywordMatches: defineTable({
    createdAt: v.number(),
    keywordId: v.id("keywords"),
    matchKind: keywordMatchKindValidator,
    matchedText: v.optional(v.string()),
    mentionId: v.id("mentions"),
    trackingSourceId: v.optional(v.id("trackingSources")),
    workspaceId: v.id("workspaces"),
  })
    .index("by_mention_and_keyword", ["mentionId", "keywordId"])
    .index("by_keyword_and_mention", ["keywordId", "mentionId"])
    .index("by_workspace_and_mention", ["workspaceId", "mentionId"])
    .index("by_workspace_keyword_and_created_at", [
      "workspaceId",
      "keywordId",
      "createdAt",
    ])
    .index("by_tracking_source_and_created_at", [
      "trackingSourceId",
      "createdAt",
    ]),

  categories: defineTable({
    colorToken: categoryColorTokenValidator,
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletionPendingAt: v.optional(v.number()),
    description: v.string(),
    enabled: v.boolean(),
    isSystem: v.boolean(),
    name: v.string(),
    normalizedName: v.string(),
    sortOrder: v.number(),
    systemKey: v.optional(categorySystemKeyValidator),
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace_and_system_key", ["workspaceId", "systemKey"])
    .index("by_workspace_normalized_name_and_deleted_at", [
      "workspaceId",
      "normalizedName",
      "deletedAt",
    ])
    .index("by_workspace_deleted_enabled_and_sort_order", [
      "workspaceId",
      "deletedAt",
      "enabled",
      "sortOrder",
    ])
    .index("by_workspace_and_sort_order", ["workspaceId", "sortOrder"]),

  savedViews: defineTable({
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    filters: v.object({
      categoryIds: v.optional(v.array(v.id("categories"))),
      keywordIds: v.optional(v.array(v.id("keywords"))),
      mentionStatuses: v.optional(v.array(mentionStatusValidator)),
      platforms: v.optional(v.array(platformValidator)),
      publishedAfter: v.optional(v.number()),
      publishedBefore: v.optional(v.number()),
    }),
    icon: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    position: v.number(),
    sort: mentionSortValidator,
    updatedAt: v.number(),
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace_user_normalized_name_and_deleted_at", [
      "workspaceId",
      "userId",
      "normalizedName",
      "deletedAt",
    ])
    .index("by_workspace_user_deleted_and_position", [
      "workspaceId",
      "userId",
      "deletedAt",
      "position",
    ])
    .index("by_workspace_user_and_updated_at", [
      "workspaceId",
      "userId",
      "updatedAt",
    ])
    .index("by_workspace_deleted_and_updated_at", [
      "workspaceId",
      "deletedAt",
      "updatedAt",
    ])
    .index("by_workspace_and_updated_at", ["workspaceId", "updatedAt"]),

  categorizationJobs: defineTable({
    attempts: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    idempotencyKey: v.string(),
    lastError: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    maxAttempts: v.number(),
    mentionId: v.id("mentions"),
    model: v.string(),
    nextAttemptAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    status: jobStatusValidator,
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_mention", ["mentionId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_model_status_and_created_at", ["model", "status", "createdAt"]),

  digestPreferences: defineTable({
    createdAt: v.number(),
    enabled: v.boolean(),
    hour: v.number(),
    mentionLimit: v.number(),
    minute: v.number(),
    nextRunAt: v.number(),
    timeZone: v.string(),
    updatedAt: v.number(),
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace_and_user", ["workspaceId", "userId"])
    .index("by_user", ["userId"])
    .index("by_enabled_and_next_run_at", ["enabled", "nextRunAt"])
    .index("by_workspace_enabled_and_next_run_at", [
      "workspaceId",
      "enabled",
      "nextRunAt",
    ])
    .index("by_workspace_and_updated_at", ["workspaceId", "updatedAt"]),

  digestRuns: defineTable({
    aggregationCompletedAt: v.optional(v.number()),
    aggregationCursor: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    digestCountsJson: v.optional(v.string()),
    digestPreferenceId: v.id("digestPreferences"),
    error: v.optional(v.string()),
    idempotencyKey: v.string(),
    localDate: v.string(),
    mentionCount: v.number(),
    mentionIds: v.array(v.id("mentions")),
    mentionLimit: v.optional(v.number()),
    outboxId: v.optional(v.id("emailOutbox")),
    scheduledFor: v.number(),
    status: digestRunStatusValidator,
    updatedAt: v.number(),
    userId: v.id("users"),
    windowEndAt: v.number(),
    windowStartAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_preference_and_local_date", ["digestPreferenceId", "localDate"])
    .index("by_workspace_and_scheduled_for", ["workspaceId", "scheduledFor"])
    .index("by_user_and_scheduled_for", ["userId", "scheduledFor"])
    .index("by_status_and_scheduled_for", ["status", "scheduledFor"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_outbox", ["outboxId"]),

  emailOutbox: defineTable({
    attempts: v.number(),
    createdAt: v.number(),
    deadAt: v.optional(v.number()),
    deliveryStatus: v.optional(emailDeliveryStatusValidator),
    digestRunId: v.optional(v.id("digestRuns")),
    from: v.string(),
    html: v.string(),
    idempotencyKey: v.string(),
    lastError: v.optional(v.string()),
    lastProviderEventAt: v.optional(v.number()),
    lastProviderEventId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    payloadFingerprint: v.string(),
    provider: v.literal("resend"),
    providerMessageId: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    status: emailOutboxStatusValidator,
    subject: v.string(),
    text: v.optional(v.string()),
    to: v.array(v.string()),
    updatedAt: v.number(),
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_workspace_status_and_lease_expires_at", [
      "workspaceId",
      "status",
      "leaseExpiresAt",
    ])
    .index("by_provider_message", ["provider", "providerMessageId"])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_digest_run", ["digestRunId"])
    .index("by_delivery_status_and_updated_at", ["deliveryStatus", "updatedAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"]),

  emailWebhookEvents: defineTable({
    attempts: v.number(),
    eventId: v.string(),
    lastError: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    outboxId: v.optional(v.id("emailOutbox")),
    processedAt: v.optional(v.number()),
    provider: v.literal("resend"),
    providerCreatedAt: v.number(),
    providerMessageId: v.string(),
    receivedAt: v.number(),
    status: emailWebhookStatusValidator,
    type: resendEmailEventTypeValidator,
    updatedAt: v.number(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_provider_event", ["provider", "eventId"])
    .index("by_provider_message_and_created_at", [
      "providerMessageId",
      "providerCreatedAt",
    ])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_outbox_and_created_at", ["outboxId", "providerCreatedAt"])
    .index("by_type_and_received_at", ["type", "receivedAt"])
    .index("by_status_and_received_at", ["status", "receivedAt"])
    .index("by_workspace_and_received_at", ["workspaceId", "receivedAt"]),

  featureRequests: defineTable({
    adminNote: v.optional(v.string()),
    body: v.string(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdByUserId: v.id("users"),
    searchText: v.string(),
    status: featureRequestStatusValidator,
    title: v.string(),
    updatedAt: v.number(),
    workspaceId: v.id("workspaces"),
  })
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_workspace_creator_and_created_at", [
      "workspaceId",
      "createdByUserId",
      "createdAt",
    ])
    .index("by_creator_and_created_at", ["createdByUserId", "createdAt"])
    .index("by_created_at", ["createdAt"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .searchIndex("search_content", {
      searchField: "searchText",
      filterFields: ["status"],
    }),

  changelogEntries: defineTable({
    body: v.string(),
    createdAt: v.number(),
    createdByClerkUserId: v.string(),
    label: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    requestedPublicationAt: v.optional(v.number()),
    slug: v.string(),
    status: changelogStatusValidator,
    summary: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    updatedByClerkUserId: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_published_at", ["status", "publishedAt"])
    .index("by_status_and_requested_publication_at", [
      "status",
      "requestedPublicationAt",
    ])
    .index("by_published_at", ["publishedAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .index("by_updated_at", ["updatedAt"])
    .index("by_created_at", ["createdAt"]),

  providerRuns: defineTable({
    attempt: v.number(),
    createdAt: v.number(),
    durationMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    inputCount: v.number(),
    operation: v.string(),
    outputCount: v.number(),
    provider: providerValidator,
    startedAt: v.number(),
    status: providerRunStatusValidator,
    trackingSourceId: v.optional(v.id("trackingSources")),
    trigger: providerRunTriggerValidator,
    updatedAt: v.number(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_provider_operation_and_started_at", [
      "provider",
      "operation",
      "startedAt",
    ])
    .index("by_provider_status_and_started_at", [
      "provider",
      "status",
      "startedAt",
    ])
    .index("by_status_and_started_at", ["status", "startedAt"])
    .index("by_workspace_and_started_at", ["workspaceId", "startedAt"])
    .index("by_workspace_status_and_started_at", [
      "workspaceId",
      "status",
      "startedAt",
    ])
    .index("by_workspace_provider_operation_status_and_started_at", [
      "workspaceId",
      "provider",
      "operation",
      "status",
      "startedAt",
    ])
    .index("by_tracking_source_and_started_at", [
      "trackingSourceId",
      "startedAt",
    ]),

  providerMetricBuckets: defineTable({
    bucketEndAt: v.number(),
    bucketStartAt: v.number(),
    failureCount: v.number(),
    granularity: metricGranularityValidator,
    inputItemCount: v.number(),
    latencyMaxMs: v.number(),
    latencyTotalMs: v.number(),
    operation: v.string(),
    outputItemCount: v.number(),
    provider: providerValidator,
    rateLimitedCount: v.number(),
    requestCount: v.number(),
    retryCount: v.number(),
    successCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_operation_granularity_and_bucket", [
      "provider",
      "operation",
      "granularity",
      "bucketStartAt",
    ])
    .index("by_provider_granularity_and_bucket", [
      "provider",
      "granularity",
      "bucketStartAt",
    ])
    .index("by_granularity_and_bucket", ["granularity", "bucketStartAt"])
    .index("by_bucket_start", ["bucketStartAt"]),

  systemMetricBuckets: defineTable({
    bucketEndAt: v.number(),
    bucketStartAt: v.number(),
    count: v.number(),
    granularity: metricGranularityValidator,
    maximum: v.number(),
    metric: v.string(),
    minimum: v.number(),
    scope: metricScopeValidator,
    sum: v.number(),
    updatedAt: v.number(),
    value: v.number(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_metric_scope_workspace_granularity_and_bucket", [
      "metric",
      "scope",
      "workspaceId",
      "granularity",
      "bucketStartAt",
    ])
    .index("by_metric_granularity_and_bucket", [
      "metric",
      "granularity",
      "bucketStartAt",
    ])
    .index("by_scope_granularity_and_bucket", [
      "scope",
      "granularity",
      "bucketStartAt",
    ])
    .index("by_workspace_metric_and_bucket", [
      "workspaceId",
      "metric",
      "bucketStartAt",
    ])
    .index("by_workspace_and_bucket", ["workspaceId", "bucketStartAt"])
    .index("by_granularity_and_bucket", ["granularity", "bucketStartAt"]),

  deletionJobs: defineTable({
    accountUserId: v.id("users"),
    accessFencedAt: v.optional(v.number()),
    attempts: v.number(),
    billingCheckedAt: v.optional(v.number()),
    billingGuardStatus: billingGuardStatusValidator,
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    dataDeletionVerifiedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
    idempotencyKey: v.string(),
    identityClerkUserId: v.optional(v.string()),
    identityDeletionVerifiedAt: v.optional(v.number()),
    kind: deletionKindValidator,
    lastError: v.optional(v.string()),
    lastErrorCode: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseVersion: v.optional(v.number()),
    maxAttempts: v.number(),
    nextAttemptAt: v.optional(v.number()),
    operationId: v.optional(v.string()),
    phase: v.optional(deletionPhaseValidator),
    purgeStage: v.optional(deletionPurgeStageValidator),
    quiescedAt: v.optional(v.number()),
    requestedByUserId: v.id("users"),
    resourceKey: v.optional(v.string()),
    scheduledAt: v.number(),
    securityFenceExpiresAt: v.optional(v.number()),
    status: deletionJobStatusValidator,
    supersedesJobId: v.optional(v.id("deletionJobs")),
    updatedAt: v.number(),
    workflowVersion: v.optional(v.number()),
    workspaceId: v.id("workspaces"),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_resource_key_and_created_at", ["resourceKey", "createdAt"])
    .index("by_kind_and_created_at", ["kind", "createdAt"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_billing_guard_status_and_created_at", [
      "billingGuardStatus",
      "createdAt",
    ])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_account_user_and_created_at", ["accountUserId", "createdAt"])
    .index("by_account_user_kind_and_created_at", [
      "accountUserId",
      "kind",
      "createdAt",
    ])
    .index("by_kind_status_and_created_at", ["kind", "status", "createdAt"]),

  auditEvents: defineTable({
    action: v.string(),
    actorClerkUserId: v.optional(v.string()),
    actorType: auditActorTypeValidator,
    actorUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    metadataJson: v.optional(v.string()),
    outcome: auditOutcomeValidator,
    requestId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    targetType: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_actor_user_and_created_at", ["actorUserId", "createdAt"])
    .index("by_actor_clerk_and_created_at", ["actorClerkUserId", "createdAt"])
    .index("by_action_and_created_at", ["action", "createdAt"])
    .index("by_target_and_created_at", ["targetType", "targetId", "createdAt"])
    .index("by_outcome_and_created_at", ["outcome", "createdAt"])
    .index("by_request_id", ["requestId"])
    .index("by_created_at", ["createdAt"]),
})
