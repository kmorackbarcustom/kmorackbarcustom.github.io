# REPORT â€” KMO Booking Legacy Extraction Direction

**Date:** 2026-09-23 (Asia/Bangkok)
**Task:** `KMO-DOMAIN-BOOKING-READINESS-001`
**KMO checkpoint inspected:** `76ea6dc1ef6a1874bfefe6016c886069438de977`
**Mode:** source inspection + Owner direction; no Booking implementation was performed by this report.

## Decision

KMO Booking will use the existing KMO real-shop behavior as the primary operational model for the next Booking implementation pass where that behavior is already proven useful in shop operations.

Canonical BK01 remains frozen under its 2026-09-23 Owner Hold. KMO must not modify canonical BK01. After KMO Booking is proven in real use, BK01 may open a separate future branch to generalize only the proven concepts for broader shop types.

The objective is not to restore the legacy application wholesale. The objective is to extract the parts that solve real KMO scheduling problems, rebuild them under the current KMO/BK01-pilot security and data boundaries, and reject hard-coded or unsafe legacy assumptions.

## Source facts found in current KMO repository

### 1. Legacy public Booking calendar already counts intake only on `appointment_date`

Source: root `booking.html`.

The current legacy source explicitly defines a daily intake cap and documents that capacity is counted only on the vehicle/customer intake date:

- `DAILY_CAP = 3`
- `buildPoolUsage()` groups non-cancelled bookings by `appointment_date`
- `pickup_date` does not consume Booking-calendar capacity
- submit-time recheck rejects only when usage on the selected `appointment_date` reaches the cap

The source comments explicitly state that work remaining in the shop until `pickup_date` must not block future intake dates.

This is the core behavior to preserve conceptually.

### 2. Legacy Booking stores appointment and operational completion separately

On successful booking creation, root `booking.html` stores:

```text
appointment_date
pickup_date
queue_status      = à¸¢à¸·à¸™à¸¢à¸±à¸™
production_status = à¸£à¸­à¹€à¸£à¸´à¹ˆà¸¡à¸‡à¸²à¸™
```

Therefore the historical KMO model already distinguished:

- customer reservation/intake truth;
- planned pickup truth;
- internal work-progress truth.

### 3. Legacy work dashboard already has a separate operational lifecycle

Source: root `bookingdashboard.html`.

The dashboard queries confirmed queue records and exposes:

```text
à¸£à¸­à¹€à¸£à¸´à¹ˆà¸¡à¸‡à¸²à¸™
à¸à¸³à¸¥à¸±à¸‡à¸—à¸³
à¹€à¸ªà¸£à¹‡à¸ˆ
```

It provides explicit status controls and updates `production_status`. The record remains visible until work is explicitly progressed/completed; it is not removed merely because the appointment date passed.

The dashboard separately displays both `appointment_date` and `pickup_date`.

### 4. Current BK01-pilot Booking has a different model

Current `bk01-pilot` Booking is primarily a staff/time-slot appointment system.

Current customer source rejects `duration_unit = 'day'` for online booking.

Current Booking state model is:

```text
hold
pending_review
confirmed
completed
cancelled
no_show
expired
```

Current admin outcome actions allow a confirmed booking to move directly to `completed` or `no_show`; there is no first-class `checked_in` or `in_progress` Booking state in the current pilot contract.

This is acceptable for ordinary appointment services but is insufficient by itself for KMO's long-running custom-work operation.

## Extracted KMO Booking contract

### A. Separate Customer Booking Calendar from Work Progress

These are separate concerns.

#### Customer Booking Calendar

Answers:

> On which date may a new customer/job enter the shop?

Capacity is consumed only on the selected `appointment_date`.

A booking with:

```text
appointment_date = Monday
pickup_date      = Friday
```

must not automatically block Tuesday through Friday on the customer Booking calendar.

#### Work Dashboard

Answers:

> What jobs are currently waiting, active, ready, overdue, or completed inside the shop?

Long-running work remains here until explicitly progressed or completed.

Duration/pickup/production progress belongs to this operational view and must not be represented by a multi-day blocking bar on the customer Booking calendar.

## B. Intake capacity must become configurable, not hard-coded

Legacy `DAILY_CAP = 3` is evidence of the business rule, not the target implementation.

The current target must support a shop-configured daily intake capacity.

Conceptually:

```text
daily_intake_capacity = N units
```

Each booking consumes a defined number of intake units on `appointment_date` only.

Examples:

```text
Shop capacity = 3U/day

Booking A consumes 3U
â†’ A alone fills Monday

Booking B consumes 1U
Booking C consumes 1U
Booking D consumes 1U
â†’ B+C+D fill Monday
```

Do not assume permanently that one booking equals one unit.

The exact unit calculation may be derived from the selected KMO products/services, but D1A must keep the model capable of representing more than one intake unit per booking.

## C. Booking duration must not be the customer-calendar lock span

For KMO:

```text
booking duration / estimated work days
!=
number of days blocked on the public Booking calendar
```

A one-month custom job must not make the public Booking calendar unavailable for one month merely because the job remains unfinished.

The public calendar blocks only its intake capacity on the intake date.

## D. Operational lifecycle remains explicit

Minimum KMO work lifecycle to preserve:

```text
WAITING_TO_START
IN_PROGRESS
COMPLETED
```

The implementation may use KMO-compatible names, but the semantics must remain separate from customer reservation/payment status.

A future refinement may add:

```text
CHECKED_IN
READY_FOR_PICKUP
```

but D1A must not collapse long-running shop work back into only `confirmed -> completed`.

Completion must remain an explicit shop action or an equally explicit authorized workflow event.

## E. Appointment-day handling

On the appointment date, the booking must be surfaced prominently to the shop as due today.

The system must support an explicit operational disposition such as:

- start/check in;
- reschedule;
- no-show;
- cancel where authorized.

Once work begins, the job remains visible in the operational dashboard independent of the public Booking calendar.

The job must not disappear merely because `appointment_date < today`.

## F. Pickup date is an operational milestone, not public intake capacity

`pickup_date` may be used for:

- expected completion/pickup planning;
- customer communication;
- overdue/ready-for-pickup reminders;
- workload visibility.

It must not, by itself, consume future public Booking intake capacity.

## G. What to reuse from BK01 R4

KMO should still selectively adopt proven generic BK01 R4 improvements, including:

- truthful customer states;
- server-authoritative payment/deposit state;
- server-authoritative hold expiry;
- narrow privilege/RLS fixes;
- secure tenant boundaries;
- browser/mobile correctness.

These generic improvements do not override the KMO intake/work-lifecycle model above.

## H. What NOT to copy from legacy

Do not restore legacy code wholesale.

Do not copy:

- hard-coded `DAILY_CAP = 3`;
- hard-coded `MIN_BOOKING_DAYS = 2`;
- direct anonymous table writes;
- legacy auth/security shortcuts;
- old environment/runtime assumptions;
- UI-only race protection as the authoritative capacity guard.

The rebuilt KMO path must enforce intake capacity server-side/atomically and retain current security/tenant boundaries.

## D1A implementation consequence

The previous D1A limitation that true day-based/custom work should only be documented is superseded for KMO Booking by this Owner direction.

D1A is now authorized to implement the KMO-specific separation of:

```text
public intake reservation
vs
internal work lifecycle
```

within the Booking domain.

This does NOT authorize Order, Claim, KMO Control, or a generic cross-domain production-capacity engine.

The immediate Booking goal is narrower:

1. public Booking availability uses intake-date capacity only;
2. daily intake capacity is configurable;
3. a booking can consume one or more intake units;
4. pickup/work duration does not block future public intake dates;
5. operational work state persists after the appointment date;
6. explicit work completion exists;
7. due-today/overdue operational visibility is deterministic;
8. capacity enforcement is atomic/server-authoritative;
9. legacy behavior is reimplemented safely, not copied blindly.

## BK01 boundary

Canonical BK01 remains on Owner Hold.

No BK01 branch or source change is authorized from this finding now.

After KMO Booking is proven with real-shop evidence, the future BK01 process is:

```text
KMO proven behavior
â†’ evidence review
â†’ generalize assumptions
â†’ open dedicated BK01 branch
â†’ design for both ordinary appointment shops and day/intake-based shops
â†’ security/data review
â†’ implement/test independently
```

The future BK01 capability must not assume that all shops behave like KMO.

## Success criterion

KMO Booking is successful when a long-running job can remain active for days or weeks without blocking unrelated future customer intake dates, while the shop can still enforce how much new work it accepts on each appointment date and can explicitly track the job until completion.
