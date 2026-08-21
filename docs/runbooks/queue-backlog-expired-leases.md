# Queue backlog and expired leases

Astreex uses several durable workflows with different recovery behavior. Do not assume every queue has a cron or lease worker.

## Queue map

| Workflow/table                               | Dispatcher and throughput                                                                          | Lease/retry behavior                                                                                  | Current limitation                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tracking in `trackingSources`/`providerRuns` | One-minute cron; scans up to 256 due rows per source type, then applies provider budgets           | Four-minute versioned lease; expired reclaim and user-driven lease invalidation close the prior run   | Config/error-paused sources need explicit reactivation                                                              |
| Creem `billingEvents`                        | Durable wake-ups; 15-minute recovery sweep handles at most 16 due events                           | Direct mutation retry after 30 seconds; current processing does not use optional billing lease fields | Dead event IDs are terminal                                                                                         |
| Daily `digestRuns`                           | 15-minute dispatcher; batches of 64 continue immediately                                           | No lease; local-date/idempotency keys prevent duplicate runs/outbox rows                              | Failed render/config runs are terminal; no retry worker for failed runs                                             |
| Resend `emailOutbox`                         | Durable wake-ups; 15-minute recovery sweep handles at most 32 due rows                             | 60-second lease; up to 8 attempts; 30-second exponential retry capped at 6 hours                      | Dead rows have no admin requeue operation                                                                           |
| Resend `emailWebhookEvents`                  | Initial HTTP handler schedules reconciliation after 30 seconds                                     | `pending_match` retries by scheduled mutation; dead after 8 total match attempts                      | No cron scans `nextAttemptAt`; recovery depends on the scheduled reconciliation chain or a new reviewed repair path |
| `mentionAnalysisJobs`                        | Durable wake-ups; 15-minute sweep scans up to 256 due rows and schedules at most 4 batches/80 jobs | Shared four-minute batch lease; default 3 attempts; deterministic retry capped at 30 minutes          | No admin requeue or configurable provider budget/circuit; invalid category catalogs remain due                      |
| `deletionJobs`                               | Durable wake-ups; 15-minute recovery sweep handles at most 8 current-version jobs                  | Five-minute versioned lease; 10 attempts; exponential retry capped at 6 hours                         | Legacy versions are review-only; dead current jobs require exact-admin retry                                        |

## Detect and scope

1. Identify the affected table and oldest due timestamp, not just the row count.
2. Confirm that the relevant dispatcher cron is installed in the exact Convex deployment:
   - Creem recovery;
   - tracking dispatch;
   - mention analysis recovery;
   - daily digest dispatch;
   - email outbox recovery;
   - durable account deletion recovery.
3. Inspect function logs for repeated configuration, schema, provider, or scheduler failures.
4. Compare queue age with designed throughput and retry delay.
5. Use `providerRuns`/`providerMetricBuckets` for external operations. The admin metrics page does not show queue depth, oldest age, lease expiry, or dead-letter counts.

## Tracking backlog or expired lease

- A claim increments `leaseVersion` and stores an exact token/expiry. Only the current unexpired holder can start or persist.
- After expiry, the dispatcher may reclaim the source. The old action returns `stale_lease` or `stale_run` and cannot apply output.
- Do not clear lease fields or decrement `leaseVersion`; that weakens fencing.
- Resolve provider/config/entitlement/usage causes, then allow due active sources to reclaim naturally.
- Preserve in-progress cursor/page/window fields. They are reused after recovery.

## Email backlog or expired lease

- Expired 60-second leases schedule a recovery wake-up. The 15-minute sweep also claims them, subject to the 32-row cap.
- The stable outbox idempotency key is also the Resend idempotency key, so a replacement worker can repeat an accepted-but-unrecorded request safely.
- Missing delivery configuration blocks dispatch. If configuration disappears after claim, the action returns the row to pending in five minutes and rolls back that attempted claim.
- Do not create a second outbox row with a different key for the same message to “unstick” it.

## Digest, webhook-match, mention analysis, and deletion backlog

- A due digest with missing sender/`APP_URL` is not claimed, so the preference stays due. A created run that fails rendering/configuration is marked `failed`; no retry worker exists.
- `emailWebhookEvents.pending_match` has its own scheduled retry chain and no cron. If it becomes old without new attempts, a reviewed repair must invoke equivalent reconciliation; do not mark it applied without an outbox provider-message match.
- Durable wake-ups advance mention analysis jobs. The 15-minute sweep recovers missed work. Missing or invalid DeepSeek configuration returns a leased batch to pending without consuming an attempt. The retry delay is five minutes. Missing filtering context or a valid `Other` category leaves jobs due and unclaimed. Repeated `blockedCatalog` results require workspace or catalog repair. The dispatcher recovers expired four-minute leases. It closes each old provider run as `lease_expired` before it plans the next job state.
- Deletion jobs should advance by phase. A pending `security_fence` job is intentionally dormant until `nextAttemptAt`; a blocked job needs billing/reconciliation; a dead job needs exact-admin review and confirmation-gated retry. Never clear lease or quiescence fields manually.

## Recover and verify

1. Fix configuration/upstream availability before increasing throughput.
2. Let supported queues reclaim or retry under their existing idempotency and lease rules.
3. For terminal/dead or undispatched workflows, make a reviewed code/maintenance change; there is no generic queue replay command in this repository.
4. Verify:
   - oldest due age decreases;
   - new claims do not exceed provider budgets;
   - expired leases receive higher versions/tokens rather than being overwritten;
   - successful rows transition to their real terminal state;
   - no duplicate mention, billing event, digest, or email payload is created.

Escalate if the backlog grows while crons are installed and dependencies are healthy, if scheduled mutations stop firing, or if any operator action would require direct edits to idempotency/checkpoint fields.
