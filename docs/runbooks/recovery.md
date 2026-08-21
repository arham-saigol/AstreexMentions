# Service recovery and rollback

Use this runbook after a failed release, cross-service configuration error, provider incident, or data-integrity concern.

## 1. Establish the recovery boundary

Record before changing anything:

- source revision and deployment time;
- customer Vercel deployment, admin Vercel deployment, and Convex deployment;
- Clerk instance and exact admin user ID;
- Creem mode and provider account/environment;
- first/last known affected times and affected workspace/source IDs;
- current queue, lease, checkpoint, subscription, usage, and audit state.

Do not include secret values, JWTs, raw webhooks, customer query text, or email payloads.

## 2. Contain safely

Choose the narrowest reversible control:

- **Customer frontend:** promote the previous known-good customer Vercel deployment.
- **Admin frontend:** promote the previous known-good admin Vercel deployment.
- **Backend:** stop additional releases; remove a compromised provider key only when necessary.
- **Provider calls:** allow circuits/backoff to contain temporary outages, or remove the relevant key for stronger containment.
- **Email:** remove/rotate `RESEND_API_KEY` to stop new sends while preserving pending outbox rows.
- **Admin:** remove the exact admin ID from both layers to deny all access.
- **Billing webhooks:** do not disable/rotate blindly; doing so stops authoritative entitlement synchronization and requires replay planning.

Do not clear durable queues or advance checkpoints to make dashboards look healthy.

## 3. Roll back code

### Frontends

Promote the prior reviewed Vercel deployment independently for `apps/web` or `apps/admin`. Verify its environment still points to the intended Clerk instance and shared Convex deployment.

### Convex backend

Use the single controlled backend release owner. From a reviewed checkout of the prior revision:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @astreex/backend deploy
```

`convex deploy` regenerates artifacts and changes functions/schema/crons/routes. Confirm the project/default production deployment before approving. Review schema compatibility first: older functions may not understand rows written by the newer release, and a destructive schema rollback may be unsafe.

Do not have both Vercel projects deploy Convex.

## 4. Restore configuration

- Compare environment **names and destinations**, not copied all-in-one files.
- Convex variables belong in the selected deployment; frontend variables belong in each Vercel project.
- Restore Clerk issuer/admin alignment, provider mode, product allowlist, webhook endpoints/secrets, sender domain, and public URLs.
- Use interactive `convex env set` for secrets.

A Convex environment correction does not require a code deployment. Vercel server environment changes normally require a redeploy/promotion.

## 5. Reconcile durable state

After code/config recovery, classify each workflow:

| State                                      | Recovery expectation                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Retryable active tracking source           | Recovers from stored `nextRunAt`/backoff; expired lease is fenced and reclaimable                                        |
| Tracking `paused/config` or `error/config` | Does not bulk-resume automatically; requires customer keyword resume or reviewed maintenance                             |
| Pending Creem event                        | Durable wake-up retries due work; 15-minute recovery sweep handles up to 16 rows/run                                     |
| Dead Creem event                           | Same ID cannot reprocess; require a new canonical event or reviewed repair                                               |
| Pending/expired email outbox               | Durable wake-up retries or reclaims work; 15-minute recovery sweep handles up to 32 rows/run                             |
| Dead email/digest run                      | No admin requeue; reviewed maintenance required                                                                          |
| Resend `pending_match`                     | Scheduled 30-second reconciliation chain; no scanning cron                                                               |
| Pending mention analysis                   | Durable wake-up claims due jobs; config-blocked work retries in 5 minutes; catalog-blocked work requires category repair |
| Pending deletion                           | Durable wake-up resumes due work; 15-minute recovery sweep remains available; security fence waits until its expiry      |

Preserve idempotency keys, payload fingerprints, provider IDs, lease versions, and checkpoints. Direct state edits can create duplicate payments/emails/mentions or lost provider windows.

## 6. Data restoration

The repository contains no automated Convex backup/export/restore or Clerk identity restoration command. If data restoration is required:

1. Follow the approved Convex/Clerk platform recovery procedure for the exact environment.
2. Preserve a pre-repair snapshot/export when available under the organization's plan and policy.
3. Use a reviewed tenant-scoped repair that validates cross-table invariants and emits audit evidence.
4. Reconcile provider events by immutable provider IDs and event times after restore.
5. Do not restore stale subscription state over newer authoritative Creem events.

Account deletion is irreversible after quiescence. Use the account-deletion runbook before attempting any identity or data recovery; cancellation is supported only before `quiescedAt`.

## 7. Verify

Run deterministic gates from the recovered revision:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These do not verify credentials. Then run only the approved credential-backed checks relevant to the incident:

- customer auth and Convex JWT;
- exact admin allow/deny;
- affected provider with approved known data;
- Creem test/live event path as applicable;
- Resend controlled mailbox and signed webhook;
- queue/lease/checkpoint progression.

Confirm actual admin metrics semantics: delivered email requires applied webhook state, active workspace means mention ingestion in range, and provider charts omit rate-limit/retry details shown only in underlying buckets.

## 8. Close

Record:

- root cause and affected window;
- rollback/config/credential actions;
- queue and data reconciliation performed;
- credential-backed evidence and cleanup;
- known unresolved rows or customer impact;
- follow-up code/test/runbook work.

Do not close while pending deletion rows are being mistaken for completed erasure, mention analysis backlog is still unexplained, or credential-backed verification is represented only by local tests.
