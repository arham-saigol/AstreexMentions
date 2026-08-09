# Free evaluation and AI-assisted onboarding

## Goal

Replace the current seven-step, payment-gated onboarding with a short flow that learns about the customer from their website, recommends monitor keywords, and lets them begin monitoring without paying. The free option is an evaluation allowance, not a publicly marketed freemium plan.

A completed onboarding must activate monitoring immediately for either the free evaluation or an authoritative paid subscription. It must preserve every selected keyword, even when the chosen tier cannot activate them all.

## Product decisions

### Free evaluation

- The free option is available only during onboarding and in the plan-selection UI. Do **not** add a Free card to the public pricing section.
- Pricing/onboarding copy may say: **“First 100 mentions free.”**
- A free workspace has one active keyword and a non-resetting, lifetime allowance of 100 newly collected mentions.
- It has the same platforms (X, Reddit, Hacker News), mention analysis, custom categories, digests, and other product capabilities as paid plans. Limits are only active-keyword capacity and the 100-mention allowance.
- When the 100th unique mention is committed, stop collection atomically and show a clear upgrade state. Do not silently drop later provider results.
- Free-tier mentions expire 60 days after collection. Do not advertise this on the public pricing page. Enforce it in the product and retention machinery; expired mentions must not be returned by dashboard APIs and must be purged in bounded background work.
- A paid subscription takes precedence over the evaluation allowance. Paid usage remains the existing recurring, provider-authoritative usage-cycle model. A lapsed paid subscription may use any unconsumed free allowance; it must not receive a new one. Reconcile active keywords whenever paid entitlement starts, changes capacity, or ends: activate the deterministic paid subset only after the authoritative subscription update, and reduce it to the free subset if access falls back to free.

### Keywords and plan capacity

- Remove the onboarding distinction between brand, competitor, and other keywords. A keyword has one user-visible form: phrase, optional description, and selected platforms.
- Add an optional keyword description with a 160-character maximum. It is context for mention analysis, not a provider query.
- The discovery system may keep a non-user-facing `brand candidate` signal solely to choose the best initial active keyword. It must never add a brand keyword the user did not select.
- Save every keyword selected during onboarding. Only activate the number covered by the selected plan/evaluation: one for free, or the paid plan’s keyword limit.
- When a selection exceeds capacity, activate the selected brand candidate first if one exists; otherwise retain the user’s selection order. Persist the remaining keywords as paused for the plan-capacity reason. Show a toast after completion that names the active and paused counts and directs the user to Keywords.
- On Keywords, paused keywords stay visible and users can pause the active keyword and resume a paused one to swap their active slot. Server-side capacity checks remain authoritative and must be concurrency safe.

### Onboarding flow

1. Ask for the company website, with an optional manual company-description fallback for an unavailable/private site.
2. Fetch the submitted site and use AI plus web search to produce an editable concise company description and recommended keywords.
3. Present a single clean keyword-selection screen. Each recommended row includes phrase, short relevance description, and editable platform choices. Users can select suggestions, edit them, remove them, or add a custom keyword in the same UI.
4. Present paid plans plus a visually polished free evaluation option. Make it clear that all plans include the same features and that the free path includes the first 100 mentions; do not add free to the marketing price-card grid.
5. Atomically save categories already initialized for the workspace, the selected keyword configuration, and the chosen access path; then send the user to the app. Paid checkout retains its current authoritative Creem confirmation behavior. The free choice requires no checkout.

The existing category-configuration onboarding screens are removed. Default categories continue to come from workspace bootstrap, and custom categories remain available in the application.

### Website research and recommendations

- Use TinyFish Fetch for the submitted website and TinyFish Search for a bounded number of AI-derived competitor/product searches. TinyFish Search and Fetch use `X-API-Key`; Fetch accepts only HTTP(S) URLs and has a ten-URL request maximum. Use direct server-side `fetch` with explicit request/response schemas rather than adding an SDK solely for two HTTP APIs.
- Use the existing DeepSeek integration to turn bounded website/search material into structured output. Do not give the model unrestricted network access or accept tool arguments/output without schema validation.
- The orchestration should be fixed and bounded: validate/canonicalize one submitted URL; Fetch it as Markdown; have the model propose a small number of search queries; execute those searches; then have the model return the company summary and a limited set of keyword suggestions. Fetch additional search-result pages only when needed and within TinyFish’s ten-URL cap.
- Validate every model response with strict Zod schemas. Treat remote page/search content as untrusted prompt input, delimit it in prompts, and instruct the model not to follow instructions contained in it.
- Store the resulting concise company context and selected keyword descriptions so the planned relevance/filter agent can consume them later. The relevance/filter agent itself is not part of this work.
- Discovery calls are authenticated, server-only, rate-limited per workspace, and idempotent/recoverable across a reload. Never expose the TinyFish key to the browser or persist raw fetched page bodies longer than required to create the reviewed suggestions.

## Existing implementation context

- Current UI: `apps/web/components/onboarding/onboarding-flow.tsx` and draft model `apps/web/lib/onboarding-draft.ts` implement seven steps: own keywords, other keywords, platforms, categories, preview, and paid-plan checkout.
- Current onboarding mutation: `packages/backend/convex/onboarding.ts` calls `replaceWorkspaceKeywordConfiguration`, which currently rejects more keywords than the subscription limit and treats no subscription as an unpaid draft.
- Existing paid entitlement and recurring counters live in `subscriptions` and `usageCycles`; ingestion in `packages/backend/convex/ingestion/service.ts` atomically increments `mentionsUsed` and pauses sources at a cap. Reuse that transactional cap behavior for the evaluation rather than implementing client-side counting.
- `packages/backend/convex/keywords.ts` currently makes every no-subscription source paused with reason `paid`; `apps/web/lib/product-access.ts` correspondingly treats non-subscribers as preview/onboarding only. Both need an explicit free-evaluation access path.
- The public pricing section is in `apps/web/app/(public)/page.tsx`; keep its three paid cards and add only the agreed subheading/copy about the first 100 mentions.
- Separately from this rollout, the DeepSeek mention analysis pipeline receives mention text, category definitions, filtering fields, and matched-keyword context (`packages/backend/convex/mentionAnalysis/internal.ts` and `packages/backend/convex/lib/deepseekMentionAnalysis.ts`).

## Implementation plan

### 1. Model a durable free allowance and active capacity separately from paid billing

Update `packages/backend/convex/schema.ts` and add a focused access/allowance module (for example `packages/backend/convex/lib/workspaceAccess.ts`) that resolves the single effective monitoring allowance for a workspace at a supplied time.

- Persist a one-time free-evaluation grant per workspace, including its 100-mention limit, consumed count, activation time, and exhaustion time. It must be created once and never reset by onboarding retries, subscription changes, or billing-cycle rollover.
- Keep paid subscriptions and Creem-created `usageCycles` intact. The resolver chooses an active paid cycle when a subscription has current entitlement; otherwise it returns the workspace’s free grant if one exists. Do not create a fake recurring paid cycle or infer paid entitlement from the free grant.
- Make active-keyword capacity part of the resolved allowance (`1` for free; the current paid cycle’s keyword limit for paid) and distinguish configured/paused keywords from active capacity.
- Add a precise paused-source reason for plan/evaluation keyword capacity rather than overloading user pause, provider configuration failure, or missing payment. Update validators, result types, and UI copy that exposes pause reasons.
- Add `description` to `keywords` (optional, max 160 characters) and add only the internal metadata necessary to retain onboarding selection order and identify an AI-suggested brand candidate. Do not add a user-facing keyword kind.
- Add a retention-expiry timestamp to mentions created under the free allowance, plus an index that permits bounded expiration scans. Paid mentions have no expiry timestamp.
- Generate Convex API types after schema changes. Follow `packages/backend/convex/_generated/ai/guidelines.md`: all public/internal functions get validators, all queries stay bounded/index-backed, and no client-provided user/workspace identity is trusted.

### 2. Centralize entitlement, keyword activation, and ingestion behavior

Refactor `packages/backend/convex/keywords.ts`, `packages/backend/convex/mentions.ts`, and `packages/backend/convex/ingestion/service.ts` to consume the shared resolver.

- Replace subscription-only `readBillingKeywordState`/`desiredTrackingState` logic with one resolver that supports paid, free, no-access, user-paused, capacity-paused, and allowance-exhausted states.
- Change onboarding application from destructive replacement-plus-limit rejection to an atomic configuration operation that upserts all selected keywords, records deterministic activation priority, selects the active subset when an allowance is effective, pauses overflow keywords, and synchronizes their source schedules. Preserve current atomic rollback behavior if category/workspace updates fail.
- For a paid choice before Creem confirms entitlement, persist the complete selection and priority but leave sources payment-paused; do not grant paid collection from a client-selected plan. When the billing lifecycle applies the authoritative subscription update, invoke the same reconciliation path to activate the paid-capacity subset and keep overflow capacity-paused. Apply the same reconciliation if a plan is downgraded, canceled, or expires.
- Update create/update/pause/resume keyword APIs to accept and return descriptions and enforce active capacity server-side. Resuming a paused keyword must fail when a slot is occupied; pausing an active keyword then resuming another is the supported swap path. Do not rely on button disabled state for authorization or quotas.
- Adapt ingestion’s existing serializable cap check to resolve either paid usage or the free grant, increment the appropriate counter exactly once for a newly inserted mention, set the free mention expiry, and pause eligible sources when the selected allowance is exhausted. Rediscovery must not consume allowance or extend a free mention’s retention.
- Update mention monitoring-state queries and product access decisions so free workspaces are `active` until the allowance is exhausted, rather than `unpaid`/preview. Preserve the paid provider configuration error state only for paid checkout actions.
- The mention analysis batch loader includes bounded filtering context and matched-keyword descriptions. Loading and application validate relevance, priority, category and mention IDs, bounded reasons, extra fields, batch cardinality, and atomic whole-batch application while preserving prompt limits.

### 3. Implement free-mention retention

Add an internal retention module (for example `packages/backend/convex/retention.ts`) and register a bounded cron in `packages/backend/convex/crons.ts`.

- Dashboard mention queries must exclude rows whose free retention expiry is at or before the caller-provided `now`; never read the wall clock inside reactive queries.
- In fixed batches, find expired mentions with the new index; delete their keyword-match and mention-analysis-job children before deleting the mention. Handle an in-flight analysis job as stale rather than allowing it to recreate or update an expired mention.
- Keep the worker idempotent, transaction-bounded, and safe to retry. Continue through batches using scheduled continuations if needed; do not collect an unbounded retention set.
- Update any dashboard counts, empty states, saved views, and keyword summaries that assume every stored mention is visible.

### 4. Add TinyFish-backed onboarding discovery

Create a small, provider-isolated TinyFish adapter under `packages/backend/convex/integrations/` and an onboarding discovery action/module alongside `packages/backend/convex/onboarding.ts`.

- Declare `TINYFISH_API_KEY` in `packages/backend/convex/convex.config.ts`; read it via generated `env`. Add a clear blocked-configuration result without leaking missing-secret details to unauthenticated callers.
- Validate input URLs: trimmed absolute HTTP(S), no credentials, and a practical maximum length. TinyFish Fetch also rejects private/localhost/metadata targets; surface a safe, actionable failure rather than trying alternate internal URLs.
- Call TinyFish Fetch with Markdown output and explicit per-URL timeout. Call Search with a purpose/intent and a fixed query/result cap. Validate TinyFish payloads before model use, cap extracted text/search snippets, and record provider-run/metric outcomes using the project’s existing operational patterns.
- Add a workspace-scoped onboarding-research record/state so duplicate clicks and reloads reuse a completed result or resume a known request instead of repeatedly purchasing/triggering external work. Add a per-workspace discovery cooldown using the recommended Convex rate-limiter component rather than a hand-rolled counter.
- Reuse the DeepSeek runtime integration with a strict structured schema: concise company description; limited suggested keywords; each suggestion’s phrase, <=160-character description, platform array, and internal brand-candidate flag. Require human review before any suggestion becomes a monitor.
- Persist only the concise reviewed company summary and accepted keyword context. Do not persist full fetched pages or arbitrary search-result content.

### 5. Replace the onboarding UI and update product surfaces

Refactor `apps/web/components/onboarding/onboarding-flow.tsx` and `apps/web/lib/onboarding-draft.ts`; split focused presentational components into `apps/web/components/onboarding/` if the current single file does not remain readable.

- Replace the seven-step local-storage draft (including `kind`, category editor, workspace preview, and mandatory paid checkout) with website/manual-description, discovery results/keyword selection, and plan selection.
- Build an accessible, minimal keyword editor used for both AI suggestions and custom entries. It must support edit/remove, optional 160-character description, all three platform toggles, duplicate phrase feedback, and at least one platform. Default suggested platforms from the AI response; default custom keywords sensibly but visibly.
- Display the returned concise company description as editable review context before suggestions are saved. Include loading, provider-unavailable, no-suggestion, and retry states without losing the user’s website/custom entries.
- In the plan step, render paid cards from `PLAN_DEFINITIONS` plus a visually integrated `Start free` choice that does not require a Creem product. Show selected keyword count versus each active-keyword allowance, but allow over-cap selection because overflow remains saved and paused.
- On free selection, create/reuse the durable free grant, invoke the atomic onboarding configuration, and route to `/app/mentions`. On paid selection, save the complete configuration and activation priority first, retain the current idempotent Creem checkout/reconciliation flow, and do not activate paid sources, show the overflow toast, or claim paid access until the provider confirms it.
- After either path completes, present the required overflow toast. On `/app/keywords`, replace “draft configuration/unpaid” language with free-evaluation and capacity-paused states; display descriptions in add/edit flows and clarify the pause/activate swap action.
- Update `apps/web/lib/product-access.ts`, `apps/web/components/keywords/*`, `apps/web/components/mentions/*`, and settings/usage displays so free users can use the app normally, see their one-time allowance, and receive an upgrade CTA when exhausted.
- In `apps/web/app/(public)/page.tsx`, retain the three paid pricing cards and add the agreed unobtrusive statement that the first 100 mentions are free. Do not mention the 60-day retention policy in this marketing section.

### 6. Tests and verification

Add focused tests at the public seams and update affected fixtures/types:

- `packages/backend/tests/onboarding-atomic.test.ts`: applying an over-cap free/paid onboarding selection preserves all keywords, activates the selected brand candidate when present, keeps a pre-payment paid selection payment-paused, activates/pauses the correct subset after authoritative billing reconciliation, and rolls back all changes on later validation failure.
- `packages/backend/tests/keywords-mentions.test.ts`: free workspaces are active with one active slot; user-driven slot swaps work; overflow cannot resume while capacity is full; keyword descriptions persist and remain tenant-scoped.
- `packages/backend/tests/ingestion-atomic.test.ts`: 100th free unique mention is committed once, sources pause atomically, concurrent sources cannot overrun the cap, rediscovery does not increment the free counter or change expiry, and paid ingestion remains unchanged.
- New retention tests: expired free mentions disappear at the public mention-query seam and the retention worker removes a bounded batch plus its associations/jobs without touching paid mentions.
- New onboarding discovery/provider tests: reject unsafe input and malformed remote/model data, use bounded requests, treat a missing TinyFish configuration safely, reuse/cool down duplicate workspace requests, and return only validated suggestions.
- `apps/web/lib/onboarding-draft.test.ts` and component tests: validate the new draft schema, free selection, description/platform editing, and the overflow feedback path.
- Update existing billing, product-access, keyword-dialog, usage-settings, and mention-state tests that currently require an active paid subscription for monitoring.

Run at minimum:

```sh
pnpm --filter @astreex/domain typecheck
pnpm --filter @astreex/backend codegen
pnpm --filter @astreex/backend test
pnpm --filter @astreex/backend lint
pnpm --filter @astreex/backend typecheck
pnpm --filter @astreex/web test
pnpm --filter @astreex/web lint
pnpm --filter @astreex/web typecheck
```

Manually verify a new signed-in workspace through: website discovery success/failure; selection of suggestions and a custom keyword; free activation; 100-mention exhaustion; visibility/purge after retention expiry; paid checkout confirmation; and keyword-slot swapping after selecting more keywords than the active plan allows.

## Acceptance criteria

- A new user can enter a website, review/edit AI-generated company context and keyword recommendations, add a custom keyword, choose platforms, and start the free evaluation without payment.
- Free monitoring works across every existing platform/feature until one active keyword has collected 100 unique mentions, then stops atomically and clearly prompts upgrade.
- The free allowance never resets or reappears after retries, billing changes, or a paid plan ending; entitlement changes reconcile the active keyword subset without granting collection from a client-selected paid plan.
- Selected overflow keywords are saved, visibly paused, and can be swapped into the active slot without data loss; a selected brand candidate is preferred, but no unselected keyword is created.
- Keyword descriptions are limited to 160 characters, editable, tenant-scoped, and reach mention-analysis context without changing provider queries.
- Mentions collected under free access stop appearing after 60 days and are purged safely; paid mentions are unaffected.
- TinyFish and DeepSeek credentials remain server-side; website/search/model inputs and outputs are bounded and validated; external discovery is rate-limited and safe to retry.
- The public pricing page still has only the three paid plan cards and only the agreed “first 100 mentions free” supporting copy.
