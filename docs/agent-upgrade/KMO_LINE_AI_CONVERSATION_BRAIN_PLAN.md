# KMO LINE AI Conversation Brain — Improvement Plan

**Task ID:** KMO-LINE-AI-CONVERSATION-BRAIN-001
**Status:** ACTIVE PLAN / IMPLEMENTATION HOLD
**Date:** 2026-09-23
**Owner:** Free
**Repo:** kmorackbarcustom/kmorackbarcustom.github.io
**Branch:** task/KMO-LINE-AI-CONVERSATION-BRAIN-001
**Worktree:** D:\AI-Workspace\runtime\worktrees\kmo-line-ai-conversation-brain-20260923
**Baseline SHA:** 31b44c30f4cb4ae05f7af2d3a9446306c694272c

> เอกสารนี้เป็น working contract สำหรับการยกระดับ LINE AI ของ KMO
> จุดประสงค์คือหยุดการแก้ทีละอาการ และยกระดับ conversation continuity, customer memory,
> business retrieval, grounding และ human escalation ให้เหมาะกับการใช้งานจริงกับลูกค้า
> เอกสารนี้ยังไม่อนุญาต implementation จนกว่า Owner จะยืนยันแผนและ Entry Conditions ผ่าน

---

## 1. Problem

เหตุการณ์จริงที่กระตุ้นงานนี้:

- ลูกค้าจองงานและส่งสลิปแล้ว
- หลายวันต่อมาลูกค้าถามสถานะการตรวจสลิป
- AI ตอบจากสถานะ DB แบบตื้น ๆ ว่าไม่พบการชำระ โดยไม่เชื่อมกับหลักฐานว่าเคยส่งสลิป
- ลูกค้าขอยกเลิกเพราะความไม่มั่นใจ
- AI ตอบ generic acknowledgement เช่น `รับทราบครับคุณลูกค้า...`
- ผลกระทบจริงคือความเชื่อมั่นลดลงและเสี่ยงเสียลูกค้า/รายได้

นี่ไม่ใช่ปัญหา prompt อย่างเดียว แต่เป็นข้อจำกัดของ conversation architecture ปัจจุบัน
## 2. Current State Confirmed From Source

ตรวจจาก source จริง ณ baseline นี้:

### Current strengths

- LINE webhook เป็น always-on Supabase Edge Function
- มี agent tool loop แล้ว
- มี read tools:
  - `search_products`
  - `get_order_status`
  - `check_queue`
- มี identity rule ที่ป้องกันการอ้างเบอร์คนอื่นมาอ่าน booking ที่ผูก LINE แล้ว
- มี grounding guard สำหรับชื่อ, รถ, สถานะ, วันที่, payment claim และ booking confirmation
- มี Reply-first / Push-fallback
- มี image path และ payment-proof staff notification
- มี `line_chat_sessions` สำหรับ session state/history

### Current structural gaps

1. `line_chat_sessions` เป็น session memory ไม่ใช่ durable customer memory
2. session หมดอายุแล้ว context สำคัญอาจหาย
3. ไม่มี durable active issue / unresolved case ต่อ customer
4. ไม่มี pending-state model สำหรับเรื่องที่ยังไม่จบ
5. ไม่มี durable conversation summary ที่แยกจาก recent history อย่างมี contract
6. business lookup ยังไม่ใช้ booking/order code เป็น first-class retrieval key
7. payment truth ปัจจุบันแยกไม่ออกระหว่าง:
   - ยังไม่ verify
   - ลูกค้าไม่เคยส่งหลักฐาน
   - ลูกค้าส่งหลักฐานแล้วแต่ staff ยังไม่ยืนยัน
8. grounding fallback ปัจจุบันเป็น generic reply ที่ไม่เข้าใจเหตุผล/ผลกระทบของ intent
9. critical intents เช่น cancel/refund/complaint ยังไม่มี deterministic escalation gate
10. LLM ยังรับผิดชอบมากเกินไปในการเชื่อมเรื่องเก่าเข้ากับเรื่องใหม่

---

## 3. Reference Architecture

แนวคิดหลักยืมจาก `thai-calorie-assistant` ซึ่งออกแบบ conversation system ไว้ชัดเจนเรื่อง:

- persistent memory
- conversation summary
- pending questions
- memory confirmation gate
- no guessing
- authoritative backend state
- user isolation
- explicit uncertainty
- supersession/audit trail
สิ่งที่นำมาใช้กับ KMO ต้องปรับให้เข้ากับร้านและ business domain ไม่ copy schema ตรง ๆ

หลักการกลาง:

```text
Conversation Ledger = หลักฐานว่าเคยคุยอะไรกัน
Customer Memory     = ข้อมูลลูกค้าที่ควรจำข้าม session
Active Issue        = เรื่องที่กำลังค้างและยังไม่ปิด
Business System     = ความจริงล่าสุดของ Booking / Order
LLM                 = ทำความเข้าใจ + เสนอ intent/action/reply plan
Backend Policy      = ตัดสินว่าอะไรเชื่อได้ / ทำได้ / ต้อง escalate
```

---

## 4. User

Primary user:
- ลูกค้า KMO ที่คุยผ่าน LINE OA

Secondary users:
- ทีมงานร้านที่ต้องรับช่วงเมื่อ AI ไม่ควรตัดสินใจเอง
- Owner/Admin ที่ต้องตรวจย้อนหลังได้ว่า AI ใช้ข้อมูลอะไรและทำไมตอบแบบนั้น

---

## 5. Scope

### In scope

- durable customer memory
- conversation continuity ข้าม session / ข้ามวัน
- conversation summary
- recent-message window
- active issues / unresolved cases
- pending questions / pending references
- business reference resolver
- Booking / Order read adapters
- critical-intent detection
- grounding / evidence policy
- human escalation
- auditability ของ AI decision
- safe fallback behavior
- tests สำหรับ customer continuity และ customer isolation

### Out of scope for this task unless later authorized

- ให้ AI สร้าง/แก้/ยกเลิก Booking โดยตรง
- ให้ AI แก้ Order โดยตรง
- เปลี่ยน Booking/Order business logic
- redesign BK01 schemas
- universal customer primary key
- migration ของ Booking/Order ไป SaaS Product Hub
- Facebook Messenger integration
## 6. Architecture Target

```text
LINE Event
   ↓
Webhook verification + dedupe
   ↓
Resolve internal customer identity
   ↓
Load Conversation Context
   ├─ durable memory
   ├─ active issues
   ├─ pending questions
   ├─ conversation summary
   └─ recent messages
   ↓
Resolve business references
   ├─ LINE identity
   ├─ phone
   ├─ booking code
   ├─ order code
   └─ previously confirmed references
   ↓
Fetch authoritative business state
   ├─ Booking
   └─ Order
   ↓
Critical Intent Gate
   ↓
ONE structured model decision
   ├─ intent
   ├─ references
   ├─ proposed memory changes
   ├─ proposed issue changes
   └─ reply plan
   ↓
Backend validation / grounding / policy
   ↓
Reply or Human Escalation
   ↓
Persist conversation + memory/issue lifecycle + audit
```

---

## 7. Data Model Direction

Names are provisional until design review, but responsibilities are required.

### 7.1 Durable customer memory

Example conceptual fields:

- id
- customer/internal_user_id
- memory_type
- key
- value
- status
- evidence_message_id
- confidence
- confirmed_at
- supersedes_memory_id
- created_at
- updated_at

Lifecycle:

`proposed -> confirmed -> superseded / rejected`

Rules:

- LLM may propose memory
- LLM must not directly create durable truth
- only confirmed memory is usable as durable customer fact
- old memory is not destructively overwritten
### 7.2 Conversation messages

Raw inbound/outbound messages remain canonical conversational evidence.

Must preserve at minimum:

- customer identity
- channel event/message id
- direction
- type
- text/attachment reference
- occurred_at
- received_at

Duplicate webhook delivery must not create duplicate conversational state.

### 7.3 Conversation summary

Purpose:
- compact long-running context
- not authoritative business state

Rules:
- summary must carry a watermark / covers-through message
- recent message window begins after the watermark
- regenerated summary supersedes prior summary
- summary cannot override Booking/Order truth

### 7.4 Active issue

Examples:

- payment_verification
- cancellation_request
- refund_request
- complaint
- wrong_item
- missed_appointment
- delivery_problem

Conceptual fields:

- id
- customer_id
- issue_type
- status
- related_entity_type
- related_entity_ref
- reason
- opened_from_message_id
- latest_message_id
- resolution
- resolved_at
- created_at
- updated_at

Critical rule:

**Unresolved issue must not disappear because session TTL expires.**

### 7.5 Pending question / pending reference

Used when AI asked something that must be answered later or when a reference is ambiguous.

Examples:

- ขอเบอร์เพื่อหา booking ที่ยังไม่ผูก LINE
- ถามว่า `อันเมื่อกี้` หมายถึง booking ไหน
- ขอ clarification ก่อนตอบ critical business question

Pending state must point to the entity/issue it belongs to.
## 8. Business Retrieval Contract

AI must not depend on chat memory for current business truth.

Resolver should support safe lookup using available verified clues:

- current LINE identity
- phone number when policy allows
- booking code such as `KLI-2609-0013`
- order code
- known confirmed customer-to-business reference
- context from active issue

Rules:

1. No lookup = no factual business claim.
2. Lookup failure is not equivalent to "record does not exist".
3. Tool/runtime failure must produce safe uncertainty, not a negative factual claim.
4. Booking/Order status shown to customer must come from current authoritative read.
5. Customer memory may help locate the record but must not replace the authoritative read.

---

## 9. Payment / Evidence Semantics

Current Boolean-style payment truth is insufficient for conversation.

The conversation layer must distinguish at least:

- no payment evidence known
- payment proof received
- verification pending
- verified paid
- verification rejected/mismatch
- unknown/tool unavailable

Important:

`deposit_paid = false` must not automatically become customer-facing text
`ยังไม่พบการชำระ` if conversation evidence proves a slip was already received.

The business database remains authoritative for final payment status.
Conversation/evidence state explains what the shop has received and what remains unresolved.

---

## 10. Critical Intent Gate

The following intents must never receive blind generic acknowledgement:

- cancel
- refund
- payment problem
- complaint
- wrong order
- missed appointment
- delivery problem
- explicit request for human staff

Required flow:

```text
detect critical intent
→ load active issue
→ resolve related Booking/Order
→ identify reason/context
→ ground facts
→ decide reply vs human escalation
```
For cancellation specifically:

- identify which booking/order the customer means
- identify whether an unresolved shop-side issue is causing the cancellation
- do not imply cancellation was executed unless an authorized action actually executed
- preserve the reason for staff follow-up
- escalate when resolution requires staff authority

---

## 11. Conversation Behavior Contract

Adopt these rules:

1. Never ask again for information already known and still valid.
2. Never convert AI inference into durable customer truth.
3. Never use conversation memory as authoritative Booking/Order status.
4. Never answer a material business fact without current evidence.
5. Never treat tool failure as proof of absence.
6. Never let unresolved issues vanish on session expiry.
7. Never answer critical intent with generic `รับทราบครับ` alone.
8. When ambiguity materially changes the answer, ask one clear question instead of guessing.
9. Routine replies should remain concise and natural Thai.
10. Human handoff must include enough context that staff does not need to reconstruct the case manually.

---

## 12. Failure Cases

Must design and test explicitly:

- session expired between related messages
- customer returns after several days
- booking exists but is not linked to LINE
- customer gives booking code but no phone
- business tool timeout/error
- DB says unpaid but slip evidence exists
- image/slip was received but vision analysis failed
- customer asks to cancel because unresolved payment issue
- customer says `อันเดิม` with multiple possible records
- duplicated webhook
- two messages from same customer arrive close together
- two different customers chat concurrently
- model proposes unsupported factual claim
- grounding blocks entire draft
- Reply token expires
- Push fallback fails
- staff takes over while AI context is active
## 13. Security / Privacy

- Internal customer id remains canonical; LINE display name is not identity.
- No customer may read another customer's Booking/Order by guessing phone/code.
- Phone fallback must preserve existing one-time-claim security boundary.
- Booking/order code lookup must be ownership-checked before returning details.
- No service-role credential in browser/client.
- Durable memory must be scoped by customer/user id.
- Cross-user memory/context leakage is release-blocking.
- Sensitive staff/internal notes must not be exposed simply because they exist in Order/Booking rows.
- All privileged writes remain server-side.
- This task does not grant the model direct write authority over Booking/Order.

---

## 14. Implementation Phases

### Phase 0 — Incident & Current-State Lock

- preserve the real incident as regression scenario
- inspect current DB/runtime behavior
- pin exact schema/contracts
- confirm current session TTL behavior
- confirm current Booking/Order retrieval behavior
- identify production data fields available for payment-proof/issue linkage

**Exit:** design inputs confirmed; no production mutation.

### Phase 1 — Conversation Contract

- lock memory rules
- lock active-issue lifecycle
- lock pending-state rules
- lock critical intents
- lock business retrieval contract
- lock safe fallback contract

**Exit:** implementation-ready contract.

### Phase 2 — Thin Vertical Slice

Implement only enough to close the real failure loop:

```text
customer has booking
→ sends payment proof
→ issue remains unresolved across days/session expiry
→ customer asks again
→ system finds correct booking
→ system remembers proof/issue
→ system avoids false "no payment" statement
→ customer asks cancel
→ system understands cause + related record
→ human escalation gets complete context
```
### Phase 3 — Durable Memory + Summary

- confirmed customer memory
- conversation summary with watermark
- recent-window loading
- supersession/audit
- customer isolation tests

### Phase 4 — Business Reference Resolver

- booking code
- order code
- phone where allowed
- LINE identity
- active-issue references
- ownership/security validation

### Phase 5 — Critical Intent & Escalation

- cancel/refund/payment/complaint/etc.
- deterministic human escalation
- staff context package
- remove unsafe generic acknowledgement paths

### Phase 6 — Hardening

- concurrency
- duplicate delivery
- tool failure
- stale context
- Reply/Push recovery
- observability
- adversarial tests

### Phase 7 — Controlled Production Rollout

- owner/internal test
- selected real conversations
- monitor retrieval failures / hallucination blocks / escalations
- expand only after evidence is acceptable

---

## 15. Acceptance Criteria

Minimum release gate:

- [ ] same customer continuity works after session TTL expires
- [ ] same customer continuity works across multiple days
- [ ] booking/order lookup works from safe verified identifiers
- [ ] booking/order code can be resolved without inventing identity
- [ ] current business fact always comes from authoritative read
- [ ] tool error never becomes false `ไม่พบข้อมูล`
- [ ] received slip evidence survives session expiry
- [ ] unresolved payment issue survives session expiry
- [ ] payment pending is not misrepresented as "customer did not pay"
- [ ] cancellation request is linked to the correct entity/reason or asks before proceeding
- [ ] no blind generic acknowledgement for critical intents
- [ ] staff escalation carries customer + issue + related record + relevant evidence
- [ ] confirmed memory persists; inferred memory does not silently become truth
- [ ] customer A and B cannot leak memory/history/business data to each other
- [ ] duplicate webhook does not duplicate state
- [ ] grounding still blocks unsupported customer/business claims
- [ ] existing Reply-first / Push-fallback behavior remains intact
- [ ] text and image conversation continuity remains intact
## 16. Canonical Regression Scenario — 2026-09-23 Incident Pattern

This task must retain a scenario equivalent to:

```text
Day 1:
customer has booking KLI-xxxx
shop requests deposit
customer sends slip
system records that payment proof was received
verification remains unresolved

Later:
customer asks whether slip/payment is okay

Expected:
- retrieve the same booking
- know proof was previously received
- distinguish proof-received/pending from verified-paid
- do not claim "no payment" merely because final verification is false
- escalate when staff verification is required

Then customer says they want to cancel because of this problem

Expected:
- detect cancellation as critical intent
- know which booking/order is involved
- preserve why the customer wants to cancel
- do not claim cancellation executed unless an authorized action exists
- do not answer only with generic acknowledgement
- send complete context to staff
```

Passing this scenario is mandatory but not sufficient; two-user isolation and failure-path tests must also pass.

---

## 17. Source Priority For This Task

When sources disagree:

1. explicit Owner decision persisted into this task/contract
2. exact live implementation + verified runtime evidence
3. locked KMO domain/security contracts
4. this plan after Owner lock
5. older PRD / PROJECT_CONTEXT historical status
6. conversation history

Do not treat stale documentation as current production truth.

---

## 18. Current Decision / Next Action

**Decision recorded:**
- create a dedicated branch/worktree for LINE AI improvement
- stop treating the problem as prompt-only
- use the Thai Calorie conversation architecture as a design reference
- preserve KMO Booking/Order business logic boundaries
- build customer memory + conversation continuity + active issue + authoritative retrieval

**Current state:** PLAN WRITTEN / IMPLEMENTATION NOT STARTED

**Next action after Owner approval:** perform Phase 0 evidence lock and return with CONFIRMED / UNVERIFIED / ASSUMPTIONS / RECOMMENDATIONS / BLOCKERS before implementation.
