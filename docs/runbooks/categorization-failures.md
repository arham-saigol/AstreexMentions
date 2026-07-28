# Categorization failures

Use this runbook when mention analysis remains pending, DeepSeek requests fail, leased jobs expire, or categories are not applied.

## Expected automatic behavior

Ingestion creates one idempotent `categorizationJobs` row per new mention with model `deepseek-v4-pro`, status `pending`, attempts `0`, default `maxAttempts: 3`, and `nextAttemptAt` equal to creation time.

The one-minute categorization cron:

- scans up to 256 due pending or expired-lease rows;
- considers at most 16 workspaces per dispatch;
- schedules at most four batches, each containing 1–50 jobs from one workspace;
- snapshots enabled category IDs, names, and descriptions;
- requires exactly one enabled permanent system category named `Other`;
- gives each batch one four-minute lease and moves linked mentions to `analysisState: "leased"`.

The action rechecks the lease, category snapshot, mention/workspace links, and complete input before calling DeepSeek. One mutation applies a result only after every input mention is assigned exactly once to an enabled category. No partial batch assignment is committed.

Successful batches mark jobs and mentions `completed`, assign categories, and write a `providerRuns` row plus an hourly `providerMetricBuckets` update for provider `deepseek`, operation `chat.completions`.

## Failure states

| Condition                                                                                   | Stored behavior                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing `DEEPSEEK_API_KEY` or invalid `DEEPSEEK_TIMEOUT_MS`                                 | No provider call or telemetry. Lease is released, the claimed attempt is restored, jobs/mentions return to pending, and `nextAttemptAt` moves five minutes forward.                            |
| Missing/disabled/invalid permanent `Other` category                                         | Jobs remain due and unclaimed; dispatcher reports them in `blockedCatalog`; attempts do not increase.                                                                                          |
| Category snapshot changes before execution/application                                      | Whole batch retries; no category is partially applied.                                                                                                                                         |
| Timeout, network/server/rate-limit failure, malformed response, or invalid total assignment | Jobs return to pending with deterministic exponential backoff starting at 30 seconds and capped at 30 minutes. A valid provider `Retry-After` is used within that cap.                         |
| Authentication or permanent request failure                                                 | Jobs become `dead`; linked mentions become `analysisState: "failed"`.                                                                                                                          |
| Retryable failure at `maxAttempts`                                                          | Jobs become `dead`; linked mentions become failed.                                                                                                                                             |
| Four-minute lease expires                                                                   | The prior running provider run is closed as `lease_expired` when present. The job returns to pending or becomes dead when attempts are exhausted; a replacement lease fences the stale action. |

The admin backend query returns categorization totals, but the current admin frontend does not parse or render them. The backend's `failed` metric currently checks a nonexistent job status instead of terminal `dead`, so inspect `categorizationJobs` directly for dead-letter counts.

## Detect and scope

1. Confirm that `dispatch mention categorization jobs` is installed in `packages/backend/convex/crons.ts` and deployed to the exact Convex target.
2. Inspect `categorizationJobs` by `status`, due/lease time, workspace, model, attempts, `lastError`, and age.
3. Inspect linked mentions for `analysisState` and `categoryId`.
4. Inspect `providerRuns` for provider `deepseek`, operation `chat.completions`, trigger, attempt, bounded error code/message, input/output counts, and unfinished `running` rows.
5. Inspect `providerMetricBuckets` for request, success, failure, retry, rate-limit, latency, and item totals.
6. Inspect the workspace's enabled categories. Confirm one row has `systemKey: "other"`, `isSystem: true`, `name: "Other"`, no `deletedAt`, and `enabled: true`.
7. Check the DeepSeek account, key, quota, and model availability outside the repository. Fixture-backed tests are not credential evidence.

Do not copy mention text, prompts, authorization headers, API keys, or raw provider responses into incident records.

## Contain

- Do not clear lease fields, reduce attempts, change job status, or assign categories manually as a first response.
- Do not apply part of a model response. The correctness boundary is total batch validation.
- For an upstream outage or quota incident, allow queue backoff to suppress retries. Removing the key is a stronger containment action; it keeps work pending and does not consume attempts.
- Do not disable or delete the permanent `Other` category to stop categorization; that leaves due work repeatedly blocked at catalog validation.

## Recover

1. Restore a valid `DEEPSEEK_API_KEY` and positive `DEEPSEEK_TIMEOUT_MS`, or repair provider access. Configuration-blocked jobs resume automatically after their stored five-minute delay.
2. Repair the enabled category catalog if `blockedCatalog` is nonzero. Preserve exactly one permanent system `Other` category.
3. Allow retryable jobs and expired leases to recover through the one-minute dispatcher. Do not create duplicate jobs for the same mention.
4. Dead jobs have no admin requeue operation. Reprocessing requires a reviewed maintenance/code path that preserves the original mention/workspace scope, uses a new fenced attempt, and does not overwrite a later valid category assignment.
5. If a provider run remains `running` after its lease should have been recovered, verify that the job is still discoverable by the expired-lease index and that the dispatcher is executing before editing state.

## Verify

- Due queue age decreases and dispatch stays within four batches/200 jobs per cron run.
- A controlled batch reaches `completed`, every mention receives one enabled category, and usage counters do not change.
- The corresponding `deepseek` run and hourly metric bucket record the exact input/output count without sensitive content.
- A rejected output leaves every category unchanged and returns the whole batch to pending or dead according to policy.
- A stale action cannot apply after lease expiry and replacement.
- Missing configuration causes no provider request, no telemetry churn, and no consumed attempt.

Do not report credential-backed recovery based only on local tests, typechecking, or queue transitions without a real DeepSeek request when that evidence is required.
