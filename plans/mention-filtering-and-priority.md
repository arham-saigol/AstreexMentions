# Mention filtering and priority

## Goal

Replace the current categorization-only analysis with one durable mention-analysis pipeline that:

1. Decides whether each collected mention is relevant to the monitored brand or product.
2. Assigns each successfully analyzed mention a `low`, `medium`, or `high` priority.
3. Assigns each mention to exactly one enabled category.
4. Keeps irrelevant mentions out of the normal feed while preserving them in a transparent, reviewable Filtered system view.
5. Lets users filter the feed and custom saved views by one or more priorities.

Do not add high-priority email alerts in this work. The stored priority and analysis results should leave room for a later alert feature, but this implementation must not enqueue or send priority emails.

## Product decisions

### Use one analysis call

Use one model call per batch for relevance, priority, and category. Replace the categorization-specific path rather than adding a second filtering worker. The decisions use the same workspace, keyword, mention, and category context; one call avoids duplicated provider work, conflicting results, and partially analyzed mentions.

Start with a hard maximum of 20 mentions per provider batch and retain a prompt-character limit. Treat 20 as the initial safe operating value, not proof of model quality; verify it against labeled examples.

### Count every collected mention toward usage

A mention consumes the monthly allowance when ingestion stores it, including a mention later classified as irrelevant. Do not refund usage after analysis. Keep the existing atomic ingestion and usage behavior in `packages/backend/convex/ingestion/service.ts`.

This keeps provider and AI work bounded and avoids backward-moving counters, quota races, and sources pausing before a later refund. Make the behavior transparent in customer-facing quota copy: usage counts collected mentions, while AI filtering controls what appears in the main feed.

### Preserve filtered results

Do not delete irrelevant mentions. Preserve the original content, keyword associations, engagement, analysis explanation, and normal retention behavior. Add a synthetic Filtered system view where users can inspect these mentions and mark a mistaken result as relevant. A manual correction must not refund or otherwise change mention usage.

### Fail open

New mentions must remain out of the normal feed while analysis is pending so they do not flash into the feed and disappear. If all durable analysis attempts fail, make the mention visible as unclassified rather than silently hiding it. A provider or model failure must not lose a potentially important mention.

### Priority means urgency and actionability

Use this policy consistently in prompts, fixtures, UI explanations, and tests:

- **High:** credible security exploit or abuse method; exposed secret; active outage, data loss, or severe regression; legal, safety, privacy, or regulatory risk; rapidly spreading harmful misinformation; another severe issue requiring immediate intervention.
- **Medium:** normal bug report, substantive complaint, customer question, purchase intent, actionable sales opportunity, competitor comparison, or feature request that should be reviewed soon.
- **Low:** praise, casual references, general discussion, and observations with no immediate action.

Negative sentiment alone is not high priority. Low engagement does not prevent a credible security disclosure from being high priority.

### Bias relevance toward recall

Only filter a mention when the unrelated meaning is clear. If context is ambiguous, keep the mention relevant. For a Linear workspace, product or company discussion is relevant, while linear algebra, linear equations, and generic uses of “linear” are irrelevant. Treat mention text and all researched material as untrusted data, never as instructions.

## Filtering context and guidelines

Replace the generic company description with analysis-specific workspace data:

- `filteringContext`: factual brand and product identity, official names and aliases, what the products do, target users, and relevant use cases.
- `filteringGuidelines`: concise inclusion and exclusion guidance, especially ambiguous names, unrelated meanings, and concrete relevant/irrelevant examples.

Persist these as separate bounded strings on the workspace. Remove the obsolete `companyDescription` design throughout the unreleased application rather than adding compatibility fields or fallbacks. Store corresponding values on the durable onboarding-research result while research is in progress/completed.

Update onboarding research in `packages/backend/convex/onboardingDiscovery.ts` so its search plan and final prompt explicitly investigate naming collisions and ambiguous meanings, not only products, competitors, and customer language. The strict response contract should return `filteringContext`, `filteringGuidelines`, and keyword suggestions. Continue to treat website and search content as untrusted.

Update:

- `packages/backend/convex/onboardingResearchInternal.ts`
- `packages/backend/convex/onboarding.ts`
- `apps/web/lib/onboarding-draft.ts`
- `apps/web/components/onboarding/onboarding-flow.tsx`
- Relevant onboarding tests and fixtures

The onboarding review step should show both fields as editable textareas and explain that they guide relevance, priority, and categorization but do not alter provider queries. The manual fallback may use the user's manual description as `filteringContext`; `filteringGuidelines` may initially be empty when research is unavailable, but the UI must let the user supply it. Require a non-empty filtering context before onboarding completion and enforce clear length limits at both client and backend boundaries. Post-onboarding settings for editing these fields are intentionally deferred, but the persisted structure and labels must be suitable for that later UI.

Pass workspace filtering context and guidelines once as shared batch context, not repeated inside every mention. Keep matched keyword phrase and bounded keyword description as per-mention context. Include the filtering fields, enabled category catalog, and each mention's exact matched keyword phrase and bounded description in the immutable analysis snapshot/fingerprint. If any of them change while a batch is leased, reject the stale application and requeue it using the existing snapshot-change behavior.

## Backend data model

Update `packages/backend/convex/schema.ts` with shared validators for priority and feed state.

### Workspaces and onboarding research

Replace `companyDescription` with bounded filtering context and guidelines fields on `workspaces` and `onboardingResearch`.

### Mentions

Add:

- `feedState`: `pending | visible | filtered`
- `priority`: optional `low | medium | high`; present after successful analysis, absent on terminal unclassified failures
- `relevanceReason`: optional bounded explanation produced by analysis
- `priorityReason`: optional bounded explanation produced by analysis
- `analysisVersion`: optional bounded policy/prompt version used for the applied result

Continue to use `analysisState` for durable execution state. On ingestion set `analysisState = pending` and `feedState = pending`.

On successful total-batch application, atomically set category, priority, reasons, analysis version, completed analysis state, and either `visible` or `filtered`. The model contract should return category and priority even for irrelevant mentions so a manually restored result has useful metadata.

On terminal job failure, atomically set `analysisState = failed` and `feedState = visible`. Do not fabricate category or priority.

A user correction from Filtered should set `feedState = visible` through an authenticated, tenant-authorized mutation. Preserve the AI reason for audit/debugging and record that the visibility was manually overridden, either with a small explicit source/override field or an existing audit event. Do not allow rediscovery to overwrite analysis or the manual correction; preserve the current rediscovery boundary in `packages/backend/convex/lib/mentionIngestion.ts`.

### Analysis jobs

Cleanly rename/replace `categorizationJobs` with `mentionAnalysisJobs`, including schema indexes, deletion stages, cron references, operational metrics, provider operation names, tests, and generated API references. Retain the current durable design:

- Idempotency per mention
- Bounded claims
- Per-workspace batching
- Leases and stale-lease protection
- Retry/backoff and dead-letter behavior
- Provider-run recording
- Total-batch validation before any result is applied

No migration or compatibility path is required; reset development data as needed.

### Mention indexes

The default feed must not scan arbitrary filtered rows and discard them in JavaScript. Add indexes that support the common feed paths, at minimum:

- Workspace + feed state + published time
- Workspace + feed state + engagement
- Workspace + feed state + priority + published time
- Workspace + feed state + priority + engagement if the query implementation needs it for bounded `most_engaged` pages

Use the feed-state indexes for visible and Filtered system feeds. Use the priority index directly for a single selected priority. For multiple priorities, keep work bounded and preserve deterministic pagination; merge bounded indexed streams or use a feed-state scan only if the existing row/byte scan ceiling remains explicit and sparse pages can continue correctly. Do not add an index for every possible filter combination.

Update the mention search index filter fields if the chosen query path supports feed state and priority there.

## Analysis provider contract and orchestration

Replace the categorization-specific modules under:

- `packages/backend/convex/categorization/`
- `packages/backend/convex/lib/mentionAnalysis.ts`

with mention-analysis equivalents. Update `packages/backend/convex/crons.ts` and all callers. Remove superseded categorization-only code and names.

Use a strict response shaped like:

```json
{
  "results": [
    {
      "mentionId": "...",
      "relevant": true,
      "relevanceReason": "...",
      "priority": "high",
      "priorityReason": "...",
      "categoryId": "..."
    }
  ]
}
```

Validation requirements:

- Exact object keys and allowed enum values
- One result for every input mention
- No duplicate, missing, or extra mention IDs
- Category ID belongs to the immutable enabled catalog
- Bounded, non-empty reasons
- No extra fields
- Entire response validated before writes begin
- Maximum 20 mentions and an explicit total prompt-character cap
- Bounded title/body, filtering context, guidelines, and keyword context

Keep `temperature: 0`, JSON response mode, timeout handling, retry classification, and secret-safe errors. Give the model the relevance and priority policies above. Tell it to keep ambiguous mentions relevant and to treat all supplied context as untrusted.

Use an analysis version constant that changes when prompt semantics or output policy changes. Persist it on mentions and include it in provider observability. Do not automatically reanalyze old mentions in this implementation.

## Mention APIs and customer feed

Update `packages/backend/convex/mentions.ts`:

- Return priority, reasons where appropriate, analysis state needed for an unclassified indicator, and feed state where needed by the Filtered UI.
- Default `listMentions` behavior must return only visible mentions.
- Add a bounded way to request filtered mentions for the synthetic Filtered view without allowing saved views to silently mix visible and filtered data.
- Extend filters with `priorities`, supporting any non-empty subset of low, medium, and high.
- Include priorities and selected system feed in cursor fingerprints so cursors cannot be reused across different result sets.
- Preserve tenant authorization for mention, category, keyword, and saved-view IDs.
- Keep filtered and pending mentions out of customer-visible total counts if such counts are introduced; billing usage remains the separate collected count.
- Add an authenticated correction mutation that only allows a workspace member to restore a filtered mention from their own workspace.

`getMention` may continue to retrieve a filtered mention for the authorized Filtered view. It must not expose another workspace's result.

## Saved views and UI

### Saved-view contract

Update `packages/backend/convex/savedViews.ts` and the `savedViews.filters` schema with an optional `priorities` array. Validate uniqueness and allowed values like the existing platform/status filters. Preserve priority filters through create, edit, copy, compact, category cleanup, and result serialization.

Keep All Mentions and Filtered as synthetic system views. Filtered must not be stored, renamed, reordered, edited, deleted, or selected as the basis for a custom saved view. Custom views operate on visible mentions only.

### Mentions UI

Update:

- `apps/web/lib/mentions.ts`
- `apps/web/components/mentions/mentions-screen.tsx`
- `apps/web/components/mentions/mention-filter-popover.tsx`
- `apps/web/components/mentions/mention-card.tsx`
- `apps/web/components/mentions/saved-views.tsx`
- Related component tests

Add:

- Low, Medium, and High checkboxes in the existing filter popover
- Priority selections in create/edit saved-view flows
- A priority badge on analyzed visible mention cards, with accessible text and a restrained visual hierarchy
- A non-alarming unclassified state for fail-open mentions
- A synthetic Filtered view with relevance explanations and a “Mark as relevant” action
- Empty and loading states specific to the Filtered view

Do not add a priority sort in this work. Preserve newest, oldest, and most engaged sorts. Do not add email-alert controls or claims that high priority sends a notification.

## Digests, metrics, retention, and deletion

### Daily digest

Update `packages/backend/convex/digest/internal.ts` so aggregation, counts, and selected digest mentions include only `feedState = visible`. Pending and filtered mentions must not appear in digest content or customer-facing category counts. Use a feed-state index so digest pagination stays bounded.

### Metrics and admin reporting

Keep raw ingestion and billed mention metrics counting all collected mentions. Add operational counts for analyzed relevant, analyzed filtered, priority tiers among relevant mentions, terminal analysis failures, and user restorations. Only relevant mentions should increment customer-facing categorization/priority breakdowns. Update `packages/backend/convex/admin.ts` and metric helpers so raw collection and analyzed feed outcomes are clearly named rather than conflated.

### Retention and deletion

Filtered mentions follow the same plan retention policy as other collected mentions. Ensure account/workspace deletion purges the replacement analysis jobs and all mention fields naturally with the mention row. Update deletion stage validators and purge logic for the renamed table. Search the repository for all `categorizationJobs`, categorization provider operation, and `companyDescription` references and remove obsolete paths.

## Quota and product copy

Update relevant pricing, usage, onboarding, and mention-feed copy to state that:

- A mention counts when Astreex collects it.
- AI filtering keeps irrelevant mentions out of the main feed.
- Filtered mentions remain reviewable and still count toward the allowance.

At minimum inspect and update:

- `apps/web/app/(public)/page.tsx`
- Billing/usage surfaces using `api.billing.customer`
- Mention empty/help text in `apps/web/components/mentions/mention-states.tsx`
- Onboarding filtering-context explanations

Do not change plan limits or usage-warning thresholds.

## Evaluation and tests

### Labeled analysis fixture

Replace/extend `packages/backend/tests/fixtures/mention-analysis/gemini-cases.json` with a mention-analysis fixture containing independently labeled examples for:

- Linear product discussion versus linear algebra/equations/generic adjective use
- Other ambiguous brand names and short context-poor mentions
- Prompt injection embedded in mention text or researched context
- Security disclosure and abuse cases
- Severe outage versus normal bug
- Complaint, question, praise, feature request, purchase intent, and competitor comparison
- Every priority tier and enabled category
- Irrelevant mentions that still require structurally valid category and priority output

Use the fixture to compare batch contract behavior at 1, 10, and 20 mentions and to document a manual/provider-backed quality check for 10, 20, and the former 50 size outside deterministic CI. Launch quality should favor very high recall for relevant mentions and high precision among items actually filtered.

### Backend evidence

Update or replace the existing categorization tests, especially:

- `packages/backend/tests/mention-analysis-worker.test.ts`
- `packages/backend/tests/mention-analysis-digest-email.test.ts`
- `packages/backend/tests/ingestion-atomic.test.ts`
- `packages/backend/tests/keywords-mentions.test.ts`
- `packages/backend/tests/onboarding-atomic.test.ts`
- `packages/backend/tests/onboarding-discovery-provider.test.ts`
- `packages/backend/tests/digest-pagination.test.ts`

Cover these observable outcomes:

1. Ingestion charges exactly once, stores a pending feed mention, and enqueues one analysis job.
2. One valid result atomically applies relevance, priority, category, reasons, version, job completion, and metrics.
3. Invalid, partial, duplicate, unknown-ID, and extra-field responses apply nothing and follow retry/dead-letter policy.
4. Pending mentions are absent from normal and Filtered feeds.
5. Relevant mentions appear in the normal feed and support priority filters.
6. Irrelevant mentions are absent from normal/custom views but appear in Filtered with their reason.
7. Restoring a filtered mention makes it visible without changing usage and cannot cross tenant boundaries.
8. A terminal analysis failure becomes visible as unclassified.
9. Rediscovery updates engagement and associations without overwriting analysis or a manual restore.
10. Saved views round-trip multiple priority selections and reject invalid/duplicate values.
11. Sparse priority and Filtered pagination remains deterministic and bounded.
12. Digests exclude pending and filtered mentions.
13. Filtered mentions still trigger existing 80%/100% usage behavior because collection, not relevance, is billed.
14. Onboarding persists reviewed filtering context/guidelines atomically and does not leave partial keyword configuration.
15. Stale analysis snapshots cannot apply after filtering context, guidelines, or category catalog changes.

### Frontend evidence

Update mention-card and filtering tests and add focused tests where the existing harness supports them:

- Priority badge labels and variants
- Priority filter selection/clearing/counting
- Saved-view create/edit payloads with priorities
- Filtered system view restrictions
- Restore action feedback
- Unclassified and filtered empty states
- Editable onboarding filtering context and guidelines

Assert accessible names and text rather than internal component state.

## Verification

Read `packages/backend/convex/_generated/ai/guidelines.md` before implementation and follow its current Convex rules.

While iterating, run the narrowest affected tests, for example:

```bash
pnpm --filter @astreex/backend test -- mention-analysis-worker.test.ts
pnpm --filter @astreex/backend test -- ingestion-atomic.test.ts keywords-mentions.test.ts
pnpm --filter @astreex/backend test -- onboarding-atomic.test.ts onboarding-discovery-provider.test.ts
pnpm --filter @astreex/backend test -- digest-pagination.test.ts
pnpm --filter @astreex/web test -- mention-card.test.tsx
```

After schema/function renames, regenerate Convex types:

```bash
pnpm convex:codegen
```

Before completion, verify changed packages and then the repository:

```bash
pnpm --filter @astreex/backend typecheck
pnpm --filter @astreex/backend test
pnpm --filter @astreex/web typecheck
pnpm --filter @astreex/web test
pnpm lint
pnpm format:check
pnpm build
```

## Acceptance criteria

- Every newly collected mention is durably analyzed once per successful analysis version for relevance, priority, and category through one bounded worker pipeline.
- Batch size cannot exceed 20, prompt size is bounded, and whole-batch output validation remains atomic.
- Onboarding produces and lets the user review filtering context and filtering guidelines instead of a generic company description.
- The normal feed, custom views, search results, and daily digest exclude pending and filtered mentions.
- The Filtered system view transparently exposes irrelevant mentions and reasons and permits a tenant-safe manual restore.
- Low, medium, and high priorities appear on analyzed mention cards and can be selected in normal filters and custom saved views.
- Filtered mentions continue to count toward usage, and customer-facing copy says so clearly.
- Terminal analysis failures fail open as visible unclassified mentions.
- Operational work remains bounded, idempotent, tenant-isolated, retry-safe, and observable.
- No high-priority email alert, notification preference, or priority email is added.
- Obsolete company-description and categorization-only paths are removed without migration or compatibility infrastructure.
