# Testing

This document describes the tests and commands that exist in this repository. Deterministic builds and fixture-backed tests do not prove that Clerk, Convex cloud deployment configuration, Xquik, FetchLayer, Algolia, DeepSeek, Creem, Resend, Vercel, DNS, OAuth, payment, or mailbox delivery works with real credentials.

No credential-backed smoke-test result is implied here. Record those results separately for the exact environment tested.

## Command map

Run commands from the repository root with Node.js 24 and pnpm 10.

| Command                                | What it actually does                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                            | Runs each workspace `test` task through Turborepo. For `@astreex/e2e`, this only runs `playwright test --list`; it does not execute browser tests.                                                                                                                                                         |
| `pnpm --filter @astreex/domain test`   | Runs deterministic domain-rule tests.                                                                                                                                                                                                                                                                      |
| `pnpm --filter @astreex/backend test`  | Runs backend unit, fixture, source-inventory, and `convex-test` suites without a real Convex deployment.                                                                                                                                                                                                   |
| `pnpm --filter @astreex/email test`    | Renders and validates React Email templates.                                                                                                                                                                                                                                                               |
| `pnpm --filter @astreex/ui test`       | Runs shared component tests in JSDOM.                                                                                                                                                                                                                                                                      |
| `pnpm --filter @astreex/web test`      | Runs customer-app library and focused component tests.                                                                                                                                                                                                                                                     |
| `pnpm --filter @astreex/admin test`    | Runs admin environment, feature-request, and changelog helper tests.                                                                                                                                                                                                                                       |
| `pnpm --filter @astreex/security test` | Runs repository-wide authorization and production-integrity source scans.                                                                                                                                                                                                                                  |
| `pnpm --filter @astreex/e2e test`      | Lists the Playwright tests and projects only.                                                                                                                                                                                                                                                              |
| `pnpm test:e2e`                        | Executes Playwright. By default it starts web on port 3000 and admin on port 3001.                                                                                                                                                                                                                         |
| `pnpm verify`                          | Runs format check, lint, typecheck, deterministic tests, and build. It does not run Playwright or live-provider tests.                                                                                                                                                                                     |
| `pnpm verify:release`                  | Validates required environment names, HTTPS URLs, `CREEM_MODE=production`, and presence of all three exact-limit Creem plans; then runs `pnpm verify` and Playwright. Runtime separately rejects duplicate plan mappings. It does not authenticate provider keys or complete payment/provider smoke tests. |

Focused examples:

```sh
pnpm --filter @astreex/backend exec vitest run tests/provider-adapters.test.ts
pnpm --filter @astreex/backend exec vitest run tests/ingestion-atomic.test.ts
pnpm --filter @astreex/security test
pnpm --filter @astreex/e2e exec playwright test public.spec.ts --project=chromium-light
```

The repository does not define a coverage-report script or enforce line/branch percentage thresholds.

## Automated coverage

### Domain and unit tests

`packages/domain/src/*.test.ts` covers:

- plan prices and keyword/mention limits;
- supported platforms, statuses, sorts, and default categories;
- deterministic provider schedules, staggering, backoff, and usage thresholds;
- categorization batch and total-output validation;
- engagement ranking and product-content validators;
- IANA time-zone and daily-digest boundaries, including DST;
- canonical X, Reddit, Hacker News, and generic URLs.

### Convex and backend tests

`packages/backend/tests` contains two distinct classes of tests:

1. **Pure/fixture/source tests** import schema and business modules directly. They validate the 25-table schema and indexes, generic pre-codegen boundary, authorization primitives, billing lifecycle, scheduling, adapters, categorization contracts, digest/email rules, and frontend/backend reference contracts.
2. **`convex-test` integration tests** execute selected queries, mutations, and actions against in-memory test schemas. They cover atomic ingestion, the durable categorization dispatcher/action with mocked provider transport, keyword/mention behavior, customer product functions, and admin product functions.

These tests do not connect to a cloud Convex deployment, do not install real crons, and do not prove Clerk JWT or deployment environment configuration. Some `convex-test` suites intentionally use focused schemas; the account-deletion workflow suite loads the complete production schema so schema validity, every purge index, and cross-tenant isolation are exercised together.

The security package separately scans production source to verify:

- public Convex functions use approved authorization wrappers or explicit changelog/webhook exceptions;
- every frontend generic function reference resolves to a public backend export;
- admin pages, route handlers, and server actions invoke server-side guards;
- Creem and Resend routes are mounted and verify the untouched raw body;
- provider secrets are absent from frontend source and are not exposed through `NEXT_PUBLIC_*` names;
- no permanent runtime mock adapters or forbidden product language are present.

### Adapter and integration tests

Backend adapter tests replace `fetch` with deterministic functions and read committed fixtures. They cover:

- **Xquik** request parameters, `x-api-key`, normalization, cursor advancement, error mapping, timeout/rate-limit handling, and secret-free logs;
- **FetchLayer** Reddit post/comment contracts, bearer auth, normalization, provider-managed pagination observations, and errors;
- **Algolia Hacker News** query windows, story/comment normalization, page progression, and errors;
- **Creem** test/production API bases, checkout, upgrade, portal, raw-body signature verification, event parsing, product mapping, lifecycle ordering, idempotency, and fail-closed configuration;
- **DeepSeek** request and response contracts, full-batch validation, timeouts, rate limits, secret-free logs, durable dispatch batching, category snapshots, four-minute leases, missing-configuration release, retry/dead-letter transitions, atomic result application, and provider telemetry;
- **account deletion** request deduplication, billing/provider failure modes and race recheck, access fencing, legacy exclusion, lease fencing and crash reclaim, bounded cross-tenant purge, data-before-Clerk ordering, Clerk success/not-found/transient/permanent/configuration outcomes, security-fence completion, exact-admin retry/cancel authorization, confirmation, safety, and audit records;
- **Resend** send idempotency, response validation, timeout/error behavior, Svix verification, event ordering, outbox state, and delivery projection.

None of these fixture tests sends a network request to the named provider.

### UI tests

- `packages/ui` covers shared button defaults, dialog behavior, labeled form controls, switch/checkbox semantics, shell/skip behavior, state announcements, progress clamping, category badges, theme selection, and class merging.
- `packages/email` covers deterministic usage-warning and daily-digest HTML/text, escaped provider content, accessible counts, canonical links, and invalid input.
- `apps/web` covers environment validation, onboarding/product routing, keyword and mention response normalization, optimistic mention status, category invariants, feature requests, strict same-origin account-deletion HTTP semantics, settings deletion states, and focused mention-card behavior.
- `apps/admin` covers exact admin environment comparison, feature-request normalization/search/sort, changelog preview sanitization, and publication-date helpers.

JSDOM tests do not replace browser accessibility, responsive-layout, authentication, or deployment testing.

## Playwright coverage

`tests/e2e/playwright.config.ts` defines three projects:

- `chromium-light` using Desktop Chrome in light mode;
- `chromium-dark` using Desktop Chrome in dark mode;
- `mobile` using the iPhone 13 device profile.

CI retries failed browser tests twice. Trace collection starts on the first retry; screenshots are captured only on failure. The HTML report is written by Playwright.

### Credential-free mode

Run in a clean shell where Clerk, Convex, and admin variables are absent:

```sh
pnpm test:e2e
```

Current coverage includes:

- paid pricing copy and absence of free-plan/free-trial claims;
- blog listing, complete article routes, structured data, and safe external links;
- honest sign-in/sign-up configuration states with no fabricated forms or account data;
- protected customer routes stopping at configuration before rendering product data;
- admin redirects to `/configuration`, an uncached 503 session response, no admin data/navigation, noindex metadata, and accessibility;
- light/dark themes, keyboard skip/theme controls, mobile navigation focus, WCAG A/AA axe checks, and horizontal overflow at 375, 768, and 1440 pixels.

Tests select their intended project and skip duplicate executions where appropriate. A mixed shell with only some variables set can select different skip branches and is not a clean disconnected test.

### Connected Clerk and Convex mode

Connected Playwright tests require these process variables:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CONVEX_URL
CLERK_TEST_USER_EMAIL
CLERK_TEST_USER_PASSWORD
```

Connected admin tests additionally require:

```text
ADMIN_CLERK_USER_ID
```

The test user's immutable Clerk ID must exactly equal `ADMIN_CLERK_USER_ID` for the admin suite, and the same exact value must be configured in the target Convex deployment. The Clerk instance must have a JWT template named `convex`; the target user and deployment data must be disposable or approved for testing.

```sh
pnpm test:e2e
```

Current connected coverage is deliberately non-destructive:

- customer sign-in followed by settings and feature-request dialog focus/accessibility checks; no feature request is submitted;
- admin sign-in, exact three-link navigation, real metrics query and table fallbacks, a no-match feature-request query, and client-side changelog draft preview; no changelog draft is submitted.

It does not create a subscription, invoke a provider, send email, replay a webhook, mutate admin data, or prove that all customer product operations work.

To test already-running or deployed applications, set both URLs and skip Playwright's local web servers:

```text
PLAYWRIGHT_WEB_URL=https://customer.example.com
PLAYWRIGHT_ADMIN_URL=https://admin.example.com
PLAYWRIGHT_SKIP_WEBSERVER=1
```

Then run `pnpm test:e2e`. The two applications must point to the same intended Clerk instance and Convex deployment.

## Credential-backed test matrix

Treat each row as a separate release record. “Automated” means repository automation exists; it does not mean the check has been run in any environment.

| Surface                 | Required controlled configuration                                                              | Repository automation                                                                       | Required evidence                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk customer auth     | Clerk keys, enabled email/password test user, `convex` JWT template, configured Convex issuer  | Connected Playwright signs in with password and opens two dialogs                           | Target Clerk instance, user ID, Convex deployment, run time, Playwright result                                                                                                    |
| Exact admin auth        | Above plus the same `ADMIN_CLERK_USER_ID` in admin and Convex                                  | Connected Playwright loads real admin metrics/queues; security tests cover exact comparison | Approved user succeeds; a separate valid non-admin user is manually confirmed denied at frontend and Convex                                                                       |
| Convex cloud            | Authenticated CLI, real development/production deployment, environment values, generated APIs  | No cloud integration suite; local tests use generic references and `convex-test`            | Deployment name/URL, codegen/deploy result, installed crons, relevant logs                                                                                                        |
| X monitoring            | `XQUIK_API_KEY`, quota, approved known query                                                   | Fixture adapter tests only                                                                  | Xquik response/run ID, persisted normalized mention, checkpoint, provider metric bucket                                                                                           |
| Reddit monitoring       | `FETCHLAYER_API_KEY`, quota, approved known post/comment queries                               | Fixture adapter tests only                                                                  | Separate post/comment runs, persisted mentions, provider metrics                                                                                                                  |
| Hacker News monitoring  | Network access to public Algolia API and known recent data                                     | Fixture adapter tests only                                                                  | Story/comment normalization, page/checkpoint behavior, provider metrics                                                                                                           |
| DeepSeek categorization | `DEEPSEEK_API_KEY` with access to `deepseek-v4-pro`                                            | Fixture transport plus `convex-test` dispatcher/action coverage with mocked `fetch`         | Deployed queue claim, provider request/run ID, atomic mention/job results, retry/dead-letter evidence; local tests are not credential proof                                       |
| Creem test mode         | Test key, test products, test allowlist, test webhook secret, disposable Clerk/Convex customer | Fixture tests only                                                                          | Checkout, signed subscription webhook, entitlement/usage cycle, upgrade, portal, cleanup                                                                                          |
| Creem live mode         | Explicit approval, live key/products/webhook, real payment method                              | None                                                                                        | Charge/transaction ID, webhook IDs, entitlement result, refund/cancellation and cleanup record                                                                                    |
| Resend                  | Verified sending domain, restricted API key, webhook secret, controlled mailbox                | Fixture tests only                                                                          | Outbox ID, Resend message ID, mailbox receipt, signed webhook event, final delivery state                                                                                         |
| Usage cap/resume        | Disposable active subscription/usage cycle and provider data                                   | `convex-test` covers atomic cap behavior and billing lifecycle resume                       | Exact cycle counts, held checkpoint, usage-paused sources, new-period or upgrade-driven resume                                                                                    |
| Account deletion        | Disposable Clerk identity, terminal Creem state, configured fence longer than token lifetime   | Complete-schema deterministic state-machine tests; no live Clerk/Creem/Convex erasure test  | Record request/job ID, phases and audit events, data verification, Clerk absence, fence expiry, final tombstone removal, and cleanup. Request acceptance alone is not completion. |

## Result-record template

For every credential-backed check, record at minimum:

```text
Environment and deployment:
Source revision:
Operator and time:
Credential/provider mode (test or production; never include secret values):
Test data and expected result:
Observed provider request/event/message/transaction IDs:
Observed Convex rows, metrics, and audit events:
Cleanup or rollback performed:
Pass/fail and unresolved follow-up:
```

Do not place credentials, raw webhook bodies, auth tokens, customer query text, or sensitive provider responses in the record.

## Known gaps that tests must not hide

- `packages/backend/convex/_generated` cannot be produced until a real Convex development deployment is selected after interactive CLI login. The generic constructor/reference boundary typechecks but is transitional.
- The categorization worker is covered with fixtures and mocked transport, but no automated suite proves real `deepseek-v4-pro` credentials, quota, request-field support, or production output quality.
- There is no automated credential-backed provider, checkout, webhook-delivery, OAuth, DNS, or mailbox suite.
- Connected Playwright uses a real Clerk user and Convex deployment but currently exercises only the explicit read/dialog flows above.
- The live deletion workflow still requires a disposable identity and explicit operator evidence; deterministic Clerk/Creem transport doubles are not evidence of cloud erasure.
