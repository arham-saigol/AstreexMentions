# Astreex

Astreex is a pnpm/Turborepo monorepo for monitoring customer conversations across X, Reddit, and Hacker News. It contains a customer-facing Next.js application, a restricted administrator application, a shared Convex backend, billing through Creem, email through Resend, and a DeepSeek mention analysis adapter.

## Repository status

The repository can lint, typecheck, test, and build without live credentials. In that disconnected mode, the applications deliberately show configuration-required or unavailable states instead of pretending that authentication, billing, ingestion, or email is connected.

Account deletion is a Convex-owned durable workflow. The customer route only
requests deletion and always reports `deleted: false`; Convex rechecks billing
and provider state, fences access, purges and verifies tenant data, deletes the
Clerk identity, holds a configurable stale-token fence, and only then marks the
job complete. Exact administrators inspect and recover the queue from the
Metrics operations surface; the sidebar remains Metrics, Feature Requests, and
Changelog.

The customer experience is deliberately single-user. It presents an account,
dashboard, brand, and monitoring profile; it has no workspace switcher,
organization, membership, invitation, or team-management surface. The
`workspaces` and `workspaceMembers` names remain internal tenant-boundary
implementation details.

`packages/backend/convex/_generated` is intentionally absent. Creating it requires a real Convex development deployment, and creating that deployment requires an interactive `npx convex login`. Until a deployment is configured, the backend uses Convex's official generic constructors and the frontends use generic function references. Do not create fake `_generated` files. After configuring a real development deployment, run Convex code generation as described below.

No credential-backed provider or payment smoke test is implied by an offline build or by this documentation.

## Monorepo structure

```text
apps/
  web/       Customer product, marketing site, authentication, onboarding
  admin/     Restricted single-user operations application
packages/
  backend/   Convex schema, functions, crons, HTTP webhooks, integrations
  domain/    Plans, validation, scheduling, and shared business rules
  email/     React Email templates
  ui/        Shared components and styling
  config/    Shared TypeScript and ESLint configuration
tests/
  security/  Authorization inventory and guard tests
scripts/
  verify-release-env.mjs
docs/
  architecture.md
  authorization.md
  billing.md
  data-model.md
  deployment.md
  jobs.md
  providers.md
  testing.md
  runbooks/       Incident response, rotation, deletion, and recovery
```

The customer app listens on `http://localhost:3000`; the admin app listens on `http://localhost:3001`.

## Prerequisites

- Node.js `24.x`
- pnpm `10.34.5` through Corepack; the workspace accepts pnpm `>=10.30.0 <11`
- A Convex account for connected backend development
- A Clerk application with the desired sign-in methods and a JWT template named `convex`
- Creem, Resend, Xquik, FetchLayer, and DeepSeek accounts for their live runtime integrations
- No API key is required for Hacker News because that adapter uses the public Algolia Hacker News API

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
```

## Development modes

### Disconnected development

Disconnected development is the default safe path for UI work and deterministic tests:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

This starts `@astreex/web` and `@astreex/admin` in parallel. It does **not** start Convex. Without Clerk and Convex variables, the web app exposes public pages and honest configuration states; the admin app denies access until its exact administrator and Clerk configuration are present. Provider-backed jobs do not run.

Useful disconnected checks:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

These commands exercise local code and fixture-backed tests. They do not prove that external credentials, webhooks, checkout, OAuth, or provider quotas work.

### Connected development

Connected development requires Clerk and a real Convex development deployment.

1. In Clerk, enable the sign-in methods required by the deployment and create the built-in Convex JWT template named exactly `convex`. Copy its issuer domain.
2. Create `packages/backend/.env.local` with the issuer so the initial Convex configuration can evaluate `auth.config.ts`:

   ```dotenv
   CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-issuer.example
   ```

3. Authenticate the Convex CLI and configure a cloud development deployment:

   ```sh
   npx convex login
   pnpm --filter @astreex/backend exec convex dev --configure new --once
   ```

   The first command is the current blocker in a fresh checkout: Convex cannot create or select even a local/development deployment until the CLI login completes interactively. Use `--configure existing` instead when attaching to an existing project. Select the intended Convex team and project deliberately. The CLI writes the selected `CONVEX_DEPLOYMENT` and development URL to an ignored local environment file under `packages/backend`.

4. Set the issuer on that Convex development deployment:

   ```sh
   pnpm --filter @astreex/backend exec convex env set CLERK_JWT_ISSUER_DOMAIN
   ```

   The command prompts for the value when it is omitted, which avoids shell-history exposure.

5. Generate the real Convex artifacts:

   ```sh
   pnpm convex:codegen
   ```

   This creates `packages/backend/convex/_generated`. Generated files must come from the Convex CLI and must not be hand-authored.

6. Put frontend variables in each app's own ignored `.env.local`. The root `.env.example` is a reference template; Next.js does not automatically load it for both workspace applications.

   `apps/web/.env.local`:

   ```dotenv
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
   NEXT_PUBLIC_CONVEX_URL=https://your-dev-deployment.convex.cloud
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_SIGN_IN_URL=/sign-in
   CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   `apps/admin/.env.local`:

   ```dotenv
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_ADMIN_URL=http://localhost:3001
   NEXT_PUBLIC_CONVEX_URL=https://your-dev-deployment.convex.cloud
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_SIGN_IN_URL=/sign-in
   ADMIN_CLERK_USER_ID=user_...
   ```

7. Set `ADMIN_CLERK_USER_ID` on the Convex development deployment to the same exact Clerk user ID used by the admin app:

   ```sh
   pnpm --filter @astreex/backend exec convex env set ADMIN_CLERK_USER_ID
   ```

8. Run the backend watcher and both applications in separate terminals:

   ```sh
   pnpm dev:backend
   ```

   ```sh
   pnpm dev
   ```

See [docs/deployment.md](docs/deployment.md) for provider variables, Clerk configuration, webhooks, production deployment, and release verification.

## Workspace commands

| Command                                    | Purpose                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`                                 | Run web and admin in parallel; does not run Convex                                   |
| `pnpm dev:web`                             | Run only `apps/web` on port 3000                                                     |
| `pnpm dev:admin`                           | Run only `apps/admin` on port 3001                                                   |
| `pnpm dev:backend`                         | Run `convex dev` for the configured development deployment                           |
| `pnpm --filter @astreex/backend dev:local` | Run Convex local mode after CLI login/configuration; it is not an offline substitute |
| `pnpm convex:codegen`                      | Generate Convex `_generated` artifacts after deployment configuration                |
| `pnpm build`                               | Build all workspaces through Turborepo                                               |
| `pnpm lint`                                | Lint all workspaces                                                                  |
| `pnpm typecheck`                           | Typecheck all workspaces                                                             |
| `pnpm test`                                | Run all deterministic workspace tests through Turborepo                              |
| `pnpm format`                              | Rewrite files with Prettier                                                          |
| `pnpm format:check`                        | Check formatting without rewriting                                                   |
| `pnpm verify`                              | Format check, lint, typecheck, test, and build                                       |
| `pnpm verify:release`                      | Validate release URLs/mode/product mapping, then run `verify`                        |
| `pnpm --filter @astreex/backend deploy`    | Deploy Convex to the selected production/preview target                              |

## Environment reference

The repository-root `.env.example` is an inventory, not a file automatically loaded by every workspace. Put frontend/server variables in the relevant app's local environment or Vercel project, and put backend secrets in the selected Convex deployment with `convex env set`.

### Variables present in `.env.example`

The example currently contains 36 unique variable names. `ADMIN_CLERK_USER_ID` appears twice because the same exact value must be installed in the admin Next.js environment and the Convex deployment.

| Variable                            | Destination and current behavior                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`              | `apps/web`; optional canonical site URL at runtime, defaulting to `https://astreex.com`. The release validator requires an HTTPS value.                                         |
| `NEXT_PUBLIC_APP_URL`               | Frontend deployment metadata required by the release validator. Current application code does not read it directly.                                                             |
| `NEXT_PUBLIC_ADMIN_URL`             | Frontend deployment metadata required by the release validator. Current application code does not read it directly.                                                             |
| `NEXT_PUBLIC_CONVEX_URL`            | Both Next.js apps; use the same controlled `.convex.cloud` URL.                                                                                                                 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Both Next.js apps. The customer app requires a `pk_` prefix.                                                                                                                    |
| `CLERK_SECRET_KEY`                  | Both Next.js servers. Never expose it through a `NEXT_PUBLIC_` name.                                                                                                            |
| `CLERK_SIGN_IN_URL`                 | Conventional Clerk setting. Current components link explicitly to `/sign-in`.                                                                                                   |
| `CLERK_SIGN_UP_URL`                 | Conventional Clerk setting. Current customer components link explicitly to `/sign-up`.                                                                                          |
| `ADMIN_CLERK_USER_ID`               | `apps/admin` and Convex; exact single-user allowlist. Missing, blank, case-changed, or whitespace-changed values deny access.                                                   |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex; required by `auth.config.ts` and copied from Clerk's JWT template named `convex`.                                                                                       |
| `APP_URL`                           | Convex; absolute customer origin used to build the daily-digest CTA. The release validator requires HTTPS. See the route gap below.                                             |
| `ADMIN_URL`                         | Release metadata only; required as HTTPS by `verify-release-env.mjs`, but not read by the current Convex runtime.                                                               |
| `CREEM_API_KEY`                     | Convex; checkout, upgrade, and portal API calls.                                                                                                                                |
| `CREEM_MODE`                        | Convex; `test` or `production`, selecting Creem's fixed test or production API base. The release validator requires `production`.                                               |
| `CREEM_TIMEOUT_MS`                  | Convex; optional positive timeout, default `15000`.                                                                                                                             |
| `CREEM_WEBHOOK_SECRET`              | Convex; verifies `creem-signature` at `/webhooks/creem`.                                                                                                                        |
| `CREEM_CHECKOUT_SUCCESS_URL`        | Convex; absolute checkout return URL. The release validator requires HTTPS.                                                                                                     |
| `CREEM_PRODUCT_ID_STARTER`          | Convex; environment-specific Starter product ID. Limits come from `packages/domain/src/plans.ts`.                                                                               |
| `CREEM_PRODUCT_ID_GROWTH`           | Convex; environment-specific Growth product ID. Limits come from `packages/domain/src/plans.ts`.                                                                                |
| `CREEM_PRODUCT_ID_SCALE`            | Convex; environment-specific Scale product ID. Limits come from `packages/domain/src/plans.ts`.                                                                                 |
| `RESEND_API_KEY`                    | Convex; durable email-outbox delivery.                                                                                                                                          |
| `RESEND_TIMEOUT_MS`                 | Convex; optional positive integer timeout, default `15000`.                                                                                                                     |
| `RESEND_WEBHOOK_SECRET`             | Convex; verifies Resend/Svix delivery events at `/webhooks/resend`.                                                                                                             |
| `RESEND_FROM_EMAIL`                 | Convex; required sender for warnings and digests. Its domain must be verified in Resend.                                                                                        |
| `RESEND_REPLY_TO_EMAIL`             | Convex; optional reply-to address. Blank means no separate reply-to.                                                                                                            |
| `FETCHLAYER_API_KEY`                | Convex; Reddit post and comment search through FetchLayer.                                                                                                                      |
| `XQUIK_API_KEY`                     | Convex; X search through Xquik.                                                                                                                                                 |
| `DEEPSEEK_API_KEY`                  | Convex; credential used by the event-driven mention analysis worker with fixed model `deepseek-v4-flash`.                                                                       |
| `DEEPSEEK_TIMEOUT_MS`               | Convex; optional positive timeout, default `120000`.                                                                                                                            |
| `TINYFISH_API_KEY`                  | Convex; onboarding company research web fetch and search through TinyFish.                                                                                                      |
| `TINYFISH_TIMEOUT_MS`               | Convex; optional positive timeout, default `45000`.                                                                                                                             |
| `XQUIK_REQUESTS_PER_SECOND`         | Convex; optional positive integer, default `100`. Hourly budget is value × 3,600; minute claims are capped at `min(60, value × 55)`.                                            |
| `FETCHLAYER_REQUESTS_PER_MINUTE`    | Convex; optional positive integer, default `30`, used as the minute cap and multiplied by 60 for the hourly budget.                                                             |
| `HN_REQUESTS_PER_HOUR`              | Convex; optional positive integer, default `9000`, used as the Hacker News hourly budget. Minute claims are capped at `min(12, value)`; invalid input blocks tracking dispatch. |

### Additional operational variables

These are used by tooling but are not part of `.env.example`:

| Variable            | Purpose                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CONVEX_DEPLOYMENT` | Convex CLI selection for the configured development deployment; written to an ignored local environment file.      |
| `CONVEX_DEPLOY_KEY` | CI secret selecting a production or preview deployment; keep it only in the single controlled backend release job. |

## Runtime verification boundary

Disconnected validation proves deterministic application behavior, including
the deletion state machine, but not live credentials or installed cloud state.
Before release, verify Clerk/Convex authentication, Creem reconciliation,
provider access and quotas, Resend delivery/webhooks, installed crons, and the
configured identity-fence duration in the target environment.

## Integration endpoints

- X: Xquik, `https://xquik.com/api/v1/x/tweets/search`
- Reddit: FetchLayer, `https://fetchlayer.dev/api/reddit`
- Hacker News: public Algolia Hacker News API
- Onboarding research: TinyFish Markdown Fetch (`https://api.fetch.tinyfish.ai`) and Search (`https://api.search.tinyfish.ai`)
- Mention analysis: DeepSeek chat completions with `deepseek-v4-flash`, dispatched from the durable Convex mention analysis queue
- Billing: Creem test or production API selected by `CREEM_MODE`
- Email: Resend API and signed webhook delivery events

## Design documentation

- [Architecture and request flows](docs/architecture.md)
- [Convex data model and every index](docs/data-model.md)
- [Customer, admin, public, webhook, and deletion authorization](docs/authorization.md)
- [Creem billing, entitlement, usage cycles, warnings, and deletion guards](docs/billing.md)
- [Tracking schedules, leases, budgets, checkpoints, and durable jobs](docs/jobs.md)
- [Xquik, FetchLayer, Algolia HN, DeepSeek, and Resend contracts](docs/providers.md)
- [Deterministic, Convex, adapter, UI, and credential-backed testing](docs/testing.md)
- [Deployment runbook](docs/deployment.md)
- [Incident, queue, rotation, deletion, and recovery runbooks](docs/runbooks/README.md)

## Deployment

Production uses three independently managed targets:

1. one Vercel project rooted at `apps/web`;
2. one Vercel project rooted at `apps/admin`;
3. one controlled production Convex deployment shared by both Vercel projects.

Do not configure both Vercel projects to run `convex deploy`; that creates competing backend release paths. Follow the complete [deployment runbook](docs/deployment.md).
