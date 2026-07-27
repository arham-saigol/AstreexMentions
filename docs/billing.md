# Billing and usage

Astreex uses Creem for checkout, subscription upgrades, customer portal access, and signed subscription webhooks. Persisted subscription and usage state in Convex is authoritative for product access; a checkout redirect is not.

This document describes the implemented contract. It does not imply that a credential-backed Creem checkout, webhook, portal, upgrade, or payment smoke test has run.

## Plans and entitlement policy

The product catalog in `packages/domain/src/plans.ts` is:

| Plan    | Display price | Keyword limit | Monthly mention limit |
| ------- | ------------: | ------------: | --------------------: |
| Starter |           $19 |             3 |                 2,000 |
| Growth  |           $99 |             6 |                20,000 |
| Scale   |          $199 |            10 |                50,000 |

Runtime billing does not look up Creem products from those display definitions. `CREEM_PRODUCT_ALLOWLIST_JSON` maps environment-specific Creem product IDs to `planId`, `keywordLimit`, and `mentionLimit`. The runtime parser requires non-empty product IDs, non-negative integer limits, and at most one product per Astreex plan; it permits a partial allowlist, but an omitted plan cannot be checked out or upgraded to. The release validator requires all three plan IDs with the limits above, but it does not independently reject an additional duplicate mapping; runtime validation still fails closed on duplicates.

There is **no free trial entitlement**. Only persisted subscription status `active` or `scheduled_cancel` grants entitlement. `trialing`, `past_due`, `unpaid`, `paused`, `canceled`, `expired`, unknown states, and invalid/missing state are inactive. A scheduled cancellation remains active only through `currentPeriodEnd`.

`checkout.completed` is bookkeeping only. It marks a matching checkout complete but never creates a subscription or entitlement. A subsequent valid subscription event or validated upgrade response must establish paid state.

## Runtime configuration

| Variable                       | Contract                                                      |
| ------------------------------ | ------------------------------------------------------------- |
| `CREEM_MODE`                   | Required: `test` or `production`. Selects the API base below. |
| `CREEM_API_KEY`                | Required for checkout, upgrade, and portal calls.             |
| `CREEM_WEBHOOK_SECRET`         | Required for `/webhooks/creem`.                               |
| `CREEM_PRODUCT_ALLOWLIST_JSON` | Required product-ID-to-plan/limits mapping.                   |
| `CREEM_CHECKOUT_SUCCESS_URL`   | Required absolute URL for checkout creation.                  |
| `CREEM_TIMEOUT_MS`             | Optional positive number; defaults to 15,000 ms.              |

| Mode         | API base                       |
| ------------ | ------------------------------ |
| `test`       | `https://test-api.creem.io/v1` |
| `production` | `https://api.creem.io/v1`      |

The release validator and runtime both use `CREEM_MODE`, `CREEM_CHECKOUT_SUCCESS_URL`, and `CREEM_PRODUCT_ALLOWLIST_JSON`. The current environment contract has no `CREEM_API_BASE_URL` or separate `CREEM_PRODUCT_ID_STARTER/GROWTH/SCALE` variables.

Missing or invalid runtime configuration returns an explicit `provider_unconfigured` result with variable names, not secret values.

## Customer operations

### Checkout

`billing/customer:createCheckout` accepts:

- `planId`: `starter`, `growth`, or `scale`;
- `idempotencyKey`: a trimmed string of 8–200 characters.

It sends `POST /checkouts` with:

```json
{
  "product_id": "<allowlisted product id>",
  "request_id": "<idempotency key>",
  "success_url": "<CREEM_CHECKOUT_SUCCESS_URL>",
  "customer": { "email": "<Clerk email, when present>" },
  "metadata": { "internal_customer_id": "<workspace id>" }
}
```

The API uses `x-api-key` authentication. The response must contain a valid `checkout_url`, ID, status, product reference, and documented mode.

The idempotency key is both the Creem `request_id` and the Convex `billingCheckouts.by_idempotency_key` key. Treat it as an immutable checkout-request ID:

- a same-workspace replay with a stored URL returns the original checkout session;
- cross-workspace reuse is rejected with `BILLING_IDEMPOTENCY_CONFLICT`;
- the internal record path also rejects reuse for a different requester or plan;
- checkout records carry a 24-hour `expiresAt`, although no current job actively expires them;
- onboarding reuses a saved URL only while its intent is younger than 24 hours and nonterminal. Expired or canceled intents receive a fresh key, while completed intents wait for authoritative subscription reconciliation instead of opening another payment session.

### Upgrade

`billing/customer:upgradeSubscription` only permits movement to a higher plan:

```text
Starter -> Growth or Scale
Growth  -> Scale
Scale   -> no upgrade target
```

It sends:

```text
POST /subscriptions/{subscriptionId}/upgrade
```

with:

```json
{
  "product_id": "<target product id>",
  "update_behavior": "proration-charge-immediately"
}
```

The validated response is applied immediately to the stored subscription and usage-cycle projection. If Creem omits either billing-period boundary, the upgrade operation remains unresolved and schedules up to five authoritative subscription reads at 30-second intervals. The operation is marked successful only after a complete period is applied; an exhausted reconciliation becomes retryable rather than freezing the old entitlement behind a completed idempotency key. Signed subscription webhooks can also reconcile the same provider object; stale or equal-time updates do not roll state backward.

### Billing portal

`billing/customer:createBillingPortal` requires a stored Creem customer ID from the latest synchronized subscription. It sends `POST /customers/billing` with `customer_id` and returns `customer_portal_link`. If no stored customer exists, the action fails with `BILLING_CUSTOMER_NOT_FOUND`.

## Signed webhook contract

The Convex route is:

```text
POST https://<deployment>.convex.site/webhooks/creem
```

The handler:

1. reads the body as text exactly once;
2. verifies `creem-signature` as a lowercase 64-character HMAC-SHA256 hex digest of the unmodified raw body;
3. parses only the supported event schemas;
4. stores and processes the verified event through an internal mutation.

Supported event types are:

- `checkout.completed`
- `subscription.active`
- `subscription.paid`
- `subscription.canceled`
- `subscription.scheduled_cancel`
- `subscription.past_due`
- `subscription.expired`
- `subscription.update`
- `subscription.trialing`
- `subscription.paused`
- `refund.created`
- `dispute.created`

The durable idempotency key is `(provider = creem, providerEventId)`. A terminal `processed` or `dead` event is a no-op on replay. A pending replay reuses the originally stored verified payload rather than replacing it. Manual checkout, portal, and upgrade provider runs become stale after 15 minutes: the same idempotency key can then start a fenced new attempt, and the one-minute billing cron terminally fails at most 16 abandoned Creem runs per dispatch.

Subscription events are accepted only when the product ID is allowlisted. A new subscription must either already map by provider subscription ID or include `metadata.internal_customer_id` for an active workspace with a matching checkout for that plan. Events without a ready target remain pending and retry after 30 seconds. The one-minute billing cron processes at most 16 due pending events per dispatch.

Provider event ordering uses `event.created_at`. An event at or before the subscription's `lastSyncedAt`, or one that moves the period start backward, is stale. Missing billing-period boundaries produce `incomplete_period`; invalid or non-increasing boundaries reject processing rather than inventing dates.

Refund and dispute events are persisted and audited but do not directly invent a subscription transition. Creem subscription events remain canonical.

Operational limitation: the event's `livemode` is persisted, but current processing does not compare it with `CREEM_MODE`. Test/live webhook separation, secrets, products, and deployment routing must therefore be kept separate by configuration.

## Billing-cycle usage

Each paid period has one open `usageCycles` row with:

- idempotency key `creem:{providerSubscriptionId}:{periodStartAt}`;
- a plan and limits snapshot;
- `mentionsUsed`;
- optional `warning80SentAt` and `warning100SentAt`;
- exact period start/end and optional subscription link.

Cycle transitions are:

- **First complete paid period:** create an open cycle with usage `0`.
- **Upgrade or resume within the same period:** preserve `mentionsUsed` and both warning timestamps, while replacing the plan/limit snapshot with the current mapped plan.
- **New provider period:** close the old cycle and create a new open cycle with usage `0` and no warning timestamps.
- **Idempotent replay of an existing cycle:** preserve the stored usage and warning timestamps.

An active subscription without a current valid open usage cycle fails closed for monitoring.

## Mention counting, warnings, and cap behavior

Only a newly inserted canonical mention consumes one unit. Rediscovery of an existing tenant-scoped mention updates engagement and keyword association without incrementing usage.

Warnings are enqueued once per cycle at 80% and 100%:

- keys are `email:usage:{usageCycleId}:80` and `email:usage:{usageCycleId}:100`;
- crossing directly from below 80% to 100% can enqueue both warnings in the same transaction;
- the warning timestamp records that the threshold was handled, not that Resend confirmed delivery;
- warning composition requires `RESEND_FROM_EMAIL`; when the workspace owner has no deliverable email, ingestion continues and records the handled threshold without creating an outbox row.

When the next new mention would exceed the cap, that candidate and later candidates are not inserted. The atomic ingestion mutation records the first unprocessed provider position, returns `checkpoint: "hold"`, and pauses every active tracking source in the workspace with `pauseReason: "usage"`. It finalizes concurrent in-flight tracking runs before clearing their leases; the run that reached the cap is finalized by its owning scheduling mutation. Re-running the same provider page can safely resume from that position without double-counting earlier items.

Usage-paused sources resume only when synchronized billing state is active and `mentionsUsed < mentionLimit`, for example after a new period or a same-period upgrade that raises the cap. Billing synchronization also pauses active sources with `pauseReason: "paid"` when entitlement becomes inactive and resumes paid-paused sources when entitlement returns. User-paused, configuration-paused, and error sources are not silently resumed by this billing path.

## Account deletion guard

Deletion always evaluates every stored subscription for the workspace. It is allowed to stage only when each subscription:

- has `entitlementStatus = inactive`;
- is not `cancelAtPeriodEnd`;
- has terminal status `canceled`, `cancelled`, `expired`, or `inactive`.

No subscription rows means there is no entitlement to retain. Active, scheduled-cancel, unknown, or other nonterminal state fails closed. Deletion also blocks on an unexpired open/complete checkout, pending or leased billing event, a provider operation started within the last 15 minutes, active leased side effect, or unavailable Creem configuration. Active email side effects are selected through the workspace/status/lease-expiry index, so retained sent-email history is not read during readiness checks. Older running rows are abandoned evidence rather than active work and are failed by the billing cron.

Active entitlement creates or updates an idempotent blocked account job, returns `BILLING_PORTAL_REQUIRED`, and instructs the customer to cancel in Creem and wait for a terminal signed webhook. Other provider uncertainty returns a support-required result.

The worker repeats the persisted check, reads every referenced subscription from Creem, and repeats the composite local check inside the mutation that begins quiescence. This closes the request/provider and provider/quiescence races. Billing rows are purged only after confirmed inactivity; retained billing event records are payload-redacted for operational evidence.

## Source of truth

- Creem transport and schemas: `packages/backend/convex/integrations/creem.ts`
- Runtime configuration: `packages/backend/convex/billing/config.ts`
- Customer actions: `packages/backend/convex/billing/customer.ts`
- Webhook persistence and reconciliation: `packages/backend/convex/billing/internal.ts`
- Subscription and usage-cycle transitions: `packages/backend/convex/billing/lifecycle.ts`
- Atomic usage enforcement: `packages/backend/convex/ingestion/service.ts`
- Deletion guard and worker: `packages/backend/convex/lib/billingDeletionGuard.ts`, `packages/backend/convex/workspaces.ts`, and `packages/backend/convex/deletion/`
