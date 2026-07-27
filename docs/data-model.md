# Convex data model

The canonical schema is `packages/backend/convex/schema.ts`. It defines 25 validated tables. This document states each table's purpose, application invariants, and every declared index.

## Conventions

- IDs are Convex document IDs. Cross-table fields use `v.id(...)`.
- Times are numeric Unix milliseconds.
- Most customer product rows carry `workspaceId`; authorization derives that workspace from the authenticated user.
- `deletedAt` denotes soft deletion. Product queries must also respect the table's status field when one exists.
- Convex indexes accelerate lookups but are not SQL-style unique constraints. Mutations enforce logical uniqueness and use `.unique()` where the data model requires at most one row.
- Durable workflows persist the status, retry, lease, and idempotency fields their implementation needs. Tracking and email actively use leases; billing currently retries pending events without using its optional lease fields; digest runs use local-date/idempotency guards without a lease.
- Idempotency indexes are part of the correctness boundary, not merely an optimization.
- The current persisted tenancy vocabulary is intentionally narrow: workspace kind is only `personal`; membership role is only `owner`.

## Identity and tenancy

### `users`

**Purpose.** Maps Clerk identities to Astreex users and points each user at the personal workspace used by customer authorization.

**Invariants.** `clerkUserId` and `tokenIdentifier` identify the same active account; bootstrap rejects a split identity. Disabled or soft-deleted users cannot authorize. A usable customer account has `personalWorkspaceId` pointing to an active personal workspace owned by that user.

**Indexes.**

- `by_clerk_user_id` (`clerkUserId`) — bootstrap/account lookup by Clerk subject.
- `by_token_identifier` (`tokenIdentifier`) — primary authenticated request lookup from the Convex identity.
- `by_personal_workspace` (`personalWorkspaceId`) — reverse lookup and integrity/maintenance checks for the personal workspace pointer.
- `by_created_at` (`createdAt`) — chronological user administration/metrics.
- `by_disabled_at` (`disabledAt`) — find disabled versus enabled accounts.
- `by_deleted_at` (`deletedAt`) — find soft-deleted versus active accounts.

### `workspaces`

**Purpose.** Tenant root for all customer-owned data.

**Invariants.** Current rows have `kind = "personal"`; `ownerUserId` is the owning `users` row; `normalizedName` is the lowercase normalized workspace name; `deletedAt` is a soft-delete marker. Current authorization requires owner, user pointer, and membership to agree.

**Indexes.**

- `by_owner_and_kind` (`ownerUserId`, `kind`) — find the owner's single personal workspace during bootstrap/repair.
- `by_owner_and_deleted_at` (`ownerUserId`, `deletedAt`) — list an owner's active/deleted workspaces.
- `by_kind_and_created_at` (`kind`, `createdAt`) — chronological reporting by workspace kind.
- `by_created_at` (`createdAt`) — global workspace growth/administration.
- `by_deleted_at` (`deletedAt`) — active/deleted workspace scans.

### `workspaceMembers`

**Purpose.** Separates tenant membership from workspace ownership so a future multi-user model has an explicit authorization relation.

**Invariants.** Current role is only `owner`. The active personal owner membership must match both `workspaces.ownerUserId` and `users.personalWorkspaceId`; `revokedAt` removes access. The logical workspace/user pair is singular.

**Indexes.**

- `by_user` (`userId`) — list memberships for a user.
- `by_workspace` (`workspaceId`) — list members of a workspace.
- `by_workspace_and_user` (`workspaceId`, `userId`) — exact authorization lookup and logical uniqueness boundary.
- `by_user_and_revoked_at` (`userId`, `revokedAt`) — active/revoked membership lookup for a user.
- `by_workspace_role_and_revoked_at` (`workspaceId`, `role`, `revokedAt`) — active members by role; future role-aware administration.

## Billing and usage

### `subscriptions`

**Purpose.** Persisted Creem subscription and entitlement state for a workspace.

**Invariants.** `provider` is always `creem`; provider customer/subscription IDs map external objects to one workspace; `status` preserves any non-empty provider value; `entitlementStatus` is the application projection (`active`/`inactive`). Effective entitlement also requires the current time to remain inside the persisted period, so scheduled-cancel access ends no later than `currentPeriodEnd` even before a terminal webhook is stored.

**Indexes.**

- `by_workspace` (`workspaceId`) — customer billing overview and deletion guard.
- `by_workspace_and_entitlement` (`workspaceId`, `entitlementStatus`) — current entitlement lookup within a tenant.
- `by_provider_customer` (`provider`, `providerCustomerId`) — map Creem customer events/portal requests.
- `by_provider_subscription` (`provider`, `providerSubscriptionId`) — map and deduplicate Creem subscription updates.
- `by_status_and_period_end` (`status`, `currentPeriodEnd`) — status/expiry maintenance.
- `by_entitlement_and_period_end` (`entitlementStatus`, `currentPeriodEnd`) — expire/reconcile effective entitlements.
- `by_plan_and_status` (`planId`, `status`) — plan/status reporting.
- `by_created_at` (`createdAt`) — chronological billing administration.

### `billingCheckouts`

**Purpose.** Durable record of customer-initiated Creem checkout sessions.

**Invariants.** A caller-supplied idempotency key must not be reused across workspaces. Each row records the derived workspace and requesting user, one Creem session ID, requested plan, expiry, and optional URL. `provider` is always `creem`.

**Indexes.**

- `by_idempotency_key` (`idempotencyKey`) — replay-safe checkout creation and conflict detection.
- `by_provider_session` (`provider`, `providerCheckoutSessionId`) — reconcile checkout webhooks/provider objects.
- `by_workspace_and_created_at` (`workspaceId`, `createdAt`) — tenant checkout history.
- `by_user_and_created_at` (`requestedByUserId`, `createdAt`) — requester history/audit support.
- `by_status_and_expires_at` (`status`, `expiresAt`) — expire open sessions.
- `by_status_and_created_at` (`status`, `createdAt`) — operational status queues/reporting.

### `billingEvents`

**Purpose.** Durable, retryable inbox for verified Creem webhook events.

**Invariants.** `(provider, providerEventId)` is the deduplication key; `payloadJson` retains the verified raw event for deterministic processing; status supports `pending`/`leased`/`processed`/`dead`. The current processor works directly from `pending`, records attempts/next retry, and does not use the optional lease fields. `provider` is always `creem`.

**Indexes.**

- `by_provider_event` (`provider`, `providerEventId`) — webhook idempotency.
- `by_status_and_next_attempt_at` (`status`, `nextAttemptAt`) — claim due retries.
- `by_status_and_lease_expires_at` (`status`, `leaseExpiresAt`) — recover abandoned leases.
- `by_provider_object_and_received_at` (`provider`, `objectId`, `receivedAt`) — order events for one provider object.
- `by_event_type_and_received_at` (`eventType`, `receivedAt`) — event-type operations/metrics.
- `by_status_and_received_at` (`status`, `receivedAt`) — queue age and dead-letter operations.
- `by_workspace_status_and_received_at` (`workspaceId`, `status`, `receivedAt`) — bounded deletion-readiness checks for unresolved tenant events.

### `usageCycles`

**Purpose.** Workspace billing-period usage ledger and period plan-limit snapshot.

**Invariants.** `planSnapshot`, `keywordLimit`, and `mentionLimit` represent the limits governing that cycle; a same-period upgrade may replace those fields while preserving usage and warning timestamps. `mentionsUsed` is non-negative; only `open` cycles govern current ingestion. `idempotencyKey` prevents duplicate cycle creation. Warning timestamps record 80% and 100% notifications. A cycle may link to a specific subscription.

**Indexes.**

- `by_idempotency_key` (`idempotencyKey`) — cycle creation/reconciliation idempotency.
- `by_workspace_and_period_start` (`workspaceId`, `periodStartAt`) — tenant usage history.
- `by_workspace_status_and_period_end` (`workspaceId`, `status`, `periodEndAt`) — find the current open cycle for customer operations.
- `by_status_and_period_end` (`status`, `periodEndAt`) — close/roll global due cycles.
- `by_subscription_and_period_start` (`subscriptionId`, `periodStartAt`) — link subscription periods to cycles.

## Monitoring and ingestion

### `keywords`

**Purpose.** Customer tracking terms and selected customer-facing platforms.

**Invariants.** Active, non-deleted rows have a tenant-local unique `normalizedPhrase`; `platforms` contains one or more of `x`, `reddit`, `hacker_news`; `createdByUserId` is the authorized creator. Deletion is soft (`status = "deleted"` plus `deletedAt`). Pausing records `pausedAt` and pauses child sources.

**Indexes.**

- `by_workspace_and_normalized_phrase` (`workspaceId`, `normalizedPhrase`) — tenant-local duplicate detection.
- `by_workspace_status_and_created_at` (`workspaceId`, `status`, `createdAt`) — bounded live configuration reads select active and paused rows without scanning deleted tombstones.
- `by_workspace_and_updated_at` (`workspaceId`, `updatedAt`) — complete tenant history and maintenance ordering, including tombstones.
- `by_creator_and_created_at` (`createdByUserId`, `createdAt`) — creator history/audit support.
- `by_status_and_updated_at` (`status`, `updatedAt`) — global lifecycle operations/metrics.

### `trackingSources`

**Purpose.** Provider-specific scheduler state for a keyword. Reddit is split into post and comment sources; X and Hacker News each use one source.

**Invariants.** Logical uniqueness is one row per `(keywordId, sourceType)` after duplicate cleanup. `workspaceId` must match the parent keyword. Status, pause reason, next run, exponential backoff, cursor/page/window progress, settled watermark, checkpoint/lease versions, and lease token/expiry form the durable scheduler state. Soft-deleted sources cannot be claimed.

**Indexes.**

- `by_keyword_and_source_type` (`keywordId`, `sourceType`) — exact source lookup/deduplication.
- `by_keyword_and_status` (`keywordId`, `status`) — manage all sources for one keyword by lifecycle.
- `by_workspace_status_and_created_at` (`workspaceId`, `status`, `createdAt`) — tenant source state and product monitoring status.
- `by_workspace_source_type_and_status` (`workspaceId`, `sourceType`, `status`) — tenant/provider-specific source management.
- `by_status_and_next_run_at` (`status`, `nextRunAt`) — global due-work claim order.
- `by_source_type_status_and_next_run_at` (`sourceType`, `status`, `nextRunAt`) — provider-specific due-work claims and budgets.
- `by_status_and_lease_expires_at` (`status`, `leaseExpiresAt`) — recover abandoned leases.
- `by_source_type_status_and_lease_expires_at` (`sourceType`, `status`, `leaseExpiresAt`) — provider-specific lease recovery.
- `by_status_and_updated_at` (`status`, `updatedAt`) — stale/error lifecycle operations and metrics.

### `mentions`

**Purpose.** Canonical normalized external posts/comments/tweets matched into a workspace.

**Invariants.** A mention belongs to exactly one workspace and platform. Deduplication prefers `(workspaceId, platform, contentType, providerItemId)` and falls back to the equivalent tuple with `fallbackKey`. `canonicalUrl` must be a credential-free HTTP(S) URL before customer return. `searchText` is normalized searchable content. `status` is customer workflow state; `analysisState` is categorization workflow state. `firstSeenAt` is creation observation time and `lastMatchedAt` advances when rediscovered. Customer pagination uses one bounded 250-row database scan to fill filtered pages across sparse gaps and carries unmatched continuation state in a workspace/filter-bound cursor.

**Indexes.**

- `by_workspace_platform_content_provider_item` (`workspaceId`, `platform`, `contentType`, `providerItemId`) — primary tenant-scoped provider dedupe.
- `by_workspace_platform_content_fallback` (`workspaceId`, `platform`, `contentType`, `fallbackKey`) — fallback dedupe when no provider item ID exists.
- `by_workspace_status_and_published_at` (`workspaceId`, `status`, `publishedAt`) — customer status feeds sorted by time.
- `by_workspace_status_and_engagement` (`workspaceId`, `status`, `engagementScore`) — customer feeds sorted by engagement.
- `by_workspace_engagement_and_published_at` (`workspaceId`, `engagementScore`, `publishedAt`) — complete tenant engagement feed with publication-time tie-breaking.
- `by_workspace_and_published_at` (`workspaceId`, `publishedAt`) — complete tenant timeline and digest windows.
- `by_workspace_category_and_published_at` (`workspaceId`, `categoryId`, `publishedAt`) — category filters and reassignment.
- `by_workspace_platform_and_published_at` (`workspaceId`, `platform`, `publishedAt`) — platform filters.
- `by_tracking_source_and_published_at` (`trackingSourceId`, `publishedAt`) — source lineage and cleanup/debugging.
- `by_status_and_published_at` (`status`, `publishedAt`) — global workflow/metrics scans.
- Search index `search_body` on `searchText`, filtered by `workspaceId`, `status`, `platform`, and `categoryId` — tenant-filtered full-text search.

### `mentionKeywordMatches`

**Purpose.** Many-to-many relation between canonical mentions and keywords that matched them.

**Invariants.** The logical `(mentionId, keywordId)` pair is unique. Mention, keyword, optional tracking source, and row `workspaceId` must all describe the same tenant. Match kind records exact/phrase/provider attribution.

**Indexes.**

- `by_mention_and_keyword` (`mentionId`, `keywordId`) — pair dedupe and keyword details for a mention.
- `by_keyword_and_mention` (`keywordId`, `mentionId`) — mentions matched by a keyword.
- `by_workspace_and_mention` (`workspaceId`, `mentionId`) — tenant-safe keyword formatting for a mention.
- `by_workspace_keyword_and_created_at` (`workspaceId`, `keywordId`, `createdAt`) — tenant keyword history.
- `by_tracking_source_and_created_at` (`trackingSourceId`, `createdAt`) — source attribution and operational review.

## Classification and customer organization

### `categories`

**Purpose.** Workspace classification catalog containing default system categories and customer-created categories.

**Invariants.** Active names are tenant-local unique by `normalizedName`. System keys are the fixed approved set. The system `Other` category is an immutable enabled fallback and cannot be deleted; deleting another category first reassigns its mentions to `Other`. Deletion is soft. System category policy controls which names/enabled states may change.

**Indexes.**

- `by_workspace_and_system_key` (`workspaceId`, `systemKey`) — bootstrap and required-system-category lookup.
- `by_workspace_normalized_name_and_deleted_at` (`workspaceId`, `normalizedName`, `deletedAt`) — active tenant-local name uniqueness.
- `by_workspace_deleted_enabled_and_sort_order` (`workspaceId`, `deletedAt`, `enabled`, `sortOrder`) — active enabled catalog in display order.
- `by_workspace_and_sort_order` (`workspaceId`, `sortOrder`) — complete workspace catalog ordering and invariant checks.

### `savedViews`

**Purpose.** User-owned persisted mention filter/sort presets within a workspace.

**Invariants.** Ownership is both `workspaceId` and `userId`. Active names are unique per workspace/user. Referenced category/keyword IDs must be active and belong to the same workspace at write time. Positions are contiguous after reorder/delete. `All Mentions` is synthetic and must never be stored, changed, reordered away from first, or deleted. Deletion is soft.

**Indexes.**

- `by_workspace_user_normalized_name_and_deleted_at` (`workspaceId`, `userId`, `normalizedName`, `deletedAt`) — active per-user name uniqueness.
- `by_workspace_user_deleted_and_position` (`workspaceId`, `userId`, `deletedAt`, `position`) — current ordered view list.
- `by_workspace_user_and_updated_at` (`workspaceId`, `userId`, `updatedAt`) — per-user change history/synchronization.
- `by_workspace_and_updated_at` (`workspaceId`, `updatedAt`) — tenant-wide maintenance and future collaboration migration.

### `categorizationJobs`

**Purpose.** Durable one-mention categorization work queue.

**Invariants.** Each job targets one `mentionId` in the same workspace. `idempotencyKey` prevents duplicate work. Status is `pending`, `leased`, `completed`, or `dead`; attempts cannot exceed `maxAttempts`; leases and next retry coordinate recovery. `model` records the categorizer version/provider selection.

**Indexes.**

- `by_mention` (`mentionId`) — find categorization history/current work for a mention.
- `by_idempotency_key` (`idempotencyKey`) — enqueue idempotency.
- `by_status_and_next_attempt_at` (`status`, `nextAttemptAt`) — claim due jobs.
- `by_status_and_lease_expires_at` (`status`, `leaseExpiresAt`) — recover abandoned jobs.
- `by_workspace_status_and_created_at` (`workspaceId`, `status`, `createdAt`) — tenant queue state.
- `by_workspace_and_created_at` (`workspaceId`, `createdAt`) — tenant categorization history.
- `by_model_status_and_created_at` (`model`, `status`, `createdAt`) — model health and migration operations.

## Digest and email

### `digestPreferences`

**Purpose.** Per-workspace/per-user daily digest schedule.

**Invariants.** The logical `(workspaceId, userId)` pair is singular. Hour is 0–23, minute is 0–59, mention limit is 1–100, timezone must be a valid IANA timezone, and `nextRunAt` is deterministically derived from local schedule. Bootstrap creates a default enabled 09:00 UTC preference.

**Indexes.**

- `by_workspace_and_user` (`workspaceId`, `userId`) — exact customer settings lookup and uniqueness boundary.
- `by_user` (`userId`) — all digest preferences for a user/future tenancy.
- `by_enabled_and_next_run_at` (`enabled`, `nextRunAt`) — global due digest claims.
- `by_workspace_enabled_and_next_run_at` (`workspaceId`, `enabled`, `nextRunAt`) — tenant due-state/maintenance.
- `by_workspace_and_updated_at` (`workspaceId`, `updatedAt`) — tenant settings changes.

### `digestRuns`

**Purpose.** Durable record of one scheduled digest window and its selected mention snapshot.

**Invariants.** `idempotencyKey` and `(digestPreferenceId, localDate)` prevent duplicate daily sends. `mentionIds` snapshots the selected top mentions for the exact window; `mentionCount` records the total candidate count before the configured limit is applied. Status progresses through processing/enqueued/sent or terminal skip/failure. An enqueued run may point to one outbox row.

**Indexes.**

- `by_idempotency_key` (`idempotencyKey`) — run creation idempotency.
- `by_preference_and_local_date` (`digestPreferenceId`, `localDate`) — one local-day run per preference.
- `by_workspace_and_scheduled_for` (`workspaceId`, `scheduledFor`) — tenant run history.
- `by_user_and_scheduled_for` (`userId`, `scheduledFor`) — recipient history.
- `by_status_and_scheduled_for` (`status`, `scheduledFor`) — due/stuck workflow operations.
- `by_status_and_created_at` (`status`, `createdAt`) — queue age and reporting.
- `by_outbox` (`outboxId`) — reverse link from email delivery to digest run.

### `emailOutbox`

**Purpose.** Durable Resend delivery outbox containing the exact rendered email payload.

**Invariants.** `idempotencyKey` prevents duplicate sends; `payloadFingerprint` detects key reuse with different content. Status is `pending`, `leased`, `sent`, or `dead`; attempts, retry time, and lease fields make delivery recoverable. `provider` is `resend`. Provider message ID links delivery webhooks, while `lastProviderEventAt`/ID protect against stale event regression.

**Indexes.**

- `by_idempotency_key` (`idempotencyKey`) — enqueue/send idempotency and fingerprint conflict detection.
- `by_status_and_next_attempt_at` (`status`, `nextAttemptAt`) — claim due sends.
- `by_status_and_lease_expires_at` (`status`, `leaseExpiresAt`) — recover abandoned delivery leases.
- `by_workspace_status_and_lease_expires_at` (`workspaceId`, `status`, `leaseExpiresAt`) — bounded deletion-readiness checks for live tenant leases.
- `by_provider_message` (`provider`, `providerMessageId`) — match Resend webhook events.
- `by_workspace_and_created_at` (`workspaceId`, `createdAt`) — tenant email history.
- `by_digest_run` (`digestRunId`) — enforce/find the message for a digest run.
- `by_delivery_status_and_updated_at` (`deliveryStatus`, `updatedAt`) — delivery-state operations/metrics.
- `by_status_and_updated_at` (`status`, `updatedAt`) — outbox queue age/health.

### `emailWebhookEvents`

**Purpose.** Durable inbox for verified Resend/Svix delivery events.

**Invariants.** `(provider, eventId)` is the deduplication key. Each event has one provider message ID/type/time. Reconciliation applies events in provider-time order to an outbox row; stale events are marked `ignored_stale`; unmatched events remain retryable until dead. `provider` is `resend`.

**Indexes.**

- `by_provider_event` (`provider`, `eventId`) — webhook idempotency.
- `by_provider_message_and_created_at` (`providerMessageId`, `providerCreatedAt`) — chronological delivery event stream for a message.
- `by_status_and_next_attempt_at` (`status`, `nextAttemptAt`) — retry unmatched/failed reconciliation.
- `by_outbox_and_created_at` (`outboxId`, `providerCreatedAt`) — applied event history for an outbox row.
- `by_type_and_received_at` (`type`, `receivedAt`) — event-type metrics/operations.
- `by_status_and_received_at` (`status`, `receivedAt`) — inbox age and dead-letter operations.

## Product feedback and public content

### `featureRequests`

**Purpose.** Customer-submitted product feedback managed by the admin app.

**Invariants.** `workspaceId` and `createdByUserId` come from current-customer authorization. Customer listing is limited to the creator and rechecked against workspace. Only exact admins change status/admin note. `completedAt` is present only while completed and is preserved on repeated completion updates.

**Indexes.**

- `by_workspace_status_and_created_at` (`workspaceId`, `status`, `createdAt`) — tenant feedback by lifecycle.
- `by_workspace_and_created_at` (`workspaceId`, `createdAt`) — tenant history.
- `by_creator_and_created_at` (`createdByUserId`, `createdAt`) — “my requests” lookup.
- `by_status_and_created_at` (`status`, `createdAt`) — admin queue by status.
- `by_status_and_updated_at` (`status`, `updatedAt`) — admin change ordering/metrics.

### `changelogEntries`

**Purpose.** Global admin-authored changelog with public published read access.

**Invariants.** Slugs are validated and logically unique. Drafts use `requestedPublicationAt`; publishing moves it to `publishedAt` and clears the requested field; published entries must be unpublished before editing. Creator/updater Clerk IDs are exact admin subjects. Public listing returns fixed-size published summary pages without bodies; an indexed slug lookup returns at most one published body.

**Indexes.**

- `by_slug` (`slug`) — uniqueness check and route lookup support.
- `by_status_and_published_at` (`status`, `publishedAt`) — public published feed in date order.
- `by_status_and_requested_publication_at` (`status`, `requestedPublicationAt`) — draft scheduling/administration.
- `by_published_at` (`publishedAt`) — chronological publication operations.
- `by_status_and_updated_at` (`status`, `updatedAt`) — admin list by lifecycle/change time.
- `by_created_at` (`createdAt`) — creation history.

## Operations, metrics, deletion, and audit

### `providerRuns`

**Purpose.** One operational attempt for an external provider operation.

**Invariants.** `idempotencyKey` prevents duplicate attempt records; start/finish/duration/status/counts describe a single scheduled/manual/webhook/retry run. Workspace and tracking source are optional because some providers are global. Error fields must not contain secrets or raw credential-bearing payloads.

**Indexes.**

- `by_idempotency_key` (`idempotencyKey`) — run record idempotency.
- `by_provider_operation_and_started_at` (`provider`, `operation`, `startedAt`) — operation history and latency analysis.
- `by_provider_status_and_started_at` (`provider`, `status`, `startedAt`) — provider health/failures.
- `by_status_and_started_at` (`status`, `startedAt`) — global stuck/failure operations.
- `by_workspace_and_started_at` (`workspaceId`, `startedAt`) — tenant-correlated provider activity.
- `by_tracking_source_and_started_at` (`trackingSourceId`, `startedAt`) — scheduler source attempt history.

### `providerMetricBuckets`

**Purpose.** Hour/day rollups of provider request volume, latency, success/failure, retries, rate limits, and item counts.

**Invariants.** The logical bucket key is `(provider, operation, granularity, bucketStartAt)` with matching `bucketEndAt`. Counts are additive; max latency tracks the maximum; total latency supports averages.

**Indexes.**

- `by_provider_operation_granularity_and_bucket` (`provider`, `operation`, `granularity`, `bucketStartAt`) — exact rollup update and detailed metrics query.
- `by_provider_granularity_and_bucket` (`provider`, `granularity`, `bucketStartAt`) — provider-wide health over time.
- `by_granularity_and_bucket` (`granularity`, `bucketStartAt`) — admin aggregate range reads.
- `by_bucket_start` (`bucketStartAt`) — retention and chronological maintenance.

### `systemMetricBuckets`

**Purpose.** Generic global/workspace hour/day metric rollups, including mention volume and digest/email outcomes.

**Invariants.** The logical bucket key is `(metric, scope, workspaceId, granularity, bucketStartAt)`. Global scope normally omits `workspaceId`; workspace scope identifies one workspace. `count`, `sum`, `minimum`, `maximum`, and current `value` must describe the same metric aggregation.

**Indexes.**

- `by_metric_scope_workspace_granularity_and_bucket` (`metric`, `scope`, `workspaceId`, `granularity`, `bucketStartAt`) — exact rollup update/read.
- `by_metric_granularity_and_bucket` (`metric`, `granularity`, `bucketStartAt`) — metric trends across scopes.
- `by_workspace_metric_and_bucket` (`workspaceId`, `metric`, `bucketStartAt`) — tenant metric history.
- `by_granularity_and_bucket` (`granularity`, `bucketStartAt`) — admin aggregate range reads.

### `deletionJobs`

**Purpose.** Durable, retryable account-deletion operations and retained legacy review records.

**Invariants.** Current account jobs carry a workflow version, stable account resource key, monotonic generation/operation ID, stored Clerk subject, phase, purge stage, billing evidence, access/quiescence/data/identity/fence timestamps, attempts, and versioned lease. Only the current workflow version is dispatchable. Quiescence precedes purge, verified tenant-data absence precedes Clerk deletion, and the stale-token security fence precedes completion. Legacy jobs remain operator-review-only.

**Indexes.**

- `by_idempotency_key` (`idempotencyKey`) — one staged request per kind/workspace and safe retries.
- `by_resource_key_and_created_at` (`resourceKey`, `createdAt`) — latest operation generation for admin retry fencing.
- `by_status_and_next_attempt_at` (`status`, `nextAttemptAt`) — claim due deletion work.
- `by_status_and_lease_expires_at` (`status`, `leaseExpiresAt`) — recover abandoned deletion leases.
- `by_billing_guard_status_and_created_at` (`billingGuardStatus`, `createdAt`) — review blocked/unconfirmed jobs.
- `by_workspace_and_created_at` (`workspaceId`, `createdAt`) — workspace deletion history.
- `by_account_user_and_created_at` (`accountUserId`, `createdAt`) — account deletion history.
- `by_kind_status_and_created_at` (`kind`, `status`, `createdAt`) — operational queue/reporting by deletion type.

### `auditEvents`

**Purpose.** Append-only security and administrative event trail.

**Invariants.** Each row identifies actor type, action, outcome, target, time, and optional workspace/request metadata. User/admin actor identifiers are stored when available. `metadataJson` must contain bounded, non-secret context; audit insertion should not expose provider credentials or raw tokens.

**Indexes.**

- `by_workspace_and_created_at` (`workspaceId`, `createdAt`) — tenant audit timeline.
- `by_actor_user_and_created_at` (`actorUserId`, `createdAt`) — internal user activity timeline.
- `by_actor_clerk_and_created_at` (`actorClerkUserId`, `createdAt`) — Clerk subject/admin activity timeline.
- `by_action_and_created_at` (`action`, `createdAt`) — action-specific investigation/metrics.
- `by_target_and_created_at` (`targetType`, `targetId`, `createdAt`) — full history for a target object.
- `by_outcome_and_created_at` (`outcome`, `createdAt`) — denied/failure investigation.
- `by_request_id` (`requestId`) — correlate all events for one request.
- `by_created_at` (`createdAt`) — global audit chronology and retention.

## Cross-table invariants

- `users.personalWorkspaceId`, `workspaces.ownerUserId`, and the active owner `workspaceMembers` row must form one consistent personal-tenant triangle.
- Customer-owned child rows must carry the same `workspaceId` as their parent records; handlers recheck this for client-supplied IDs.
- `keywords` own `trackingSources`; deleting a keyword soft-deletes its sources and clears source leases/progress.
- `mentions` are canonical per workspace/provider identity; `mentionKeywordMatches` carries the many-to-many keyword attribution.
- Category deletion cannot leave a mention pointing at an unavailable category; mentions are reassigned to the workspace's required `Other` category first.
- Usage and entitlement are separate: an active subscription without a current valid usage cycle fails closed for paid monitoring capacity.
- Digest runs snapshot selected mentions before enqueueing one idempotent outbox message.
- Provider webhook tables are inboxes; provider call/run tables and metric buckets are observability records; they do not authorize customer access.
- Deletion authorization requires both a current personal-owner tenant authorization and a separately computed inactive-billing confirmation.
