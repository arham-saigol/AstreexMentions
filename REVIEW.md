Cuts:
In `@packages/backend/convex/integrations/tinyfish.ts`:
- Around lines 11-29 and 218-235: `shrink` Validate and return only the fetched Markdown text that `researchCompany` consumes. The adapter currently models and returns Fetch metadata and error rows that no caller reads. (-16 lines)

In `@apps/web/lib/onboarding-draft.test.ts`:
- Around lines 11 and 87-97: `delete` Remove the setup and assertion for `selectOnboardingPlan`; that helper has no production caller, so this test is the only reason it remains. Keep the checkout-reuse assertions in this test. (-10 lines)

In `@packages/backend/convex/onboardingDiscovery.ts`:
- Around lines 132-146 and 199-208: `inline` Remove the single-use `completedFromRow` wrapper. Parse the loaded completed row directly in the `begin.state === "completed"` branch. (-9 lines)
- Lines 68 and 197: `collapse` Return only the `rate_limited` state. The UI does not read `retryAfter`, so forwarding it through this public result adds an unused API field. (-1 line)

In `@apps/web/lib/onboarding-draft.ts`:
- Around lines 5 and 72-73: `delete` Remove `ONBOARDING_STEP_COUNT`, `OnboardingStep`, and `OnboardingPlan`; none has a production consumer after the onboarding rewrite. (-3 lines)
- Around lines 109-114: `delete` Remove `selectOnboardingPlan`. The flow updates `selectedPlan` directly, leaving this wrapper test-only. (-6 lines)

In `@packages/backend/convex/onboardingResearchInternal.ts`:
- Around lines 78-107: `collapse` Build the shared running-research fields once, add clearing fields only to the patch path, and add `createdAt`/`workspaceId` only to the insert path. The current insert repeats the same fingerprint, input, status, and timestamps. (-6 lines)
- Around lines 36 and 70-74: `delete` Remove `retryAfter` from the internal rate-limit result. Its only consumer forwards it to a browser that ignores it. (-3 lines)

In `@packages/backend/convex/billing/customer.ts`:
- Around lines 35-40 and 175-185: `delete` Remove `activatedAt` and `exhaustedAt` from the billing overview's evaluation payload. They remain durable grant fields, but no web consumer uses them; the UI only needs the limits and consumed count. (-7 lines)

In `@packages/backend/convex/lib/workspaceAccess.ts`:
- Around lines 118-135: `shrink` Make `ensureFreeEvaluationGrant` return `void`. Its only caller ignores the document, so return early for an existing grant and remove the post-insert read and impossible-state check. (-5 lines)

In `@packages/backend/convex/keywords.ts`:
- Around lines 89-100 and 735-746: `collapse` Remove `activeLimit` and `configuredLimit` from the summary. `activeLimit` duplicates the existing `limit` field exactly, while `configuredLimit` has no consumer; have the Keywords screen read `summary.limit`. (-4 lines)
