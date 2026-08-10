# Durable jobs and scheduling

Convex is the scheduler and durable state store. Provider calls run only in internal actions; mutations claim work, fence it, schedule actions, and atomically persist results.

This document describes deterministic/fixture-backed behavior. It does not imply that credential-backed provider jobs have run.

## Installed crons

`packages/backend/convex/crons.ts` installs six one-minute crons:

1. dispatch durable account deletions;
2. retry pending Creem billing events;
3. dispatch due tracking sources;
4. dispatch due mention analysis jobs;
5. dispatch due daily digest preferences;
6. dispatch pending/expired-lease email outbox rows.

## Tracking source model

One customer platform expands into these durable source types:

| Customer platform | Tracking source   | Provider            |
| ----------------- | ----------------- | ------------------- |
| X                 | `x`               | Xquik               |
| Reddit            | `reddit_posts`    | FetchLayer posts    |
| Reddit            | `reddit_comments` | FetchLayer comments |
| Hacker News       | `hacker_news`     | Algolia Hacker News |

The `(keywordId, sourceType)` pair is the logical source identity. A source persists its cadence, `nextRunAt`, failure/backoff state, checkpoint window/cursor/page, settled watermark, checkpoint version, and lease token/version/expiry.

### Polling intervals

The active backend scheduler uses these exact intervals:

| Source          |    Starter |     Growth |      Scale |
| --------------- | ---------: | ---------: | ---------: |
| X               |  5 minutes |  5 minutes |  5 minutes |
| Hacker News     | 10 minutes | 10 minutes | 10 minutes |
| Reddit posts    |    6 hours |    2 hours |     1 hour |
| Reddit comments |    6 hours |    2 hours |     1 hour |

### Deterministic `nextRunAt` staggering

A new or reactivated source computes its stable key as:

```text
{workspaceId}:{keywordId}:{sourceType}
```

FNV-1a hashing places the initial `nextRunAt` between `now` and `now + 59,999 ms`. This is deterministic for the same key and timestamp; it is not random security material.

The one-minute dispatcher applies a second deterministic delay before the action runs:

```text
hash("dispatch:{trackingSourceId}:{leaseVersion}") mod 55,001 ms
```

This spreads claimed provider requests across the minute rather than bursting at cron time.

After a terminal provider page, the scheduler advances from the persisted scheduled phase, not from completion time. Late completion skips already-missed boundaries while retaining the source's original phase.

## Due claims, budgets, and circuits

The dispatcher scans at most 256 due active rows per source type, merges source types belonging to one provider, and sorts by `nextRunAt` then source ID.

A provider may claim only the smaller of its per-minute cap and remaining current-hour request budget:

| Provider            | Default minute claims |                         Default hourly request budget |      Circuit threshold |   Cooldown |
| ------------------- | --------------------: | ----------------------------------------------------: | ---------------------: | ---------: |
| Xquik               |                    60 | `XQUIK_REQUESTS_PER_SECOND * 3,600` (default 360,000) | 5 consecutive failures |  5 minutes |
| FetchLayer Reddit   |                    30 | `FETCHLAYER_REQUESTS_PER_MINUTE * 60` (default 1,800) | 4 consecutive failures | 10 minutes |
| Algolia Hacker News |                    12 |                `HN_REQUESTS_PER_HOUR` (default 9,000) | 5 consecutive failures |  5 minutes |

All three dispatch settings must be positive integers. Xquik uses an hourly budget of `XQUIK_REQUESTS_PER_SECOND * 3,600` and a minute cap of `min(60, XQUIK_REQUESTS_PER_SECOND * 55)`. FetchLayer uses `FETCHLAYER_REQUESTS_PER_MINUTE` as its minute cap and multiplies it by 60 for the hourly budget. Hacker News uses `HN_REQUESTS_PER_HOUR` as its hourly budget and `min(12, HN_REQUESTS_PER_HOUR)` as its minute cap. Any invalid non-empty setting makes the shared tracking dispatcher fail closed before claiming work.

Hourly usage comes from persisted provider metric buckets. A circuit opens when the most recent runs within its cooldown window contain the threshold number of consecutive failures before any success. An open circuit claims no work until its calculated `openUntil` has passed; a newer success closes the consecutive-failure sequence.

## Versioned leases and fencing

Tracking leases last four minutes. A claim:

- increments `leaseVersion`;
- writes a token containing source ID, version, and claim time;
- stores the exact expiry;
- schedules the internal action.

Only a worker whose version, token, and expiry all match the current row, and whose lease is not expired, may start or persist a run. Expired leases are reclaimable and receive a higher fencing version. Stale actions return `stale_lease` or `stale_run` without applying provider output.

A provider run has idempotency key:

```text
tracking:{trackingSourceId}:{leaseVersion}
```

The start mutation inserts it once. Duplicate action delivery cannot create a second run for the same lease.

Keyword pause, resume, deletion, platform removal, query changes, inactive billing transitions, and workspace usage-cap pauses finalize any matching in-flight provider run before clearing or replacing its lease. During a usage-cap transaction, the triggering run remains owned by its scheduling mutation while every other invalidated run is finalized. Stale actions are fenced from persistence, while their runs and provider metrics reach a terminal state.

## Eligibility recheck

Immediately before a provider call, the action re-reads durable state and requires:

- a current lease;
- an active, non-deleted source;
- an active, non-deleted workspace and keyword;
- the source platform still selected by the keyword;
- the latest subscription to have active entitlement and contain `now` in its period;
- a current open usage cycle with remaining mention capacity;
- the source provider credential to be configured, except public Algolia HN.

Ineligible sources release their leases and move to a durable pause state:

| Reason                      | Stored state                      |
| --------------------------- | --------------------------------- |
| Keyword/platform inactive   | `paused`, `pauseReason: "user"`   |
| Paid entitlement inactive   | `paused`, `pauseReason: "paid"`   |
| Provider credential missing | `paused`, `pauseReason: "config"` |
| Mention capacity exhausted  | `paused`, `pauseReason: "usage"`  |

## Failure backoff

Retryable tracking failures use exponential backoff:

```text
min(6 hours, 30 seconds * 2^(consecutiveFailures - 1))
```

A stable hash applies a deterministic multiplier from 0.75 through 1.25. A provider `Retry-After` value is a floor, and the final delay remains capped at six hours. The source stores `backoffMs`, `backoffUntil`, and the same timestamp as `nextRunAt`.

Non-retryable failures move the source to `error`. Authentication and invalid-query failures also set `pauseReason: "config"`. Retryable failures keep the source active for a later claim.

## Checkpoint safety

Every provider execution works inside a persisted time window:

- an unfinished window is reused after lease recovery;
- otherwise the window starts at the settled watermark, or `now - interval` for a new source, and ends at claim time;
- the window, cursor/page, settled watermark, and `checkpointVersion` change only in the result mutation holding the current lease.

Cursor and page providers continue as follows:

- Xquik `hasMore` requires a non-empty advancing cursor;
- Algolia HN `hasMore` requires a non-negative next page;
- continuation increments `checkpointVersion` but keeps the same scheduled `nextRunAt`, cursor window, and cadence boundary;
- the terminal page clears in-progress cursor/page/window state.

FetchLayer exposes provider-managed pages but no safe client cursor. When `nextPageUrl` indicates more provider data, the scheduler persists an incremented page depth and repeats the same window with a larger `pages` request. Ingestion deduplicates the repeated prefix, and the window settles only after FetchLayer reports no next page.

A settled watermark is the maximum of the previous watermark, newest observed publication time, and window end. It never moves backward.

## Strict provider-result boundary

Actions serialize the normalized provider result and pass it to a mutation. Before storage, the mutation requires an exact result contract:

- `state: "ok"`;
- strictly validated normalized mentions;
- checkpoint observation;
- one of cursor, page, or provider-managed pagination;
- no invented top-level or mention fields.

Malformed JSON or an invalid normalized shape is a retryable provider execution failure. Raw provider payloads, credentials, headers, and customer queries are not stored in provider logs.

## Atomic ingestion and deduplication

One provider response is split into durable batches of at most 25 candidates. Every batch is staged before any is marked ready, then each ready batch is applied in one Convex serializable mutation, including scope checks, dedupe reads, inserts/rediscovery patches, usage accounting, keyword association, mention analysis enqueue, warning enqueue, metrics, and cap pause.

A candidate must match its source type. Canonical mention dedupe is workspace-scoped:

1. prefer `(workspaceId, platform, contentType, providerItemId)`;
2. otherwise use `(workspaceId, platform, contentType, normalizedFallbackKey)`.

If provider and fallback identities resolve to different rows, ingestion fails rather than merging them. Rediscovery cannot overwrite body, title, status, category, or analysis; it updates engagement fields plus `lastMatchedAt` and ensures the `(mentionId, keywordId)` association once.

New mentions:

- increment `mentionsUsed` exactly once;
- set `feedState: "pending"` and enqueue at most one mention analysis job using `mention-analysis:mention:{mentionId}`;
- increment global and workspace mention metrics;
- enqueue 80%/100% usage warnings when newly crossed.

At the mention cap, active workspace sources are atomically paused for usage. The mutation stores the first unprocessed candidate position on the durable provider batch and holds the checkpoint. The current and later batches remain ready; after a new billing period or higher same-period limit resumes the source, they are drained before another live provider request.

## Other durable workflows

### Creem billing inbox

Verified Creem events are deduplicated by provider event ID. Pending target/configuration failures retry after 30 seconds; the cron processes at most 16 due events each minute. Current processing runs directly in the mutation and does not use the schema's optional billing-event lease fields.

### DeepSeek mention analysis

The mention analysis cron scans up to 256 due or expired jobs. It considers at most 16 workspaces and schedules at most four batches. Each prompt-bounded batch contains at most 20 jobs from one workspace. Thus, one dispatch claims at most 80 jobs.

A claim snapshots the workspace filtering fields and the enabled category catalog. The catalog must contain exactly one enabled permanent system `Other` category. Jobs receive one shared four-minute lease. Linked mentions move to `analysisState: "leased"` and remain out of both customer feeds. Before the provider call, the action validates the lease, complete snapshot, mention links, workspace, and full input.

The worker validates the entire model result before one mutation applies a result. Every mention must receive relevance, priority, one enabled category, and bounded reasons. Success completes the jobs and mentions. It also sets feed state and records a versioned `deepseek` provider run with hourly metrics. A changed snapshot or invalid result retries the full batch without partial application. Retryable errors use deterministic 30-second exponential backoff capped at 30 minutes. Permanent or exhausted jobs become `dead`. Their mentions fail open as visible and unclassified. Ingestion gives each job three maximum attempts.

Missing or invalid DeepSeek configuration causes no provider call or telemetry write. The worker releases the lease and restores the claimed attempt. It returns jobs and mentions to pending and adds a five-minute delay. Missing filtering context or an invalid catalog blocks due jobs without consuming attempts.

### Daily digest

The digest cron scans at most 64 enabled due preferences, sorted by `nextRunAt` then ID. In one mutation it advances the preference to the next local wall-clock occurrence, records one run per workspace/local date, snapshots the deterministic top mention IDs, and schedules rendering. Empty days are recorded as `skipped_empty` and send no email. Time windows use IANA time zones and local calendar boundaries, including 23/25-hour DST days.

Digest runs do not currently have a lease. Idempotency keys prevent duplicate daily runs and duplicate outbox rows.

### Email outbox

The email cron claims at most 32 due pending or expired-lease rows. Email leases last 60 seconds and expired leases are recoverable. The durable outbox key is reused as Resend's provider idempotency key. Retryable sends use up to eight attempts with 30-second exponential backoff capped at six hours. Missing delivery configuration releases the lease, does not consume the attempted claim, and retries in five minutes.

See [providers.md](./providers.md) for the exact Resend transport and webhook projection.

## Current limitations

- Mention analysis has no admin requeue/repair control or configurable provider budget/circuit. Missing filtering context or a broken enabled-category catalog leaves due jobs pending until the workspace is repaired.
- FetchLayer pagination is resumed by durably increasing the provider-managed page depth; repeated prefix items are deduplicated.
- Fixture-backed and `convex-test` suites validate deterministic worker behavior, not provider credentials, quotas, payment state, DNS, or webhook delivery.

## Durable account deletion

The deletion cron claims at most eight due current-version account jobs per
minute. Pending/failed work and expired leased/running work are eligible.
Claims increment attempts and `leaseVersion`, issue a unique five-minute token,
and schedule the internal action. Legacy versions are never auto-claimed.

The action proceeds through `billing_check`, `purge`, `verify_data`,
`identity_delete`, `security_fence`, and `done`. Purge uses batches of 50 and
at most 20 batches per action, returning the job to pending when more work
remains. Retryable failures use deterministic exponential backoff from 30
seconds to six hours; permanent or exhausted failures become `dead`. Exact
admins can create a new generation from the latest dead job. Cancellation is
available only before `quiescedAt`.

## Source of truth

- Scheduler model: `packages/backend/convex/scheduling/model.ts`
- Dispatcher and persistence: `packages/backend/convex/scheduling/internal.ts`
- Provider execution action: `packages/backend/convex/scheduling/actions.ts`
- Atomic ingestion: `packages/backend/convex/ingestion/service.ts`
- Crons: `packages/backend/convex/crons.ts`
- Mention analysis dispatcher and state: `packages/backend/convex/mentionAnalysis/internal.ts`
- Mention analysis action: `packages/backend/convex/mentionAnalysis/actions.ts`
- Digest dispatcher: `packages/backend/convex/digest/internal.ts`
- Email outbox dispatcher: `packages/backend/convex/email/internal.ts`
