# REVIEW — CODEX KMO BK01 MOBILE PILOT

Date: 2026-09-09 (Asia/Bangkok)
Mode: Independent review / read-only
Route: `review-only + UI + security/pre-release scan`

## EXECUTIVE VERDICT

**REMEDIATE BEFORE OWNER RETEST**

The four Admin secret-scan hits are not real credentials. All four credential categories resolve to the same 17-character, explicitly marked non-live placeholder fingerprint (`SHA-256 prefix 03AAA57DAA40`), not to a JWT/token-shaped value. The blocked build did not deploy: Cloudflare currently routes 100% of Admin to `14da45d6-0efa-4d7b-bf7d-cb5d82b282e2` and Consumer to `fe6730cc-c26c-4e4f-91d9-f4751d4e374c`.

The candidate is nevertheless not ready for the requested complete owner mobile retest. Live public reads show 2 services but 0 staff, so no customer slot can be booked. The page has no explicit zero-staff/read-failure state. More importantly, the new weekly-hours trigger returns success when a shop has no weekly row, so the general contract is fail-open for missing configuration. The new tests are predominantly source-string checks and do not prove these behaviors, tenant denial, or mobile interaction.

Confirmed baseline: branch `pilot/bk01-independent-deployment`, HEAD `dd266f7825eda9295636e5d4fe1e76c18e798a50`, ahead of origin by 10 commits, with the intentional modified/untracked work preserved. No code, SQL, env, canonical file, commit, push, deployment, cleanup, or database mutation was performed. The only repository write is this requested review.

## P0/P1 FINDINGS

### P1 — Missing weekly configuration fails open at the booking-write boundary

- Evidence: `supabase/kmo-baseline/KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:105-112` returns `NEW` when no `(shop_id, day_of_week)` row exists. The trigger at lines 124-129 therefore enforces closure/hours only when a row exists.
- Impact: a new or partially configured shop can still book according to staff schedule alone. Adding staff can make a day bookable even though shop-level weekly truth is absent.
- KMO current state: live anon read returns 7 weekly rows, so the observed KMO tenant is not currently on the missing-row path. This remains a generic release blocker and should be changed to fail closed or made impossible by a seven-row invariant created atomically with every shop.
- Classification: `GENERIC_BK01_DEFECT`.

### P1 — Customer booking cannot complete with the current live KMO data

- Evidence: live anon REST reads on 2026-09-09 returned services `200` with 2 rows, staff `200` with 0 rows, and weekly schedule `200` with 7 rows. `page.tsx:237-260` requires at least one staff member with an eligible schedule for every slot.
- Impact: services display, but every time is unavailable and the customer cannot progress to a valid booking slot.
- UX defect: `page.tsx:592-621` still renders “any staff” with no explicit “no active staff/configuration incomplete” state. Load/read errors are collapsed to `shop = null` at lines 100-103, making a permission/network failure look like a missing shop.
- Classification: live data/setup is `KMO_DOWNSTREAM_ONLY`; missing truthful empty/error states are `GENERIC_BK01_DEFECT`.

### P0 disposition — secret scan remains a deployment gate, not a confirmed leak

- `admin_server_secret_hits=4` is explained by non-live placeholder contamination, detailed below.
- No real credential was found in the candidate artifacts using exact-value comparison against the five server credential categories in local env files.
- The correct release action remains to stop deployment until clean generated directories are rebuilt with a public-only build environment and the unchanged exact-value scanner returns zero. Do not bypass or weaken it.

## MOBILE FINDINGS 1-9 MATRIX

| # | Reproduced / evidence | Root cause | Remediation status | Severity | Retest |
|---|---|---|---|---|---|
| 1 Weekly closure save | Source + live table confirmed; 7 rows live | Canonical lacked shop weekly truth; KMO added table/RPC/UI | Partial: KMO works, missing-row path fails open and runtime negative booking proof was not rerun | P1 generic | After DB fix/proof |
| 2 Mobile time input | Source reproduced old native-time limitation; new text inputs exist | `type=time` mobile picker usability | Partial: direct typing works in source, but malformed characters are silently stripped by `normalizeTimeInput` | P2 | Real device + invalid cases |
| 3 Customer setup incomplete | Confirmed by live 2 services / 0 staff | KMO operational data is incomplete | Not remediated | P1 | After active staff + schedules |
| 4 Special holidays | Existing RPC/UI present; owner report says add/delete passed | Existing holiday model | No regression found; no current mutating proof run by this review | P2 evidence gap | Short smoke |
| 5 Staff/shop schedule + reset | Source confirms prior reload; new handler removes reload | Full-dashboard reload replaced all local cards; shop/staff models were separate | Partial: Staff B state is retained, but Staff A is optimistically changed before RPC success and not rolled back; DB RPC does not validate staff hours against shop hours | P2 | Multi-card failure-path retest |
| 6 Profile requires PromptPay | Confirmed in canonical `update_shop_settings`; KMO adds owner-scoped `update_shop_profile` | Profile/payment fields were coupled in one RPC | Design is sound statically; current outsider runtime negative proof not independently rerun | P2 | Owner save + outsider deny |
| 7 Duration units | Confirmed; UI and schema remain minutes | `duration_minutes` is a scheduling primitive, not display-only metadata | Not remediated; correctly not faked with cosmetic unit selector | P2 product gap | Separate upstream phase |
| 8 Numeric leading zero | Confirmed old numeric state; new string state permits empty edit | `Number(e.target.value)` forced empty to zero | Source remediation complete; validation covers empty, non-finite, negative, integer duration, deposit > price | P2 | Mobile keyboard/save smoke |
| 9 Empty customer page / 42501 | Independently reproduced: public columns `200`; `.eq(is_active,true)` returns `401/42501` for Services and Staff | anon had row policy but no grant on private `is_active` columns | Query fix is correct; zero-staff and read-error states remain incomplete | P1 | After staff setup |

## SECRET-SCAN ROOT CAUSE

Safe exact-value analysis (no values printed):

| Credential category | Local classification | Admin generated match |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 17 chars, explicit placeholder marker, not JWT/token shaped | `.open-next/cloudflare/next-env.mjs` |
| `LINE_CHANNEL_SECRET` | same placeholder fingerprint | `.open-next/cloudflare/next-env.mjs` |
| `LINE_CHANNEL_ACCESS_TOKEN` | same placeholder fingerprint | `.open-next/cloudflare/next-env.mjs` |
| `NOTIFICATION_DISPATCH_SECRET` | same placeholder fingerprint | `.open-next/cloudflare/next-env.mjs` |
| `LINE_MERCHANT_CHANNELS_JSON` | empty JSON object; no credential hit | none attributable |

All four counted categories use the same fingerprint. This is why a category-based scanner can report four hits even though the matched literal is one shared placeholder. The same placeholder also exists in Turbopack cache files under `.next/cache/turbopack/...`. Stale Consumer output contains it in `.open-next/cloudflare/next-env.mjs`, server bundles, and a static chunk. Because the placeholder is generic, a literal match inside a browser chunk is contamination/scanner noise, not evidence that four secrets were exposed.

Root cause: `.env.local` is copied into both apps by `scripts/sync-env.js` before builds. Restoring `.env.local` after a public-only build does not restore or invalidate already-generated `.next`, `.open-next`, or Turbopack cache content. A later build without first removing generated output can retain the restored local placeholder or, if real values were ever present, real sensitive values. Build ordering is therefore security-significant.

Remote state was checked read-only with Wrangler. The newest and active deployments are exactly Admin version `14da45d6-0efa-4d7b-bf7d-cb5d82b282e2` and Consumer version `fe6730cc-c26c-4e4f-91d9-f4751d4e374c`, both at 100%. No fourth version exists. The blocked Admin build was not uploaded/deployed. This review did not download prior deployed bundles, so it does not independently prove their byte-level contents; the prior successful deployment report's zero-hit scan remains the available evidence for those versions.

Required rebuild procedure (not executed): preserve env backups outside build directories; remove only the explicitly resolved app `.next` and `.open-next` directories; set a minimal public-only build env with server categories unset/non-exported rather than populated with a shared placeholder; build OpenNext from clean output; exact-scan `.next` and `.open-next` for every real/local credential value and category; require zero real-value hits; restore env files only after scanning; do not run another build before deploy; deploy with Admin config and Consumer `wrangler.dark.jsonc`; verify version and zero cron/custom-domain scope.

## DB / RLS / TENANT ISOLATION

- `shop_weekly_schedules` enables RLS (`PATCH.sql:24`) and grants anon only `shop_id, day_of_week, is_open, open_time, close_time` (`PATCH.sql:132-133`). Authenticated direct mutation is revoked; mutation is through `upsert_shop_weekly_schedule`.
- Weekly upsert checks owner/admin role (`PATCH.sql:52-54`), requires exactly seven unique weekdays, and scopes every write to `p_shop_id`. It does not accept a separate target tenant after authorization.
- Profile RPC uses `is_shop_owner(p_shop_id)` before updating the same `p_shop_id` (`PROFILE_DECOUPLE_PATCH.sql:15-34`); payment columns are absent, so profile saves cannot clear PromptPay.
- Existing staff schedule upsert verifies the target staff's shop and caller role (`KMO_BK01_BASELINE.sql:1346-1358`). It validates internal time order but does not cross-check shop weekly hours (`1379-1403`). This is a defense-in-depth/data-consistency gap; the booking trigger still blocks an existing weekly closed/out-of-hours row.
- Existing shop-wide and staff-specific holidays are enforced in create-hold (`BASELINE.sql:532-540, 584-605, 637-662`) and reschedule (`1546-1558`).
- Public table contract was independently exercised: approved Services/Staff columns return `200`; attempts to filter private `is_active` return `42501`; weekly public projection returns 7 rows.
- Limitation: a live schema dump attempt could not run because this checkout is not currently linked in the CLI (`LegacyProjectNotLinkedError`). No database mutation fallback was attempted. Current owner/outsider RPC denial and trigger execution are therefore supported by SQL plus prior rollback reports, not fresh DB-backed negative tests. They must be rerun before release acceptance.

## PUBLIC BOOKING CONTRACT

Removing `.eq('is_active', true)` from `booking-service.ts:113-129` is correct for the current privilege design. RLS remains the active-row boundary; broadening anon grants to `is_active` is unnecessary.

For 2 active services + 0 active staff, the truthful behavior is: display services, clearly state that online scheduling is not yet available because no service resource is configured, show no false bookable slot, and disable progression. Current source meets only the last two indirectly: every slot is unavailable, but it misleadingly presents “any staff” and gives no configuration-specific explanation.

The page distinguishes weekly closed and special holiday per slot, but does not own explicit page-level states for zero staff, zero slots, or read failure. A failed resource read becomes the same UI as “shop not found.” These states need distinct user copy and diagnostics before customer retest.

## SCHEDULE CONSISTENCY

Intended effective availability is correctly represented in the current UI calculation:

`shop weekly open AND staff working AND not shop holiday AND not staff holiday AND slot within both ranges AND not occupied`

The create-hold RPC enforces staff schedule, breaks, holidays, active staff/service, and collision. The new booking trigger enforces an existing shop weekly row for create and reschedule updates. A closed KMO day cannot be reopened merely by adding staff while its weekly row exists.

Remaining gaps:

1. Missing weekly row is fail-open at DB trigger level (P1).
2. `upsert_staff_weekly_schedule` can persist working hours outside shop hours; only UI constrains them. Persisted truth can therefore disagree, although booking writes are blocked by the weekly trigger.
3. Closing a shop day visually masks existing staff `isWorkingDay`; it does not atomically rewrite staff schedules. Reopening can reveal the old staff flag again. This should be an explicit product decision, not accidental behavior.
4. Saving Staff A no longer reloads Staff B, which addresses the reported reset. However `page.tsx:545-553` updates local Staff A before the RPC and leaves that state in place on failure. Add per-card dirty/saved/error status or rollback the failed card. For wider release, per-card save plus dirty indicator is safer than implicit bulk semantics.

## PROFILE / PAYMENT BOUNDARY

The decoupling design is accepted. `update_shop_profile` changes only name, phone, address; requires owner authorization; updates exactly the authorized shop; and does not reference payment fields. Existing `update_shop_settings` can remain the payment/integration write path until it is separately redesigned.

Future payment support should model verified payment instruments explicitly: PromptPay recipient identity, bank-transfer display metadata, and an uploaded/provider-issued static merchant QR as separate types. Do not generate a dynamic QR from an ordinary bank account unless a verified banking/provider standard explicitly supports it.

## SERVICE DURATION ARCHITECTURE

Minutes and hours can be safe human-facing aliases while persistence stays integer minutes, provided the service remains same-day and the converted value is a positive integer within an explicit maximum. Store a display-unit preference only for editing/presentation; continue scheduling from canonical minutes.

True “day” services are not an alias. Current `end_time TIME` wraps across midnight, staff availability is checked against one weekday, the consumer generates same-day 30-minute slots, weekly/holiday checks cover only the start date, and reschedule/occupancy semantics assume one continuous same-day appointment. Genuine multi-day support needs start/end timestamps or a date range as the booking contract, per-day shop/staff/holiday validation, resource occupancy across dates, timezone/DST rules, multi-day collision tests, reschedule/cancel semantics, and calendar UI. Until that phase exists, reject durations that cross the shop day or 24-hour boundary and classify day support as `GENERIC_BK01_PRODUCT_GAP`.

## TEST QUALITY

Executed evidence:

- `npm test` -> 27/27 PASS.
- `npm run lint` -> 0 errors; Consumer 7 warnings, Admin 1 warning.
- `npm run build` -> PASS for Consumer and Admin in an isolated temporary copy so the preserved worktree's generated artifacts were not overwritten. Warnings: Next middleware convention and Edge runtime are deprecated.
- `git diff --check` -> PASS.
- Worktree status after verification remained the expected source/untracked scope plus this review.

Quality assessment: the five owner-mobile tests and four weekly-schedule tests read files as text and assert regex presence/absence. They do not execute `normalizeTimeInput`, React state transitions, Supabase queries, RPC authorization, RLS, trigger behavior, booking/reschedule rejection, multi-card save failure, or a mobile browser. A function can be broken while retaining the searched strings and all nine tests stay green.

Missing meaningful coverage:

- table-driven unit tests for `8`, `800`, `08:00`, `8:30`, `25:00`, `1260`, empty, partial breaks, start >= end, and malformed characters;
- component/browser tests for clearing numeric fields, zero-staff/read-error states, Staff A failure while Staff B is dirty, and narrow viewport/touch/focus behavior;
- DB-backed tests for missing weekly row fail-closed, recurring closed day, outside shop hours, special holiday, reschedule, direct mutation denial, owner/admin allow, outsider/other-tenant deny, and public projection;
- generated-artifact secret scan as an automated pre-deploy gate with distinct handling for placeholders versus real values.

## UPSTREAM CLASSIFICATION

Canonical comparison was read-only. Current canonical state: branch `docs/bk01-real-shop-hardening`, HEAD `520bb082af7cab3cf19eec47094daea5760d4f3e`, clean status at inspection.

| Issue | Classification | Evidence |
|---|---|---|
| KMO Worker names/account/dark config and local artifact ordering | `DEPLOYMENT_OR_ENVIRONMENT_DEFECT` | KMO-only Cloudflare/build lane |
| 2 services / 0 staff operational setup | `KMO_DOWNSTREAM_ONLY` | live KMO REST state |
| Public `is_active` filter causing 42501 | `GENERIC_BK01_DEFECT` | canonical public client still depends on the same model; downstream query removal is generic |
| Shop profile coupled to PromptPay | `GENERIC_BK01_DEFECT` | canonical still has only `update_shop_settings` with profile/payment fields |
| No shop recurring weekly model / missing-row fail-open | `GENERIC_BK01_DEFECT` | canonical has no `shop_weekly_schedules`; KMO mitigation is incomplete for missing rows |
| Native time inputs and numeric forced-zero state | `GENERIC_BK01_DEFECT` | canonical dashboard still uses `type=time`, numeric state, and auto-30% deposit |
| Human-facing hours and true multi-day service model | `GENERIC_BK01_PRODUCT_GAP` | canonical persistence and engine are minute/same-day based |
| Regex-only regression suite and no mobile/DB behavior proof | `TEST_OR_EVIDENCE_GAP` | current new tests inspect strings only |
| Mojibake fallback strings introduced in `booking-service.ts:193,227-228` | `KMO_DOWNSTREAM_ONLY` regression requiring correction; generic prevention gap | changed file contains corrupted Thai literals and a BOM |

Generic fixes should be developed and verified upstream, released as a committed canonical ref, then synced into KMO. Do not normalize the current downstream mitigation into a silent fork.

## EXACT NEXT ACTIONS

1. Fix the P1 weekly invariant upstream: provision exactly seven rows atomically for every shop and make booking/reschedule fail closed when the relevant row is missing. Add DB-backed negative tests before syncing to KMO.
2. Complete KMO booking setup with at least one real active staff/resource and a seven-day staff schedule inside shop hours. Read back through the public projection; do not fabricate staff semantics.
3. Add truthful Consumer states for zero staff, zero services/slots, weekly closed, special holiday, and read failure. Keep services visible with zero staff but disable booking progression explicitly.
4. Harden schedule saving: validate staff hours against shop hours inside the RPC, decide whether closing/reopening preserves staff intent, and rollback/mark failed per-card saves. Add dirty/saved/error indicators.
5. Extract and strictly test time normalization. Accept only the documented numeric/colon grammars; reject malformed characters instead of stripping them into a valid time. Run narrow-viewport and real-device checks.
6. Correct the three mojibake Thai fallbacks and remove the unintended BOM without altering unrelated copy. Add an encoding regression check.
7. Replace regex-only checks with component/browser and DB-backed behavioral tests, including outsider/cross-tenant denial and create/reschedule weekly enforcement.
8. Perform the clean public-only OpenNext rebuild and exact-value scan described above. Require zero real-secret hits; keep Consumer on `wrangler.dark.jsonc`; verify no cron, notification activation, domain cutover, Stripe, or deploy outside the explicit later authorization.
9. Rerun owner profile save, schedule multi-card failure path, services/staff CRUD, and customer booking on a real mobile device. Only after the evidence passes should the verdict change to `PASS FOR OWNER RETEST` or a deployment be considered.

## Stop boundary

No implementation, generated-directory cleanup, database write, migration/RPC apply, canonical mutation, commit, push, deployment, cron/notification activation, or domain cutover was performed.
