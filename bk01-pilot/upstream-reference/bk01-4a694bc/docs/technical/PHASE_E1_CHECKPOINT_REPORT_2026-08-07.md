# Phase E1 checkpoint report — owner auth foundation

Date: 2026-08-07
Status: local implementation complete; live migration and end-to-end verification pending approval

## Implemented

- Added cookie-based Supabase SSR browser/server clients using `@supabase/ssr`.
- Added Next.js 16 `proxy.ts` session refresh using `auth.getClaims()`.
- Added `/auth/callback` handling both PKCE `code` and email OTP `token_hash` callbacks.
- Added real email/password `/login` and dashboard authentication/membership guard.
- Added logout server action.
- Replaced simulated `/register` completion with real Supabase Auth signup and atomic RPC provisioning.
- Added an in-page “check your email” state when `signUp()` returns no session.
- Pending onboarding data is stored without the password and resumed after email confirmation.
- Added idempotency protection to avoid duplicate shops when confirmation callbacks are retried.
- Added `.env.example`; `.env.local` was not modified.

## Database migration

`supabase/migrations/20260807155759_phase_e1_owner_auth_and_provisioning.sql`

The migration:

- adds owner/business/requested-plan/idempotency fields to `local_service.shops`;
- adds the first `shop_users` policy, restricted to the authenticated user's own memberships;
- adds `local_service.provision_owner_shop(...)` as an authenticated-only `SECURITY DEFINER` RPC;
- validates authentication and inputs inside the function;
- creates the shop and owner membership atomically;
- keeps paid plan choices as `requested_plan` while the actual subscription remains `trial` until Phase E4 billing exists.

## Verification completed

- Targeted ESLint: passed with zero errors.
- Root `npm run build`: passed for both apps with zero TypeScript/build errors.
- `git diff --check`: passed.
- `npm install --package-lock-only --ignore-scripts`: zero reported vulnerabilities.

## Not yet verified

- Migration SQL has not been applied to the linked/live Supabase project.
- Local Supabase was unavailable at `127.0.0.1:54322`, so database lint and RPC tests were not run locally.
- The live project's email-confirmation setting is not observable with the currently available tools. The UI handles either configuration based on the real `signUp()` response.
- Signup redirect URLs still need to allow the admin callback URL in Supabase Auth URL Configuration.
- No live signup, confirmation-email, cross-tenant RLS, or logout browser test has been run.

## Required live verification after approval

1. Add exact local and production `/auth/callback` URLs to Supabase Auth Redirect URLs.
2. Apply the Phase E1 migration to project `gyleqrjdzwwlqierdwcy`.
3. Verify anon cannot execute `provision_owner_shop`.
4. Verify authenticated user A can provision once and receives an owner membership.
5. Retry with the same idempotency key and confirm no duplicate shop is created.
6. Verify user B cannot read user A's `shop_users` row or enter user A's dashboard.
7. Test signup with the project's actual email-confirmation setting.
8. Verify login, dashboard guard, and logout in the browser.

## Existing out-of-scope lint failures

The full admin lint command still fails on pre-existing errors in the old webhook, dashboard, and platform-admin files. E1-targeted lint passes. These existing files were not expanded into this checkpoint solely to make the global lint clean.
