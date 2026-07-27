# Architecture

This document describes the implementation in `apps/*`, `packages/*`, and `tests/*`. Convex is the system of record; Next.js guards improve routing and failure handling but do not replace backend authorization.

## Package boundaries

| Package                                 | Responsibility                                                                                                                                                                                               | May depend on                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `apps/web` (`@astreex/web`)             | Public marketing/blog/changelog pages, Clerk sign-in/up, onboarding, and the customer product UI on port 3000. It validates generic Convex responses with Zod before rendering them.                         | `@astreex/backend`, `@astreex/domain`, `@astreex/ui`, Clerk, Convex, Next.js |
| `apps/admin` (`@astreex/admin`)         | Restricted operations UI on port 3001 for metrics, feature requests, and changelog management. Every protected request is exact-admin checked before it calls Convex.                                        | `@astreex/backend`, `@astreex/domain`, `@astreex/ui`, Clerk, Convex, Next.js |
| `packages/backend` (`@astreex/backend`) | Convex schema, public and internal functions, HTTP webhooks, crons, durable jobs, provider adapters, authorization, billing, ingestion, categorization, digest, email, metrics, deletion, and audit records. | `@astreex/domain`, `@astreex/email`, Convex, Resend, Zod                     |
| `packages/domain` (`@astreex/domain`)   | Browser-safe domain enums, plans, categories, scheduling, time, URL, usage, content, engagement, and deterministic helpers. It has no app or backend dependency.                                             | Temporal polyfill, Zod                                                       |
| `packages/email` (`@astreex/email`)     | React Email layouts and templates plus deterministic rendering helpers. It does not send mail.                                                                                                               | `@astreex/domain`, React Email, React                                        |
| `packages/ui` (`@astreex/ui`)           | Shared accessible UI primitives, shell components, theme support, and styles. It contains no business persistence.                                                                                           | React, Next.js peer APIs, Radix UI, Recharts, utility libraries              |
| `packages/config` (`@astreex/config`)   | Shared TypeScript and ESLint configuration only.                                                                                                                                                             | ESLint and TypeScript tooling                                                |
| `tests/e2e` (`@astreex/e2e`)            | Playwright projects for desktop light/dark and mobile. The package `test` script lists tests; `test:e2e` executes them.                                                                                      | Playwright, Clerk testing, axe                                               |
| `tests/security`                        | Source-scanning authorization and guard tests.                                                                                                                                                               | Repository source and Vitest through the workspace toolchain                 |

The root is a pnpm workspace orchestrated by Turborepo. Root scripts are the supported entry points; see `README.md`.

## Runtime topology

- Clerk issues browser sessions and the JWT used for authenticated Convex calls. The Clerk JWT template must be named `convex`.
- `apps/web` and `apps/admin` are separate Next.js deployments but use the same Clerk tenant and Convex deployment.
- Convex stores application state, runs transactional functions, executes one-minute crons, and exposes only two HTTP webhook paths.
- External services are called only from backend actions/adapters:
  - X through **Xquik**.
  - Reddit posts and comments through FetchLayer.
  - Hacker News stories and comments through Algolia's public HN API.
  - Billing through Creem.
  - Email delivery and delivery webhooks through Resend.
  - DeepSeek categorization through a durable one-minute dispatcher, leased batch action, strict total-result validation, and atomic result application.

## Customer request and authentication flow

1. A request for `/app/*` or `/onboarding/*` reaches `ProtectedProductLayout` in `apps/web`.
2. The server checks that Clerk and the Convex URL are configured. Missing configuration renders an explicit configuration state rather than sample customer data.
3. `auth()` requires a signed-in Clerk user; signed-out users are redirected to `/sign-in` with the intended destination.
4. In the browser, `ConvexProviderWithClerk` obtains the Clerk `convex` JWT and attaches it to Convex calls.
5. `packages/backend/convex/auth.config.ts` accepts the JWT only for application ID `convex` and the configured `CLERK_JWT_ISSUER_DOMAIN`.
6. The first product bootstrap calls `users:bootstrapCurrentUser`. In one Convex mutation it reconciles the token identifier and Clerk subject, creates or repairs one personal workspace and owner membership, creates default categories, and creates default digest preferences.
7. Every later customer operation derives the workspace from the persisted user record. The client does not select a `workspaceId`.
8. The backend verifies the JWT subject, token identifier, active user, active workspace, active membership, personal workspace ownership, `users.personalWorkspaceId`, and owner role before data access.
9. Functions that accept record IDs also verify that each record belongs to the derived workspace; user-owned records such as saved views are checked against both workspace and user.

The Next.js check controls navigation. The Convex check is the authoritative data boundary.

## Admin request and authentication flow

Admin access is deliberately checked at both runtime layers.

1. `apps/admin/proxy.ts` rejects missing configuration, redirects signed-out browser requests to sign-in, returns 401 for signed-out API requests, and redirects or returns 403 for a non-admin Clerk user.
2. The proxy compares `clerkAuth.userId` to `ADMIN_CLERK_USER_ID` by exact string equality. Case changes or surrounding whitespace do not match.
3. Protected layouts, the session route, data loaders, and every server action call `guardAdmin()` or `requireAdminAccess()` again. They perform the same exact comparison, so bypassing the proxy is insufficient.
4. Server-side Convex calls obtain the Clerk JWT with `getToken({ template: "convex" })` and set it on a `ConvexHttpClient`.
5. Every public function in `convex/admin.ts` uses `adminQuery` or `adminMutation`. The wrapper reads the authenticated Convex identity and requires `identity.subject === ADMIN_CLERK_USER_ID` in the Convex deployment environment.
6. Missing/blank Convex admin configuration fails with `ADMIN_NOT_CONFIGURED`; a non-exact subject fails with `FORBIDDEN`.

The same Clerk user ID must therefore be configured independently in the admin Next.js deployment and the Convex deployment. See `authorization.md` for the complete operation inventory.

## Public read exception

`changelog:listPublishedEntries` and `changelog:getPublishedEntry` are the only deliberately anonymous Convex queries. They use the visibly named `publicQuery` wrapper. The list reads bounded published summary pages; the detail route uses the slug index and returns at most one body after rechecking published status and numeric `publishedAt`. Draft fields such as requested publication time, labels, and actor IDs are not returned.

Marketing and blog content are otherwise local application content. Customer data, admin data, mutations, and actions have no anonymous client entry point.

## Single-user UI and future tenancy

The data model is tenant-shaped now, but the product policy is intentionally single-user:

- Tenant-owned rows carry `workspaceId` and use workspace-first indexes.
- Identity, workspace, and membership are separate tables so team membership can be introduced without moving every product row.
- Current schema validators allow only `workspaces.kind = "personal"` and `workspaceMembers.role = "owner"`.
- Current customer authorization requires the authenticated user to own the personal workspace, hold the active owner membership, and have that workspace in `users.personalWorkspaceId`.
- Workspace and membership terminology is internal. The customer UI presents an account, dashboard, brand, and monitoring profile, with no workspace switcher, organization, membership, invitation, or team-management surface.
- Customer functions never trust a client-selected workspace.

Future team tenancy requires an intentional schema and policy change: expand workspace kinds and roles, define role capabilities, change current-tenant selection, add a trusted workspace-selection mechanism, and update every record-level authorization check. Merely inserting another membership must not grant access under the present code.

## Scheduled and provider work

All six Convex crons run every minute:

1. dispatch durable account-deletion jobs;
2. retry persisted Creem billing events;
3. claim due tracking sources;
4. claim due categorization jobs;
5. claim due daily digests;
6. claim pending email outbox messages.

Account deletion, tracking, categorization, and email use durable leases. Billing retries pending inbox rows directly, and digest dispatch relies on local-date/idempotency guards rather than a lease.

For leased provider work:

- A mutation finds due rows through status/time indexes, assigns a token and expiry, and schedules an internal action.
- The action re-reads the leased context, calls the external provider, and submits validated output to an internal mutation.
- The mutation checks the lease or fencing state again before committing output, retry state, checkpoints, and telemetry.
- Provider input and output cross explicit Zod/runtime contracts; provider errors are reduced to bounded, secret-free codes and messages.

Tracking sources map as follows:

| Source type       | Provider            | Credential           |
| ----------------- | ------------------- | -------------------- |
| `x`               | Xquik               | `XQUIK_API_KEY`      |
| `reddit_posts`    | FetchLayer          | `FETCHLAYER_API_KEY` |
| `reddit_comments` | FetchLayer          | `FETCHLAYER_API_KEY` |
| `hacker_news`     | Algolia Hacker News | none                 |

Ingestion commits normalized mentions in bounded chunks. Mention deduplication is tenant-scoped by provider item ID when available and by a fallback key otherwise. Keyword matches are stored separately so one mention can match several keywords without duplicating the mention.

## Webhook boundaries

The root Convex HTTP router exposes only:

- `POST /webhooks/creem`
- `POST /webhooks/resend`

The router delegates the untouched `Request`. Each handler reads `request.text()` exactly once, verifies the provider signature before persistence, and then invokes an internal mutation.

- Creem uses the `creem-signature` header and `CREEM_WEBHOOK_SECRET`. Invalid signatures return 401; invalid event bodies return 400. Accepted events enter the durable `billingEvents` queue and are deduplicated by provider event ID.
- Resend uses `svix-id`, `svix-timestamp`, and `svix-signature` with `RESEND_WEBHOOK_SECRET`. Invalid signatures return 401. Supported events enter `emailWebhookEvents`, are deduplicated by provider event ID, and are reconciled to outbox messages by provider message ID and provider event time.

Webhooks are unauthenticated only in the browser-session sense. Their authorization mechanism is the provider signature. They cannot call arbitrary public mutations, and subsequent processing remains internal to Convex.

## Deletion flow

Account deletion is a durable Convex workflow, never an immediate client-side cascade:

1. Customer authorization derives the active personal workspace and owner.
2. The customer supplies literal `DELETE`. The strict same-origin Next.js route authenticates Clerk, obtains the Convex JWT, calls `workspaces:deleteAccount`, and never calls Clerk deletion APIs.
3. Convex evaluates subscriptions, open/completed unexpired checkouts, unresolved billing events, running provider operations, active leased side effects, and provider configuration. Any uncertainty fails closed.
4. Active entitlement creates/updates a blocked job and returns `BILLING_PORTAL_REQUIRED`; other uncertainty returns support-required state. Confirmed inactivity creates or resumes one versioned account job and atomically fences the user/workspace.
5. A one-minute dispatcher claims only current workflow-version jobs with a versioned five-minute lease. Expired workers are fenced and reclaimable; legacy jobs are review-only.
6. The worker verifies Creem authoritatively, rechecks local billing state in the quiescence transaction, revokes producers, and purges tenant-owned rows in bounded workspace-indexed batches.
7. Convex verifies the workspace and tenant rows are absent before making Clerk identity deletion available. Clerk success and not-found converge; retryable failures back off, while permanent/configuration failures dead-letter for exact-admin recovery.
8. A retained user tombstone blocks old credentials for `DELETION_IDENTITY_FENCE_MS`. Only after the fence expires is the user tombstone removed and the durable job marked `completed`.

The admin sidebar has exactly Metrics, Feature Requests, and Changelog.
Deletion operations are linked from Metrics at `/deletions`, where exact
administrators can inspect lifecycle evidence, retry current-version dead jobs,
or cancel only before quiescence with explicit confirmation and audit records.

See `authorization.md` for guard details and `data-model.md` for `deletionJobs`.

## Pre-codegen Convex boundary

A real Convex development deployment has not yet been configured in this checkout. Initial deployment creation—including the attempted local mode—requires an authenticated `npx convex login`, so `convex/_generated` cannot yet be produced.

The current source intentionally uses official generic Convex APIs rather than fake generated files:

- `packages/backend/convex/server.ts` re-exports `queryGeneric`, `mutationGeneric`, `actionGeneric`, all internal generic constructors, and `httpActionGeneric`.
- It uses `GenericDataModel` contexts and small `indexEquals`/`indexGreaterThanOrEqual` adapters because generic models cannot encode schema index tuples.
- `packages/backend/convex/lib/functionReferences.ts` creates typed internal references with `makeFunctionReference`.
- The web and admin apps create public references with `makeFunctionReference` and validate untyped results at runtime.

This boundary typechecks and is covered by source-inventory tests, but it is transitional. From the repository root, configure a real development deployment and then generate its schema-specific files:

```sh
npx convex login
pnpm --filter @astreex/backend exec convex dev --configure new --once
pnpm convex:codegen
```

Use `--configure existing` instead when attaching to an existing Convex project. After configuration, `pnpm dev:backend` is the normal persistent backend development process. Codegen must target that configured deployment. Only after it succeeds should constructors, API references, and data-model imports be migrated to `convex/_generated`; do not hand-author generated files.

## Related documents

- [Data model](./data-model.md)
- [Authorization](./authorization.md)
- [Repository setup](../README.md)
