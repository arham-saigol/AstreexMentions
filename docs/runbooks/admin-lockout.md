# Admin lockout

Admin access is a single exact Clerk user ID checked independently by the admin Next.js app and Convex. There is no role, organization claim, secondary admin, or break-glass account.

## Identify the fail-closed state

| Observed state                                                       | Meaning                                                                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Redirect to `/configuration`; admin session API returns uncached 503 | Admin app is missing `ADMIN_CLERK_USER_ID`, Clerk publishable key, or Clerk secret key, or Clerk initialization failed.     |
| Redirect to `/sign-in`; API 401                                      | Configuration is present, but there is no Clerk session.                                                                    |
| Redirect to `/unauthorized`; API 403                                 | Signed-in Clerk user ID does not exactly match the admin app's configured ID.                                               |
| “Admin data is not connected”                                        | Frontend admin auth succeeded, but `NEXT_PUBLIC_CONVEX_URL` or Clerk `convex` JWT access is unavailable.                    |
| “Admin data is unavailable”                                          | Authenticated Convex query failed or returned an invalid shape. A mismatched/missing Convex-side admin ID can surface here. |

The comparison is character-for-character. Case changes, leading/trailing whitespace, a different Clerk environment, or a replacement Clerk user all deny access.

## Triage

1. Confirm the intended production or non-production Clerk instance and copy the immutable `user_...` ID for the approved account.
2. Confirm the admin Vercel project uses that exact Clerk instance and has nonblank:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`;
   - `CLERK_SECRET_KEY`;
   - `ADMIN_CLERK_USER_ID`;
   - `NEXT_PUBLIC_CONVEX_URL`.
3. Confirm the target Convex deployment has:
   - matching `CLERK_JWT_ISSUER_DOMAIN`;
   - exact same `ADMIN_CLERK_USER_ID`.
4. Audit Convex variable names without printing values:

   ```sh
   pnpm --filter @astreex/backend exec convex env list --prod --names-only
   ```

5. Confirm Clerk can mint the JWT template named exactly `convex` for the approved user.
6. Check that the browser is signed into the approved user, not a similarly named/email account.

Do not paste the Clerk secret, JWT, or full environment output into an incident channel.

## Recover

1. Set the exact approved Clerk user ID in Convex:

   ```sh
   pnpm --filter @astreex/backend exec convex env set --prod ADMIN_CLERK_USER_ID
   ```

   Omit the value to enter it interactively.

2. Set the same exact value in the admin Vercel Production environment. Remove accidental spaces/newlines; the application preserves a nonblank configured value for exact comparison.
3. Verify the Clerk keys/issuer and Convex URL belong to the same intended environment.
4. Redeploy/promote the admin Vercel project so server environment changes are active. A Convex environment update does not require a backend code deploy.
5. Sign out and sign in again to refresh the Clerk session/JWT.

If the approved Clerk user was deleted, selecting a new admin requires an explicit access change in both environments. A recreated account normally has a different immutable user ID.

## Emergency containment

To deny all admin access, remove `ADMIN_CLERK_USER_ID` from both the admin Vercel project and Convex. The app and backend fail closed. Record who performed the action and how access will be restored.

## Verify

- The approved user reaches `/metrics` and can load a verified Convex response.
- The admin navigation contains only Metrics, Feature Requests, and Changelog.
- A separate valid Clerk user receives frontend unauthorized behavior and cannot call `admin:getMetricsOverview` directly.
- Admin mutations continue to create audit events with the approved Clerk subject.

Do not weaken `assertAdminClerkUserId`, bypass the proxy, or add a temporary public/admin route during recovery.
