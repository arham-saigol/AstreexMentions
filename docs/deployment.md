# Deployment runbook

This runbook describes the production topology and the credential-backed work that must be completed outside the repository. It does not claim that any Clerk, Convex, Creem, Resend, Xquik, FetchLayer, DeepSeek, Vercel, DNS, OAuth, payment, or email smoke test has been run.

## Target topology

Deploy exactly three production targets:

| Target                       | Root/source        | Responsibility                                                             |
| ---------------------------- | ------------------ | -------------------------------------------------------------------------- |
| Customer Vercel project      | `apps/web`         | Marketing, authentication, onboarding, customer product                    |
| Admin Vercel project         | `apps/admin`       | Restricted single-user operations UI                                       |
| Convex production deployment | `packages/backend` | Data, authorization, jobs, crons, provider calls, billing, email, webhooks |

Both Vercel projects must use the same production `NEXT_PUBLIC_CONVEX_URL`. Use one controlled release path for that Convex production deployment. Do not make both Vercel projects run `convex deploy`; two independent frontend builds must not race to change the backend schema or functions.

A developer may also have a personal Convex development deployment. That is separate from the single shared production deployment.

## 1. Preflight

1. Use Node.js `24.x` and pnpm `10.34.5`.
2. Confirm the intended production domains, for example:
   - customer: `https://app.example.com`
   - admin: `https://admin.example.com`
3. Create or identify one Clerk production instance, one Convex project/default production deployment, one Creem live account, one Resend account, and provider accounts.
4. Decide who owns the only production Convex deploy key and release job.
5. Keep secrets out of Git. `.env`, `.env.*`, `.convex`, and `.vercel` are ignored.
6. Run deterministic validation before connecting production credentials:

   ```sh
   corepack enable
   corepack prepare pnpm@10.34.5 --activate
   pnpm install --frozen-lockfile
   pnpm verify
   ```

`pnpm verify` is an offline code-quality gate. It does not validate external accounts or prove that live integrations work.

## 2. Clerk

Use the same Clerk environment for the customer app, admin app, and matching Convex deployment. Do not mix Clerk test keys, production keys, and JWT issuer domains from different Clerk instances.

### Enable authentication methods

In the Clerk dashboard:

1. Enable email address authentication. Configure the required verification method and confirm that email delivery is available for the production instance.
2. Enable Google as a social connection.
3. For production Google OAuth, complete any Google client configuration, consent-screen, domain, and redirect requirements shown by Clerk.
4. Register both production application domains with Clerk as required by the production instance.
5. Keep the customer routes at `/sign-in` and `/sign-up`; the admin app uses `/sign-in`.

The UI says “email or Google” because those methods are controlled by Clerk. The repository cannot enable them on behalf of the deployment owner.

### Create the Convex JWT template

1. In Clerk, create the built-in Convex JWT template.
2. Name it exactly `convex`; both applications call `getToken({ template: "convex" })`, and `ConvexProviderWithClerk` expects the same integration.
3. Confirm that its audience/application ID is `convex`.
4. Copy the template issuer domain. Set that exact URL as `CLERK_JWT_ISSUER_DOMAIN` in Convex.

`packages/backend/convex/auth.config.ts` refuses to configure without `CLERK_JWT_ISSUER_DOMAIN` and registers `applicationID: "convex"`.

### Choose the administrator

Create or sign in with the one Clerk user who may use the admin application, then copy the immutable Clerk user ID (`user_...`). Install that exact value in both places:

- the `apps/admin` Vercel project as `ADMIN_CLERK_USER_ID`;
- the Convex deployment as `ADMIN_CLERK_USER_ID`.

The check is exact and fail-closed. Email address, organization membership, or a similar-looking user ID does not grant access.

## 3. Configure a real Convex development deployment and codegen

Convex-generated files cannot be produced from an unauthenticated checkout. The current repository intentionally uses generic Convex constructors and references until this step is completed.

1. Make the Clerk JWT issuer available while the initial config is evaluated. Create `packages/backend/.env.local`:

   ```dotenv
   CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-issuer.example
   ```

2. Log in interactively:

   ```sh
   pnpm --filter @astreex/backend exec convex login
   ```

   `npx convex login` is the equivalent direct CLI flow. It requires user authorization; this cannot be completed by an offline build or an unauthenticated automation run.

3. Configure a cloud development deployment in the intended Convex project:

   ```sh
   pnpm --filter @astreex/backend exec convex dev --configure new --once
   ```

   Use `--configure existing` instead when attaching to an already-created project. Select the intended team and project deliberately. Convex writes the local `CONVEX_DEPLOYMENT` selection and development URL to an ignored local environment file.

4. Set the issuer and administrator on the development deployment:

   ```sh
   pnpm --filter @astreex/backend exec convex env set CLERK_JWT_ISSUER_DOMAIN
   pnpm --filter @astreex/backend exec convex env set ADMIN_CLERK_USER_ID
   ```

5. Generate code from the actual deployment configuration:

   ```sh
   pnpm convex:codegen
   ```

   The output belongs under `packages/backend/convex/_generated`. Never synthesize or hand-edit it. `convex dev` and `convex deploy` also run codegen by default.

6. Copy the development deployment's `.convex.cloud` URL into both apps' local `NEXT_PUBLIC_CONVEX_URL` values. Do not use the `.convex.site` HTTP-actions URL as the React client URL.

7. Start connected development with two terminals:

   ```sh
   pnpm dev:backend
   ```

   ```sh
   pnpm dev
   ```

The root `pnpm dev` script starts only the two Next.js applications; it does not start Convex.

## 4. Convex environment

Set backend variables with the Convex CLI or dashboard. Omitting the value from `convex env set NAME` prompts interactively and avoids storing a secret in shell history.

- Development deployment: `pnpm --filter @astreex/backend exec convex env set NAME`
- Default production deployment: `pnpm --filter @astreex/backend exec convex env set --prod NAME`
- Audit names without printing values: `pnpm --filter @astreex/backend exec convex env list --prod --names-only`

### Required production runtime values

| Variable                     | Production value                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`    | Issuer from Clerk's `convex` JWT template                                         |
| `ADMIN_CLERK_USER_ID`        | Exact allowed `user_...` ID                                                       |
| `APP_URL`                    | Customer HTTPS origin used to build the daily-digest CTA; see the route gap below |
| `CREEM_API_KEY`              | Creem live API key                                                                |
| `CREEM_MODE`                 | `production`                                                                      |
| `CREEM_WEBHOOK_SECRET`       | Secret for the production Creem webhook endpoint                                  |
| `CREEM_PRODUCT_ID_STARTER`   | Live Starter product ID                                                           |
| `CREEM_PRODUCT_ID_GROWTH`    | Live Growth product ID                                                            |
| `CREEM_PRODUCT_ID_SCALE`     | Live Scale product ID                                                             |
| `CREEM_CHECKOUT_SUCCESS_URL` | Absolute HTTPS customer return URL, such as `https://app.example.com/onboarding`  |
| `RESEND_API_KEY`             | Restricted production sending API key                                             |
| `RESEND_WEBHOOK_SECRET`      | Secret for the production Resend webhook endpoint                                 |
| `RESEND_FROM_EMAIL`          | Sender on a verified Resend domain                                                |
| `XQUIK_API_KEY`              | Xquik API key                                                                     |
| `FETCHLAYER_API_KEY`         | FetchLayer API key                                                                |
| `DEEPSEEK_API_KEY`           | DeepSeek API key                                                                  |

Optional runtime values:

| Variable                         | Default/behavior                                                            |
| -------------------------------- | --------------------------------------------------------------------------- |
| `RESEND_REPLY_TO_EMAIL`          | No separate reply-to when blank                                             |
| `CREEM_TIMEOUT_MS`               | 15000 ms                                                                    |
| `RESEND_TIMEOUT_MS`              | 15000 ms                                                                    |
| `DEEPSEEK_TIMEOUT_MS`            | 120000 ms                                                                   |
| `XQUIK_REQUESTS_PER_SECOND`      | 100; hourly budget is value × 3,600 and minute cap is `min(60, value × 55)` |
| `FETCHLAYER_REQUESTS_PER_MINUTE` | 30; used as the minute cap and multiplied by 60 for the hourly budget       |
| `HN_REQUESTS_PER_HOUR`           | 9000; used as the hourly budget and minute cap `min(12, value)`             |

All three dispatch settings must be positive integers; invalid values block tracking dispatch before work is claimed. `ADMIN_URL` is present in `.env.example` but is release metadata only; the current Convex runtime does not read it. Runtime and release validation both use `CREEM_MODE`, `CREEM_CHECKOUT_SUCCESS_URL`, and all three `CREEM_PRODUCT_ID_*` variables. There is no `CREEM_API_BASE_URL` or JSON product allowlist in the current contract.

## 5. Creem

### Keep test and live configuration separate

The billing client selects its API endpoint from `CREEM_MODE`:

| Mode         | API base                       | Product IDs         | Intended deployment                        |
| ------------ | ------------------------------ | ------------------- | ------------------------------------------ |
| `test`       | `https://test-api.creem.io/v1` | Creem test products | Developer/non-production Convex deployment |
| `production` | `https://api.creem.io/v1`      | Creem live products | Controlled production Convex deployment    |

Do not put test product IDs in the production deployment or live product IDs in a test deployment. Do not reuse webhook secrets between test and live endpoints.

### Create products and map IDs

Create Starter, Growth, and Scale products separately in Creem test mode and live mode. Their Astreex limits are defined in `packages/domain/src/plans.ts`:

| Plan    | Display price | Keyword limit | Monthly mention limit |
| ------- | ------------: | ------------: | --------------------: |
| Starter |           $19 |             3 |                 2,000 |
| Growth  |           $99 |             6 |                20,000 |
| Scale   |          $199 |            10 |                50,000 |

Install each test product ID in its corresponding variable:

```dotenv
CREEM_PRODUCT_ID_STARTER=prod_test_starter
CREEM_PRODUCT_ID_GROWTH=prod_test_growth
CREEM_PRODUCT_ID_SCALE=prod_test_scale
```

Create equivalent production variables with the three live product IDs. The runtime requires all three IDs and rejects duplicates. Keyword and mention limits come from `packages/domain/src/plans.ts`, not deployment variables. Do not install placeholder IDs.

For shell-independent entry, use the interactive form:

```sh
pnpm --filter @astreex/backend exec convex env set CREEM_PRODUCT_ID_STARTER
pnpm --filter @astreex/backend exec convex env set CREEM_PRODUCT_ID_GROWTH
pnpm --filter @astreex/backend exec convex env set CREEM_PRODUCT_ID_SCALE
pnpm --filter @astreex/backend exec convex env set --prod CREEM_PRODUCT_ID_STARTER
pnpm --filter @astreex/backend exec convex env set --prod CREEM_PRODUCT_ID_GROWTH
pnpm --filter @astreex/backend exec convex env set --prod CREEM_PRODUCT_ID_SCALE
```

### Configure the webhook

Convex HTTP actions use the deployment's `.convex.site` origin:

```text
https://<deployment-name>.convex.site/webhooks/creem
```

Create one test webhook pointing to the non-production deployment and one live webhook pointing to the production deployment. Store each endpoint's signing secret in the matching deployment as `CREEM_WEBHOOK_SECRET`.

The handler verifies `creem-signature` against the untouched raw body and accepts these event types:

- `checkout.completed`
- `subscription.active`
- `subscription.paid`
- `subscription.canceled`
- `subscription.scheduled_cancel`
- `subscription.past_due`
- `subscription.expired`
- `subscription.update`
- `subscription.trialing`
- `subscription.paused`
- `refund.created`
- `dispute.created`

Subscribe the endpoint to the supported events available in the relevant Creem environment. The webhook is authoritative for persisted entitlement state; returning from checkout alone does not prove that access is active.

### Billing operations implemented by Astreex

- **Checkout:** `POST /checkouts` with the mapped product ID, an idempotent request ID, the configured success URL, optional Clerk email, and `internal_customer_id` metadata containing the Astreex workspace ID.
- **Upgrade:** `POST /subscriptions/{subscriptionId}/upgrade` with the target product and `update_behavior: "proration-charge-immediately"`.
- **Portal:** `POST /customers/billing` for the Creem customer ID stored on the synchronized subscription.
- **Webhook processing:** signed events are persisted and processed idempotently; a one-minute cron retries pending Creem billing events.

Checkout, upgrade, and portal actions deliberately return a provider-unconfigured state when required values are missing. They must not be described as operational until credential-backed tests complete.

## 6. Resend

### Verify a sending domain

1. Add the production sending domain in Resend.
2. Publish every DNS record Resend requires and wait until the domain is verified.
3. Set `RESEND_FROM_EMAIL` to an address on that verified domain, for example:

   ```text
   Astreex <notifications@updates.example.com>
   ```

4. Optionally set `RESEND_REPLY_TO_EMAIL` to a monitored support address.
5. Create a restricted API key suitable for sending and install it as `RESEND_API_KEY` in Convex.

`APP_URL` must be the customer HTTPS origin because digest composition uses it for links. The primary digest CTA resolves to `/app/mentions`.

### Configure the webhook

Create a Resend webhook at:

```text
https://<deployment-name>.convex.site/webhooks/resend
```

Store its signing secret as `RESEND_WEBHOOK_SECRET`. The handler requires and verifies the `svix-id`, `svix-timestamp`, and `svix-signature` headers against the raw request body.

Subscribe to the delivery events that the repository understands:

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

Email delivery is durable: messages are written to an outbox, a one-minute cron dispatches pending entries, Resend requests use idempotency keys, and signed webhook events update delivery state.

## 7. Monitoring and analysis providers

### Xquik

- Vendor: **Xquik**
- Variable: `XQUIK_API_KEY`
- Endpoint: `https://xquik.com/api/v1/x/tweets/search`
- Authentication: `x-api-key`
- Optional scheduler setting: `XQUIK_REQUESTS_PER_SECOND`, default `100`

A valid key and provider quota are required to verify X monitoring. Fixture-backed adapter tests do not call Xquik.

### FetchLayer Reddit

- Variable: `FETCHLAYER_API_KEY`
- Base URL: `https://fetchlayer.dev/api/reddit`
- Authentication: bearer token
- Operations: Reddit post search and comment search
- Optional scheduler setting: `FETCHLAYER_REQUESTS_PER_MINUTE`, default `30`

### Hacker News

The Hacker News adapter calls the public Algolia endpoint `https://hn.algolia.com/api/v1/search_by_date` and requires no API key. `HN_REQUESTS_PER_HOUR` defaults to `9000`, sets the hourly budget, and also bounds minute claims as `min(12, value)`. Keep it positive; invalid input makes shared tracking dispatch fail closed.

### DeepSeek

- Variable: `DEEPSEEK_API_KEY`
- Endpoint: `https://api.deepseek.com/chat/completions`
- Implemented model: `deepseek-v4-flash`
- Request behavior: JSON response format, temperature `0`, high reasoning effort, thinking enabled
- Optional timeout: `DEEPSEEK_TIMEOUT_MS`, default `120000`

The model name is fixed in code. No environment variable selects a different model. A one-minute Convex cron dispatches same-workspace batches of up to 20 jobs. The worker uses four-minute leases, full-result validation, and atomic application. Missing or invalid DeepSeek configuration returns jobs to pending without a consumed attempt or provider telemetry. The retry delay is five minutes. Local validation does not prove that the account can use `deepseek-v4-flash`.

## 8. Deploy the controlled Convex production backend

### Configure production variables first

Set every required runtime variable on the default production deployment. Examples:

```sh
pnpm --filter @astreex/backend exec convex env set --prod CLERK_JWT_ISSUER_DOMAIN
pnpm --filter @astreex/backend exec convex env set --prod ADMIN_CLERK_USER_ID
pnpm --filter @astreex/backend exec convex env set --prod APP_URL
pnpm --filter @astreex/backend exec convex env set --prod CREEM_MODE production
pnpm --filter @astreex/backend exec convex env set --prod CREEM_API_KEY
pnpm --filter @astreex/backend exec convex env set --prod CREEM_WEBHOOK_SECRET
pnpm --filter @astreex/backend exec convex env set --prod CREEM_PRODUCT_ID_STARTER
pnpm --filter @astreex/backend exec convex env set --prod CREEM_PRODUCT_ID_GROWTH
pnpm --filter @astreex/backend exec convex env set --prod CREEM_PRODUCT_ID_SCALE
pnpm --filter @astreex/backend exec convex env set --prod CREEM_CHECKOUT_SUCCESS_URL
pnpm --filter @astreex/backend exec convex env set --prod RESEND_API_KEY
pnpm --filter @astreex/backend exec convex env set --prod RESEND_WEBHOOK_SECRET
pnpm --filter @astreex/backend exec convex env set --prod RESEND_FROM_EMAIL
pnpm --filter @astreex/backend exec convex env set --prod XQUIK_API_KEY
pnpm --filter @astreex/backend exec convex env set --prod FETCHLAYER_API_KEY
pnpm --filter @astreex/backend exec convex env set --prod DEEPSEEK_API_KEY
```

Audit variable names without exposing values:

```sh
pnpm --filter @astreex/backend exec convex env list --prod --names-only
```

### Deploy once

From an authenticated, reviewed release checkout:

```sh
pnpm --filter @astreex/backend deploy
```

`convex deploy` typechecks the functions, regenerates `_generated`, bundles functions, and pushes functions, indexes, crons, HTTP routes, and schema. When local `CONVEX_DEPLOYMENT` selects a development deployment, `convex deploy` targets that project's default production deployment; confirm the project before approving the release.

For CI, create a production deploy key and store it as `CONVEX_DEPLOY_KEY` only in the dedicated backend release job. Do not copy that key into both Vercel projects. Do not use a preview deploy key when the intended topology is one controlled production deployment.

Record the deployment name and both URLs:

- React client: `https://<deployment>.convex.cloud`
- HTTP actions/webhooks: `https://<deployment>.convex.site`

Deploy Convex before deploying frontend code that depends on new functions or schema.

## 9. Create two Vercel projects

Import the same repository twice.

### Customer project

- Root Directory: `apps/web`
- Framework: Next.js
- Node.js: 24.x
- Package manager: pnpm
- Production domain: customer domain

### Admin project

- Root Directory: `apps/admin`
- Framework: Next.js
- Node.js: 24.x
- Package manager: pnpm
- Production domain: admin domain

For both projects, allow the build to access source files outside the selected Root Directory because each app imports workspace packages from `packages/*` and uses the root pnpm lockfile. Vercel's normal monorepo detection and each app's `build` script are sufficient. If commands must be specified explicitly, use `corepack pnpm install --frozen-lockfile` for install and `corepack pnpm build` for build while retaining the configured app root.

Do not install Convex provider secrets, Creem secrets, Resend secrets, or provider API keys in Vercel. They belong in Convex.

### Customer Vercel variables

| Variable                            | Value                                 |
| ----------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_APP_URL`               | Customer HTTPS origin                 |
| `NEXT_PUBLIC_ADMIN_URL`             | Admin HTTPS origin                    |
| `NEXT_PUBLIC_SITE_URL`              | Customer canonical HTTPS origin       |
| `NEXT_PUBLIC_CONVEX_URL`            | Shared production `.convex.cloud` URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk production publishable key      |
| `CLERK_SECRET_KEY`                  | Matching Clerk production secret key  |
| `CLERK_SIGN_IN_URL`                 | `/sign-in`                            |
| `CLERK_SIGN_UP_URL`                 | `/sign-up`                            |

### Admin Vercel variables

| Variable                            | Value                                               |
| ----------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`               | Customer HTTPS origin                               |
| `NEXT_PUBLIC_ADMIN_URL`             | Admin HTTPS origin                                  |
| `NEXT_PUBLIC_CONVEX_URL`            | Same production `.convex.cloud` URL as customer app |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same Clerk production publishable key               |
| `CLERK_SECRET_KEY`                  | Matching Clerk production secret key                |
| `CLERK_SIGN_IN_URL`                 | `/sign-in`                                          |
| `ADMIN_CLERK_USER_ID`               | Exact approved Clerk `user_...` ID                  |

Set production variables in Vercel's Production environment. Do not point untrusted preview deployments at production Convex with production Clerk keys. Leave previews disconnected or attach them deliberately to an approved non-production Clerk/Convex environment.

After the domains are assigned, recheck Clerk's production domain/origin configuration and the absolute URLs stored in Convex.

## 10. Release verification

### Deterministic gate

Run from a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Or run the aggregate:

```sh
pnpm verify
```

### Release-environment gate

`pnpm verify:release` first runs `scripts/verify-release-env.mjs`, then `pnpm verify`. The script reads the current process environment; it does not automatically load `.env.example`.

The current validator requires these non-blank names:

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_ADMIN_URL
NEXT_PUBLIC_CONVEX_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_JWT_ISSUER_DOMAIN
ADMIN_CLERK_USER_ID
APP_URL
ADMIN_URL
CREEM_API_KEY
CREEM_MODE
CREEM_WEBHOOK_SECRET
CREEM_CHECKOUT_SUCCESS_URL
CREEM_PRODUCT_ID_STARTER
CREEM_PRODUCT_ID_GROWTH
CREEM_PRODUCT_ID_SCALE
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
RESEND_FROM_EMAIL
FETCHLAYER_API_KEY
XQUIK_API_KEY
DEEPSEEK_API_KEY
```

It also:

- requires `CREEM_MODE=production`;
- requires HTTPS for `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_URL`, `APP_URL`, `ADMIN_URL`, and `CREEM_CHECKOUT_SUCCESS_URL`;
- requires all three `CREEM_PRODUCT_ID_*` values and rejects duplicate product IDs.

It does **not** verify:

- that keys authenticate;
- that Clerk email or Google login succeeds;
- that the Clerk JWT template is valid;
- that the selected Convex deployment is the intended deployment;
- that the Creem product IDs exist in the selected Creem environment;
- that a webhook can reach Convex or that its signature secret matches;
- that Resend's domain is verified;
- that provider quotas or DeepSeek model access are available.

## 11. Required credential-backed smoke tests

These are manual or separately automated release checks. They require real accounts, network access, provider-approved test data, and observable backend state. They have not been run merely because this runbook exists.

### Deployment and public surface

- Load the production customer homepage, sign-in, sign-up, changelog, and product routes over HTTPS.
- Load the admin domain over HTTPS and confirm an unauthenticated user is redirected to sign-in.
- Confirm both apps report the intended Convex deployment and no configuration-required state.

### Clerk and authorization

- Register or sign in with a verified email flow.
- Sign in with Google.
- Confirm Clerk can mint the `convex` JWT and authenticated Convex queries succeed.
- Confirm the approved `ADMIN_CLERK_USER_ID` can enter the admin app.
- Confirm a different valid Clerk user receives the unauthorized state in both the admin frontend and admin Convex functions.

### Convex

- Bootstrap a fresh user and personal workspace.
- Create, update, pause/resume, and remove a keyword while checking plan limits.
- Confirm the one-minute crons are installed and producing no configuration errors.
- Inspect Convex logs for rejected auth, schema, scheduler, webhook, or provider errors.

### Provider ingestion

- **Xquik:** run an X keyword against a query expected to return a known tweet; verify normalization, pagination, persisted mention, and provider metrics.
- **FetchLayer:** run both Reddit post and comment searches against known data; verify persisted mentions and provider metrics.
- **Hacker News:** query known recent data through Algolia and verify story/comment normalization.
- Confirm rate-limit or temporary-failure handling does not fabricate successful mentions.

### DeepSeek

- Confirm the account can call `deepseek-v4-flash` with the implemented request fields.
- Ingest approved test mentions, then verify the one-minute dispatcher claims same-workspace batches, assigns exactly one enabled category per mention, and records the expected `deepseek` provider run/metrics.
- Exercise a controlled retryable failure and a rejected invalid result; confirm lease fencing, whole-batch retry, and no partial category writes. Do not claim these credential-backed behaviors unless the deployed worker was actually exercised.

### Creem test mode

Using a non-production Convex deployment, Creem test API key, test products, and the test webhook:

1. Start Starter checkout and confirm the generated URL is on the Creem test flow.
2. Complete checkout with a provider-approved test payment method.
3. Confirm `checkout.completed` and subscription events reach `/webhooks/creem` with valid signatures.
4. Confirm the synchronized subscription has active entitlement and the expected limits.
5. Upgrade to Growth or Scale and verify immediate-proration behavior and synchronized limits.
6. Open the customer portal from the stored provider customer ID.
7. Exercise cancel/refund states needed by the release policy and confirm entitlement changes are webhook-driven.

### Creem live mode

Before general availability, perform an explicitly approved production transaction using the actual live products, live API key, live webhook, and a real payment method. Confirm checkout, signed webhook delivery, entitlement, portal access, and the chosen refund/cancellation procedure. This may create a real charge. Record the transaction and clean-up outcome. A successful test-mode checkout is not proof that live product IDs or live webhooks are correct.

### Resend

- Trigger a digest to a controlled mailbox on the verified sending domain configuration.
- Confirm the outbox changes from pending/leased to sent with a Resend message ID.
- Confirm the message is delivered and every link, including `/app/mentions`, resolves on the production customer app.
- Confirm signed Resend webhook events update delivery status.
- Test a controlled bounce or suppression workflow if required by the release policy.

## 12. Rollback and incident controls

- Frontend rollback: promote the previous known-good Vercel deployment independently for web or admin.
- Backend rollback: use the single controlled Convex release owner to deploy a reviewed previous backend revision. Consider schema compatibility before reverting functions.
- Provider containment: remove or rotate the relevant Convex environment key to force an honest `provider_unconfigured` state.
- Billing containment: disable the Creem webhook or rotate/remove its secret only with an incident plan; doing so stops authoritative subscription synchronization.
- Email containment: remove/rotate `RESEND_API_KEY` to stop delivery while preserving the durable outbox for later retry.
- Admin containment: remove `ADMIN_CLERK_USER_ID` from the admin Vercel project and Convex to fail closed.

After any rollback or key rotation, repeat the relevant credential-backed smoke checks rather than relying only on `pnpm verify`.
