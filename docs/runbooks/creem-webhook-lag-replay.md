# Creem webhook lag and replay

Use this runbook when checkout return succeeds but entitlement does not update, Creem reports delivery failures, or `billingEvents` accumulates.

## Authoritative boundary

The checkout redirect is not entitlement. Persisted subscription events establish or change access. The Convex route is:

```text
POST https://<deployment>.convex.site/webhooks/creem
```

The handler reads the raw body once and verifies `creem-signature` with `CREEM_WEBHOOK_SECRET` before parsing or persistence.

- Missing/invalid webhook configuration: 503 `provider_unconfigured`.
- Invalid signature: 401.
- Unsupported/invalid body: 400.
- Target/configuration not ready after verification: 503, while the event remains `pending`.
- Processed/dead duplicate: accepted as a no-op.

## Detect and scope

1. Confirm test versus production Creem account, endpoint, products, and Convex deployment. The event `livemode` is stored but current processing does not compare it with `CREEM_MODE`; environment separation is operationally mandatory.
2. Inspect `billingEvents`:
   - `status`, `receivedAt`, `providerCreatedAt`, `attempts`, `nextAttemptAt`, `lastError`;
   - `providerEventId`, `eventType`, `objectId`, and `livemode`;
   - never copy `payloadJson` into tickets.
3. Inspect `providerRuns` for provider `creem`, operation `webhook`, and errors such as `TARGET_NOT_READY` or `PRODUCT_NOT_ALLOWED`.
4. Inspect the matching `subscriptions`, `usageCycles`, `billingCheckouts`, and `auditEvents` rows.
5. Check Creem delivery attempts and HTTP responses for the exact event ID.

The admin metrics page can show Creem request success/failure totals if metric buckets exist, but it does not show the billing inbox or subscription state.

## Expected retry and idempotency

- Pending target/configuration failures retry after 30 seconds.
- Durable wake-ups process pending retries at their due time. The 15-minute recovery sweep processes at most 16 due events per run.
- `(provider = creem, providerEventId)` is the durable idempotency key.
- Replaying a pending event increments attempts and reuses the originally stored verified payload; a replay cannot replace it with a different body.
- A `processed` or `dead` event ID is terminal and replay is a no-op.
- Events at or before `lastSyncedAt`, or events moving a period start backward, are stale and cannot roll subscription state backward.

## Recover pending events

1. Correct the target condition:
   - install all three distinct `CREEM_PRODUCT_ID_*` values, including the product referenced by the event;
   - ensure checkout metadata contains the active Astreex workspace ID and a matching checkout exists when required;
   - restore the matching webhook secret and route;
   - keep test and live products/secrets/deployments separate.
2. Allow the dispatcher to retry, or ask Creem to replay the same event. Do not alter its event ID or raw body.
3. If volume exceeds 16 due events, monitor oldest `nextAttemptAt` and `receivedAt`. Processing catches up after the dependency is fixed.

## Recover dead or stale events

- Replaying the same dead event cannot reprocess it.
- Prefer a new canonical Creem subscription event for the provider object. Refund/dispute events do not invent entitlement transitions.
- If Creem cannot emit a corrective event, use a reviewed, tenant-scoped repair change that preserves event ordering and audit history. Do not change `billingEvents.status`, `subscriptions.lastSyncedAt`, usage counters, or product IDs directly as an ad hoc fix.

## Verify

- The event is `processed` or a documented terminal no-op, with `lastError` cleared where applicable.
- The expected subscription has the correct product-derived plan, period boundaries, status, `entitlementStatus`, and `lastSyncedAt`.
- Exactly one current open usage cycle exists for the paid period, with existing same-period usage/warning timestamps preserved when applicable.
- Paid/usage-paused tracking sources resume only when synchronized entitlement is active and capacity is available; user/config/error sources remain unchanged.
- A later duplicate delivery makes no additional state change.

Do not report recovery complete based only on a 200 webhook response. Verify the persisted subscription and usage projection.
