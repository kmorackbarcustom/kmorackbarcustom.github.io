You are the INDEPENDENT BATCH REVIEWER for a governed change. You wrote none of the work under review. You have read access to the repository; verify everything against the real files, git objects and command output. Do not accept any summary — including this one — as truth.

## OUTPUT CONTRACT — read first

- Do NOT write, create or edit any file anywhere in the workspace. The review rail snapshots this workspace and **rejects the entire result if any file changes**. Review only.
- Do NOT run any command that writes into the repository: no `npm install`, `npm ci`, `npm run build`, `next build`, or anything that regenerates caches/output trees.
- The ONLY commands you should execute are read-only: `git log`, `git show`, `git diff`, `git rev-parse`, `git status`, `grep`, `cat`, `sed`, `sha256sum`, and the read-only test suite `node --no-warnings --test --experimental-test-isolation=none tests/*.test.ts` (run from the `bk01-pilot` directory). The suite is a source-reading contract test and needs no install; it has been confirmed to pass here.
- Do not present a plan, do not ask for approval, and do not end with a question. **Your final message text IS the review deliverable.**

## Repository and exact revision under review

- Workspace / working directory: `D:\AI-Workspace\runtime\worktrees\kmo-b1-codex-580d165` — this is a **clean detached worktree created at the exact frozen candidate SHA**. The app subtree is `bk01-pilot/`.
- **Revision under review (exact): `580d165e642e10ceb0ce26da473542cd1d65f504`**
- Batch base (before all reviewed work): `09f6dde73801b4ef2932134da9ccef2e5783c370`
- Diff under review: `git diff 09f6dde73801b4ef2932134da9ccef2e5783c370 580d165e642e10ceb0ce26da473542cd1d65f504`
- Confirm yourself with `git rev-parse HEAD` and `git status --porcelain`, and report what you actually observe.

## Locked sources of truth (they define the requirements)

- `bk01-pilot/docs/RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md` — authoritative stage graph and per-stage acceptance
- `bk01-pilot/docs/BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md` — **sections B, C and G are the requirement text for this batch**
- `bk01-pilot/docs/BRIEF-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md`
- `bk01-pilot/KMO_SCHEMA_CONTRACT.md` and `bk01-pilot/KMO_EXTENSION_DESIGN.md` (both LOCKED; note they live at `bk01-pilot/` root, not under `docs/`)

Treat these as CLAIMS TO BE TESTED, not facts (they are written by the authors):
`LR-01-EVIDENCE-2026-09-24.md`, `LR-02-EVIDENCE-2026-09-24.md`, `LR-02C-EVIDENCE-2026-09-24.md`, `LR-02D-EVIDENCE-2026-09-24.md`, `REPORT-CLAUDE-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-24.md`.

**Important:** a previous reviewer (`agent-claude`) already produced verdicts on an earlier revision. Your job is to reach your **own** verdict on `580d165` from the source yourself. Do not adopt, assume, or lean on that reviewer's conclusions; you may read its report only to identify claims worth adversarially testing, and you must state clearly if any of its claims do not hold up.

## What is under review

Three consecutive stages on the consumer booking app:

1. **LR-01** — three pure helper modules under `bk01-pilot/apps/booking-consumer/src/lib/`: `load-result.ts` (query-error vs genuinely-empty), `booking-state.ts` (truthful page-state resolver), `payment-instruction.ts` (payment authority gate, PromptPay payload, `remainingHoldSeconds`). KMO-specific requirements: the "no schedule" input must derive from the shop's own weekly schedule (`local_service.shop_weekly_schedules`), NOT a staff-only schedule model; payment authority must fail closed rather than inventing an amount, a recipient or an account-holder name.

2. **LR-02** — wiring into `bk01-pilot/apps/booking-consumer/src/app/book/[slug]/page.tsx`: no invented deposit amount (`?? 100` / `|| 100`), the account-holder name is never derived from the shop name, the hold countdown derives from the server hold `expires_at` (never a hard-coded 900 seconds), and the KMO static-QR fallback is preserved but provenance-gated so it can never justify an amount or a name.

3. **LR-02C / LR-02D** — wiring the LR-01 truthful states into the page (dedicated screen per non-OK state via `resolveBookingPageState`, `NO_SCHEDULE` via `countOpenWeeklyDays`, `SHOP_NOT_FOUND` distinct from `LOAD_ERROR`, two new i18n keys in BOTH message files), plus the bounded remediation of two earlier findings (a dead `isBookingBlocked` branch removed; an overclaiming comment corrected).

Note: **LR-03 SQL work is NOT part of this review.** It was produced after this SHA and is out of scope.

## What you must actually do

1. Read the real files in full. Open the diff with git.
2. **Run the test suite read-only yourself** from `bk01-pilot`: `node --no-warnings --test --experimental-test-isolation=none tests/*.test.ts`. Report the actual observed counts. If it cannot run, say so and mark it unverified — do not guess.
3. Verify each material claim in the evidence docs against the code and git objects. Explicitly test the per-work-unit lane states recorded in the evidence ledgers — check whether they match the persisted raw lane records, and whether any failed/aborted lane has been explained into a PASS. (The authors disclosed at least one such correction; verify both the correction and whether anything else was overclaimed.)
4. Check the KMO-specific invariants **by name**, not by impression: the `NO_SCHEDULE` source, the per-service payment-blocked gate, the countdown's server authority, the static-QR provenance gate, and i18n key parity.
5. Adversarially probe for defects the authors' own checks would miss: an unreachable or inverted branch, an off-by-one or boundary error in the countdown/expiry logic, a state that can never render, an i18n key used but undefined, a preserved guard silently weakened, an over-permissive payment or authority path, or a claim stronger than its evidence.
6. Judge whether brief sections B and C are actually met, and whether any public contract or test was weakened merely to make tests pass. Check the test files for anything that merely pattern-matches source text while asserting little — and say so plainly if the evidence is weaker than it appears.

## Report structure (in your reply, in this order)

1. **Revision and provenance** — the exact SHA and `git status` you observed yourself.
2. **Verdict** — exactly one of `BATCH_APPROVED`, `APPROVED_WITH_FINDINGS`, `REMEDIATE`.
3. **Stage-by-stage assessment** — LR-01, LR-02, LR-02C/LR-02D against their stated acceptance.
4. **Findings** — each with severity (CRITICAL/HIGH/MEDIUM/LOW), exact file and line, what is wrong, why it matters, and whether it is blocking.
5. **Evidence-doc claim check** — any claim the code does not support, especially per-work-unit lane states, plus your independent judgement of the earlier reviewer's conclusions.
6. **Unverified areas** — exactly what you could not check and why.
7. **Independence statement** — confirm you did not author this work.

End your reply with exactly this line, alone on the final line:

`B1_BATCH_VERDICT: <BATCH_APPROVED|APPROVED_WITH_FINDINGS|REMEDIATE>`
