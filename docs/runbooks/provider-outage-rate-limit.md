# Provider outage or rate limit

Use this runbook for Xquik, FetchLayer Reddit, or Algolia Hacker News failures. X uses **Xquik**.

## Expected automatic behavior

| Condition                                                      | Stored behavior                                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Timeout, network failure, malformed response, 408, 429, or 5xx | Run fails, source stays `active`, and `nextRunAt`/`backoffUntil` use deterministic exponential backoff. A valid `Retry-After` is a floor. |
| 401/402/403                                                    | Non-retryable `auth`; source becomes `error` with `pauseReason: "config"`.                                                                |
| 400/404/409/422                                                | Non-retryable `invalid_query`; source becomes `error` with `pauseReason: "config"`.                                                       |
| Missing Xquik or FetchLayer key when a lease executes          | Source becomes `paused` with `pauseReason: "config"`; no provider request is sent.                                                        |
| Open provider circuit                                          | The one-minute dispatcher claims no work for that provider until cooldown expires.                                                        |
| Hourly budget exhausted                                        | No additional work is claimed until budget is available.                                                                                  |

Tracking retry delay is `30 seconds * 2^(consecutiveFailures - 1)`, deterministically jittered from 0.75 to 1.25 and capped at six hours. Xquik and Hacker News circuits open after five consecutive recent failures for five minutes; FetchLayer opens after four for ten minutes.

Hacker News uses the public Algolia API and has no credential. `HN_REQUESTS_PER_HOUR` defaults to 9000, sets the hourly budget, and limits minute claims to `min(12, value)`. An invalid value blocks the shared tracking-dispatch configuration.

## Detect and scope

1. On the admin metrics page, select the shortest range containing the incident. Check provider request/failure counts and average latency. The page does not show rate-limit or retry counts.
2. In the intended Convex deployment, inspect:
   - `providerRuns` by provider/status/start time for `errorCode`, bounded `errorMessage`, duration, operation, source, and workspace;
   - `providerMetricBuckets` for `rateLimitedCount`, `retryCount`, max/total latency, and item counts;
   - `trackingSources` for `status`, `pauseReason`, `lastError`, `consecutiveFailures`, `nextRunAt`, `backoffUntil`, lease fields, and checkpoint fields.
3. Separate one bad query/source from a provider-wide pattern. Do not copy `providerQuery` into a public incident record.
4. Confirm whether a Resend sender configuration failure is involved. After a provider response, ingestion requires `RESEND_FROM_EMAIL`; if sender configuration is missing, the source is paused as configuration and the provider run records `resend_provider_unconfigured`.
5. Check the provider status page/account quota outside the repository.

## Contain

- For 429s or quota pressure, reduce the appropriate Convex environment dispatch setting:

  ```sh
  pnpm --filter @astreex/backend exec convex env set XQUIK_REQUESTS_PER_SECOND
  pnpm --filter @astreex/backend exec convex env set FETCHLAYER_REQUESTS_PER_MINUTE
  pnpm --filter @astreex/backend exec convex env set HN_REQUESTS_PER_HOUR
  ```

  Values must be positive integers. Xquik's minute cap is `min(60, XQUIK_REQUESTS_PER_SECOND * 55)`, so low values can reduce it below 60. Hacker News minute claims are `min(12, HN_REQUESTS_PER_HOUR)`.

- For a broad outage, allow the circuit and retry backoff to suppress calls. Removing a provider key is a stronger containment action, but claimed sources will become configuration-paused and will not bulk-resume automatically when the key returns.
- Do not move checkpoints or settled watermarks forward to reduce backlog. That can discard an unprocessed provider window.
- Do not clear current leases. A stale worker is fenced by token, version, and expiry; expired four-minute leases are reclaimable.

## Recover

1. Restore or rotate the provider key, quota, or upstream service. For Hacker News, restore network reachability rather than adding a key.
2. Restore `RESEND_FROM_EMAIL` as well if sources show `resend_provider_unconfigured`.
3. Retryable sources recover through their stored `nextRunAt` and the one-minute dispatcher.
4. `paused/config` and `error/config` sources are not automatically reactivated by setting a key. There is no admin bulk-resume operation. A customer pause/resume of the affected keyword recalculates source state from current billing/usage and clears configuration/error state; for broad incidents, use a reviewed maintenance change rather than asking many customers to toggle individually.
5. Do not resume until the workspace has active entitlement and a current usage cycle. Otherwise the source will fail closed to `paid` or `usage` pause.

## Verify

- A new `providerRuns` row succeeds for each affected source type.
- `trackingSources` has no lease, `status: "active"`, cleared failure/backoff fields, and an expected future `nextRunAt`.
- Checkpoint version/progress advances only after validated persistence.
- `providerMetricBuckets` records success and no continuing rate-limit spike.
- A known approved result appears once as a tenant-scoped mention; rediscovery does not increase usage.

Escalate to a code repair if non-retryable sources must be bulk-reset, if provider runs remain `running` after leases are superseded, or if checkpoints appear inconsistent. The current admin app provides observation, not queue/source repair controls.
