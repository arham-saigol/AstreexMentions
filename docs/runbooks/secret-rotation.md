# Secret rotation

Rotate secrets in the exact service and deployment where they are used. The root `.env.example` is an inventory, not a shared runtime file.

## Inventory by destination

| Destination              | Sensitive values                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer Vercel project  | `CLERK_SECRET_KEY`                                                                                                                            |
| Admin Vercel project     | `CLERK_SECRET_KEY`; `ADMIN_CLERK_USER_ID` is access-sensitive even though it is not a secret                                                  |
| Convex deployment        | `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `XQUIK_API_KEY`, `FETCHLAYER_API_KEY`, `DEEPSEEK_API_KEY` |
| Dedicated backend CI job | `CONVEX_DEPLOY_KEY`                                                                                                                           |

Clerk publishable keys, Convex URLs, issuer domain, sender address, product allowlist, and rate settings are configuration, but rotating/changing them can still cause outages or access changes.

## Standard API-key rotation

Use for Creem API, Resend API, Xquik, FetchLayer, and DeepSeek when the provider supports overlapping keys.

1. Identify test versus production and create a restricted replacement key.
2. Set it in the matching Convex deployment, omitting the CLI value to avoid shell history:

   ```sh
   pnpm --filter @astreex/backend exec convex env set --prod NAME
   ```

3. Perform the smallest approved credential-backed check and inspect provider runs/metrics.
4. Revoke the old key.
5. Verify again and record provider key identifier, not the secret.

Avoid a gap between revocation and installation. For Xquik/FetchLayer, a missing key encountered by a claimed source creates `paused/config`; restoring the key does not bulk-resume those sources. For Resend, pending outbox rows remain durable and can retry after configuration returns. For DeepSeek, missing configuration returns leased categorization jobs to `pending`, restores the attempt count, and schedules another check in five minutes.

## Webhook-secret rotation

The runtime accepts one Creem secret and one Resend secret; there is no dual-secret overlap in code.

1. Confirm the exact provider endpoint and `.convex.site` deployment URL.
2. Start the provider-side rotation and obtain the new endpoint secret through the approved secure channel.
3. Immediately set the matching Convex environment value:

   ```sh
   pnpm --filter @astreex/backend exec convex env set --prod CREEM_WEBHOOK_SECRET
   pnpm --filter @astreex/backend exec convex env set --prod RESEND_WEBHOOK_SECRET
   ```

4. Send/replay a controlled signed event and verify persistence.
5. End the old-secret validity if the provider supports an overlap window.

During mismatch, Creem/Resend requests receive 401 and should be retried by the provider. A missing secret returns 503. Creem pending replay is idempotent; a dead event ID cannot be revived. Resend duplicate event IDs are no-ops.

## Clerk secret rotation

1. Rotate in the intended Clerk instance.
2. Update `CLERK_SECRET_KEY` in both Vercel projects that use that instance.
3. Redeploy/promote both applications.
4. Verify customer sign-in, admin exact-user access, and `convex` JWT minting.
5. Revoke the prior key according to Clerk's procedure.

Do not change `CLERK_JWT_ISSUER_DOMAIN` unless the Clerk instance/template issuer actually changes. If it changes, update Convex deliberately and re-test all authenticated queries.

## Convex deploy-key rotation

1. Create a replacement production deploy key in Convex.
2. Update only the dedicated backend release job's `CONVEX_DEPLOY_KEY`.
3. Run a non-destructive authenticated CLI/release check appropriate to the platform.
4. Revoke the old key.

Do not install the production deploy key in either Vercel frontend project.

## Emergency compromise containment

- Revoke/remove the affected key first when ongoing abuse outweighs availability.
- Xquik/FetchLayer removal pauses claimed sources as configuration.
- Resend API-key removal stops delivery while preserving the outbox.
- Webhook-secret removal stops authoritative event ingestion; plan provider replay before doing it.
- Creem API-key removal blocks checkout/upgrade/portal but does not by itself stop a correctly signed webhook.
- Removing both admin IDs fails admin access closed; use the admin lockout runbook to restore.

## Verify and close

- Audit environment names with `convex env list --prod --names-only`; do not print secret values.
- Confirm the old credential is rejected only after the new one is verified.
- Inspect `providerRuns`, queue state, webhook HTTP results, and audit events for the rotation window.
- Resume any configuration-paused tracking sources through a reviewed path.
- Record scope, provider key identifier, operator, time, verification, and revocation outcome.
