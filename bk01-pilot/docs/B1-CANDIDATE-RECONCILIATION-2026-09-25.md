# B1 CANDIDATE / RUNTIME RECONCILIATION — Owner ruling 2026-09-25 (step 1)

Date: 2026-09-25 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)

## 1. The Owner-cited SHAs are STALE — corrected by measurement

The Owner ruling describes the execution state as:

```text
current HEAD        = 234603d22be1954e63ddf17d606fca0b27587a70
product-code tip    = 07558fe3872b367b235a9c648304eca2b4d9e941
```

Measured on disk at ruling time:

```text
current HEAD        = ec9a3c7b48595b33a6cdc1c0e00ad9f7abbaef93          <-- NOT the cited value
product-code tip    = 580d165e642e10ceb0ce26da473542cd1d65f504  <-- NOT the cited value (last commit touching bk01-pilot/apps)
cited 234603d       = 234603d22be1954e63ddf17d606fca0b27587a70     (exists; IS an ancestor of HEAD)
cited 07558fe       = 07558fe3872b367b235a9c648304eca2b4d9e941     (exists; 3 product commits behind the actual tip)
```

Eight commits landed after the Owner-cited HEAD, i.e. after the state the Owner was briefed on:

```text
ec9a3c7 docs(kmo): LR-03 WU02 static qualification = REMEDIATE (1 HIGH, 2 MEDIUM, 2 LOW)
ed3dfbf docs(kmo): LR-03 evidence — WU01 PASS, section A resolved, attempt ledger
f82994b feat(kmo): LR-03 WU01 KMO intake/work-state DB contract (paired patch+rollback, no apply)
ed93670 docs(kmo): LR-03 stage plan — SoT path correction + section A grant requirement resolved
6cec525 docs(kmo): B1 bounded re-review APPROVED_WITH_FINDINGS at 8b67325; LR-03 unblocked
8b67325 docs(kmo): Task checkpoint — LR-02D complete, B1 approved at 234603d, re-review in flight at 4b7efb9
4b7efb9 docs(kmo): LR-02D evidence — F1/F4 remediation, attempt ledger, carried findings
580d165 fix(kmo): LR-02D remediate B1 findings F1/F4 + persist the B1 review verdict
```

This is reported rather than silently corrected: the ruling's intent (review the current product
candidate **including LR-02C**) is preserved, but the literal SHAs in the ruling do not match the
repository, so any dispatch keyed to them would review a superseded revision.

## 2. Corrected candidate definitions

```text
REPO HEAD (includes held LR-03 SQL + docs)   ec9a3c7b48595b33a6cdc1c0e00ad9f7abbaef93
PRODUCT-CODE TIP (bk01-pilot/apps)           580d165e642e10ceb0ce26da473542cd1d65f504   <- includes LR-02C AND the LR-02D remediation
LR-02C CODE TIP (as named in the ruling)     07558fe3872b367b235a9c648304eca2b4d9e941
B1 FIRST-REVIEW REVISION                     234603d22be1954e63ddf17d606fca0b27587a70
B1 RE-REVIEW REVISION                        8b6732540d6e952f2d95192b8ea1fb3ef73952a3
```

**Frozen B1 candidate for the next independent review: `580d165e642e10ceb0ce26da473542cd1d65f504`** — it is the newest revision of the
product surface, and it contains LR-02C (`07558fe3872b367b235a9c648304eca2b4d9e941`) plus the bounded remediation of B1's F1/F4 findings.
Reviewing `07558fe3872b367b235a9c648304eca2b4d9e941` alone would review a revision already superseded by that remediation.

LR-03 artifacts (`f82994b`, `ed3dfbf`, `ec9a3c7`) are **excluded from B1 scope** and are now under
**HOLD** by this ruling. They are unapplied SQL source and documentation only — no runtime effect.

## 3. Runtime state that matters to B1 (corrected)

```text
Independent reviewer previously bound (D-2)  agent-claude
Claude non-BUILD rail                        plan-only; cannot run tests or write a report
                                             -> handled by a prompt-side output contract; produced two
                                                real verdicts, or to be replaced entirely per this ruling
Codex runtime pin (enforced, v2.5.5)         openai / gpt-6-luna / reasoning_effort=medium
Codex authorized pin (ruling, brief, registry) gpt-5.6-luna
```

The Codex pin divergence is the blocker for step 2 of the ruling and is evidenced in
`CODEX-READINESS-PROBE-2026-09-25.md`.

## 4. B1 verdicts already on record (so the ruling is not made on incomplete information)

| Pass | Revision | Reviewer | Verdict |
|---|---|---|---|
| B1 first review (LR-01+LR-02+LR-02C) | `234603d` | `agent-claude` | `APPROVED_WITH_FINDINGS` |
| B1 bounded re-review (after F1/F4 remediation) | `8b67325` | `agent-claude` | `APPROVED_WITH_FINDINGS`, no new blocking finding |

Both are persisted with full provenance in `REPORT-CLAUDE-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-24.md`.
Owner step 3 overrides D-2 for this run, so those Claude verdicts are **superseded as the governing
review** once a Codex verdict exists — they are retained as evidence, not deleted.

## 5. What this reconciliation did NOT do

```text
no git reset / rebase / history rewrite
no push
no protected Relay skill or runtime edit
no LR-03 product-file revert (HOLD = stop advancing, not destroy)
```
