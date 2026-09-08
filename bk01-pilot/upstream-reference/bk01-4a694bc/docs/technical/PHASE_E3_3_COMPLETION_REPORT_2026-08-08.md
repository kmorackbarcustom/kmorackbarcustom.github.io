# Phase E3.3 completion report — shop settings + shops table column-exposure fix

Date: 2026-08-08
Status: Complete. Implemented, applied to live DB, and verified solo (no Codex review this round — approved by the project owner in advance; see the vault session handoff).

## Why this checkpoint existed

While preflighting E3.3, a real security gap was found and confirmed live: `local_service.shops` had a blanket `GRANT ALL` to `anon`/`authenticated` (the same table-grant-vs-RLS-role gap already closed on `bookings`/`services`/`staff`/`staff_schedules`/`shop_holidays` in E2/E3.1/E3.2), and the only anon-facing RLS policy did not restrict which *columns* were exposed. A plain unauthenticated REST call (`select=*`) returned `subscription_status`, `trial_ends_at`, `owner_name`, `business_category`, and `requested_plan` for any shop whose slug is known — and shop slugs are public booking-page URLs by design.

## What changed

**Migration 1 — `20260808000000_phase_e3_3_shop_settings_authorization.sql`:**
- Revoked `INSERT`/`UPDATE`/`DELETE` on `shops` from `anon`/`authenticated`, and `SELECT` from `anon` entirely.
- Added `local_service.shop_public_profile`, a view exposing only the columns the consumer booking flow needs (`id, name, slug, phone, address, line_oa_id, promptpay_number, promptpay_name, require_deposit, default_deposit_amount`), granted `SELECT` to `anon`/`authenticated`.
- Added owner-only `update_shop_settings(p_shop_id, p_name, p_phone, p_address, p_promptpay_number, p_promptpay_name, p_line_oa_id)`, `SECURITY DEFINER`, validated, `REVOKE`d from `PUBLIC`/`anon`/`service_role`, granted to `authenticated`.

**Migration 2 — `20260808000100_phase_e3_3_fix_public_profile_view.sql` (bug found during this session's own live verification, fixed same session):**
- The view was first created `WITH (security_invoker = true)`. That setting makes Postgres also check the *querying role's own privileges* on the underlying table — so revoking `anon`'s table-level `SELECT` broke the view for `anon` too, not just direct table access, defeating the point of the view. Reproduced live via a real anon REST call against the view (401, not 200) before concluding anything worked. Fixed by recreating the view without `security_invoker` (the default: runs with the defining role's privileges) — safe here because the view has a fixed column list and a fixed `WHERE is_active = true` with no caller-supplied input, so there's no bypass risk in it running as owner.

**App code (`booking-admin`):**
- `admin-service.ts`: `DashboardShop` now carries `phone`, `address`, `promptpayNumber`, `promptpayName`, `lineOaId`; `fetchAdminDashboardData` selects them from `shops`; added `updateShopSettings()` wrapping the new RPC.
- `dashboard/page.tsx`: shop-profile section (name/phone/address) and the settings tab (PromptPay/LINE OA ID) now load and save real data, gated to `shopRole === 'owner'` on every input and the save button. Removed `shopSlogan` and `allowStaffSelection` state (no backing DB column, ever). Removed the `Custom Messaging API Channel Token` `<input type="password">` and the mock "ทดสอบส่งข้อความแจ้งเตือนเข้า LINE OA" button (fake success, no real send) — replaced with an honest note that custom per-shop LINE isn't available yet and no token is ever stored client-side. Fixed `handleCopyShopLink` and the displayed booking-link URL, which both hard-coded `http://localhost:3000` instead of `NEXT_PUBLIC_BOOKING_SITE_URL`.
- **Bug found during this session's own browser verification, fixed same session:** the dashboard's initial page-load `useEffect` never called `setShopPhone`/`setShopAddress`/`setPromptpayNumber`/`setPromptpayName`/`setLineOaId` — only the post-mutation refresh path (`loadDashboardBookings`) did. A fresh page load showed blank phone/PromptPay/LINE fields until some unrelated mutation happened to trigger a refresh. Caught by loading the settings tab immediately after login in a real browser and finding real DB data didn't match what was displayed. Fixed by adding the same five setters to the initial `useEffect`. The pre-existing duplication between that `useEffect` and `loadDashboardBookings` (which already existed before this checkpoint, from Phase E2) is left as-is — flagged as minor tech debt, not fixed here, to avoid an unreviewed late-session refactor beyond this checkpoint's scope.

**App code (`booking-consumer`):**
- `booking-service.ts`: `getShopBySlug` now reads `shop_public_profile` instead of `shops.select('*')`.

## Live verification performed

REST (anon key + real authenticated owner/admin/staff/cross-tenant-owner accounts, created and deleted via Admin API):
- Anon cannot `SELECT`, `INSERT`, or `UPDATE` `shops` directly (401/403 with a real Postgres permission-denied response, not a silent empty result).
- Anon **can** `SELECT` `shop_public_profile` (after the view fix) and the row contains **none** of `subscription_status`/`trial_ends_at`/`owner_name`/`business_category`/`requested_plan`/`registration_idempotency_key` — checked programmatically, not by eye.
- Anon cannot call `update_shop_settings` (401).
- A real authenticated `admin` and a real authenticated `staff` member of the shop both get rejected by `update_shop_settings` with "Owner role required" (403) — settings are owner-only, unlike services/staff which admins can also manage.
- A real owner of a *different* shop cannot call `update_shop_settings` against this shop (403) — cross-tenant check passed.
- Blank required field (`promptpay_name`) is rejected (400) before touching the row.
- A real owner successfully updates the shop via the RPC; the change is immediately visible through `shop_public_profile`; the exact original values were then restored and the restore was itself verified by re-reading the view (not assumed).

Browser (real dev server, both apps):
- `/book/[slug]` loads correctly through the new view (services, prices, deposits all render, zero console errors) and a full booking (`create_booking_hold` → PromptPay step) completes end to end using data that flowed through the new public view.
- Dashboard: real owner login → Shop Profile section and Settings tab both show live DB values (not placeholders) → a real save round-trip through `update_shop_settings` succeeds and is reflected in `shops.updated_at`.

All test fixtures (2 throwaway shops, 8 throwaway auth users across both verification passes, 1 test booking + customer) were deleted and re-confirmed as zero via direct count queries before this checkpoint was called done.

## Out of scope / still mock

- Billing tab (Phase E4) — untouched, still fully mock, not started.
- Per-shop custom LINE OA Channel Token — deliberately not built. The UI now says so honestly instead of offering a client-side input that would have violated this project's Zero Client Secrets rule the moment it was wired to anything.

## Commits

- `af8836f` — checkpoint 1: local implementation + first migration applied (view had the `security_invoker` bug at this point, not yet caught).
- (this checkpoint) — checkpoint 2: view fix migration + dashboard initial-load bug fix + this report, following live verification that caught both issues.

Not pushed as of writing this report — see PROJECT_HANDOVER_BRIEF.md for current push status.
