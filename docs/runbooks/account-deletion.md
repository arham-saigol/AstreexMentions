# Account deletion

Account deletion is asynchronous and Convex-owned. Request acceptance is not
completed erasure. The customer response always contains `deleted: false`;
only a retained `deletionJobs` row with `status = "completed"` and
`phase = "done"` after the identity fence is terminal evidence.

## Safety model

1. `/api/account/delete` accepts only a configured same-origin `POST` with
   literal `DELETE`, verifies Clerk, obtains the Clerk `convex` JWT, and calls
   `workspaces:deleteAccount`. It never calls Clerk's deletion API.
2. Convex derives the personal tenant and checks its owner/account linkage.
3. Deletion fails closed for active or unknown entitlement, scheduled
   cancellation, unexpired checkout, unresolved billing event, running
   provider operation, active leased side effect, or missing Creem
   configuration.
4. Acceptance atomically persists the current workflow-version job, disables
   the user, marks the workspace deletion-pending, and writes an audit event.
5. The one-minute dispatcher uses five-minute token/version leases. It ignores
   every legacy job without the current workflow version.
6. The worker verifies Creem authoritatively and repeats the local composite
   guard in the quiescence mutation before marking the user/workspace deleted
   and revoking the owner membership.
7. Tenant data is purged in batches of 50. Provider schedules and producers
   reject deletion-pending/deleted tenants. Billing event payloads are
   redacted rather than treated as active tenant data.
8. Convex verifies tenant rows and the workspace are absent and the retained
   user tombstone is scrubbed before the internal action can delete Clerk.
9. Clerk `404` and a verified delete both converge. The user tombstone remains
   for `DELETION_IDENTITY_FENCE_MS`, which must exceed the longest Clerk/Convex
   token lifetime. Bootstrap rejects old credentials during this fence.
10. After the fence expires, the tombstone is removed and the job completes.

## Customer-visible states

- `available`: the customer may open the exact-confirmation dialog.
- `accepted` / `in_progress`: HTTP 202; sign out, but do not claim erasure is
  complete.
- `portal_required`: HTTP 409; cancel in Creem and wait for a terminal signed
  webhook.
- `support_required`: HTTP 503; billing/provider uncertainty, a legacy job, or
  terminal operator state needs review.

Repeated requests return the same current operation. They do not create a
second purge.

## Inspect the operation

Use Metrics → Account deletion operations (`/deletions`). The sidebar remains
exactly Metrics, Feature Requests, and Changelog.

Inspect:

- status, phase, purge stage, attempts, generation, and operation ID;
- `billingGuardStatus`, `lastErrorCode`, and next attempt;
- lease expiry/version evidence;
- `quiescedAt`, `dataDeletionVerifiedAt`,
  `identityDeletionVerifiedAt`, `securityFenceExpiresAt`, and `completedAt`;
- lifecycle audit events for the deletion-job target.

Do not expose raw provider responses, secrets, auth tokens, or unbounded errors
in tickets or UI feedback.

## State response

### `blocked`

- `BILLING_PORTAL_REQUIRED`: have the customer cancel in Creem, wait for the
  terminal webhook, then submit again.
- Other codes: reconcile checkouts, billing events, provider runs, outbox
  leases, and Creem configuration. Do not force the job pending.

Blocking during the initial worker billing phase restores the access fence only
when the user/workspace markers still equal that job's exact fence timestamp.

### `failed`

The retry is automatic at `nextAttemptAt`. Confirm the error is transient and
allow the one-minute dispatcher to reclaim it with a higher lease version.
Never clear a lease or decrement attempts/version manually.

### `dead`

An exact administrator may create a new generation only when:

- the job is a current workflow-version account job;
- it is `dead`;
- it is the latest row for its account resource key; and
- the operator types `RETRY` exactly.

Retry is audited and preserves the safe resume point. Legacy jobs cannot be
retried by this control.

### Pre-quiescence cancellation

Cancellation requires exact admin authorization, literal `CANCEL`, current
workflow version, and no `quiescedAt`. It clears only access markers equal to
the job's fence timestamp and records an audit event. Cancellation is rejected
after quiescence, including purge, data verification, Clerk deletion, security
fence, and completion.

### `security_fence`

This is expected waiting, not a stuck queue. Do not retry or cancel it. Verify
`nextAttemptAt = securityFenceExpiresAt`; the dispatcher completes it after the
configured time.

## Clerk outcomes

- Already absent: record identity verification and enter the security fence.
- Delete succeeds and follow-up GET is absent: enter the fence.
- Timeout, transport error, 408/409/429/5xx, or still-present verification:
  retry with the durable backoff.
- Permanent 4xx or invalid response: dead-letter for review.
- Missing/invalid Clerk secret, timeout, or fence configuration: dead-letter
  with `CLERK_DELETION_CONFIGURATION_REQUIRED`; repair configuration before
  exact-admin retry.

Clerk deletion must never be attempted before `dataDeletionVerifiedAt`.

## Completion verification

Before reporting completion, verify:

- the job is current workflow version, `completed`, and `done`;
- `dataDeletionVerifiedAt ≤ identityDeletionVerifiedAt ≤
securityFenceExpiresAt ≤ completedAt`;
- the target workspace and retained user tombstone are absent;
- no tenant-owned producer, outbox, mention, keyword, category, saved view,
  usage, subscription, checkout, provider-run, or unredacted billing-event row
  remains;
- Clerk reports the identity absent;
- lifecycle and operator audit records exist without sensitive payloads.

The timestamp comparisons above allow equality because fast deterministic
steps may share one millisecond.

## Legacy jobs

Any job missing `workflowVersion` or using a non-current version is
operator-review-only. The dispatcher ignores it, and retry/cancel controls
reject it. Preserve the record and use a reviewed migration or maintenance
procedure; never patch it into the current version in place.
