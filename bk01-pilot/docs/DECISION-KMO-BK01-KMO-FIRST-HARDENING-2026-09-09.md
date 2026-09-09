# DECISION — KMO BK01 KMO-FIRST HARDENING

Date: 2026-09-09 (Asia/Bangkok)
Status: LOCKED BY OWNER
Repo: `D:\AI-Workspace\projects\kmorackbarcustom.github.io\bk01-pilot`
Branch: `pilot/bk01-independent-deployment`

## DECISION

KMO BK01 will be developed first for the real operational needs of KMO RACKBARCUSTOM.
It does not need to preserve feature parity with canonical BK01 when parity would reduce KMO usability, safety, or correctness.

Canonical BK01 remains read-only from this workstream.
No KMO remediation may modify, commit, push, migrate, or deploy canonical BK01.

KMO may independently harden architecture, database contracts, UI/UX, tests, and runtime behavior.
Upstream maintainers may later inspect KMO deltas and independently decide which changes should be adopted upstream.

## DELTA LABELS

Every material KMO divergence should be classified as one of:

- `KMO_ONLY` — specific to KMO operations or policy.
- `GENERIC_CANDIDATE` — likely reusable by upstream or other booking tenants.
- `TEMPORARY_MITIGATION` — safe downstream fix pending a better long-term model.

No divergence should be hidden as an accidental fork.
## CURRENT RELEASE GATE

Independent Codex review verdict:
`REMEDIATE BEFORE OWNER RETEST`

Owner retest and dark deployment remain blocked until KMO remediation evidence passes.

Required KMO hardening before retest:

1. Missing weekly schedule must fail closed at booking/reschedule boundary.
2. Staff schedule must respect shop open/closed days and hours at DB level, not UI only.
3. Staff-card save failure must not erase or falsely preserve unrelated unsaved state.
4. Consumer must distinguish zero services, zero active staff, zero available slots, shop closed/holiday, and read failure.
5. Fix mojibake/BOM regressions.
6. Mobile time entry must be easy but strict; malformed values must be rejected rather than guessed.
7. Numeric service fields must support clearing/retyping without forced leading zero.
8. Shop profile remains independent from payment configuration.
9. Replace source-string-only regression evidence with behavioral and DB-backed proof where practical.
10. Clean generated artifacts and require a zero-real-secret build scan before deployment.

## SERVICE DURATION POLICY

- Minutes and hours may share canonical minute persistence for same-day services.
- True multi-day services are a separate booking architecture and must not be faked by a display-only unit selector.
- KMO may implement multi-day support later if required by real KMO operations.

## STOP RULES

- Do not deploy until tests, DB proof, build, and secret scan pass.
- Do not push without explicit Owner instruction.
- Do not activate cron, notification integrations, custom domains, Stripe, or cutover as part of this remediation.
- Preserve unrelated worktree changes.
