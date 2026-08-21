# Mention analysis failures

Use this runbook when analysis stays pending, Vertex Gemini requests fail, leases expire, or results are not applied.

## Expected behavior

Ingestion creates one `mentionAnalysisJobs` row for each new mention. The linked mention starts with `analysisState: "pending"` and `feedState: "pending"`.

The one-minute cron does this work:

- It scans at most 256 due or expired jobs.
- It considers at most 16 workspaces.
- It schedules at most four batches.
- Each batch contains at most 20 jobs from one workspace.
- It snapshots the filtering fields and enabled categories.
- It gives each batch a four-minute lease.

The action checks the lease and snapshot before it calls Vertex Gemini. It validates the complete response before it writes any result.

A successful result sets relevance, priority, category, reasons, and the analysis version. Relevant mentions become visible. Irrelevant mentions move to the Filtered view.

## Failure states

| Condition                             | Stored behavior                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Missing provider configuration        | The worker releases the lease. The job returns to pending without a consumed attempt.               |
| Invalid category catalog              | The dispatcher leaves the job due and reports `blockedCatalog`.                                     |
| Analysis snapshot changes             | The complete batch retries. The worker applies no result.                                           |
| Temporary provider or output error    | The job returns to pending with bounded backoff.                                                    |
| Permanent error or exhausted attempts | The job becomes `dead`. The mention becomes visible and unclassified.                               |
| Expired lease                         | The dispatcher closes the old provider run. It retries or ends the job, based on the attempt count. |

## Detect and scope

1. Make sure that `dispatch mention analysis jobs` is installed in `packages/backend/convex/crons.ts`.
2. Inspect `mentionAnalysisJobs` by status, due time, lease time, workspace, attempt count, and `lastError`.
3. Inspect linked mentions for `analysisState`, `feedState`, `priority`, `categoryId`, and `analysisVersion`.
4. Inspect `providerRuns` for provider `gemini` and operation `mention_analysis:mention-analysis-v2`.
5. Inspect `providerMetricBuckets` for request, error, retry, rate-limit, latency, and item totals.
6. Inspect the workspace filtering fields and enabled category catalog.
7. Make sure that one enabled permanent system category has `systemKey: "other"` and `name: "Other"`.

Do not put mention text, prompts, headers, keys, or raw provider responses in incident records.

## Contain

- Do not edit lease fields or attempt counts as the first response.
- Do not apply part of a model response.
- For a provider outage, let the queue use its stored backoff.
- Do not remove the permanent `Other` category to stop analysis.

## Recover

1. Restore the provider configuration or provider access.
2. Repair the enabled category catalog if `blockedCatalog` is not zero.
3. Let pending jobs and expired leases recover through the dispatcher.
4. Do not create a duplicate job for the same mention.
5. Use a reviewed maintenance path for dead jobs. No admin requeue operation exists.

## Verify

- A cron run claims at most 80 jobs in four batches.
- A controlled batch applies relevance, priority, category, reasons, and the analysis version.
- A filtered result stays out of the normal feed and remains in the Filtered view.
- A terminal error makes the mention visible and unclassified.
- Usage counters do not change during analysis or manual restoration.
- A stale action cannot apply after a lease or snapshot change.
- Missing configuration causes no provider request and no consumed attempt.

Local tests do not prove that production provider credentials work. Use a real Vertex Gemini request when credential evidence is required.
