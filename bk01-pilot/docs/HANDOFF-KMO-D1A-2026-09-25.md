# HANDOFF — KMO D1A LONG_RUN (session 2026-09-25 → next session)

Date: 2026-09-25 (Asia/Bangkok)
From: Hermes session `20260924_222814_f9664e`
Repo (worktree): `D:\AI-Workspace\runtime\worktrees\kmo-d1a-longrun-20260924`
Branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924`
HEAD at handoff: `37cb2eafbe70af5f68c1d46cb7735dc7aa851d9d` · worktree **clean** · **never pushed**

## 1. กำลังทำอะไร อยู่โปรเจกต์ไหน

**Project:** `kmorackbarcustom/kmorackbarcustom.github.io` → KMO Booking (BK01 pilot), pilot subtree `bk01-pilot/`
**Task:** `KMO-DOMAIN-BOOKING-READINESS-001` · Workstream `DOMAIN OPERATIONS` · LONG_RUN · `WF-DEV-01 v1.4.0`
**เป้าหมายปลายทาง:** `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` (**ยังไม่ถึง** — เป็น marker ปลาย run LR-03…LR-10)
**คำสั่งล่าสุด:** Owner ruling `BRIEF-KMO-BK01-D1A-CONTINUE-LONG-RUN-2026-09-24.md` + Owner ruling 2026-09-25 (D-3)

## 2. สถานะปัจจุบัน (ของจริง ตรวจจาก disk)

| Stage | State | Evidence / Commit |
|---|---|---|
| LR-00 preflight | PASS | `LR-00-PREFLIGHT-EVIDENCE-2026-09-24.md` |
| LR-01 pure helpers | COMPLETE | `f74ac29` `c95a3bf` `f135edb` |
| LR-02 consumer truth/payment | COMPLETE | `ce163ae` `e1ff830` |
| LR-02C truthful-state wiring | COMPLETE | `07558fe` · `LR-02C-EVIDENCE-2026-09-24.md` |
| LR-02D F1/F4 remediation | COMPLETE | `580d165` · `LR-02D-EVIDENCE-2026-09-24.md` |
| **B1 (Codex, Owner D-3)** | **`REMEDIATE`** — 2 HIGH + 1 MEDIUM blocking | `37cb2ea` · `REPORT-CODEX-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-25.md` |
| **LR-03 KMO DB contract** | **ON HOLD** (B1 ไม่ผ่าน → continue rule) | `LR-03-EVIDENCE-2026-09-24.md` · `QUALIFICATION-LR03-WU01-2026-09-25.md` |
| B2 critical review | ยังไม่เริ่ม (รอ LR-03) | — |
| LR-04…LR-10 | ยังไม่เริ่ม | — |

**B1 target ที่ freeze ไว้:** `580d165e642e10ceb0ce26da473542cd1d65f504` (bk01-pilot/apps tip)

## 3. งานที่ต้องทำต่อทันที (next session) — ลำดับชัดเจน

**ขั้น 1 — Bounded remediation ของ Codex B1 findings** (LR-03 ยัง HOLD)
- **C1 (HIGH, blocking)** `page.tsx:168` — `authoritativeDepositAmount(holdResult?.deposit_amount ?? selectedService?.deposit_amount)` ยัง fallback ไป service amount **หลังมี hold** ⇒ ต้อง fail closed เมื่อ hold row ไม่มี amount ที่ใช้ได้ (brief C: hold/server state = authoritative payable deposit)
- **C2 (HIGH, blocking)** `page.tsx:966` + `handleCopyPromptpay` (~:209) — ยังแสดง/คัดลอก PromptPay number ดิบโดย gate แค่ "ไม่ว่าง" ⇒ brief C ต้องการ no-copy/no-show เมื่อ authority tuple ไม่ครบ (`paymentMethodAvailable` gate แค่ปุ่ม download QR ที่ :947 — คนละคอนโทรล)
- **C4 (MEDIUM)** `NO_SLOT_FOR_DATE` — ยังไม่มีใน resolver (0 occurrences) · ต้องเลือก: model เป็น state หรือบันทึก bounded deviation พร้อมเหตุผล
- **C5 (MEDIUM)** `LR-02-EVIDENCE-2026-09-24.md` **ขัดกันเอง** (work-unit table = FAIL vs attempt ledger = PASS) **และ raw lane records ไม่ได้ commit** (`git ls-files` = 0) ⇒ ต้องแก้ ledger ให้ตรง + commit raw lane record เพื่อให้ยืนยันได้จาก tree
- **C3 = REFUTED — ห้ามแก้** (reviewer เขWผิด: ไม่มี `booking.payment` object เลย และ `booking.step3.amountUnavailable` มีอยู่จริงทั้ง th/en)

**ขั้น 2** — Codex B1 re-review บน SHA ใหม่ (clean isolated worktree, contract เดิม + write prohibition)

**ขั้น 3** — เฉพาะเมื่อ B1 = `PASS`/`BATCH_APPROVED` → กลับไปทำ **LR-03 ต่อจาก HOLD state** (WU01 SQL มีแล้ว) แล้วปิด D-02/D-03/D-04 จาก qualification + **B2 critical review**

## 4. Owner ruling ที่ยังมีผล (อย่าละเมิด)

- **D-3 (bounded, run นี้เท่านั้น):** B1 reviewer = `agent-codex` · Session-1 only · `provenance_session=1` + `CODEX_SESSION_1_SELECTED` · `openai / gpt-6-luna / medium` · **ห้ามแก้ `model_pins.py`** · ห้ามแก้ Relay skill/runtime/config · ห้ามเปลี่ยน Claude rail ใน task นี้
- **ห้าม:** production apply/deploy/cutover · Order / Claim / KMO Control · push/merge (ยกเว้น authority เดิม) · canonical BK01 mutation
- **ห้ามใช้ Claude verdict หรือ artifact เก่าแทน Codex verdict รอบนี้** (เก็บไว้เป็นหลักฐานเท่านั้น)
- Claude non-BUILD rail defect = **งาน hardening แยกภายหลัง** ไม่แก้ระหว่าง run นี้

## 5. กับดักที่เจอในรอบนี้ (สำคัญ — อย่าเสียเวลาซ้ำ)

1. **Wrapper `invoke-codex-worker.ps1` fail-closed** ต่อ model ที่ไม่ตรง `PIN_CODEX` (`gpt-6-luna`) — `gpt-5.6-luna` ถูกปฏิเสธด้วย `CODEX_PIN_MISMATCH` (D-3 แก้เรื่องนี้แล้ว)
2. **Rail workspace scope guard ทิ้งผลรีวิวทั้งหมดถ้าไฟล์เปลี่ยน** — reviewer ที่รัน build จะสร้าง `.next` ⇒ ต้องใส่ **hard WRITE PROHIBITION** ใน prompt และ **ห้ามรัน `npm run build` ใน worktree ที่จะใช้ review** (controller รันเองแล้วทำ `.next` ค้าง → guard ยิงก่อน reviewer เริ่ม)
3. **test suite ของ bk01-pilot รันได้โดยไม่ต้องมี `node_modules`** (source-reading tests) ⇒ อย่า copy node_modules เข้า review worktree (จะ trip guard)
4. **Declared check ต้องรัน baseline ก่อน dispatch เสมอ** — รอบนี้เจอ check defect ตัวเอง 2 ครั้ง: `grep -c`+`test -z` เป็นบวกเสมอ · `\c ` ใน single-quote ยุบเป็น `c ` ไปแมตช์คำว่า "publi**c **" · RLS pattern ไม่ทนช่องว่างจัดคอลัมน์ · grep ข้อความในไฟล์ test ไม่เจอเพราะเก็บ regex-escaped
5. **`--resolved-review-checkpoint` ไม่ใช่ verdict** — ใช้เพื่อไม่ให้ aggregate ค้างเท่านั้น (ห้ามตีความเป็น review ผ่าน)
6. **Control sync:** `eventId` ผูกกับ revision ⇒ ส่ง revision เดิม payload ต่าง = `EVENT_ID_PAYLOAD_CONFLICT`; ลืม `--product-code BK01` = **422 unresolved product identity**
7. **MSYS:** native tool ไม่รับ `/d/...` ต้องใช้ `D:/...`; `execute_code` ไม่มี `bash` ต้องใช้ `C:/Program Files/Git/bin/bash.exe`
8. **มี Hermes session อื่น live บน run เดียวกัน 2 ตัว** (telegram `20260924_175829_8e6ebd3d`, desktop `20260924_225214_72954c`) → commit อาจโผล่มาโดยไม่คาดคิด · **ควรมี single-controller lock ต่อ (project, run)**

## 6. เอกสารสำคัญที่ต้องอ่านก่อนเริ่ม

```text
bk01-pilot/docs/RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md   (manifest + D-1/D-2/D-3)
bk01-pilot/docs/tasks/TASK-KMO-DOMAIN-BOOKING-READINESS-001.md                        (checkpoint)
bk01-pilot/docs/REPORT-CODEX-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-25.md               (B1 verdict ล่าสุด — ตัวจริง)
bk01-pilot/docs/review-evidence/codex-b1-580d165/                                      (raw reviewer evidence ที่ commit แล้ว)
bk01-pilot/docs/B1-CANDIDATE-RECONCILIATION-2026-09-25.md                              (SHA ที่ถูกต้อง — ของใน ruling stale 8 commits)
bk01-pilot/docs/CODEX-READINESS-PROBE-2026-09-25.md                                    (pin mismatch + 4 options)
bk01-pilot/docs/LR-03-EVIDENCE-2026-09-24.md + QUALIFICATION-LR03-WU01-2026-09-25.md    (LR-03 ที่ HOLD)
bk01-pilot/KMO_SCHEMA_CONTRACT.md + KMO_EXTENSION_DESIGN.md                            (LOCKED; อยู่ที่ bk01-pilot/ root ไม่ใช่ docs/)
```

## 7. ข้อควรระวังด้านความซื่อสัตย์

- **`LR-02B-WU02` lane = FAIL จริง** (`WORKER_REPORTED_FAIL`, exit 2) แม้ artifact ดี — อย่ากลับไปเขียนเป็น PASS
- **`LR-03` qualification = `REMEDIATE`** — D-01 (HIGH: `booking_work_state_events` `ON DELETE CASCADE` + BEFORE DELETE guard ⇒ booking ที่มี event ลบไม่ได้) **ยังเป็น Owner Decision Gap ที่ยังไม่ได้รับ ruling**
- รายงานทุกอย่างเป็นไฟล์ + full path · ใช้ `PASS ใน manual/dev test` · ห้ามเคลม `PRODUCTION_READY`
