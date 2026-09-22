# KMO → BK01 Upstream Feedback Ledger

Purpose: record evidence from the KMO real pilot that can improve canonical BK01 without mixing KMO-only business behavior into the product.

Upstream reference baseline:
`4a694bcf1cd7c167c12036e89f999e04b969f7b9`

## Operating rule — bidirectional learning loop

- **Watch BK01 upstream:** review relevant committed BK01 changes and selectively sync/adapt verified improvements into KMO.
- **Report KMO findings upstream:** generic defects, security/reliability findings, reusable improvements, and proven product ideas must be reported with evidence.
- **BK01 owns the decision:** upstream may accept, redesign, defer, or reject a report. Record that disposition here.
- **Urgent downstream mitigation is not upstream closure:** if KMO must mitigate first, keep it bounded and still file the generic defect upstream.
- **Avoid silent forks:** KMO-specific deltas may remain when needed, but their reason and upstream disposition must be explicit.

Classification:
- **GENERIC DEFECT** — canonical behavior is unsafe/broken; prepare upstream fix/evidence.
- **UPSTREAM CANDIDATE** — KMO improvement may generalize after real-use proof.
- **KMO ONLY** — shop/domain-specific behavior; never push upstream as canonical.
- **UPSTREAM SYNC** — canonical improvement to review for downstream adoption.

Each item must record direction (`BK01 → KMO` or `KMO → BK01`), source/exact revision, KMO evidence, tests/runtime result, KMO action, whether canonical was modified, upstream disposition (`ACCEPTED` / `REDESIGN` / `DEFERRED` / `REJECTED` / `PENDING`), and downstream sync status.
## Current verified items

### BK01-FB-001 — fake PromptPay fallback
Classification: **GENERIC DEFECT**

Canonical consumer falls back to a sample PromptPay recipient when shop PromptPay is unset. KMO removed the fallback and now fails closed unless a real PromptPay recipient or explicit static QR is configured.

Evidence:
`docs/UPSTREAM-DEFECT-BK01-PROMPTPAY-FAKE-FALLBACK-2026-09-08.md`

KMO regression: 18/18 tests PASS at the mitigation checkpoint.
Canonical modified by KMO work: **NO**.

### BK01-FB-002 — LINE identity timing
Classification: **UPSTREAM CANDIDATE / NOT YET PROVEN**
Canonical BK01 currently binds LINE after booking completion using `booking_code + link_token` via the LINE webhook. KMO legacy Booking and Order use LIFF to obtain `line_user_id` before submit and fail closed when LINE friendship/UID is missing.

Potential KMO experiment: unified LIFF entry captures LINE identity once before the customer chooses Booking / Order / Claim, while retaining BK01 post-completion binding as a browser fallback.

Do not propose this upstream until KMO proves the UX and recovery behavior in real use.

### BK01-FB-003 — Order implementation state
Classification: **UPSTREAM SYNC / STATUS EVIDENCE**

Canonical Order Phase 0 contract is PASS/LOCKED, but `04_PHASE0_HANDOFF.md` states `Build authorization: NO`. No Order runtime/dashboard implementation exists at upstream ref `4a694bc`.

The five canonical Order contract documents are copied into active KMO `docs/order/` unchanged for future implementation comparison.

### Claim / CM01
Not currently a BK01 canonical implementation. Treat KMO Claim integration as a separate module boundary until an upstream contract explicitly says otherwise.