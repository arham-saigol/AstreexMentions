# Usage cap and resume

Use this runbook when a workspace stops ingesting because `mentionsUsed` reaches `mentionLimit`, or when a new period/upgrade does not resume monitoring.

## Expected cap behavior

- Only a newly inserted canonical mention consumes one unit. Rediscovery does not.
- When a new mention reaches the limit, that mention is inserted, the cycle count is updated, and active workspace sources are paused with `pauseReason: "usage"`.
- If the cycle is already at the limit before a candidate, that candidate and later candidates are not inserted. The result records the first unprocessed position and holds the provider checkpoint.
- 80% and 100% warning timestamps record that each threshold was handled, not that Resend delivered an email. An owner without a deliverable email produces no outbox row and does not block ingestion.
- A current active subscription without a valid open usage cycle fails closed as usage-exhausted.

The backend admin query calculates `usagePausedWorkspaces`, but the current admin frontend does not display it.

## Detect and scope

1. Inspect the latest effective `subscriptions` row and exact current `usageCycles` row:
   - `status: "open"`;
   - period contains the current time;
   - plan/limits snapshot is correct;
   - `mentionsUsed` and `mentionLimit` are non-negative integers.
2. Inspect all non-deleted `trackingSources` for the workspace. Usage-capped rows are `paused` with `pauseReason: "usage"` and no active lease.
3. Inspect the source checkpoint/window. A cap in the middle of a page must retain the unprocessed point; do not advance it manually.
4. Inspect the warning outbox keys `email:usage:<usageCycleId>:80` and `:100` and the cycle warning timestamps.
5. Confirm whether missing `RESEND_FROM_EMAIL` caused ingestion retries around a warning threshold. If the owner has no deliverable email, expect the warning timestamp without a matching outbox row; ingestion must continue.

## Resume paths

Supported automatic resume occurs during synchronized billing lifecycle changes:

- **New billing period:** close the old cycle, create a new open cycle with usage zero, then resume paid/usage-paused sources.
- **Same-period upgrade:** preserve usage and warning timestamps, raise limits from the mapped plan, and resume usage-paused sources only when `mentionsUsed < mentionLimit`.
- **Entitlement resume:** resume paid-paused sources; usage-paused sources resume only if capacity exists.

User-paused, configuration-paused, and error sources are deliberately not resumed by billing synchronization.

A customer can also pause/resume a keyword. Resume recalculates state from current entitlement and usage; it remains usage-paused when capacity is unavailable.

## Recover

1. Fix the authoritative Creem subscription event or product allowlist; do not patch `mentionLimit` independently of billing state.
2. Confirm the event created/preserved the correct cycle and that only one applicable open cycle governs the workspace.
3. Confirm `mentionsUsed < mentionLimit` after a new period or upgrade.
4. Allow billing synchronization to clear `pauseReason: "usage"`. If a prior event was missed, follow the Creem replay runbook.
5. If only selected sources remain paused, determine whether they are user/config/error pauses rather than usage pauses. Do not bulk-clear all pause reasons.

## Verify

- Sources are active only when entitlement and the current usage cycle both allow work.
- The held provider page/window resumes without inserting earlier candidates twice.
- The first newly inserted canonical mention increments usage once.
- Warning outbox idempotency prevents duplicate 80%/100% messages.
- At the next cap, all active workspace sources pause again atomically.

Do not report recovery from a raised UI number alone. Verify the persisted cycle, source pause reasons, checkpoint, and a successful provider/ingestion run.
