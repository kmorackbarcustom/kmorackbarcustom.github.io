# REPORT — SOL INDEPENDENT VERIFICATION: KMO BK01 SEED ADOPTION

Date: 2026-09-24 (Asia/Bangkok)
Mode: READ-ONLY INDEPENDENT VERIFICATION
Repository: `kmorackbarcustom/kmorackbarcustom.github.io`
Worktree: `D:\AI-Workspace\runtime\worktrees\kmo-bk01-upstream-seed-20260924`
Branch: `prep/kmo-bk01-upstream-seed-20260924`
Verified HEAD: `30c7e44ad86bc462683b97dab417cb22388bb908`
Domain branch anchor: `058fe5211c9eb39d7dda3087ec40b1e896227113`

## Verdict

`INDEPENDENT_VERIFICATION = PASS_WITH_EXECUTION_PLAN_REMEDIATION`

The adoption assessment is substantially supported by current source, but the existing one-shot execution plan must not be dispatched unchanged.

Confirmed markers:
- `SOURCE_PARITY_WITH_DOMAIN_058fe52 = CONFIRMED`
- `F1_F2_F3_F4 = CONFIRMED_WITH_F3_SCOPE_CORRECTION`
- `CODEX_REVIEW_ARTIFACT_CHAIN = REPRODUCIBLE`
- `ONE_SHOT_BOOKING_INTEGRATION_FEASIBILITY = CONFIRMED`
- `EXISTING_PLAN_IMPLEMENTATION_READINESS = REMEDIATE`

No product source, SQL, runtime, configuration, deployment or production state was changed by this verification.

## Confirmed from actual repository state

1. `30c7e44` is a direct descendant of Domain SHA `058fe52`; local Domain and origin Domain both point to `058fe52`; prep worktree is clean.
2. Diff `058fe52..30c7e44` under `bk01-pilot/apps`, `bk01-pilot/supabase`, `bk01-pilot/tests`, and `bk01-pilot/order` is empty. The prep branch adds only documentation and the inert reference pack.
3. Active consumer routes remain only root, `/book/[slug]`, and `/manage-booking`; no active Portal, Order, or Claim route exists.
4. F-1 is real: `loadDashboardBookings(false)` replaces all schedules and saved snapshots, and multiple unrelated admin mutations call it. Per-card save itself preserves/rolls back only that card, so D0.5 was too narrow when it treated the broader unsaved-state issue as stale.
5. F-2 is real: the customer page still falls back from `promptpay_name` to shop name/fallback text, still uses `?? 100` for pre-hold deposit display, and still resets a client-owned `900` second countdown.
6. F-3 is real only with scope: the KMO pilot baseline excludes Tickets/Claim authority, but historical migration `20260818000000_local_service_tickets.sql` does contain ticket tables, RLS and RPCs. It is inherited source, not adopted KMO runtime authority.
7. F-4 is real: KMO has `public.products`; the locked KMO contract assigns Order/job authority to `public.orders` and production scheduling authority to `public.production_allocations`; the BK01 Order scaffold uses a different model/direction.
8. The four `ALREADY_PRESENT` blobs were independently re-hashed and match the recorded blob IDs for manage-booking, upload-intent, notification policy and its test.
9. Codex R1/R2/R3 reports and their target SHAs exist in Git. R1 raised three substantive findings; R2 closed those and found whitespace only; R3 passed that reviewed delta.

## Independent corrections not closed by Codex R3

### IV-1 — OD-3 is misclassified as an open ownership decision

Current locked authority already says `public.orders` is KMO Order/job truth unless a later approved persisted contract changes it. No newer persisted Owner decision in the inspected KMO source overturns that rule.

Correction: park BK01 Order as future reference/adaptation material. A future Order task may decide HOW to reuse BK01 concepts around KMO authority, but this Booking run must not ask Hermes to decide WHO owns Order truth.

### IV-2 — intake-capacity data placement is underspecified

The existing plan requires shop capacity and per-booking intake units but does not lock where KMO-only fields live. That leaves an implementer free to add KMO-only columns to generic `local_service.*`, violating the extension boundary.

Correction: KMO-specific intake configuration, service policy and immutable per-booking intake snapshot must live under `kmo_booking.*`. Public/browser code must not receive direct write authority; public Booking RPCs consume this state server-side.

### IV-3 — Booking work-state authority needs an explicit anti-dual-truth boundary

The persisted 2026-09-23 Owner direction authorizes a Booking-owned operational lifecycle so unfinished bookings remain visible after appointment day. That newer direction does not transfer Order or production authority.

Correction: the Booking work-state is only Booking operational progression. This run must not create/update/replace `public.orders` or `public.production_allocations`, and must prove those KMO authorities remain unchanged.

### IV-4 — Portal S5 is unnecessary for D1

Changing `/` to `/shop/[slug]` is not required for `BOOKING_READY_FOR_CONTROL` and creates a needless Owner decision inside an otherwise executable Booking run.

Correction: park Public Portal completely for this long run. Keep `/` -> `/book/<slug>` unchanged.

### IV-5 — workflow pins in the old Task/plan are stale for a new long-run dispatch

Canonical workflow repo `origin/main@c8f41ac2b51445af2e7095995be17132d103064a` contains Registry `1.6.0`, `WF-DEV-01 v1.4.0 / LONG_RUN`, `WF-RELAY-01 v1.3.0`, Relay runtime `v2.5.3`, and the restored role model: OpenCode ordinary builder, AGY UI/UX only, Qwen test/remediation support, Codex principal reviewer, Claude senior difficult remediation only.

The D1A implementation has not started, so the next Owner dispatch should explicitly repin the unstarted execution before substantive work rather than silently inherit the older workflow text.

## Runtime facts not independently re-proven in this round

This review did not connect to or mutate live Supabase/Cloudflare. Therefore current production schema objects, live grants/policies, current environment values, production row state, deploy revision, provider credentials and executor readiness remain runtime-preflight evidence, not confirmed facts from this report.

## Execution disposition

Do not dispatch `PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md` by itself.

Use the corrected long-run plan, Run Manifest and execution brief created from this verification. They preserve the valid F-1..F-4 findings while closing IV-1..IV-5 before implementation.

Verified source/evidence anchor: `30c7e44ad86bc462683b97dab417cb22388bb908`.

The prepared execution package must be committed and tagged `kmo-bk01-d1a-longrun-prepared-20260924`. Hermes resolves that tag to an exact SHA during LR-00 and uses the tag target as the implementation base. The tag target must be a descendant of `30c7e44` whose additional delta is documentation-only.

Reason: the implementation branch then contains the independently verified source, Seed reference pack, corrected plan, Run Manifest and execution brief in one pinned revision.

If the Domain branch advances from `058fe52` before dispatch, HOLD and reconcile that delta before creating the implementation branch.

## Final marker

`KMO_BK01_INDEPENDENT_VERIFICATION = PASS_WITH_CORRECTED_LONG_RUN_REQUIRED`
