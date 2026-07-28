# Authorization

Convex is the authoritative authorization layer. Next.js route guards are defense in depth and user-experience controls; no backend function relies on a page being hidden.

## Identity configuration

Clerk must provide a JWT template named `convex`. Convex accepts that token through `packages/backend/convex/auth.config.ts` with:

- `applicationID: "convex"`;
- `domain: CLERK_JWT_ISSUER_DOMAIN`.

`requireIdentity()` calls `ctx.auth.getUserIdentity()` and returns `UNAUTHENTICATED` when no valid identity is present.

## Customer tenant policy

The current customer policy is stricter than ordinary membership authorization. A request is allowed only when all of these are true:

1. a user exists at `users.by_token_identifier` for the JWT `tokenIdentifier`;
2. `users.clerkUserId` exactly equals the JWT `subject`;
3. the user has neither `disabledAt` nor `deletedAt`;
4. `users.personalWorkspaceId` is present;
5. that workspace exists and has no `deletedAt`;
6. a `workspaceMembers.by_workspace_and_user` row exists and has no `revokedAt`;
7. membership user/workspace IDs match the resolved records;
8. the workspace kind is `personal`;
9. the workspace owner is the authenticated user;
10. `users.personalWorkspaceId` equals the workspace ID;
11. the membership role is `owner`.

Failures are intentionally coarse:

- missing user or personal workspace: `BOOTSTRAP_REQUIRED`;
- missing/deleted workspace: `TENANT_NOT_FOUND`;
- identity mismatch, disabled/deleted account, missing/revoked/invalid membership, or non-owner/non-personal state: `FORBIDDEN`.

Customer-facing functions do not accept a tenant ID. They derive the current workspace from persisted identity state. Public actions perform the same policy through an internal query before external I/O; they do not trust an action argument.

### Wrapper meanings

- `authenticatedQuery`, `authenticatedMutation`, `authenticatedAction`: require a valid Clerk identity. Except for bootstrap, customer handlers using these wrappers immediately call `resolveCurrentCustomerAuthorization` before reading or writing tenant data.
- `customerQuery`, `customerMutation`: require identity and resolve the current customer tenant in the wrapper.
- `customerAction`: requires identity and resolves the current customer tenant through an internal query before the action handler runs.
- `adminQuery`, `adminMutation`, `adminAction`: require the exact configured admin Clerk subject.
- `publicQuery`: deliberately anonymous reads only. There is no `publicMutation` or `publicAction` alias.
- `internalQuery`, `internalMutation`, `internalAction`: not callable by clients.
- raw `httpAction`: reserved for signature-verified provider webhooks.

## Customer operation inventory

“Current tenant” below means the complete policy above, not merely a signed-in user.

| Public function                               | Authorization and record scope                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users:bootstrapCurrentUser`                  | Identity only because the user/workspace may not exist yet. Atomically reconciles Clerk subject and token identifier, rejects conflicting/disabled/deleted accounts, and creates or repairs exactly one personal workspace and owner membership. |
| `users:getCurrentUser`                        | Current tenant; returns only the resolved viewer.                                                                                                                                                                                                |
| `users:updateCurrentUser`                     | Current tenant; patches only the resolved viewer.                                                                                                                                                                                                |
| `workspaces:getCurrentWorkspace`              | Current tenant; returns the derived personal workspace and owner membership, never a client-selected workspace.                                                                                                                                  |
| `workspaces:updateCurrentWorkspace`           | Current tenant; patches only the derived workspace.                                                                                                                                                                                              |
| `workspaces:getAccountDeletionReadiness`      | Current identity plus its personal-account/deletion fence; reports billing/readiness or durable operation state without accepting a tenant ID.                                                                                                   |
| `workspaces:getAccountDeletionStatus`         | Current identity plus its personal-account/deletion fence; returns the caller-owned current operation only.                                                                                                                                      |
| `workspaces:deleteAccount`                    | Current personal tenant, literal `DELETE`, linked owner/account guard, composite fail-closed billing/provider check, and atomic durable access fence.                                                                                            |
| `billing/customer:getBillingOverview`         | `customerQuery`; reads subscriptions and usage cycles only for `ctx.workspace.id`.                                                                                                                                                               |
| `billing/customer:createCheckout`             | `customerAction`; current tenant is resolved before I/O. Idempotency keys are checked against the same workspace, and Creem metadata uses the derived workspace ID.                                                                              |
| `billing/customer:createBillingPortal`        | `customerAction`; uses the Creem customer ID from the derived workspace subscription.                                                                                                                                                            |
| `billing/customer:upgradeSubscription`        | `customerAction`; loads and applies changes only for the derived workspace and allows upgrades only to a higher plan.                                                                                                                            |
| `keywords:listKeywords`                       | Current tenant; workspace-indexed read excluding soft-deleted rows.                                                                                                                                                                              |
| `keywords:getKeywordSummary`                  | Current tenant; workspace-scoped keyword, subscription, and usage reads.                                                                                                                                                                         |
| `keywords:createKeyword`                      | Current tenant; creator/workspace IDs come from authorization; enforces tenant-local normalized phrase uniqueness and plan/draft capacity.                                                                                                       |
| `keywords:updateKeyword`                      | Current tenant; the supplied keyword ID must belong to the derived workspace and be active; tracking sources remain in that workspace.                                                                                                           |
| `keywords:pauseKeyword`                       | Current tenant; keyword ID must belong to the workspace; related non-deleted sources are paused.                                                                                                                                                 |
| `keywords:resumeKeyword`                      | Current tenant; keyword ID must belong to the workspace; billing/usage state determines whether sources can actually become active.                                                                                                              |
| `keywords:deleteKeyword`                      | Current tenant; keyword ID must belong to the workspace; keyword and related sources are soft-deleted and leases are cleared.                                                                                                                    |
| `mentions:listMentions`                       | Current tenant; base query is workspace-indexed. Category and keyword filter IDs are rejected unless they belong to the same workspace. Cursor embeds and verifies workspace plus filter fingerprint.                                            |
| `mentions:getMention`                         | Current tenant; supplied mention ID must have the derived `workspaceId`.                                                                                                                                                                         |
| `mentions:updateMentionStatus`                | Current tenant; supplied mention ID must have the derived `workspaceId` before patching.                                                                                                                                                         |
| `categories:listCategories`                   | Current tenant; lists the workspace catalog and validates catalog invariants.                                                                                                                                                                    |
| `categories:createCategory`                   | Current tenant; inserts into the derived workspace and enforces tenant-local active normalized-name uniqueness.                                                                                                                                  |
| `categories:updateCategory`                   | Current tenant; category ID must belong to the workspace and not be deleted; system-category invariants still apply.                                                                                                                             |
| `categories:deleteCategory`                   | Current tenant; category ID must belong to the workspace; protected system categories cannot be deleted, and mentions are reassigned to the required workspace-local `Other` category before soft deletion.                                      |
| `savedViews:listSavedViews`                   | Current tenant; stored views are filtered by both workspace and viewer. The synthetic `All Mentions` view is added in memory.                                                                                                                    |
| `savedViews:createSavedView`                  | Current tenant; stored owner is the resolved viewer, category/keyword filter IDs must belong to the workspace, and active names are unique per workspace/user.                                                                                   |
| `savedViews:updateSavedView`                  | Current tenant; view ID must match both workspace and viewer; the synthetic view cannot be persisted or changed.                                                                                                                                 |
| `savedViews:reorderSavedViews`                | Current tenant; submitted IDs must contain every current stored view for the workspace/user exactly once.                                                                                                                                        |
| `savedViews:deleteSavedView`                  | Current tenant; view ID must match workspace and viewer; deletion is soft and remaining positions are compacted.                                                                                                                                 |
| `settings:getSettings`                        | Current tenant; reads the digest preference at the exact workspace/user pair.                                                                                                                                                                    |
| `settings:updateDigestPreferences`            | Current tenant; patches only the exact workspace/user preference.                                                                                                                                                                                |
| `digest/customer:getDailyDigestPreference`    | `customerQuery`; reads the exact `ctx.workspace.id`/`ctx.viewer.id` preference.                                                                                                                                                                  |
| `digest/customer:updateDailyDigestPreference` | `customerMutation`; patches the exact `ctx.workspace.id`/`ctx.viewer.id` preference after schedule validation.                                                                                                                                   |
| `featureRequests:createFeatureRequest`        | Current tenant; creator and workspace IDs come from authorization.                                                                                                                                                                               |
| `featureRequests:listMyFeatureRequests`       | Current tenant; reads by resolved creator and additionally filters to the derived workspace.                                                                                                                                                     |

Even when a function uses an `authenticated*` wrapper rather than a `customer*` wrapper, its handler performs current-tenant resolution before product data access. `users:bootstrapCurrentUser` is the sole authenticated-only exception because it creates that state.

## Exact admin authorization

`ADMIN_CLERK_USER_ID` is a single-user allowlist, not a role claim.

### Next.js layer

`apps/admin/lib/env.ts` treats a missing or blank value as unconfigured but preserves every character of a nonblank configured value. `hasExactAdminClerkUserId` allows access only when:

```text
actual Clerk user ID === configured ADMIN_CLERK_USER_ID
```

There is no case folding and no trimming before equality. For example, `user_123`, `USER_123`, `user_123 `, and ` user_123` are different values.

The check runs in all of these paths:

- `apps/admin/proxy.ts` for protected browser and API routing;
- `guardAdmin()` in the protected layout and session route;
- server-side data loaders before creating an authenticated Convex client;
- `requireAdminAccess()` in every admin server action before input handling and mutation dispatch.

Missing auth configuration produces a configuration state/503, no Clerk user produces sign-in/401, and a different Clerk user produces unauthorized/403.

### Convex layer

Every function exported from `convex/admin.ts` uses an admin wrapper. `requireAdminIdentity()`:

1. requires a valid Convex identity;
2. reads the Convex deployment's `ADMIN_CLERK_USER_ID`;
3. rejects missing/blank configuration with `ADMIN_NOT_CONFIGURED`;
4. requires `identity.subject` to exactly equal the configured value;
5. rejects every mismatch with `FORBIDDEN`.

Configure the same exact Clerk user ID in both the admin Next.js environment and the Convex deployment environment. Passing the Next.js check does not bypass the Convex check.

### Admin operations

All of these are exact-admin-only:

- `admin:getMetricsOverview`
- `admin:listDeletionJobs`
- `admin:getDeletionJob`
- `admin:retryDeletionJob`
- `admin:cancelDeletionJob`
- `admin:listFeatureRequests`
- `admin:updateFeatureRequest`
- `admin:listChangelogEntries`
- `admin:createChangelogEntry`
- `admin:updateChangelogEntry`
- `admin:publishChangelogEntry`
- `admin:unpublishChangelogEntry`
- `admin:deleteChangelogEntry`

Admin mutations write audit events with the admin Clerk subject. Published changelog entries must be unpublished before editing; publishing moves `requestedPublicationAt` to `publishedAt`, and unpublishing reverses that state.

## Anonymous changelog exception

`changelog:listPublishedEntries` and `changelog:getPublishedEntry` are the only anonymous Convex queries. Their authorization classification is `public_published_read`; the list returns bounded summary pages, while the slug lookup returns at most one published body.

The list query uses `changelogEntries.by_status_and_published_at` with `status = "published"`, rechecks that status and a numeric publication timestamp, and returns opaque-cursor pages containing only:

- `publishedAt`
- `slug`
- `summary`
- `title`
- `updatedAt`

The detail query uses `changelogEntries.by_slug`, applies the same publication checks, and adds `body`. Neither query returns drafts, requested publication dates, labels, or admin actor IDs. There are no anonymous mutations or actions.

## Webhook authorization

The only public HTTP actions are provider callbacks:

| Public function and path                                   | Mechanism                                                                                                                              | Persistence boundary                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `billing/creemHttp:creemWebhook` — `POST /webhooks/creem`  | HMAC-style verification through `verifyCreemWebhookSignature` using the untouched body, `creem-signature`, and `CREEM_WEBHOOK_SECRET`. | Only after verification and event parsing does the handler invoke the internal Creem ingestion mutation. |
| `email/resendHttp:resendWebhook` — `POST /webhooks/resend` | Resend/Svix verification using the untouched body, `svix-id`, `svix-timestamp`, `svix-signature`, and `RESEND_WEBHOOK_SECRET`.         | Only after verification does the handler invoke the internal Resend event ingestion mutation.            |

Each body is read exactly once. Invalid signatures return 401. Missing Resend signature headers return 400. Provider-unconfigured handlers return 503. Processing failures request provider retry rather than accepting an unpersisted event.

A provider signature authorizes only ingestion of that provider event. Webhooks have no customer/admin wrapper and no path to arbitrary public mutations.

## Deletion guard

Deletion authorization is deliberately split into tenant ownership and billing state.

### Account deletion

`assertAccountDeletionAllowed` additionally requires:

- the account is not already deleted;
- `account.personalWorkspaceId` equals the workspace;
- `workspace.ownerUserId` equals the account user ID;
- `membership.userId` equals the account user ID.

### Billing confirmation

Persisted subscription state is considered inactive only when every subscription:

- has `entitlementStatus === "inactive"`;
- does not have `cancelAtPeriodEnd === true`;
- has a terminal normalized status: `canceled`, `cancelled`, `expired`, or `inactive`.

Unknown status, missing status, active entitlement, and scheduled cancellation all fail closed. A blocked request creates/updates a `deletionJobs` row with `billingGuardStatus = "blocked_active"` and returns a billing-portal-required result. Confirmed inactivity stages a pending job. Neither public deletion mutation directly hard-deletes a workspace.

The public route never deletes Clerk. Internal functions alone claim the
versioned lease, quiesce and purge the derived tenant, verify data absence, and
expose the stored Clerk subject to the internal action. Bootstrap rejects the
disabled/deleted user tombstone during the identity fence. Legacy jobs without
the current workflow version are excluded from dispatch and rejected by
retry/cancel mutations.

Exact-admin retry requires literal `RETRY`, a latest current-version dead
account job, and creates a new audited generation. Cancellation requires
literal `CANCEL`, current workflow version, and proof that `quiescedAt` is
absent; it restores only access markers equal to that job's fence timestamp.

## Enforcement and inventory tests

The repository maintains a reviewable map in `convex/lib/publicFunctionAuthorizationInventory.ts`. It classifies every public function as one of:

- `admin_exact_clerk_subject`;
- `authenticated_identity_current_workspace`;
- `provider_signature`;
- `public_published_read`.

Current backend and security tests verify that:

- every discovered public Convex registration has an inventory entry whose wrapper matches source;
- frontend generic references resolve to public backend exports with the expected function kind and argument names;
- public registrations use approved authorization wrappers or the explicit changelog/Creem/Resend exceptions;
- every `admin:*` registration uses an admin wrapper, and protected admin layouts, pages, route handlers, and server actions call a server admin guard;
- the customer wrapper derives the current tenant and does not declare a wrapper-level `workspaceId` argument;
- both webhook routes are POST-only, read `request.text()` once, avoid `request.json()`, and pass that raw body to signature verification;
- unit tests cover exact admin-ID matching, current personal-tenant authorization, and the separate inactive-billing deletion guard.

These inventory checks do not replace handler-level review of record ownership and lifecycle invariants. Any new public function must be added to the inventory and assigned the narrowest valid wrapper before it is considered complete.
