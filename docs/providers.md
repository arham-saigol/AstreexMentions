# Provider integrations

External calls are isolated in backend adapters/actions. Provider responses are normalized and validated before a Convex mutation can persist them.

This document describes implemented request contracts and fixture-backed behavior. It does not claim that Xquik, FetchLayer, Algolia, DeepSeek, or Resend credentials and quotas have been tested live.

## Common monitoring adapter contract

Xquik, FetchLayer, and Algolia adapters return:

```ts
{
  state: "ok",
  items: NormalizedProviderMention[],
  checkpoint: {
    newestProviderItemId?, newestPublishedAt?,
    oldestProviderItemId?, oldestPublishedAt?
  },
  pagination: Cursor | Page | ProviderPages
}
```

Normalized mentions require a stable provider ID, non-empty body/search text, canonical HTTP(S) URL, platform/content type, publication timestamp, and finite engagement score. The scheduling mutation revalidates a strict normalized contract before ingestion.

Monitoring requests default to a 15-second timeout. Errors are reduced to bounded codes:

| HTTP/result            | Code            | Retryable                                         |
| ---------------------- | --------------- | ------------------------------------------------- |
| 401, 402, 403          | `auth`          | No                                                |
| 400, 404, 409, 422     | `invalid_query` | No                                                |
| 408 or client timeout  | `network`       | Yes                                               |
| 429                    | `rate_limit`    | Yes; honors numeric/date `Retry-After` when valid |
| 5xx                    | `server`        | Yes                                               |
| Malformed/invalid JSON | `malformed`     | Yes                                               |
| Fetch/network failure  | `network`       | Yes                                               |

Provider logs contain only provider, operation, outcome, duration, item count, status, and bounded error code. They intentionally exclude URLs, query text, request/response bodies, headers, cursors, and keys.

## X: Xquik

The X vendor is **Xquik**.

| Property       | Contract                                       |
| -------------- | ---------------------------------------------- |
| Environment    | `XQUIK_API_KEY`                                |
| Endpoint       | `GET https://xquik.com/api/v1/x/tweets/search` |
| Authentication | `x-api-key: <XQUIK_API_KEY>`                   |
| Timeout        | 15 seconds                                     |

Query parameters:

| Parameter   | Contract                                   |
| ----------- | ------------------------------------------ |
| `q`         | Required non-empty query                   |
| `queryType` | `Latest` or `Top`; scheduler uses `Latest` |
| `limit`     | 1–200; scheduler uses 25                   |
| `cursor`    | Optional non-empty pagination cursor       |

The response must contain `tweets`, `has_next_page`, and an optional `next_cursor`. Each tweet requires ID, text, timestamp, and an author with ID, name, username, and verified flag. Optional counts are normalized into Astreex engagement fields. Canonical links are built as:

```text
https://x.com/{username}/status/{tweetId}
```

If `has_next_page` is true, `next_cursor` must be present and different from the request cursor. A missing or non-advancing cursor is treated as malformed and retryable; no checkpoint is advanced.

Scheduler policy is controlled by `XQUIK_REQUESTS_PER_SECOND` (default 100). It sets an hourly budget of value × 3,600 and a minute cap of `min(60, value × 55)`. See [jobs.md](./jobs.md).

## Reddit: FetchLayer

FetchLayer uses one credential but two separate source types and operations.

| Property           | Posts                                           | Comments                                                 |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------- |
| Source type        | `reddit_posts`                                  | `reddit_comments`                                        |
| Endpoint           | `POST https://fetchlayer.dev/api/reddit/search` | `POST https://fetchlayer.dev/api/reddit/search-comments` |
| Operation          | `posts.search`                                  | `comments.search`                                        |
| Normalized content | `post`                                          | `comment`                                                |

Authentication is:

```text
Authorization: Bearer <FETCHLAYER_API_KEY>
Content-Type: application/json
```

The shared request body accepts:

- required `query`;
- optional positive `limit` and `pages`;
- optional `sort`: `relevance`, `hot`, `new`, `top`, or `comments`;
- optional `subreddit`;
- optional `time`: `all`, `year`, `month`, `week`, `day`, or `hour`.

The scheduler sends `limit: 25` and `sort: "new"` independently to posts and comments. It begins with `pages: 1`; while FetchLayer reports another page, it durably increases the requested page depth up to four cumulative pages and reruns the same search window. The ceiling bounds provider response time and action memory; reaching it settles the current window even when FetchLayer advertises more history. Previously returned items are deduplicated during ingestion. The action splits each normalized response into at-most-25-item Convex mutations. Intermediate batches retain the lease and provider run; only the final batch advances the checkpoint. A retry can safely reapply earlier batches through ingestion idempotency.

Posts require enough data to derive stable ID, title/body, creation time, and Reddit permalink. Comments require stable ID, body, creation time, and permalink. Permalinks are accepted only for `reddit.com` or its subdomains and are canonicalized to `https://www.reddit.com/...`.

FetchLayer reports provider-managed pagination such as `nextPageUrl`, `pagesRequested`, and `pagesScraped`, but the documented search input intentionally has no cursor. Astreex does not fetch the provider-supplied URL. Instead, it persists the page depth and increases `pages` until FetchLayer reports no next page or the four-page cumulative ceiling is reached, then settles the current window.

`FETCHLAYER_REQUESTS_PER_MINUTE` defaults to 30 and sets both the per-minute claim cap and the hourly budget multiplier.

## Hacker News: Algolia

| Property          | Contract                                           |
| ----------------- | -------------------------------------------------- |
| Credential        | None                                               |
| Endpoint          | `GET https://hn.algolia.com/api/v1/search_by_date` |
| Scheduler request | Stories and comments, 25 hits per page             |

Supported parameters are required `query`, page, hits per page, and optional `tags`/`numericFilters`. The scheduler uses:

```text
tags=(story,comment)
numericFilters=created_at_i>=<windowStartSeconds>,created_at_i<=<windowEndSeconds>
```

Window start is rounded up to seconds and window end is rounded down. Algolia page pagination is persisted and continued until `page + 1 >= nbPages`.

Stories and comments are distinct normalized content types. HTML in story/comment text is converted to plain text, and canonical URLs always use:

```text
https://news.ycombinator.com/item?id={objectID}
```

`HN_REQUESTS_PER_HOUR` is a positive integer with default `9000`. It is the hourly request budget, and the minute claim cap is `min(12, HN_REQUESTS_PER_HOUR)`. A lower value reduces both limits; a higher value never raises the minute cap above 12. Invalid input makes the shared tracking-dispatch configuration fail closed.

## Mention analysis: DeepSeek

| Property       | Contract                                         |
| -------------- | ------------------------------------------------ |
| Environment    | `DEEPSEEK_API_KEY`                               |
| Endpoint       | `POST https://api.deepseek.com/chat/completions` |
| Model          | `deepseek-v4-pro`                                |
| Timeout        | `DEEPSEEK_TIMEOUT_MS`, default 120 seconds       |
| Authentication | `Authorization: Bearer <DEEPSEEK_API_KEY>`       |

The integration validates and sends this strict request shape:

```json
{
  "model": "deepseek-v4-pro",
  "temperature": 0,
  "reasoning_effort": "high",
  "thinking": { "type": "enabled" },
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<mention analysis contract>" },
    {
      "role": "user",
      "content": "{\"context\":{...},\"mentions\":[...]}"
    }
  ]
}
```

The prompt:

- includes the reviewed filtering context and guidelines once per batch;
- includes bounded matched-keyword context with each mention;
- includes only enabled category IDs, names, and descriptions;
- defines relevance and low, medium, and high priority policy;
- treats all supplied text as untrusted data, never as instructions;
- requires JSON only and forbids extra IDs, omissions, duplicates, and extra fields.

A batch contains at most 20 unique, non-empty mentions. Its prompt cannot exceed 48,000 characters. All text fields and output reasons have fixed limits. The response content must be valid JSON with exactly:

```json
{
  "results": [
    {
      "mentionId": "<input id>",
      "relevant": true,
      "relevanceReason": "<bounded explanation>",
      "priority": "low",
      "priorityReason": "<bounded explanation>",
      "categoryId": "<enabled category id>"
    }
  ]
}
```

Validation covers all input mentions. Every input ID must appear exactly once. Every category ID must come from the enabled catalog. An invalid ID, priority, reason, or object shape rejects the full batch before storage changes.

The one-minute Convex dispatcher groups prompt-bounded jobs from one workspace under a four-minute lease. Each lease has an exact analysis snapshot. The dispatcher schedules at most four batches. It calls `createDeepSeekMentionAnalysisRequester` only after it validates the lease, mentions, workspace, and snapshot. The catalog must include exactly one enabled permanent system `Other` category.

A result applies only after full-batch validation succeeds. Success atomically stores all analysis fields, feed state, and job state. Provider runs and metrics use a versioned `mention_analysis:` operation. Retryable errors use deterministic queue backoff from 30 seconds to 30 minutes. Permanent or exhausted jobs become `dead`. Linked mentions fail open as visible and unclassified. Missing or invalid DeepSeek configuration causes no request or provider telemetry. It restores the claimed attempt and returns jobs to pending for five minutes.

Fixture-backed and `convex-test` worker coverage does not prove that a real account can access `deepseek-v4-pro`, accepts the implemented request fields, or returns valid production analysis.

## Email: Resend

Resend has three separate configuration boundaries:

| Use                    | Required values                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| Compose usage warnings | `RESEND_FROM_EMAIL`; optional `RESEND_REPLY_TO_EMAIL`                        |
| Compose daily digests  | Above plus absolute `APP_URL`                                                |
| Deliver outbox         | `RESEND_API_KEY`; optional positive `RESEND_TIMEOUT_MS` (default 15 seconds) |
| Verify webhook         | `RESEND_WEBHOOK_SECRET`                                                      |

The sender domain must be verified in Resend outside this repository.

### Send contract and idempotency

Delivery sends:

```text
POST https://api.resend.com/emails
Authorization: Bearer <RESEND_API_KEY>
Idempotency-Key: <emailOutbox.idempotencyKey>
```

The JSON body contains `from`, `to`, `subject`, `html`, optional `text`, and optional `reply_to`. The success response must be exactly `{ "id": "<non-empty provider message id>" }`.

Idempotency exists at two layers:

1. Convex indexes the durable outbox by `idempotencyKey` and stores a stable payload fingerprint. Reusing a key with different recipients/content/from/subject/reply-to is an `IDEMPOTENCY_COLLISION`.
2. The same durable key is passed to Resend as `Idempotency-Key`. If a 60-second lease expires after Resend accepted the request but before Convex recorded success, the replacement worker repeats the same provider-idempotent request.

The email cron claims at most 32 pending or expired-lease rows per minute. Retryable failures use up to eight attempts with delays of 30 seconds, 60 seconds, 120 seconds, and so on, capped at six hours. HTTP 408, 409, 429, and 5xx are retryable. Missing delivery configuration releases the lease, rolls back the attempt count, and retries after five minutes. Non-retryable or exhausted sends become `dead`; a linked digest run becomes `failed`.

A successful send sets outbox `status: "sent"`, `deliveryStatus: "sent"`, and the provider message ID. It does not prove inbox delivery.

### Signed webhook

The Convex route is:

```text
POST https://<deployment>.convex.site/webhooks/resend
```

The handler requires `svix-id`, `svix-timestamp`, and `svix-signature`, reads the raw body once, and verifies it with Resend's official Standard Webhooks/Svix verifier before parsing or persistence. Missing headers return 400; invalid signatures return 401.

Supported outbound delivery event types are:

- `email.scheduled`
- `email.sent`
- `email.delivery_delayed`
- `email.delivered`
- `email.opened`
- `email.clicked`
- `email.complained`
- `email.bounced`
- `email.failed`
- `email.suppressed`

A successfully verified event outside that schema, such as `email.received`, returns 202 `ignored` and is not persisted.

The Svix ID is the durable event idempotency key `(provider = resend, eventId)`. Events match an outbox row by Resend message ID. A webhook that arrives before send completion is retained as `pending_match`, retried every 30 seconds, and becomes `dead` after eight matching attempts if no outbox row appears. If the matched outbox belongs to a deletion-pending, deleted, or already-removed workspace, the event is settled as ignored without an outbox/workspace link or delivery metric; reconciliation applies the same fence.

Out-of-order events cannot regress delivery state. A later provider timestamp wins. At the same timestamp, precedence is:

```text
scheduled < sent < delivery_delayed < delivered < opened < clicked
< failed < suppressed < bounced < complained
```

If timestamp and type are equal, the lexicographically greater event ID wins. Older or duplicate events are stored as `ignored_stale`; applied events update delivery metrics.

### Resend limitations

- Delivery/open/click/bounce/complaint state depends on the signed webhook being configured and reachable.
- Webhook state is a latest-event projection, not a permanent monotonic “success” flag; a later bounce or complaint can replace `delivered`.
- Usage warning timestamps record successful outbox enqueue, not delivery.
- Daily digest rendering builds the Astreex CTA as `/app/mentions` from `APP_URL`.
- Fixture tests do not verify DNS, sender reputation, mailbox delivery, suppression behavior, webhook reachability, or that emailed links resolve in a deployed app.

## Source of truth

- Monitoring adapters: `packages/backend/convex/integrations/providers/`
- Monitoring action: `packages/backend/convex/scheduling/actions.ts`
- DeepSeek transport: `packages/backend/convex/integrations/deepseek.ts`
- DeepSeek validation: `packages/backend/convex/lib/deepseekMentionAnalysis.ts`
- Resend transport: `packages/backend/convex/integrations/resend.ts`
- Resend outbox: `packages/backend/convex/email/internal.ts`
- Resend webhook: `packages/backend/convex/email/resendHttp.ts` and `email/webhookInternal.ts`
