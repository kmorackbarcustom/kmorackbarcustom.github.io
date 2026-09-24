# LR-02D EVIDENCE — KMO-DOMAIN-BOOKING-READINESS-001 (D1A LONG_RUN)

Date: 2026-09-24 (Asia/Bangkok)
Stage: `LR-02D — B1 findings remediation (F1 + F4)` · Review Batch: B1
Engine: `hermes-native-swarm v0.1.1` (`swarmctl run --execute`)
Stage base: `234603d22be1954e63ddf17d606fca0b27587a70`
Stage tip: `580d165e642e10ceb0ce26da473542cd1d65f504`

## Why this stage exists

`B1` (independent batch review of LR-01 + LR-02 + LR-02C) returned
`APPROVED_WITH_FINDINGS` at `234603d`. Two of its five findings were actionable on this
surface and were turned into a bounded work unit rather than hand-patched by Hermes:

- **F1 (MEDIUM, dead code)** — `isBookingBlocked` (page ~165) was always `false` by the
  time `<main>` was reached (~582), because LR-02C already returns the dedicated
  full-page `pageState === 'BOOKING_DISABLED'` screen (~477) for the same condition. The
  whole amber branch (~582-596) could therefore never render.
- **F4 (LOW, comment overclaim)** — the comment above `contactFallback` (~426-427)
  claimed it was used "for every non-OK state", but `SHOP_NOT_FOUND` deliberately omits
  it (no shop object, hence no phone) and `BOOKING_DISABLED` uses its own inline call
  button.

Findings F2, F3 and F5 were **not** turned into work and are carried, not dropped — see
the end of this file.

## Work unit ledger

| # | Work unit | Lane state | Commit |
|---|---|---|---|
| 1 | `LR02D-WU02-B1-FINDING-REMEDIATION-R2` | `SWARM_WORK_UNIT_PASS` (checks 10/10) | `580d165` |

## Attempt ledger

| # | Attempt state | Root cause / outcome | Action taken |
|---|---|---|---|
| 1 | `LR02D-WU01-B1-FINDING-REMEDIATION` → **`SWARM_WORK_UNIT_FAIL` / worker `BLOCKED`** | **Controller spec defect, not a worker defect.** The packet required `isBookingBlocked` to reach zero occurrences while forbidding every test edit — but the controller's own `tests/consumer-truthful-states.test.ts:113` asserted `assert.match(source, /isBookingBlocked/)`, pinning the very dead branch F1 removes. So "whole suite passes unmodified" was unsatisfiable. The worker applied F1 + F4, observed 97/98 (only that test failing), then restored the worktree to pristine and reported BLOCKED with three explicit resolution options. | Spec corrected and unit re-issued as R2 with that **one** test file in scope for one line of surgery. Checks were added to prove no test block was deleted, no assertion weakened, and no test count lost. The worker's honest BLOCKED is recorded as correct behaviour, not as a failure to explain away. |
| 2 | `LR02D-WU02-B1-FINDING-REMEDIATION-R2` | — | Committed `580d165`. |

Local fix attempts used: 2 of 2 for this issue cycle (attempt 1 = the spec defect
correction; attempt 2 = the passing rerun). No reviewer remediation required in this unit.

Non-vacuity at baseline before dispatch of R2: four gating checks returned non-zero
(`lr02d2-dead-branch-removed`, `lr02d2-stale-assertion-line-removed`,
`lr02d2-contact-fallback-comment-corrected`, and the sibling-assertions guard while it was
still written incorrectly) and six guards passed. One declared check was **found defective
during this baseline run and fixed before dispatch**: the test file stores regex-escaped
literals (`/t\('blocked\.title'\)/`), so a plain grep for `t('blocked.title')` never matched;
it was rewritten to fixed-string matching. Dispatching the original form would have produced
a false FAIL after correct remediation.

## Deliverable

```text
page.tsx
  - const isBookingBlocked = shop?.is_accepting_online_bookings === false;   REMOVED
  - {isBookingBlocked ? ( …amber panel… ) : bookingSuccess ? (               -> {bookingSuccess ? (
  - contactFallback comment rewritten to name the states that actually use it
tests/consumer-truthful-states.test.ts
  - assert.match(source, /isBookingBlocked/);  REMOVED (one line)
  - its stale comment replaced with an accurate one
  - every other assertion in that test, and all 12 test blocks, retained
```

The dedicated `pageState === 'BOOKING_DISABLED'` screen is untouched and is now the only
consumer of `blocked.title` / `blocked.description` / `t('callShop', { phone: shopPhone })`.

## Controller-run gates (Hermes, not worker self-report)

```text
npm test                        -> 98/98 pass   (unchanged count; nothing removed or skipped)
focused consumer-truthful-states -> 12/12 pass
lint                            -> 0 errors (warnings pre-existing)
npm --workspace apps/booking-consumer run build -> PASS
git diff --check                -> clean
secret scan (2 changed artifacts)-> 0 findings
th/en i18n key parity           -> exact
artifact sha256 == lane evidence-> page c0dbf3a23585b84f69ef…
diff                            -> 8 insertions, 21 deletions (net removal, as intended)
```

Independent verification of the diff was done by reading it, not by trusting the lane:

```text
grep -c isBookingBlocked  page.tsx                      -> 0
grep -c isBookingBlocked  tests/consumer-truthful-states.test.ts -> 0
grep -c '^test('          tests/consumer-truthful-states.test.ts -> 12 (unchanged)
test-file diff            -> exactly one assertion line + its comment
no assert.ok(true), no deleted test block, no relaxed pattern
```

## Scope confirmation

```text
changed paths (this unit)  consumer page + one existing test file (one line) + B1 report
src/lib                    UNCHANGED
message files              UNCHANGED
admin app                  UNTOUCHED
all other tests            UNCHANGED
SQL / migrations           NONE
reference pack             UNCHANGED (read-only)
environment artifacts      none committed
public.orders / public.production_allocations touched   NO
Order / Claim / KMO Control touched                     NO
production mutation / deploy / cutover                  NOT ATTEMPTED
```

Preserved and re-verified: `resolveBookingPageState`, `countOpenWeeklyDays`,
`everyServicePaymentBlocked`, `pageState`, all seven dedicated non-OK screens,
`authoritativeDepositAmount`, `promptpayName`, `resolvePaymentInstruction`,
`resolveStaticQrInstruction`, `paymentMethodAvailable`, the guard
`shop.require_deposit && depositAmount > 0 && !paymentMethodAvailable`,
`remainingHoldSeconds(holdResult?.expires_at, expiryNow)`,
`holdHasTimeRemaining = holdSecondsRemaining !== null && holdSecondsRemaining > 0`, and
the banner guard `{holdHasTimeRemaining ? (`.

## Carried findings (recorded, not silently dropped)

| # | Status | Disposition |
|---|---|---|
| F1 MEDIUM | **CLOSED** by this stage | dead branch removed; dedicated screen retained |
| F2 LOW | CARRIED | `everyServicePaymentBlocked` reuses the globally-computed `paymentMethodAvailable` inside a per-service `.every()`. Correct for all realistic inputs; not reachable as a bug. Recorded for the LR-03+ record. |
| F3 LOW | CARRIED (by design) | The LR-02/LR-02C tests are regex-on-source, so they are not runtime behaviour proof. This is the stage's inherent limitation and `LR-06` is the stage that owns real browser/mobile evidence. Not a failure of B1. |
| F4 LOW | **CLOSED** by this stage | comment now matches the code |
| F5 LOW | CARRIED | Brief section B names `NO_SLOT_FOR_DATE`; it remains the pre-existing date-scoped inline step-2 banner (`setupState.noSlots`) rather than a shop-wide page state. Arguably correct (it is date-scoped, not shop-wide readiness), but the literal brief gap is not closed. |

## Stage state

```text
LR-01   COMPLETE
LR-02   COMPLETE   — F-2 closed
LR-02C  COMPLETE   — LR-01 truthful-state helpers wired
B1      APPROVED_WITH_FINDINGS at 234603d (report persisted)
LR-02D  COMPLETE   — F1 + F4 remediated at 580d165
next    re-review decision on 580d165, then LR-03
```

**Open decision (not taken by Hermes).** B1 approved `234603d`; the remediation has since
produced `580d165`, which changes the reviewed revision. The manifest does not name a B1
re-review trigger (its re-review clause is attached to LR-04 changing the LR-03 SQL
contract), and Hermes must not invent review authority or skip a required review. The
remediation is a net removal of dead code plus a comment/test-line fix with all gates
green, but the honest position is that the currently approved SHA is `234603d` and the
current tip is `580d165`. This is surfaced rather than resolved silently.
