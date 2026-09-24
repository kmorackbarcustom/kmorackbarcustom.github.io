# LR-02C EVIDENCE — KMO-DOMAIN-BOOKING-READINESS-001 (D1A LONG_RUN)

Date: 2026-09-24 (Asia/Bangkok)
Stage: `LR-02C — Truthful-state wiring` (completes the LR-02 required outcome) · Review Batch: B1
Engine: `hermes-native-swarm v0.1.1` (`swarmctl run --execute`)
Stage base: `00012d8589de8cf84a3eb4683b8d4983a1005a30`
Stage tip: `07558fe3872b367b235a9c648304eca2b4d9e941`

## Why this stage exists

LR-02 was marked `COMPLETE` at `d01725e`, but its own required outcome was **not** met.
`BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md` section B requires the customer
page to reach explicit `NO_SERVICES`, `NO_STAFF`, `NO_SCHEDULE`, `NO_SLOT_FOR_DATE` and
a payment-not-configured fail-closed state, and the Run Manifest LR-02 objective is
"wire truthful **states**". Measured on `d01725e`:

```text
resolveBookingPageState in apps/**      -> 0 occurrence outside its own module
countOpenWeeklyDays     in apps/**      -> 0 occurrence outside its own module
singleRowOrNull         in apps/**      -> 0 occurrence outside its own module
multipleRowsOrThrow     in apps/**      -> 0 occurrence outside its own module
NO_SCHEDULE / PAYMENT_NOT_CONFIGURED in page -> 0
```

The page still used only two ad-hoc inline checks (`if (loadError)`, `if (!shop)`) and
inline stepper banners, so a partly-configured shop (no services, no staff, no open
weekly day, or deposit-required with no payment setup) still reached a **dead stepper
under HTTP 200** — exactly the defect section B was written to close. Two of the three
LR-01 helper families were dead code from the app's perspective.

This was found independently by two reviewers' preliminary passes (the B1 reviewer,
and controller review) and was reported by the B1 reviewer as the likely main finding.

## Correction to the LR-02 evidence record (recorded, not hidden)

`bk01-pilot/docs/LR-02-EVIDENCE-2026-09-24.md` (written by the author at `d01725e`)
lists in its work-unit ledger:

```text
| 4 | LR02B-WU01-HOLD-EXPIRY                | SWARM_WORK_UNIT_PASS (checks 8/8) | see attempt 5 |
| 5 | LR02B-WU02-EXPIRED-STATE-CORRECTION   | SWARM_WORK_UNIT_PASS (checks 9/9) | e1ff830       |
```

The raw lane record for WU02 does **not** say PASS. Measured from the preserved
evidence JSON:

```text
evidence-LR02B-WU02-EXPIRED-STATE-CORRECTION.json
  state        = SWARM_WORK_UNIT_FAIL
  reasons      = ['WORKER_REPORTED_FAIL']
  worker.state = FAIL
  worker qualifier = "incomplete work unit — deliverables are in the repository and
                      verified, but required evidence and cleanup were not finished
                      before my tool-iteration cap; do NOT read this as a PASS"
  envelope     = SWARM_WORK_UNIT_FAIL, swarmctl exit 2
  commander checks = 9/9 PASS
```

So the row's *state* column overclaims a `WORKER_REPORTED_FAIL` lane as a lane PASS.
Per `hermes-native-swarm` v0.1.1 a worker `FAIL` is never converted into a PASS by
explanation. The durable artifacts of that lane are genuinely good and were
independently verified (below), but the ledger cell is wrong and is corrected here.

### Independent verification of the WU02 artifacts (done while recovering state)

```text
page blob at e1ff830 == af0f68ddb1076bed4677cb77176f80e16b7f08df
working-tree sha256 aa540a37019135359793d6f577faae2245975ef4ea2547691543472cd101ed4c
  == af0f68dd… with CRLF  -> the committed blob IS the reviewed artifact (no drift)
focused consumer-hold-expiry         8/8 PASS
full suite at that revision          86/86 PASS
non-vacuity control A: page restored to the PRE-fix revision
  -> consumer-hold-expiry fails 6/8  (the corrected test really pins the fix)
non-vacuity control B: only the WU02 guard reverted (strict positivity removed)
  -> consumer-hold-expiry fails 2/8  (exactly the WU02 defect)
```

The strict-positivity correction itself was necessary and correct: `remainingHoldSeconds`
returns `0` for a genuinely elapsed hold, so gating the banner on mere non-nullness froze
an expired hold at `00:00` and made the expired recovery panel unreachable.

## Work unit ledger

| # | Work unit | Lane state | Commit |
|---|---|---|---|
| 1 | `LR02C-WU01-TRUTHFUL-STATE-WIRING` | `SWARM_WORK_UNIT_PASS` (checks 8/8) | `07558fe` |

## Attempt ledger

| # | Attempt state | Root cause / outcome | Action taken |
|---|---|---|---|
| 1 | `SWARM_WORK_UNIT_PASS` | — | Committed `07558fe`. |

Local fix attempts used: 1 of 2. No reviewer remediation required in this unit.
All eight declared checks were proven able to fail at baseline before dispatch:
five gating checks returned non-zero at `00012d8` and three guard checks passed
(the guards' job is to stay green).

## Deliverable

```text
page.tsx
  import { resolveBookingPageState, countOpenWeeklyDays } from '../../../lib/booking-state';
  const openWeeklyDayCount = countOpenWeeklyDays(shopWeeklySchedule);
  const everyServicePaymentBlocked =
    services.length > 0 &&
    services.every((service) => {
      const serviceDepositAmount = authoritativeDepositAmount(service.deposit_amount);
      return shop?.require_deposit === true && serviceDepositAmount !== null && !paymentMethodAvailable;
    });
  const pageState = resolveBookingPageState({
    isLoading: isLoadingShop, loadError, shop,
    serviceCount: services.length, staffCount: staffList.length,
    openWeeklyDayCount, everyServicePaymentBlocked,
  });
```

Dedicated full-page screens, in resolver precedence order, before the stepper:
`LOADING` · `LOAD_ERROR` · `SHOP_NOT_FOUND` · `BOOKING_DISABLED` · `NO_SERVICES` ·
`NO_STAFF` · `NO_SCHEDULE` · `PAYMENT_NOT_CONFIGURED`, then `OK` → existing stepper.

- `NO_SCHEDULE` derives from the **KMO shop-weekly** model through
  `countOpenWeeklyDays(shopWeeklySchedule)` (`local_service.shop_weekly_schedules`),
  never from a staff-only schedule.
- `everyServicePaymentBlocked` mirrors the existing create-hold guard **per service**:
  `require_deposit === true` && that service's own finite positive deposit && no
  payment method. One bookable service (no deposit required, zero/unset deposit, or an
  available payment method) keeps the page `OK` — the page is not blocked.
- `SHOP_NOT_FOUND` and `LOAD_ERROR` remain distinct screens.
- Every non-OK screen keeps the shop-contact fallback.
- New i18n keys `booking.setupState.noSchedule` and
  `booking.setupState.paymentNotConfigured` in **both** `th.json` and `en.json`;
  full key-set parity verified (`th-only: []`, `en-only: []`).

## Controller-run gates (Hermes, not worker self-report)

```text
npm test                                  -> 98/98 pass   (86 baseline + 12 new)
focused consumer-truthful-states          -> 12/12 pass
lint                                      -> 0 errors (warnings pre-existing)
npm --workspace apps/booking-consumer run build -> PASS
git diff --check                          -> clean
secret scan (4 changed artifacts)         -> 0 findings
i18n key parity th vs en                  -> exact
artifact sha256 == lane evidence sha256   -> page 9d6ea588…, test 03ad3621…
```

### Non-vacuity controls (each proven able to fail)

```text
control A: page restored to the prior revision (state wiring absent)
  -> consumer-truthful-states: 6 of 12 FAIL   (tests 2,3,4,5,7,10)
control B: booking.setupState.noSchedule removed from en.json only
  -> consumer-truthful-states: 1 of 12 FAIL   (test 9, i18n parity)
restored -> 12/12 PASS, page sha256 back to 9d6ea588…
```

## Scope confirmation

```text
changed paths (this unit)  consumer page, its two message files, 1 new test
src/lib                    UNCHANGED (LR-01 modules untouched)
protected tests            public-contract / promptpay / shop-weekly-schedule /
                           consumer-payment-authority / consumer-hold-expiry UNCHANGED
admin app                  UNTOUCHED
SQL / migrations           NONE
reference pack             UNCHANGED (read-only)
environment artifacts      no .env.local or generated artifact committed
public.orders / public.production_allocations touched   NO
Order / Claim / KMO Control touched                     NO
production mutation / deploy / cutover                  NOT ATTEMPTED
```

Preserved unchanged and re-verified in the page: `authoritativeDepositAmount`,
`promptpayName = shop?.promptpay_name?.trim() || null`, `resolvePaymentInstruction`,
`resolveStaticQrInstruction`, `paymentMethodAvailable`, the literal guard
`shop.require_deposit && depositAmount > 0 && !paymentMethodAvailable`,
`remainingHoldSeconds(holdResult?.expires_at, expiryNow)`,
`holdHasTimeRemaining = holdSecondsRemaining !== null && holdSecondsRemaining > 0`,
and the banner guard `{holdHasTimeRemaining ? (`.

## Stage state

```text
LR-01   COMPLETE
LR-02   COMPLETE  — F-2 closed; the LR-01 truthful-state helpers are now WIRED
LR-02C  COMPLETE  — required outcome met at 07558fe
B1      BLOCKED_INDEPENDENT_REVIEW_RAIL_PERMISSION (see below)
next    LR-03 only after B1 has a real verdict
```

`d01725e`'s LR-02 `COMPLETE` marker was premature with respect to section B; that gap is
closed here. The B1 batch now covers `LR-01 + LR-02 + LR-02C` on the exact final SHA.
