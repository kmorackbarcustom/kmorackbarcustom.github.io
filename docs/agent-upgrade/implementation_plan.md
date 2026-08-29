# Implementation Plan: KMO LINE Chat Agent Upgrade

**Created:** 2026-08-28
**Status:** CLOSED for Phase 1–4 — implemented + deployed; retained as as-built execution record. Phase 5 is not part of this plan.

เอกสารนี้เริ่มต้นเป็นแผนก่อน build แต่หลัง truth reconciliation 2026-08-29 ให้ใช้อ่านเป็น **as-built record ของ Phase 1–4**. สถานะปัจจุบันที่ authoritative ให้ดู `PRD.md` + `PROJECT_CONTEXT.md`; งาน Phase ถัดไปต้องมี brief แยกก่อน implement.

---

## Phase 1 — Identity Model Fix (ไม่ต้องรอ eval โมเดล ทำได้เลย)

### 1.1 Schema
```sql
alter table public.customers add column if not exists line_display_name text;
```

### 1.2 แก้ trigger `kmo_sync_customer_from_booking`
ไฟล์: ต้อง `pg_get_functiondef` ของจริงจาก DB ก่อนแก้ (มีหลาย migration ทับกันมา ต้อง diff ให้ตรง live)
เปลี่ยน: เอา logic เขียน `name` ออกจาก path ที่มาจาก booking sync — เขียนแค่ `name`/`phone` เหมือนเดิม **ไม่แตะ `line_display_name` เด็ดขาด**

### 1.3 แก้ `line-webhook/index.ts` (บรรทัดที่ upsert customers ตอน follow/first message)
เปลี่ยนจาก:
```ts
{ line_uid: userId, platform: "line", name: profile?.displayName ?? "LINE User", phone: "" }
```
As built: `upsertLineCustomer()` seed `name` และ `line_display_name` ด้วยชื่อ LINE เฉพาะตอน insert แรก (`ignoreDuplicates: true`); หลังจากนั้นอัปเดตเฉพาะ `line_display_name`. ชื่อจริงจาก booking trigger จึงเป็นเจ้าของ `name` โดยไม่ถูก `getProfile()` เขียนทับอีก

### 1.4 Backfill — ตรวจจริงพบ 8 คนที่โดนทับชื่อ
```sql
-- หา list ก่อน (ไม่ backfill มั่ว)
select c.id, c.line_uid, c.name
from public.customers c
join public.bookings b on b.line_uid = c.line_uid and b.customer_name = c.name
where c.line_uid is not null;
```
แล้ววนเรียก `getProfile(line_uid)` จริงต่อ LINE API เอาชื่อ LINE ปัจจุบันมาใส่ `line_display_name` — **ต้องเรียก LINE API จริง ไม่ใช่เดา**

### 1.5 แก้ `admin-line-reply.html`
โชว์ `line_display_name (name)` แทน `name` เดี่ยวๆ ในลิสต์ค้นหาลูกค้า

### Verification (Phase 1) — as built
- [x] ลูกค้า LINE 29 รายมี `line_display_name`; 8 รายที่ชื่อถูกทับได้รับชื่อ LINE จริงคืนจาก `getProfile()`
- [x] `admin-line-reply` / `staff-reply` แสดงชื่อจริงและชื่อ LINE แยกกัน; K.9 ตรวจบนหน้าจริงแล้ว
- [x] กติกา identity ที่ผูก `line_uid` แล้วไม่ให้ phone fallback แซง ถูก verify ร่วมกับ Phase 3

---

## Phase 2 — Model Eval / Production Model Selection — CLOSED

### As-built result
- `gemma4:31b-cloud` ผ่าน tool-calling และ agent-loop eval แรก แต่ภายหลังมีประวัติ token-loop garbage จาก traffic จริง/งานอื่นใน workspace
- ทำ head-to-head เพิ่มกับโมเดล Ollama Cloud ที่ยัง callable โดยใช้ `LINE_AI_SAFETY_RULES` และ tool flow จริง
- `deepseek-v4-flash:0731-cloud` ได้ grounding/tool discipline สะอาดหลังปรับ prompt ให้ `get_order_status` เรียกได้โดยไม่ขอเบอร์ก่อน
- Production chat/agent จึงสลับเป็น `deepseek-v4-flash:0731-cloud`; Gemini 2.5 Flash คงเป็น fallback
- เพิ่ม `isDegenerateText()` guard เพื่อไม่ส่ง token-loop/repeated-chunk garbage ให้ลูกค้า

### Verification (Phase 2)
- [x] ผล eval เป็นลายลักษณ์อักษรใน `phase2-model-eval.md`
- [x] Production code ใช้ `deepseek-v4-flash:0731-cloud` (`ai-providers.ts`)
- [x] Degenerate-output guard + Gemini fallback อยู่ใน production path

---

## Phase 3 — Agent Tool-Calling Loop

### 3.1 นิยาม tool schema (3 ตัว)
```
search_products(query: string) → ใช้ RPC search_products เดิม
get_order_status(phone?: string) → ยกระดับ getCustomerContext เดิม
  - บังคับใช้กติกา exclusive-once-linked จาก PRD §3
  - ถ้า booking/order มี line_uid แล้วและไม่ตรงกับผู้ถาม → ไม่คืนข้อมูล
check_queue() → อ่านความหนาแน่นคิวจริง

FAQ ไม่ได้เป็น tool แยกใน production; `shop_faqs` ถูกโหลดเข้า system prompt
```

### 3.2 แก้ `getCustomerContext` (customer-context.ts)
เพิ่มเงื่อนไข: phone-fallback query ต้องมี `.is('line_uid', null)` กำกับด้วย — ไม่ใช่ OR แบบเปิดกว้างเหมือนเดิม

```sql
-- เดิม (เสี่ยง):
.or(`line_uid.eq.${lineUid},phone.eq.${customerPhone}`)

-- ใหม่: แยก 2 query แทน OR เดียว
-- query 1: line_uid ตรง (ไม่จำกัดเงื่อนไขอื่น)
-- query 2: phone ตรง AND line_uid is null เท่านั้น
-- รวมผลจาก 2 query, ให้ query 1 (line_uid) มาก่อนเสมอถ้ามี
```

### 3.3 เปลี่ยน `generateLineReply`/`ai-providers.ts` ให้เป็น agent loop
- รับ `tools` schema เข้าไปในการยิง request
- ถ้า response เป็น `tool_calls` → execute จริง → ส่งผลกลับเข้า messages → เรียกโมเดลอีกรอบ
- นับรอบ ห้ามเกิน 3 — ถ้าครบ 3 แล้วยังไม่จบ ให้ตอบด้วยข้อมูลเท่าที่มี + NEEDS_STAFF_FOLLOWUP

### 3.4 ลบ eager-fetch เดิมออกจาก `line-webhook/index.ts`
`Promise.all([getCustomerContext, search_products, get_upcoming_queue_density])` — เปลี่ยนเป็นให้ agent เรียกเองผ่าน tool แทน (ไม่ยัด context ทุกข้อความอีกต่อไป)

### Verification (Phase 3)
- [ ] ถามสถานะออเดอร์จริง → ได้คำตอบจริงจาก tool ไม่ใช่ prompt เดิม
- [ ] ถามด้วยเบอร์คนอื่นที่มี line_uid ผูกแล้ว → tool ปฏิเสธให้ข้อมูล
- [ ] จำลอง tool loop เกิน 3 รอบ → ต้องตอบ NEEDS_STAFF_FOLLOWUP ไม่ค้าง/ไม่ crash

---

## Phase 4 — Reply-First / Push-Fallback

### 4.1 แก้ handler ส่งข้อความ
- Path หลัก: ใช้ `replyMessage(replyToken, ...)` เหมือนเดิม
- Handler พยายาม `replyMessage` ก่อน; ถ้า LINE reply call ล้มเหลว/ใช้ token ไม่สำเร็จและมีข้อความตอบ → fallback `pushMessage(line_uid, ...)`

### 4.2 (Deferred — ไม่ต้องทำเฟสนี้) Push quota tracking
เก็บไว้เป็น idea ไม่ implement ตอนนี้ (usage ต่ำ) — ถ้าจะทำ: table เก็บ count ต่อเดือน + threshold แจ้งเตือนผ่าน Telegram

### Verification (Phase 4) — as built
- [x] ข้อความปกติยังใช้ Reply เป็น path หลัก
- [x] Push fallback อยู่ใน handler เมื่อ Reply ล้มเหลว
- [ ] ยังไม่มีหลักฐาน production จาก reply token ที่หมดอายุจริง — บันทึกเป็น monitoring limitation ไม่ใช่ blocker ของ Phase 4

---

## Rollout / Deploy Checklist (ทุก phase)

- [ ] `supabase functions deploy line-webhook --project-ref xfhpwxjywqgqefbncumm` (ใช้ `SUPABASE_ACCESS_TOKEN_KEEPALIVE` จาก keys.txt)
- [ ] Migration ใหม่ผ่าน `apply_migration` (Supabase MCP) หรือ SQL editor — เขียนไฟล์ migration เก็บไว้ใน `supabase/migrations/` เสมอ ไม่แก้ผ่าน dashboard เฉยๆ
- [ ] Commit + push ทุกครั้งหลัง deploy สำเร็จ (repo `kmorackbarcustom.github.io`)
- [ ] ถ้า phase ไหนแตะ `internal-proxy` — ต้องขออนุญาต CEO ก่อนเสมอ (ดู memory [[internal-proxy-locked]])
- [ ] ถ้า phase ไหนแตะข้อมูล production ของ order/booking ที่มีสถานะ active — ถามนโยบายก่อนแก้ทุกครั้ง (บทเรียนจาก 28/08)
