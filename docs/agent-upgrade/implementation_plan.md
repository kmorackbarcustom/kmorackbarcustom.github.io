# Implementation Plan: KMO LINE Chat Agent Upgrade

**Created:** 2026-08-28
**Status:** Draft — รอ CEO อนุมัติก่อนเริ่ม Phase 1

ลำดับ phase ตั้งใจให้ **Phase 1 ทำได้ทันทีไม่ต้องรอผลใคร** (แก้บั๊กที่ยืนยันแล้ว) ส่วน **Phase 2 เป็น blocker ของ Phase 3** (ต้องรู้ก่อนว่าโมเดลไหนใช้ได้จริง ก่อนลงมือสร้าง agent loop)

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
เป็น: เขียน `line_display_name` แทน (หรือคู่กับ) `name` — ต้องตัดสินใจว่า `name` เริ่มต้นควรเป็นอะไรถ้ายังไม่เคยจอง (ชื่อ LINE ไปก่อนก็ได้ จนกว่าจะมีชื่อจริงจาก booking มาเขียนทับ — แต่ `line_display_name` ต้องไม่ถูกทับอีก)

### 1.4 Backfill 7 คนที่โดนทับชื่อไปแล้ว
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

### Verification (Phase 1)
- [ ] Query ยืนยัน 0 แถวที่ `name` กับ `line_display_name` เท่ากันแบบไม่ตั้งใจ (ยกเว้นกรณีชื่อ LINE = ชื่อจริงพอดีจริงๆ)
- [ ] ทดสอบจองใหม่ผ่านฟอร์ม → backfill line_uid ผ่านแชท → เช็คว่า `line_display_name` ไม่เปลี่ยน, `name` เปลี่ยนตามฟอร์ม
- [ ] เปิด `admin-line-reply.html` จริง ค้นชื่อ LINE เจอ K.9 ได้แล้ว

---

## Phase 2 — Model Eval (blocker ก่อน Phase 3)

### 2.1 ทดสอบ tool-calling ของ `gemma4:31b-cloud` (Ollama Cloud)
ยิง request ตรงไปที่ `https://ollama.com/v1/chat/completions` พร้อม `tools` param (schema สมมติ 1 tool ง่ายๆ) เช็คว่า:
- โมเดลเรียก tool จริงไหม (ตอบ `tool_calls` ใน response ไม่ใช่แค่ text)
- เรียกด้วย argument ที่ parse ได้ถูกต้อง

### 2.2 ถ้า gemma4 ไม่รองรับ/รองรับได้ไม่ดี
สลับ Gemini 2.5 Flash ขึ้นเป็นตัวหลักสำหรับ agent loop โดยเฉพาะ (Ollama เก็บไว้เป็น fallback ของงาน non-agent อื่นถ้ามี) — ต้องแก้ `ai-providers.ts` ให้เลือก provider ตาม "ต้องใช้ tool-calling หรือไม่"

### 2.3 Eval rule-adherence (คำถามหลอกล่อ 8-10 ข้อ)
ใช้ prompt ชุด `LINE_AI_SAFETY_RULES` จริง ยิงผ่านทั้ง 2 โมเดลผู้สมัคร เทียบว่าใครหลุดกฎกี่ครั้ง (ยืนยันจองเอง, มั่วราคา, ฯลฯ) — ผลใช้ตัดสินใจ Gemma vs DeepSeek vs Gemini ให้เป็น agent หลัก

### Verification (Phase 2)
- [ ] มีผล eval เป็นลายลักษณ์อักษร (ไม่ใช่ความรู้สึก) ก่อนล็อกโมเดล

---

## Phase 3 — Agent Tool-Calling Loop

### 3.1 นิยาม tool schema (3 ตัว)
```
search_products(query: string) → ใช้ RPC search_products เดิม
search_faq(query: string) → query shop_faqs (ILIKE เดิมไปก่อน, ไม่ทำ pgvector เฟสนี้)
get_order_status(phone?: string) → ยกระดับ getCustomerContext เดิม
  - บังคับใช้กติกา exclusive-once-linked จาก PRD §3
  - ถ้า booking/order มี line_uid แล้วและไม่ตรงกับผู้ถาม → ไม่คืนข้อมูล
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
- ถ้า agent loop เสร็จช้าเกินไป (ตั้ง threshold จาก reply token TTL จริงของ LINE) หรือ replyToken ถูกใช้ไปแล้ว → fallback `pushMessage(line_uid, ...)`

### 4.2 (Deferred — ไม่ต้องทำเฟสนี้) Push quota tracking
เก็บไว้เป็น idea ไม่ implement ตอนนี้ (usage ต่ำ) — ถ้าจะทำ: table เก็บ count ต่อเดือน + threshold แจ้งเตือนผ่าน Telegram

### Verification (Phase 4)
- [ ] ข้อความปกติ (ตอบเร็ว) ยังใช้ Reply เหมือนเดิม ไม่กิน Push quota
- [ ] จำลอง agent ตอบช้า (เช่น mock delay) → ยืนยันว่า fallback ไป Push จริง ไม่ค้าง/ไม่หาย

---

## Rollout / Deploy Checklist (ทุก phase)

- [ ] `supabase functions deploy line-webhook --project-ref xfhpwxjywqgqefbncumm` (ใช้ `SUPABASE_ACCESS_TOKEN_KEEPALIVE` จาก keys.txt)
- [ ] Migration ใหม่ผ่าน `apply_migration` (Supabase MCP) หรือ SQL editor — เขียนไฟล์ migration เก็บไว้ใน `supabase/migrations/` เสมอ ไม่แก้ผ่าน dashboard เฉยๆ
- [ ] Commit + push ทุกครั้งหลัง deploy สำเร็จ (repo `kmorackbarcustom.github.io`)
- [ ] ถ้า phase ไหนแตะ `internal-proxy` — ต้องขออนุญาต CEO ก่อนเสมอ (ดู memory [[internal-proxy-locked]])
- [ ] ถ้า phase ไหนแตะข้อมูล production ของ order/booking ที่มีสถานะ active — ถามนโยบายก่อนแก้ทุกครั้ง (บทเรียนจาก 28/08)
