# Resend failures

Separate composition, provider send, and signed delivery-webhook failures. They have different stored states and recovery paths.

## Failure boundaries

| Boundary                  | Required configuration                                        | Failure behavior                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage-warning composition | `RESEND_FROM_EMAIL`; optional `RESEND_REPLY_TO_EMAIL`         | Configuration missing during provider-result persistence pauses the tracking source with `pauseReason: "config"`. A missing owner email skips the warning outbox row, records the threshold as handled, and does not block ingestion. |
| Daily-digest composition  | Sender values plus absolute `APP_URL`                         | Digest dispatcher returns `blocked_config` before claiming due preferences. A created run with unavailable recipient/config/render becomes `failed`.                                                                                  |
| Outbox delivery           | `RESEND_API_KEY`; optional positive `RESEND_TIMEOUT_MS`       | Dispatcher blocks while unconfigured. A claimed row whose config disappears is returned to pending in five minutes without consuming the attempt.                                                                                     |
| Delivery projection       | `RESEND_WEBHOOK_SECRET` and reachable `.convex.site` endpoint | Missing config returns 503, missing Svix headers 400, invalid signature 401, processing failure 500/retry.                                                                                                                            |

## Detect and scope

1. Admin `/metrics` “Emails delivered” counts only applied `email.delivery_delivered` webhook events. It is not the number of accepted send API calls.
2. Inspect `emailOutbox`:
   - `pending`: due/retrying;
   - `leased`: current send attempt, 60-second lease;
   - `sent`: Resend returned a message ID; inspect `deliveryStatus` separately;
   - `dead`: non-retryable or exhausted send.
3. Inspect `providerRuns`/`providerMetricBuckets` for provider `resend`, operation `emails.send`, errors, retries, rate limits, and latency.
4. Inspect linked `digestRuns`. A dead outbox marks the linked digest `failed`.
5. Inspect `emailWebhookEvents` for `pending_match`, `applied`, `ignored_stale`, or `dead` and the matching provider message ID.
6. Check the Resend domain, API-key status, suppression/bounce state, webhook endpoint, and delivery logs outside the repository.

Do not place rendered customer email bodies or recipient addresses in public incident records.

## Send retry behavior

- Durable wake-ups dispatch new rows, retries, and expired leases. The 15-minute recovery sweep claims at most 32 due rows.
- Retryable statuses are 408, 409, 429, and 5xx, plus timeout/network/invalid-response failures.
- Sends retry up to eight attempts with 30-second exponential delay capped at six hours.
- The durable outbox idempotency key is sent to Resend as `Idempotency-Key`.
- A provider success changes the row to `sent`/delivery `sent`; it does not prove mailbox delivery.

## Webhook behavior

Supported event projection is:

```text
scheduled < sent < delivery_delayed < delivered < opened < clicked
< failed < suppressed < bounced < complained
```

A later provider timestamp wins; equal timestamps use the precedence above, then event-ID ordering. Older events become `ignored_stale` and cannot regress state.

A webhook arriving before the outbox has the provider message ID becomes `pending_match`, retries every 30 seconds through scheduled mutations, and becomes `dead` after eight total match attempts. There is no cron scanning this table.

## Recover

1. Restore sender/`APP_URL`, API key, verified domain, or webhook secret in the exact Convex deployment.
2. Pending and expired-lease outbox rows recover automatically after delivery configuration is healthy.
3. Retryable rows continue according to `nextAttemptAt`; do not duplicate them under a new idempotency key.
4. Configuration-paused tracking sources caused by missing sender values do not bulk-resume automatically. Follow the provider-outage runbook after restoring the sender.
5. Failed digest runs and dead outbox/webhook rows have no admin retry operation. Requeue/reconcile them only through a reviewed maintenance change that preserves the original payload fingerprint/idempotency key and provider message/event IDs.
6. Replaying the same Resend webhook event ID is a duplicate and will not revive a dead `pending_match` row. Prefer a new provider delivery event or a reviewed reconciliation path.

## Verify

- A controlled outbox row reaches `sent` with one provider message ID.
- The controlled mailbox receives the message and every link, including `/app/mentions`, resolves on the intended customer origin.
- A valid signed webhook updates `deliveryStatus` and creates the corresponding system metric once.
- A later bounce/complaint can replace a prior delivered state as designed.
- Warning timestamps correspond to durable enqueue, not claimed delivery.
- No duplicate outbox row or provider message is created during lease recovery.
