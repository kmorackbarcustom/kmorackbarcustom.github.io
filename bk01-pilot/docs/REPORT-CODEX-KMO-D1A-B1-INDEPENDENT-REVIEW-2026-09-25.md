# CODEX B1 — INDEPENDENT BATCH REVIEW RESULT

Date: 2026-09-25 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)
Review Batch: `B1` — stages `LR-01` + `LR-02` + `LR-02C` + `LR-02D`
**Revision under review (exact): `580d165e642e10ceb0ce26da473542cd1d65f504`**
Batch base: `09f6dde73801b4ef2932134da9ccef2e5783c370`
Review worktree: `D:\AI-Workspace\runtime\worktrees\kmo-b1-codex-580d165` (clean detached worktree)

## Verdict

```text
B1_BATCH_VERDICT: REMEDIATE
```

**3 blocking findings** (2 HIGH, 1 MEDIUM) that affect product behaviour, plus 2 non-blocking.

## Reviewer provenance (D-3 conformance — fail-closed check PASSED)

Every D-3 required field was verified on the actual review invocation, not inferred:

```text
declared_agent_identity   = agent-codex                    OK
executor_identity         = agent-codex                    OK
executor_registration     = codex-wrapper                  OK
execution_backend         = direct_external_process        OK
transport_model           = none                           OK
provenance_session        = 1                              OK   (D-3 required)
session_route_code        = CODEX_SESSION_1_SELECTED       OK   (D-3 required)
context_mode              = INDEPENDENT-QA                 OK
exit_code                 = 0                              OK
version                   = codex-cli 0.156.1
wrapper_sha256            = sha256:d106f2a78210c9384291e31dcad383bf34ea15b9c7dae4e48d813c0a614fe6a9
prompt_sha256             = sha256:e072b096e0133005632f6e8820bd5f58cac84bba7de28e884983991d6a71536c
stdout_sha256             = sha256:948ee1cdbb2fa0c78f62e2bd1dc029610f25996daf8488894af054dd1b443f1c
EXECUTOR_READY            = PASS
```

Provider/model were the enforced runtime pin `openai / gpt-6-luna / reasoning_effort=medium`, exactly as
D-3 authorizes. **No mismatch, so no fail-closed STOP was required.**

Raw evidence is persisted **inside the tree** (not only in temp) so a future reviewer can verify it
rather than trusting this prose:

```text
bk01-pilot/docs/review-evidence/codex-b1-580d165/agent-codex.stdout.txt      sha256 948ee1cd…
bk01-pilot/docs/review-evidence/codex-b1-580d165/agent-codex.invocation.json sha256 1622dc37…
bk01-pilot/docs/review-evidence/codex-b1-580d165/agent-codex.stderr.txt      (empty)
bk01-pilot/docs/review-evidence/codex-b1-580d165/codex-b1-prompt.md          sha256 e072b096…
```

The reviewer confirmed it read `HEAD` and `git status` itself (clean at the exact SHA) and ran the test
suite itself, reporting **98/98**.

## Findings — as verified by the controller against source

The controller re-checked every finding rather than accepting the report. One is **refuted**.

| # | Reviewer severity | Controller verification |
|---|---|---|
| **C1** | HIGH (blocking) | **CONFIRMED.** `page.tsx:168` = `authoritativeDepositAmount(holdResult?.deposit_amount ?? selectedService?.deposit_amount)`. Once a hold exists, an absent server amount falls back to the selected service's pre-hold configuration, and that value then feeds `resolvePaymentInstruction` — so a QR/amount can be produced from data the hold row did not authorise. Brief section C requires the hold/server state to be the authoritative payable deposit. |
| **C2** | HIGH (blocking) | **CONFIRMED.** `page.tsx:966` renders the raw PromptPay number and its copy button gated only on `promptpayNumber` being non-empty; `handleCopyPromptpay` (`page.tsx:~209`) checks only `if (!promptpayNumber) return;`. So the customer can still read/copy the number when the authority tuple is incomplete (invalid recipient format, or no configured account name/amount). `paymentMethodAvailable` gates only the QR **download** button (`:947`) — a different control. Brief section C explicitly requires a no-copy/no-download regression when payment authority is incomplete. |
| **C3** | MEDIUM (blocking) | **REFUTED — false positive.** The reviewer states the page calls `t('step3.amountUnavailable')` while the message files define the key under `payment.amountUnavailable`, and cites `th.json:127`/`en.json:127`. Measured: there is **no `booking.payment` object at all** in either file (`'payment' in booking` → `False`), and `booking.step3.amountUnavailable` **does exist** in both (`'ยังไม่ได้ตั้งค่ายอดมัดจำ'` / `'No deposit amount has been configured'`). The page uses `useTranslations('booking')` (`page.tsx:46`), so `t('step3.amountUnavailable')` resolves correctly. `th.json:127` is simply the `amountUnavailable` line inside the `step3` block, which the reviewer misread as a separate `payment` namespace. **This finding does not hold up and is not being actioned.** |
| **C4** | MEDIUM (blocking) | **CONFIRMED as a brief-literal gap.** `NO_SLOT_FOR_DATE` appears `0` times in both `page.tsx` and `booking-state.ts`; a no-slot date still renders the pre-existing inline step-2 banner (`page.tsx:~824`). Brief section B lists `NO_SLOT_FOR_DATE` among the explicit states. This was already carried as finding **F5** from the first B1 pass, and the earlier reviewer judged it arguably correct because it is date-scoped rather than shop-wide. Whether it is *blocking* is a genuine judgement call the reviewer made differently from the previous pass. |
| **C5** | MEDIUM (blocking) | **CONFIRMED as an evidence-integrity defect.** `LR-02-EVIDENCE-2026-09-24.md` contradicts itself: the work-unit table (line 34) records `LR02B-WU02` as lane `SWARM_WORK_UNIT_FAIL`, while the attempt ledger (line 55) records attempt 5 as `SWARM_WORK_UNIT_PASS` and asserts the committed unit produced a lane PASS. Additionally, `git ls-files` shows the raw lane records are **not committed** (`0` files matching `swarm-lr02`), so the "no FAIL was explained into a PASS" claim **cannot be verified from the reviewed revision**. The reviewer is correct that this is a defect in the evidence, not merely a stylistic wart. |
| **C6** | LOW (non-blocking) | **CONFIRMED.** Most page-level tests are regex-on-source assertions rather than rendered behaviour. This matches carried finding **F3** from the previous pass; `LR-06` is the stage that owns real browser/mobile evidence. |

## What the reviewer independently confirmed as sound

```text
LR-01  three helpers within scope with real behaviour tests; NO_SCHEDULE counts open rows from the
       shop weekly schedule; payment helper rejects incomplete tuples; countdown distinguishes
       elapsed 0 from unusable null
LR-02  no literal deposit 100, no shop-name fallback, no hard-coded 900 countdown remaining
LR-02C/02D  dedicated screen per state, LOAD_ERROR distinct from SHOP_NOT_FOUND,
       NO_SCHEDULE uses the shop weekly model, both setup-state keys present in th and en
static QR  requires an explicitly supplied URL
dead isBookingBlocked branch  removed (confirmed)
contactFallback comment       corrected (confirmed as a genuine improvement over the prior wording)
```

## Independence

The reviewer explicitly separated what it could and could not verify, stated that it did not adopt the
previous reviewer's conclusions (whose report cites `234603d…`, a different revision, and was used only
to select claims worth attacking), and listed its unverified areas: raw lane records unavailable in this
revision, and no build/lint/browser checks permitted by the contract. Its independence statement is
present and consistent with the D-3 provenance above.

## Consequences

Per the Owner ruling's continue rule, a substantive finding means the **remediation / re-review contract**
applies — so **LR-03 stays ON HOLD**. The previous Claude verdicts are **not** a substitute for this
verdict, as the ruling states.

Remediation scope implied (subject to the controller deciding unit boundaries, not this report):
C1 + C2 (payment authority fail-closed on the hold row and on the copy/display path), C4 (decide
`NO_SLOT_FOR_DATE`, either model it or record a bounded deviation with rationale), C5 (repair the
contradictory ledger and commit the raw lane records so the claim is verifiable from the tree).
**C3 is not actioned** — it is a false positive.
