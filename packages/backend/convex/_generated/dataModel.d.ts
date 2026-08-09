/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  auditEvents: {
    document: {
      action: string;
      actorClerkUserId?: string;
      actorType: "user" | "admin" | "system" | "provider";
      actorUserId?: Id<"users">;
      createdAt: number;
      metadataJson?: string;
      outcome: "success" | "denied" | "failure";
      requestId?: string;
      targetId?: string;
      targetType: string;
      workspaceId?: Id<"workspaces">;
      _id: Id<"auditEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "action"
      | "actorClerkUserId"
      | "actorType"
      | "actorUserId"
      | "createdAt"
      | "metadataJson"
      | "outcome"
      | "requestId"
      | "targetId"
      | "targetType"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_action_and_created_at: ["action", "createdAt", "_creationTime"];
      by_actor_clerk_and_created_at: [
        "actorClerkUserId",
        "createdAt",
        "_creationTime",
      ];
      by_actor_user_and_created_at: [
        "actorUserId",
        "createdAt",
        "_creationTime",
      ];
      by_created_at: ["createdAt", "_creationTime"];
      by_outcome_and_created_at: ["outcome", "createdAt", "_creationTime"];
      by_request_id: ["requestId", "_creationTime"];
      by_target_and_created_at: [
        "targetType",
        "targetId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingCheckouts: {
    document: {
      completedAt?: number;
      createdAt: number;
      expiresAt: number;
      idempotencyKey: string;
      planId: "starter" | "growth" | "scale";
      provider: "creem";
      providerCheckoutSessionId: string;
      requestedByUserId: Id<"users">;
      status: "open" | "complete" | "expired";
      updatedAt: number;
      url?: string;
      workspaceId: Id<"workspaces">;
      _id: Id<"billingCheckouts">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "createdAt"
      | "expiresAt"
      | "idempotencyKey"
      | "planId"
      | "provider"
      | "providerCheckoutSessionId"
      | "requestedByUserId"
      | "status"
      | "updatedAt"
      | "url"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_provider_session: [
        "provider",
        "providerCheckoutSessionId",
        "_creationTime",
      ];
      by_status_and_created_at: ["status", "createdAt", "_creationTime"];
      by_status_and_expires_at: ["status", "expiresAt", "_creationTime"];
      by_user_and_created_at: [
        "requestedByUserId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_plan_and_created_at: [
        "workspaceId",
        "planId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_status_and_expires_at: [
        "workspaceId",
        "status",
        "expiresAt",
        "_creationTime",
      ];
      by_workspace_status_plan_and_completed_at: [
        "workspaceId",
        "status",
        "planId",
        "completedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingEvents: {
    document: {
      attempts: number;
      createdAt: number;
      eventType: string;
      lastError?: string;
      leaseExpiresAt?: number;
      leaseToken?: string;
      livemode: boolean;
      nextAttemptAt?: number;
      objectId?: string;
      payloadJson: string;
      processedAt?: number;
      provider: "creem";
      providerCreatedAt: number;
      providerEventId: string;
      receivedAt: number;
      redactedAt?: number;
      status: "pending" | "leased" | "processed" | "dead";
      updatedAt: number;
      workspaceId?: Id<"workspaces">;
      _id: Id<"billingEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "createdAt"
      | "eventType"
      | "lastError"
      | "leaseExpiresAt"
      | "leaseToken"
      | "livemode"
      | "nextAttemptAt"
      | "objectId"
      | "payloadJson"
      | "processedAt"
      | "provider"
      | "providerCreatedAt"
      | "providerEventId"
      | "receivedAt"
      | "redactedAt"
      | "status"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_event_type_and_received_at: [
        "eventType",
        "receivedAt",
        "_creationTime",
      ];
      by_provider_event: ["provider", "providerEventId", "_creationTime"];
      by_provider_object_and_received_at: [
        "provider",
        "objectId",
        "receivedAt",
        "_creationTime",
      ];
      by_status_and_lease_expires_at: [
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
      by_status_and_next_attempt_at: [
        "status",
        "nextAttemptAt",
        "_creationTime",
      ];
      by_status_and_received_at: ["status", "receivedAt", "_creationTime"];
      by_workspace_and_received_at: [
        "workspaceId",
        "receivedAt",
        "_creationTime",
      ];
      by_workspace_redacted_and_received_at: [
        "workspaceId",
        "redactedAt",
        "receivedAt",
        "_creationTime",
      ];
      by_workspace_status_and_received_at: [
        "workspaceId",
        "status",
        "receivedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  categories: {
    document: {
      colorToken:
        | "blue"
        | "orange"
        | "green"
        | "red"
        | "purple"
        | "yellow"
        | "gray"
        | "pink"
        | "cyan"
        | "slate";
      createdAt: number;
      deletedAt?: number;
      deletionPendingAt?: number;
      description: string;
      enabled: boolean;
      isSystem: boolean;
      name: string;
      normalizedName: string;
      sortOrder: number;
      systemKey?:
        | "question"
        | "complaint"
        | "praise"
        | "bug"
        | "feature_request"
        | "competitor_mention"
        | "other";
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"categories">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "colorToken"
      | "createdAt"
      | "deletedAt"
      | "deletionPendingAt"
      | "description"
      | "enabled"
      | "isSystem"
      | "name"
      | "normalizedName"
      | "sortOrder"
      | "systemKey"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_workspace_and_sort_order: [
        "workspaceId",
        "sortOrder",
        "_creationTime",
      ];
      by_workspace_and_system_key: [
        "workspaceId",
        "systemKey",
        "_creationTime",
      ];
      by_workspace_deleted_at_and_deletion_pending_at_and_sort_order: [
        "workspaceId",
        "deletedAt",
        "deletionPendingAt",
        "sortOrder",
        "_creationTime",
      ];
      by_workspace_deleted_enabled_and_sort_order: [
        "workspaceId",
        "deletedAt",
        "enabled",
        "sortOrder",
        "_creationTime",
      ];
      by_workspace_normalized_name_and_deleted_at: [
        "workspaceId",
        "normalizedName",
        "deletedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  changelogEntries: {
    document: {
      body: string;
      createdAt: number;
      createdByClerkUserId: string;
      label?: string;
      publishedAt?: number;
      requestedPublicationAt?: number;
      slug: string;
      status: "draft" | "published";
      summary: string;
      title: string;
      updatedAt: number;
      updatedByClerkUserId: string;
      _id: Id<"changelogEntries">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "body"
      | "createdAt"
      | "createdByClerkUserId"
      | "label"
      | "publishedAt"
      | "requestedPublicationAt"
      | "slug"
      | "status"
      | "summary"
      | "title"
      | "updatedAt"
      | "updatedByClerkUserId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_created_at: ["createdAt", "_creationTime"];
      by_published_at: ["publishedAt", "_creationTime"];
      by_slug: ["slug", "_creationTime"];
      by_status_and_published_at: ["status", "publishedAt", "_creationTime"];
      by_status_and_requested_publication_at: [
        "status",
        "requestedPublicationAt",
        "_creationTime",
      ];
      by_status_and_updated_at: ["status", "updatedAt", "_creationTime"];
      by_updated_at: ["updatedAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  deletionJobs: {
    document: {
      accessFencedAt?: number;
      accountUserId: Id<"users">;
      attempts: number;
      billingCheckedAt?: number;
      billingGuardStatus:
        "pending" | "confirmed_inactive" | "blocked_active" | "failed";
      completedAt?: number;
      createdAt: number;
      dataDeletionVerifiedAt?: number;
      generation?: number;
      idempotencyKey: string;
      identityClerkUserId?: string;
      identityDeletionVerifiedAt?: number;
      kind: "workspace" | "account";
      lastError?: string;
      lastErrorCode?: string;
      leaseExpiresAt?: number;
      leaseToken?: string;
      leaseVersion?: number;
      maxAttempts: number;
      nextAttemptAt?: number;
      operationId?: string;
      phase?:
        | "billing_check"
        | "purge"
        | "verify_data"
        | "identity_delete"
        | "security_fence"
        | "done";
      purgeStage?:
        | "email_webhook_events"
        | "digest_runs"
        | "email_outbox"
        | "digest_preferences"
        | "mention_keyword_matches"
        | "mention_analysis_jobs"
        | "saved_views"
        | "feature_requests"
        | "mentions"
        | "tracking_provider_pages"
        | "tracking_sources"
        | "keywords"
        | "categories"
        | "usage_cycles"
        | "free_evaluation_grants"
        | "onboarding_research"
        | "billing_checkouts"
        | "subscriptions"
        | "provider_runs"
        | "system_metric_buckets"
        | "billing_events"
        | "audit_events"
        | "workspace_members"
        | "workspace"
        | "user_tombstone";
      quiescedAt?: number;
      requestedByUserId: Id<"users">;
      resourceKey?: string;
      scheduledAt: number;
      securityFenceExpiresAt?: number;
      status:
        | "pending"
        | "billing_check"
        | "blocked"
        | "leased"
        | "running"
        | "completed"
        | "failed"
        | "dead"
        | "canceled";
      supersedesJobId?: Id<"deletionJobs">;
      updatedAt: number;
      workflowVersion?: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"deletionJobs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accessFencedAt"
      | "accountUserId"
      | "attempts"
      | "billingCheckedAt"
      | "billingGuardStatus"
      | "completedAt"
      | "createdAt"
      | "dataDeletionVerifiedAt"
      | "generation"
      | "idempotencyKey"
      | "identityClerkUserId"
      | "identityDeletionVerifiedAt"
      | "kind"
      | "lastError"
      | "lastErrorCode"
      | "leaseExpiresAt"
      | "leaseToken"
      | "leaseVersion"
      | "maxAttempts"
      | "nextAttemptAt"
      | "operationId"
      | "phase"
      | "purgeStage"
      | "quiescedAt"
      | "requestedByUserId"
      | "resourceKey"
      | "scheduledAt"
      | "securityFenceExpiresAt"
      | "status"
      | "supersedesJobId"
      | "updatedAt"
      | "workflowVersion"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_account_user_and_created_at: [
        "accountUserId",
        "createdAt",
        "_creationTime",
      ];
      by_account_user_kind_and_created_at: [
        "accountUserId",
        "kind",
        "createdAt",
        "_creationTime",
      ];
      by_billing_guard_status_and_created_at: [
        "billingGuardStatus",
        "createdAt",
        "_creationTime",
      ];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_kind_and_created_at: ["kind", "createdAt", "_creationTime"];
      by_kind_status_and_created_at: [
        "kind",
        "status",
        "createdAt",
        "_creationTime",
      ];
      by_resource_key_and_created_at: [
        "resourceKey",
        "createdAt",
        "_creationTime",
      ];
      by_status_and_lease_expires_at: [
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
      by_status_and_next_attempt_at: [
        "status",
        "nextAttemptAt",
        "_creationTime",
      ];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  digestPreferences: {
    document: {
      createdAt: number;
      deletionPausedAt?: number;
      enabled: boolean;
      hour: number;
      mentionLimit: number;
      minute: number;
      nextRunAt: number;
      timeZone: string;
      updatedAt: number;
      userId: Id<"users">;
      workspaceId: Id<"workspaces">;
      _id: Id<"digestPreferences">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "deletionPausedAt"
      | "enabled"
      | "hour"
      | "mentionLimit"
      | "minute"
      | "nextRunAt"
      | "timeZone"
      | "updatedAt"
      | "userId"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_enabled_and_next_run_at: ["enabled", "nextRunAt", "_creationTime"];
      by_user: ["userId", "_creationTime"];
      by_workspace_and_updated_at: [
        "workspaceId",
        "updatedAt",
        "_creationTime",
      ];
      by_workspace_and_user: ["workspaceId", "userId", "_creationTime"];
      by_workspace_enabled_and_next_run_at: [
        "workspaceId",
        "enabled",
        "nextRunAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  digestRuns: {
    document: {
      aggregationCompletedAt?: number;
      aggregationCursor?: string;
      completedAt?: number;
      createdAt: number;
      digestCountsJson?: string;
      digestPreferenceId: Id<"digestPreferences">;
      error?: string;
      idempotencyKey: string;
      localDate: string;
      mentionCount: number;
      mentionIds: Array<Id<"mentions">>;
      mentionLimit?: number;
      outboxId?: Id<"emailOutbox">;
      scheduledFor: number;
      status: "processing" | "enqueued" | "sent" | "skipped_empty" | "failed";
      updatedAt: number;
      userId: Id<"users">;
      windowEndAt: number;
      windowStartAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"digestRuns">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aggregationCompletedAt"
      | "aggregationCursor"
      | "completedAt"
      | "createdAt"
      | "digestCountsJson"
      | "digestPreferenceId"
      | "error"
      | "idempotencyKey"
      | "localDate"
      | "mentionCount"
      | "mentionIds"
      | "mentionLimit"
      | "outboxId"
      | "scheduledFor"
      | "status"
      | "updatedAt"
      | "userId"
      | "windowEndAt"
      | "windowStartAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_outbox: ["outboxId", "_creationTime"];
      by_preference_and_local_date: [
        "digestPreferenceId",
        "localDate",
        "_creationTime",
      ];
      by_status_and_created_at: ["status", "createdAt", "_creationTime"];
      by_status_and_scheduled_for: ["status", "scheduledFor", "_creationTime"];
      by_user_and_scheduled_for: ["userId", "scheduledFor", "_creationTime"];
      by_workspace_and_scheduled_for: [
        "workspaceId",
        "scheduledFor",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  emailOutbox: {
    document: {
      attempts: number;
      createdAt: number;
      deadAt?: number;
      deliveryStatus?:
        | "scheduled"
        | "sent"
        | "delivery_delayed"
        | "delivered"
        | "opened"
        | "clicked"
        | "complained"
        | "bounced"
        | "failed"
        | "suppressed";
      digestRunId?: Id<"digestRuns">;
      from: string;
      html: string;
      idempotencyKey: string;
      lastError?: string;
      lastProviderEventAt?: number;
      lastProviderEventId?: string;
      leaseExpiresAt?: number;
      leaseToken?: string;
      nextAttemptAt?: number;
      payloadFingerprint: string;
      provider: "resend";
      providerMessageId?: string;
      replyTo?: string;
      sentAt?: number;
      status: "pending" | "leased" | "sent" | "dead";
      subject: string;
      text?: string;
      to: Array<string>;
      updatedAt: number;
      userId: Id<"users">;
      workspaceId: Id<"workspaces">;
      _id: Id<"emailOutbox">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "createdAt"
      | "deadAt"
      | "deliveryStatus"
      | "digestRunId"
      | "from"
      | "html"
      | "idempotencyKey"
      | "lastError"
      | "lastProviderEventAt"
      | "lastProviderEventId"
      | "leaseExpiresAt"
      | "leaseToken"
      | "nextAttemptAt"
      | "payloadFingerprint"
      | "provider"
      | "providerMessageId"
      | "replyTo"
      | "sentAt"
      | "status"
      | "subject"
      | "text"
      | "to"
      | "updatedAt"
      | "userId"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_delivery_status_and_updated_at: [
        "deliveryStatus",
        "updatedAt",
        "_creationTime",
      ];
      by_digest_run: ["digestRunId", "_creationTime"];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_provider_message: ["provider", "providerMessageId", "_creationTime"];
      by_status_and_lease_expires_at: [
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
      by_status_and_next_attempt_at: [
        "status",
        "nextAttemptAt",
        "_creationTime",
      ];
      by_status_and_updated_at: ["status", "updatedAt", "_creationTime"];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_status_and_lease_expires_at: [
        "workspaceId",
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  emailWebhookEvents: {
    document: {
      attempts: number;
      eventId: string;
      lastError?: string;
      nextAttemptAt?: number;
      outboxId?: Id<"emailOutbox">;
      processedAt?: number;
      provider: "resend";
      providerCreatedAt: number;
      providerMessageId: string;
      receivedAt: number;
      status: "pending_match" | "applied" | "ignored_stale" | "dead";
      type:
        | "email.scheduled"
        | "email.sent"
        | "email.delivery_delayed"
        | "email.delivered"
        | "email.opened"
        | "email.clicked"
        | "email.complained"
        | "email.bounced"
        | "email.failed"
        | "email.suppressed";
      updatedAt: number;
      workspaceId?: Id<"workspaces">;
      _id: Id<"emailWebhookEvents">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "eventId"
      | "lastError"
      | "nextAttemptAt"
      | "outboxId"
      | "processedAt"
      | "provider"
      | "providerCreatedAt"
      | "providerMessageId"
      | "receivedAt"
      | "status"
      | "type"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_outbox_and_created_at: [
        "outboxId",
        "providerCreatedAt",
        "_creationTime",
      ];
      by_provider_event: ["provider", "eventId", "_creationTime"];
      by_provider_message_and_created_at: [
        "providerMessageId",
        "providerCreatedAt",
        "_creationTime",
      ];
      by_status_and_next_attempt_at: [
        "status",
        "nextAttemptAt",
        "_creationTime",
      ];
      by_status_and_received_at: ["status", "receivedAt", "_creationTime"];
      by_type_and_received_at: ["type", "receivedAt", "_creationTime"];
      by_workspace_and_received_at: [
        "workspaceId",
        "receivedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  featureRequests: {
    document: {
      adminNote?: string;
      body: string;
      completedAt?: number;
      createdAt: number;
      createdByUserId: Id<"users">;
      searchText: string;
      status: "new" | "planned" | "in_progress" | "completed" | "declined";
      title: string;
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"featureRequests">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "adminNote"
      | "body"
      | "completedAt"
      | "createdAt"
      | "createdByUserId"
      | "searchText"
      | "status"
      | "title"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_created_at: ["createdAt", "_creationTime"];
      by_creator_and_created_at: [
        "createdByUserId",
        "createdAt",
        "_creationTime",
      ];
      by_status_and_created_at: ["status", "createdAt", "_creationTime"];
      by_status_and_updated_at: ["status", "updatedAt", "_creationTime"];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_creator_and_created_at: [
        "workspaceId",
        "createdByUserId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_status_and_created_at: [
        "workspaceId",
        "status",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {
      search_content: {
        searchField: "searchText";
        filterFields: "status";
      };
    };
    vectorIndexes: {};
  };
  freeEvaluationGrants: {
    document: {
      activatedAt: number;
      createdAt: number;
      exhaustedAt?: number;
      mentionLimit: number;
      mentionsUsed: number;
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"freeEvaluationGrants">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activatedAt"
      | "createdAt"
      | "exhaustedAt"
      | "mentionLimit"
      | "mentionsUsed"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_workspace: ["workspaceId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  keywords: {
    document: {
      activationPriority?: number;
      brandCandidate?: boolean;
      createdAt: number;
      createdByUserId: Id<"users">;
      deletedAt?: number;
      description?: string;
      normalizedPhrase: string;
      pauseReason?: "user" | "capacity" | "payment";
      pausedAt?: number;
      phrase: string;
      platforms: Array<"x" | "reddit" | "hacker_news">;
      status: "active" | "paused" | "deleted";
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"keywords">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activationPriority"
      | "brandCandidate"
      | "createdAt"
      | "createdByUserId"
      | "deletedAt"
      | "description"
      | "normalizedPhrase"
      | "pausedAt"
      | "pauseReason"
      | "phrase"
      | "platforms"
      | "status"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_creator_and_created_at: [
        "createdByUserId",
        "createdAt",
        "_creationTime",
      ];
      by_status_and_updated_at: ["status", "updatedAt", "_creationTime"];
      by_workspace_and_updated_at: [
        "workspaceId",
        "updatedAt",
        "_creationTime",
      ];
      by_workspace_phrase_and_deleted_at: [
        "workspaceId",
        "normalizedPhrase",
        "deletedAt",
        "_creationTime",
      ];
      by_workspace_status_and_created_at: [
        "workspaceId",
        "status",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  mentionAnalysisJobs: {
    document: {
      attempts: number;
      completedAt?: number;
      createdAt: number;
      idempotencyKey: string;
      lastError?: string;
      leaseExpiresAt?: number;
      leaseToken?: string;
      maxAttempts: number;
      mentionId: Id<"mentions">;
      model: string;
      nextAttemptAt?: number;
      startedAt?: number;
      status: "pending" | "leased" | "completed" | "dead";
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"mentionAnalysisJobs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempts"
      | "completedAt"
      | "createdAt"
      | "idempotencyKey"
      | "lastError"
      | "leaseExpiresAt"
      | "leaseToken"
      | "maxAttempts"
      | "mentionId"
      | "model"
      | "nextAttemptAt"
      | "startedAt"
      | "status"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_mention: ["mentionId", "_creationTime"];
      by_model_status_and_created_at: [
        "model",
        "status",
        "createdAt",
        "_creationTime",
      ];
      by_status_and_lease_expires_at: [
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
      by_status_and_next_attempt_at: [
        "status",
        "nextAttemptAt",
        "_creationTime",
      ];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_status_and_created_at: [
        "workspaceId",
        "status",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  mentionKeywordMatches: {
    document: {
      createdAt: number;
      keywordId: Id<"keywords">;
      matchKind: "exact" | "phrase" | "provider";
      matchedText?: string;
      mentionId: Id<"mentions">;
      trackingSourceId?: Id<"trackingSources">;
      workspaceId: Id<"workspaces">;
      _id: Id<"mentionKeywordMatches">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "keywordId"
      | "matchedText"
      | "matchKind"
      | "mentionId"
      | "trackingSourceId"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_keyword_and_mention: ["keywordId", "mentionId", "_creationTime"];
      by_mention_and_keyword: ["mentionId", "keywordId", "_creationTime"];
      by_tracking_source_and_created_at: [
        "trackingSourceId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_and_mention: ["workspaceId", "mentionId", "_creationTime"];
      by_workspace_keyword_and_created_at: [
        "workspaceId",
        "keywordId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  mentions: {
    document: {
      analysisState: "pending" | "leased" | "completed" | "failed";
      analysisVersion?: string;
      authorDisplayName?: string;
      authorHandle?: string;
      body: string;
      canonicalUrl: string;
      categoryId?: Id<"categories">;
      commentCount?: number;
      contentType: string;
      engagementScore: number;
      fallbackKey?: string;
      feedState: "pending" | "visible" | "filtered";
      firstSeenAt: number;
      language?: string;
      lastMatchedAt: number;
      likeCount?: number;
      platform: "x" | "reddit" | "hacker_news";
      pointCount?: number;
      priority?: "low" | "medium" | "high";
      priorityReason?: string;
      providerItemId?: string;
      publishedAt: number;
      quoteCount?: number;
      relevanceReason?: string;
      replyCount?: number;
      repostCount?: number;
      retentionExpiresAt?: number;
      searchText: string;
      status: "new" | "saved" | "dismissed";
      title?: string;
      trackingSourceId?: Id<"trackingSources">;
      updatedAt: number;
      visibilityOverride?: "manually_restored";
      workspaceId: Id<"workspaces">;
      _id: Id<"mentions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "analysisState"
      | "analysisVersion"
      | "authorDisplayName"
      | "authorHandle"
      | "body"
      | "canonicalUrl"
      | "categoryId"
      | "commentCount"
      | "contentType"
      | "engagementScore"
      | "fallbackKey"
      | "feedState"
      | "firstSeenAt"
      | "language"
      | "lastMatchedAt"
      | "likeCount"
      | "platform"
      | "pointCount"
      | "priority"
      | "priorityReason"
      | "providerItemId"
      | "publishedAt"
      | "quoteCount"
      | "relevanceReason"
      | "replyCount"
      | "repostCount"
      | "retentionExpiresAt"
      | "searchText"
      | "status"
      | "title"
      | "trackingSourceId"
      | "updatedAt"
      | "visibilityOverride"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_retention_expires_at: ["retentionExpiresAt", "_creationTime"];
      by_status_and_published_at: ["status", "publishedAt", "_creationTime"];
      by_tracking_source_and_published_at: [
        "trackingSourceId",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_and_published_at: [
        "workspaceId",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_category_and_published_at: [
        "workspaceId",
        "categoryId",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_feed_state_and_published_at: [
        "workspaceId",
        "feedState",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_feed_state_engagement_and_published_at: [
        "workspaceId",
        "feedState",
        "engagementScore",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_feed_state_priority_and_published_at: [
        "workspaceId",
        "feedState",
        "priority",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_feed_state_priority_engagement_and_published_at: [
        "workspaceId",
        "feedState",
        "priority",
        "engagementScore",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_platform_and_published_at: [
        "workspaceId",
        "platform",
        "publishedAt",
        "_creationTime",
      ];
      by_workspace_platform_content_fallback: [
        "workspaceId",
        "platform",
        "contentType",
        "fallbackKey",
        "_creationTime",
      ];
      by_workspace_platform_content_provider_item: [
        "workspaceId",
        "platform",
        "contentType",
        "providerItemId",
        "_creationTime",
      ];
      by_workspace_status_and_engagement: [
        "workspaceId",
        "status",
        "engagementScore",
        "_creationTime",
      ];
      by_workspace_status_and_published_at: [
        "workspaceId",
        "status",
        "publishedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {
      search_body: {
        searchField: "searchText";
        filterFields:
          | "categoryId"
          | "feedState"
          | "platform"
          | "priority"
          | "status"
          | "workspaceId";
      };
    };
    vectorIndexes: {};
  };
  onboardingResearch: {
    document: {
      completedAt?: number;
      createdAt: number;
      errorCode?: string;
      filteringContext?: string;
      filteringGuidelines?: string;
      inputFingerprint: string;
      manualDescription?: string;
      startedAt: number;
      status: "running" | "completed" | "failed";
      suggestionsJson?: string;
      updatedAt: number;
      websiteUrl?: string;
      workspaceId: Id<"workspaces">;
      _id: Id<"onboardingResearch">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "createdAt"
      | "errorCode"
      | "filteringContext"
      | "filteringGuidelines"
      | "inputFingerprint"
      | "manualDescription"
      | "startedAt"
      | "status"
      | "suggestionsJson"
      | "updatedAt"
      | "websiteUrl"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_workspace: ["workspaceId", "_creationTime"];
      by_workspace_and_updated_at: [
        "workspaceId",
        "updatedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  providerMetricBuckets: {
    document: {
      bucketEndAt: number;
      bucketStartAt: number;
      failureCount: number;
      granularity: "hour" | "day";
      inputItemCount: number;
      latencyMaxMs: number;
      latencyTotalMs: number;
      operation: string;
      outputItemCount: number;
      provider:
        | "x"
        | "reddit_posts"
        | "reddit_comments"
        | "hacker_news"
        | "deepseek"
        | "resend"
        | "creem"
        | "tinyfish";
      rateLimitedCount: number;
      requestCount: number;
      retryCount: number;
      successCount: number;
      updatedAt: number;
      _id: Id<"providerMetricBuckets">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "bucketEndAt"
      | "bucketStartAt"
      | "failureCount"
      | "granularity"
      | "inputItemCount"
      | "latencyMaxMs"
      | "latencyTotalMs"
      | "operation"
      | "outputItemCount"
      | "provider"
      | "rateLimitedCount"
      | "requestCount"
      | "retryCount"
      | "successCount"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_bucket_start: ["bucketStartAt", "_creationTime"];
      by_granularity_and_bucket: [
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
      by_provider_granularity_and_bucket: [
        "provider",
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
      by_provider_operation_granularity_and_bucket: [
        "provider",
        "operation",
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  providerRuns: {
    document: {
      attempt: number;
      createdAt: number;
      durationMs?: number;
      errorCode?: string;
      errorMessage?: string;
      finishedAt?: number;
      idempotencyKey: string;
      inputCount: number;
      operation: string;
      outputCount: number;
      provider:
        | "x"
        | "reddit_posts"
        | "reddit_comments"
        | "hacker_news"
        | "deepseek"
        | "resend"
        | "creem"
        | "tinyfish";
      startedAt: number;
      status: "running" | "succeeded" | "failed";
      trackingSourceId?: Id<"trackingSources">;
      trigger: "scheduled" | "manual" | "webhook" | "retry";
      updatedAt: number;
      workspaceId?: Id<"workspaces">;
      _id: Id<"providerRuns">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "attempt"
      | "createdAt"
      | "durationMs"
      | "errorCode"
      | "errorMessage"
      | "finishedAt"
      | "idempotencyKey"
      | "inputCount"
      | "operation"
      | "outputCount"
      | "provider"
      | "startedAt"
      | "status"
      | "trackingSourceId"
      | "trigger"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_provider_operation_and_started_at: [
        "provider",
        "operation",
        "startedAt",
        "_creationTime",
      ];
      by_provider_status_and_started_at: [
        "provider",
        "status",
        "startedAt",
        "_creationTime",
      ];
      by_status_and_started_at: ["status", "startedAt", "_creationTime"];
      by_tracking_source_and_started_at: [
        "trackingSourceId",
        "startedAt",
        "_creationTime",
      ];
      by_workspace_and_started_at: [
        "workspaceId",
        "startedAt",
        "_creationTime",
      ];
      by_workspace_provider_operation_status_and_started_at: [
        "workspaceId",
        "provider",
        "operation",
        "status",
        "startedAt",
        "_creationTime",
      ];
      by_workspace_status_and_started_at: [
        "workspaceId",
        "status",
        "startedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  savedViews: {
    document: {
      createdAt: number;
      deletedAt?: number;
      filters: {
        categoryIds?: Array<Id<"categories">>;
        keywordIds?: Array<Id<"keywords">>;
        mentionStatuses?: Array<"new" | "saved" | "dismissed">;
        platforms?: Array<"x" | "reddit" | "hacker_news">;
        priorities?: Array<"low" | "medium" | "high">;
        publishedAfter?: number;
        publishedBefore?: number;
      };
      icon: string;
      name: string;
      normalizedName: string;
      position: number;
      sort: "newest" | "oldest" | "most_engaged";
      updatedAt: number;
      userId: Id<"users">;
      workspaceId: Id<"workspaces">;
      _id: Id<"savedViews">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "deletedAt"
      | "filters"
      | "filters.categoryIds"
      | "filters.keywordIds"
      | "filters.mentionStatuses"
      | "filters.platforms"
      | "filters.priorities"
      | "filters.publishedAfter"
      | "filters.publishedBefore"
      | "icon"
      | "name"
      | "normalizedName"
      | "position"
      | "sort"
      | "updatedAt"
      | "userId"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_workspace_and_updated_at: [
        "workspaceId",
        "updatedAt",
        "_creationTime",
      ];
      by_workspace_deleted_and_updated_at: [
        "workspaceId",
        "deletedAt",
        "updatedAt",
        "_creationTime",
      ];
      by_workspace_user_and_updated_at: [
        "workspaceId",
        "userId",
        "updatedAt",
        "_creationTime",
      ];
      by_workspace_user_deleted_and_position: [
        "workspaceId",
        "userId",
        "deletedAt",
        "position",
        "_creationTime",
      ];
      by_workspace_user_normalized_name_and_deleted_at: [
        "workspaceId",
        "userId",
        "normalizedName",
        "deletedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  subscriptions: {
    document: {
      cancelAtPeriodEnd: boolean;
      canceledAt?: number;
      createdAt: number;
      currentPeriodEnd: number;
      currentPeriodStart: number;
      endedAt?: number;
      entitlementStatus: "active" | "inactive";
      lastSyncedAt: number;
      monitoringAccessReconciledAt?: number;
      planId: "starter" | "growth" | "scale";
      provider: "creem";
      providerCustomerId: string;
      providerPriceId?: string;
      providerSubscriptionId: string;
      status: string;
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"subscriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "cancelAtPeriodEnd"
      | "canceledAt"
      | "createdAt"
      | "currentPeriodEnd"
      | "currentPeriodStart"
      | "endedAt"
      | "entitlementStatus"
      | "lastSyncedAt"
      | "monitoringAccessReconciledAt"
      | "planId"
      | "provider"
      | "providerCustomerId"
      | "providerPriceId"
      | "providerSubscriptionId"
      | "status"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_created_at: ["createdAt", "_creationTime"];
      by_entitlement_reconciled_at_and_period_end: [
        "entitlementStatus",
        "monitoringAccessReconciledAt",
        "currentPeriodEnd",
        "_creationTime",
      ];
      by_plan_and_status: ["planId", "status", "_creationTime"];
      by_provider_customer: ["provider", "providerCustomerId", "_creationTime"];
      by_provider_subscription: [
        "provider",
        "providerSubscriptionId",
        "_creationTime",
      ];
      by_status_and_period_end: ["status", "currentPeriodEnd", "_creationTime"];
      by_workspace: ["workspaceId", "_creationTime"];
      by_workspace_and_entitlement: [
        "workspaceId",
        "entitlementStatus",
        "_creationTime",
      ];
      by_workspace_and_last_synced_at: [
        "workspaceId",
        "lastSyncedAt",
        "_creationTime",
      ];
      by_workspace_plan_and_last_synced_at: [
        "workspaceId",
        "planId",
        "lastSyncedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  systemMetricBuckets: {
    document: {
      bucketEndAt: number;
      bucketStartAt: number;
      count: number;
      granularity: "hour" | "day";
      maximum: number;
      metric: string;
      minimum: number;
      scope: "global" | "workspace";
      sum: number;
      updatedAt: number;
      value: number;
      workspaceId?: Id<"workspaces">;
      _id: Id<"systemMetricBuckets">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "bucketEndAt"
      | "bucketStartAt"
      | "count"
      | "granularity"
      | "maximum"
      | "metric"
      | "minimum"
      | "scope"
      | "sum"
      | "updatedAt"
      | "value"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_granularity_and_bucket: [
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
      by_metric_granularity_and_bucket: [
        "metric",
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
      by_metric_scope_workspace_granularity_and_bucket: [
        "metric",
        "scope",
        "workspaceId",
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
      by_scope_granularity_and_bucket: [
        "scope",
        "granularity",
        "bucketStartAt",
        "_creationTime",
      ];
      by_workspace_and_bucket: [
        "workspaceId",
        "bucketStartAt",
        "_creationTime",
      ];
      by_workspace_metric_and_bucket: [
        "workspaceId",
        "metric",
        "bucketStartAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  trackingProviderPages: {
    document: {
      batchIndex: number;
      createdAt: number;
      durationMs: number;
      finalize: boolean;
      generation: number;
      providerOutputCount: number;
      providerQuery: string;
      ready: boolean;
      resultJson: string;
      startPosition: number;
      trackingSourceId: Id<"trackingSources">;
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"trackingProviderPages">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "batchIndex"
      | "createdAt"
      | "durationMs"
      | "finalize"
      | "generation"
      | "providerOutputCount"
      | "providerQuery"
      | "ready"
      | "resultJson"
      | "startPosition"
      | "trackingSourceId"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_source_and_created_at: [
        "trackingSourceId",
        "createdAt",
        "_creationTime",
      ];
      by_source_generation_and_batch: [
        "trackingSourceId",
        "generation",
        "batchIndex",
        "_creationTime",
      ];
      by_source_ready_and_batch: [
        "trackingSourceId",
        "ready",
        "batchIndex",
        "_creationTime",
      ];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  trackingSources: {
    document: {
      backoffMs: number;
      backoffUntil?: number;
      checkpointVersion: number;
      consecutiveFailures: number;
      createdAt: number;
      deletedAt?: number;
      deletionPausedAt?: number;
      inProgressCursor?: string;
      inProgressPage?: number;
      inProgressWindowEndAt?: number;
      inProgressWindowStartAt?: number;
      intervalMs: number;
      keywordId: Id<"keywords">;
      lastError?: string;
      lastRunAt?: number;
      lastSuccessAt?: number;
      leaseExpiresAt?: number;
      leaseToken?: string;
      leaseVersion: number;
      nextRunAt: number;
      pauseReason?: "paid" | "user" | "capacity" | "usage" | "config";
      providerQuery: string;
      settledWatermarkAt?: number;
      settledWatermarkItemId?: string;
      sourceType: "x" | "reddit_posts" | "reddit_comments" | "hacker_news";
      status: "active" | "paused" | "error" | "deleted";
      totalFailures: number;
      updatedAt: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"trackingSources">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "backoffMs"
      | "backoffUntil"
      | "checkpointVersion"
      | "consecutiveFailures"
      | "createdAt"
      | "deletedAt"
      | "deletionPausedAt"
      | "inProgressCursor"
      | "inProgressPage"
      | "inProgressWindowEndAt"
      | "inProgressWindowStartAt"
      | "intervalMs"
      | "keywordId"
      | "lastError"
      | "lastRunAt"
      | "lastSuccessAt"
      | "leaseExpiresAt"
      | "leaseToken"
      | "leaseVersion"
      | "nextRunAt"
      | "pauseReason"
      | "providerQuery"
      | "settledWatermarkAt"
      | "settledWatermarkItemId"
      | "sourceType"
      | "status"
      | "totalFailures"
      | "updatedAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_keyword_and_source_type: ["keywordId", "sourceType", "_creationTime"];
      by_keyword_and_status: ["keywordId", "status", "_creationTime"];
      by_source_type_status_and_lease_expires_at: [
        "sourceType",
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
      by_source_type_status_and_next_run_at: [
        "sourceType",
        "status",
        "nextRunAt",
        "_creationTime",
      ];
      by_status_and_lease_expires_at: [
        "status",
        "leaseExpiresAt",
        "_creationTime",
      ];
      by_status_and_next_run_at: ["status", "nextRunAt", "_creationTime"];
      by_status_and_updated_at: ["status", "updatedAt", "_creationTime"];
      by_workspace_and_created_at: [
        "workspaceId",
        "createdAt",
        "_creationTime",
      ];
      by_workspace_source_type_and_status: [
        "workspaceId",
        "sourceType",
        "status",
        "_creationTime",
      ];
      by_workspace_status_and_created_at: [
        "workspaceId",
        "status",
        "createdAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  usageCycles: {
    document: {
      closedAt?: number;
      createdAt: number;
      idempotencyKey: string;
      keywordLimit: number;
      mentionLimit: number;
      mentionsUsed: number;
      periodEndAt: number;
      periodStartAt: number;
      planSnapshot: {
        keywordLimit: number;
        mentionLimit: number;
        planId: "starter" | "growth" | "scale";
      };
      status: "open" | "closed";
      subscriptionId?: Id<"subscriptions">;
      updatedAt: number;
      warning100SentAt?: number;
      warning80SentAt?: number;
      workspaceId: Id<"workspaces">;
      _id: Id<"usageCycles">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "closedAt"
      | "createdAt"
      | "idempotencyKey"
      | "keywordLimit"
      | "mentionLimit"
      | "mentionsUsed"
      | "periodEndAt"
      | "periodStartAt"
      | "planSnapshot"
      | "planSnapshot.keywordLimit"
      | "planSnapshot.mentionLimit"
      | "planSnapshot.planId"
      | "status"
      | "subscriptionId"
      | "updatedAt"
      | "warning80SentAt"
      | "warning100SentAt"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_idempotency_key: ["idempotencyKey", "_creationTime"];
      by_status_and_period_end: ["status", "periodEndAt", "_creationTime"];
      by_subscription_and_period_start: [
        "subscriptionId",
        "periodStartAt",
        "_creationTime",
      ];
      by_workspace_and_period_start: [
        "workspaceId",
        "periodStartAt",
        "_creationTime",
      ];
      by_workspace_status_and_period_end: [
        "workspaceId",
        "status",
        "periodEndAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      clerkUserId: string;
      createdAt: number;
      deletedAt?: number;
      disabledAt?: number;
      email?: string;
      imageUrl?: string;
      name?: string;
      personalWorkspaceId?: Id<"workspaces">;
      tokenIdentifier: string;
      updatedAt: number;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clerkUserId"
      | "createdAt"
      | "deletedAt"
      | "disabledAt"
      | "email"
      | "imageUrl"
      | "name"
      | "personalWorkspaceId"
      | "tokenIdentifier"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clerk_user_id: ["clerkUserId", "_creationTime"];
      by_created_at: ["createdAt", "_creationTime"];
      by_deleted_at: ["deletedAt", "_creationTime"];
      by_disabled_at: ["disabledAt", "_creationTime"];
      by_personal_workspace: ["personalWorkspaceId", "_creationTime"];
      by_token_identifier: ["tokenIdentifier", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  workspaceMembers: {
    document: {
      createdAt: number;
      revokedAt?: number;
      role: "owner";
      updatedAt: number;
      userId: Id<"users">;
      workspaceId: Id<"workspaces">;
      _id: Id<"workspaceMembers">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "revokedAt"
      | "role"
      | "updatedAt"
      | "userId"
      | "workspaceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
      by_user_and_revoked_at: ["userId", "revokedAt", "_creationTime"];
      by_workspace: ["workspaceId", "_creationTime"];
      by_workspace_and_user: ["workspaceId", "userId", "_creationTime"];
      by_workspace_role_and_revoked_at: [
        "workspaceId",
        "role",
        "revokedAt",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  workspaces: {
    document: {
      createdAt: number;
      deletedAt?: number;
      deletionPendingAt?: number;
      filteringContext?: string;
      filteringGuidelines?: string;
      kind: "personal";
      lastMentionAt?: number;
      name: string;
      normalizedName: string;
      ownerUserId: Id<"users">;
      updatedAt: number;
      _id: Id<"workspaces">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "deletedAt"
      | "deletionPendingAt"
      | "filteringContext"
      | "filteringGuidelines"
      | "kind"
      | "lastMentionAt"
      | "name"
      | "normalizedName"
      | "ownerUserId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_created_at: ["createdAt", "_creationTime"];
      by_deleted_at: ["deletedAt", "_creationTime"];
      by_deletion_pending_at: ["deletionPendingAt", "_creationTime"];
      by_kind_and_created_at: ["kind", "createdAt", "_creationTime"];
      by_last_mention_at: ["lastMentionAt", "_creationTime"];
      by_owner_and_deleted_at: ["ownerUserId", "deletedAt", "_creationTime"];
      by_owner_and_kind: ["ownerUserId", "kind", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
