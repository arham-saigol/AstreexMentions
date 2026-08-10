# Operations runbooks

These runbooks describe the current implementation. They do not assert that credential-backed incident drills or smoke tests have run.

## Safety rules

1. Identify the exact Convex deployment, Vercel project, Clerk instance, and provider mode before changing configuration.
2. Never paste secret values, tokens, raw webhook bodies, customer queries, or provider payloads into tickets or logs.
3. Prefer a reversible configuration or deployment rollback over direct table edits.
4. Do not clear leases, checkpoints, idempotency keys, warning timestamps, or provider event IDs by hand as a first response.
5. Record the time window, affected workspace/source IDs, provider request/event/message IDs, actions taken, and verification result.
6. A successful local build or fixture test is not evidence that a provider account or credential works.

## What the admin metrics page actually shows

The exact-admin-only `/metrics` page renders selectable 7/30/90-day ranges with:

- total non-deleted workspaces;
- “active workspaces,” defined as workspaces with a workspace-scoped `mentions_ingested` metric in the range, not signed-in or subscribed workspaces;
- global `mentions_ingested` count in the range;
- applied `email_delivery_delivered` webhook count in the range;
- daily mention volume;
- analyzed relevant mention counts by applied category, bucketed by `firstSeenAt`;
- provider request, success, failure, and average-latency totals.

The backend query also returns provider max latency/input/output/rate-limit/retry totals, mention platform totals, subscriptions, mention analysis, delivery states, and usage-paused workspace count. The current admin frontend schema does not parse or render those additional fields. Inspect the underlying Convex tables for incident triage.

Provider metric names are the persisted `provider` values. Tracking runs use `x`, `reddit_posts`, `reddit_comments`, and `hacker_news`; mention analysis uses `deepseek`; email and billing use `resend` and `creem`.

## Runbooks

- [Provider outage or rate limit](./provider-outage-rate-limit.md)
- [Creem webhook lag and replay](./creem-webhook-lag-replay.md)
- [Queue backlog and expired leases](./queue-backlog-expired-leases.md)
- [Usage cap and resume](./usage-cap-resume.md)
- [Mention analysis failures](./mention-analysis-failures.md)
- [Resend failures](./resend-failures.md)
- [Account deletion](./account-deletion.md)
- [Admin lockout](./admin-lockout.md)
- [Secret rotation](./secret-rotation.md)
- [Service recovery and rollback](./recovery.md)

See [testing](../testing.md) for deterministic and credential-backed verification boundaries.
