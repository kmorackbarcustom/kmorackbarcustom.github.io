# PRD: KMO LINE Chat Agent Upgrade (Tool-Calling + Identity Model Fix)

**Project Owner:** Gutumrod (คุณฟรี)
**Execution:** Claude Code, working directly in `kmorackbarcustom.github.io`
**Created:** 2026-08-28
**Last Updated:** 2026-08-29 — documentation truth reconciliation after production hardening

---

## 1. Objective

**ปัญหาที่ต้องการแก้:**
- `line-webhook` ตอบลูกค้าแบบ single-shot prompt — code เดา context ล่วงหน้า (ILIKE keyword match) ยัดเข้า prompt ทุกครั้งไม่ว่าจำเป็นหรือไม่ ไม่มีทางให้โมเดลเลือกดึงข้อมูลเองตามคำถามจริง
- ตัวตนลูกค้าสับสนระหว่างช่องทาง — `customers.name` ถูกเขียนทับกันเองระหว่าง "ชื่อ LINE จริง" (จาก `getProfile()`) กับ "ชื่อจริงจากฟอร์มจอง" (จาก trigger `kmo_sync_customer_from_booking`) แล้วแต่ event ไหนมาถึงหลังสุด — ยืนยันแล้วว่ากระทบจริง 7/28 ลูกค้าที่มี line_uid (25%)
- กติกาจับคู่ตัวตนตอนนี้ (line_uid หรือเบอร์โทร แบบ OR ไม่มีเงื่อนไข) เปิดช่องให้คนพิมพ์เบอร์คนอื่นแล้วเห็น/แย่งผูก booking ของคนอื่นได้

**เป้าหมาย:**
- เปลี่ยน AI ตอบแชทจาก single-shot prompt → **agent แบบ tool-calling** (read-only เฟสแรก) เรียกข้อมูลตามที่จำเป็นจริง แม่นยำกว่าเดิม ไม่ใช่ยัดทุกอย่างล่วงหน้า
- แก้ identity model ให้ "ชื่อ LINE" กับ "ชื่อจริง" แยกกันถาวร ไม่ชนกันได้อีก ไม่ว่า event จะมาลำดับไหน
- ปิดช่องโหว่การสวมสิทธิ์ผ่านเบอร์โทร โดยไม่ทำลาย fallback ที่จำเป็น (95% ของ booking ไม่มี line_uid ตั้งแต่ต้น)
- วางรากฐานให้ขยายรองรับ Facebook Messenger ได้ในอนาคต (ไม่ทำในเฟสนี้ แต่ schema ต้องไม่ปิดทาง)

**ขอบเขตที่ส่งขึ้น production แล้ว (Phase 1–4):**
- Agent tools 3 ตัว (read-only): `search_products`, `get_order_status`, `check_queue`; FAQ ยังคงเป็นข้อมูลคงที่ใน system prompt ไม่ใช่ tool แยก
- Identity model: เพิ่ม `customers.line_display_name`, แก้ trigger, backfill 8 คนที่ตรวจพบจริงว่าชื่อ LINE ถูกทับ
- กติกาจับคู่ตัวตนใหม่: line_uid exclusive เมื่อผูกแล้ว, เบอร์โทร fallback ได้แค่ตอนยังไม่เคยผูก (one-time claim)
- Reply/Push strategy: พยายามตอบผ่าน Reply (ฟรี ไม่กินโควตา) ก่อนเสมอ, fallback ไป Push (กินโควตา 300/เดือน) เฉพาะเมื่อใกล้หมดเวลา reply token จริงๆ
- จำกัด tool-call loop ไม่เกิน 3 รอบ

**นอกขอบเขต (ไม่ทำเฟสนี้ — เก็บไว้อนาคต):**
- Write tools (จองจริง/ยกเลิกจริงผ่าน agent) — รอดูผลเฟส read-only ก่อน
- Facebook Messenger integration เต็มรูป (ต้องมี Facebook App + App Secret + ผ่าน Meta App Review ก่อน — ยังไม่ได้เตรียม)
- pgvector / semantic search แทน ILIKE keyword match — ใช้ FAQ เดิม (4 ข้อ) ไปก่อน พอโตค่อยอัปเกรด
- LINE image/vision understanding — ยังไม่ใช่ production feature; `gemma4:31b-cloud` ผ่าน capability verification ด้านภาพแล้วเมื่อ 2026-08-29 แต่ต้องทำเป็น Phase ถัดไปพร้อม brief/eval แยก
- ย้ายระบบ booking/order ไป SaaS Product Hub (BK01) — ตรวจสอบแล้ว (28/08) ว่า BK01 เองอยู่ระหว่าง truth-reconciliation เรื่องความสมบูรณ์ และยังไม่มี concept "ออเดอร์สั่งผลิต" เลย ตัดสินใจเดินหน้าระบบเดิมต่อ ไม่รอ
- "ลูกค้าเลือกวันติดตั้งเอง" สำหรับ CustomerOrder.html — ยืนยันแล้วว่าต้องการ (เหมือน `bookings.appointment_date`) แต่ยังไม่ได้ออกแบบ schema/validation กับตัวจัดคิวการผลิต — ต้องคุยรายละเอียดเป็นงานแยกก่อนเริ่ม

---

## 2. Architecture

### แนวคิด: agent ยังคงอยู่ใน Supabase Edge Function เดิม — ไม่ย้ายไป Hermes/OpenClaw

ตรวจสอบแล้ว (28/08) ว่า Hermes เป็น local process รันผ่าน PowerShell บนเครื่อง CEO เอง (`start-hermes-gateway.vbs`) และ OpenClaw เป็น session-based agent (ต้อง bootstrap ใหม่ทุก session) — **ทั้งคู่ไม่ใช่ always-on public service** ถ้าเอามารับ LINE webhook จริง ลูกค้าทักตอนปิดเครื่อง/session ไม่ทำงานจะไม่มีใครตอบเลย จึงคงสถาปัตยกรรมเดิมไว้: Supabase Edge Function (`line-webhook`) always-on, public HTTPS, ตอบเร็วพอสำหรับ LINE reply token

### Component Stack

| Component | Technology |
|-----------|------------|
| Webhook / Agent runtime | Supabase Edge Function (`line-webhook`, Deno) |
| Model หลัก (production chat/agent) | `deepseek-v4-flash:0731-cloud` ผ่าน Ollama Cloud |
| Model สำรอง | Gemini 2.5 Flash — single-shot fallback เมื่อ Ollama ล้มเหลว/ตรวจพบ degenerate output |
| Vision candidate (ยังไม่ production) | `gemma4:31b-cloud` — verified image-capable 2026-08-29; รอ Phase ถัดไป |
| Data store | Supabase Postgres (project `xfhpwxjywqgqefbncumm`) |
| ส่งข้อความ | LINE Messaging API — Reply (หลัก, ฟรี) + Push (สำรอง, กินโควตา 300/เดือน) |
| Staff console | `admin-line-reply.html` → `staff-reply` edge function |

### Data flow (production Phase 3–4)

```
ลูกค้า → LINE → line-webhook (Deno)
                   ↓
         agent loop (โมเดลเลือกเรียก tool เอง, ≤3 รอบ)
                   ↓
    ┌──────────────┼──────────────┐
search_products  get_order_status  check_queue
   (tool)             (tool)          (tool)
FAQ/shop facts อยู่ใน system prompt ไม่ใช่ tool แยก
                   ↓
         ตอบผ่าน Reply ก่อน → ถ้า Reply ล้มเหลว → Push fallback
```

---

## 3. Identity Model (ส่วนที่ผนวกเข้ามาระหว่างทาง — บั๊ก K.9)

**ปัญหาที่ยืนยันแล้ว:** `customers.name` ถูกเขียนทับระหว่าง "ชื่อ LINE" (`line-webhook` เขียนตอน follow/first message) กับ "ชื่อจริงจากฟอร์มจอง" (trigger `kmo_sync_customer_from_booking` เขียนตอน backfill line_uid) — ใครมาทีหลังชนะ ไม่มี field แยก

**แก้ไข:**
1. เพิ่ม `customers.line_display_name` — เขียนได้จาก `line-webhook`/`getProfile()` เท่านั้น
2. แก้ `kmo_sync_customer_from_booking` — เขียนแค่ `name`/`phone` ห้ามแตะ `line_display_name`
3. Backfill ชื่อ LINE จริงกลับให้ 8 คนที่ตรวจพบจริงและโดนทับไปแล้ว (ดึงผ่าน `getProfile()` อีกครั้งจาก `line_uid` ที่มีอยู่)
4. `admin-line-reply.html` แสดงทั้งสองชื่อคู่กัน เช่น `K.9 (บุณยสิทธิ์ วรุตม์พงศ์)`

**กติกาจับคู่ตัวตนใหม่** (ใช้กับ tool เช็คสถานะออเดอร์ด้วย):

| สถานะ booking/order | กติกา |
|---|---|
| ยังไม่มี `line_uid` (95% ของข้อมูล) | จับคู่ด้วยเบอร์โทรได้ — แต่จับคู่ได้ครั้งเดียวเพื่อผูก line_uid ถาวร |
| มี `line_uid` ผูกแล้ว | ห้ามใช้เบอร์โทรแซง/ทับอีก ต้องตรง line_uid เท่านั้น |

---

## 4. Success Criteria

- [x] Agent เรียก tool ได้จริงผ่าน production `deepseek-v4-flash:0731-cloud`; tool loop จำกัดไม่เกิน 3 รอบ
- [x] ลูกค้าถามสถานะออเดอร์ได้คำตอบจาก tool จริง ไม่ใช่คำตอบลอยๆ
- [x] คนพิมพ์เบอร์คนอื่นที่มี `line_uid` ผูกแล้วไม่สามารถอ่านสถานะของเจ้าของได้
- [x] ลูกค้า 8 รายที่ชื่อ LINE ถูกทับได้รับ `line_display_name` กลับคืน และ staff เห็นทั้งชื่อจริง/ชื่อ LINE
- [x] Reply เป็น path หลัก และมี Push fallback เมื่อ Reply ล้มเหลว
- [x] มี degenerate-output guard และ Gemini fallback ก่อนส่งข้อความเสียให้ลูกค้า

**Known limitation:** Push fallback ผ่าน logic/integration path แล้ว แต่ยังไม่มีหลักฐานจาก reply token ที่หมดอายุจริงใน traffic production; ให้ติดตามผ่าน monitoring ต่อเนื่อง.

---

## 5. Risks & Mitigation

| ความเสี่ยง | ผลกระทบ | วิธีแก้ |
|-----------|----------|----------|
| Ollama model อาจเสื่อม/retire หรือพ่น degenerate output | ลูกค้าได้คำตอบผิด/ขยะ หรือ agent ล้ม | Production ใช้ `deepseek-v4-flash:0731-cloud`; มี `isDegenerateText()` guard + Gemini fallback + success logging และต้อง monitor traffic จริงต่อเนื่อง |
| Push quota 300/เดือน หมดถ้าใช้พร่ำเพรื่อ | ลูกค้าตอบไม่ได้กลางเดือน | Reply เป็นทางหลักเสมอ, Push แค่ทางสำรอง; พิจารณานับ usage ถ้าปริมาณโตขึ้นจริง (ตอนนี้ 40 ข้อความทั้งหมด ยังไม่ต้องรีบ) |
| Trigger sync เขียนทับ identity ผิดอีกในอนาคตถ้ามีคนแก้โดยไม่รู้ที่มา | ชื่อ LINE หายซ้ำแบบ K.9 | Comment เตือนในโค้ด + memory ผูกไว้ |
| `internal-proxy` policy ถูกล็อกไว้ ต้องขออนุญาตก่อนแก้ทุกครั้ง | งานล่าช้าถ้าลืมขอ | เช็ค [[internal-proxy-locked]] ก่อนแตะไฟล์นั้นเสมอ |

---

## 6. Phase Status Ledger

| Phase | Status | Production | Docs synced |
|---|---|---:|---:|
| Phase 1 — Identity Model Fix | CLOSED | Yes | Yes |
| Phase 2 — Model Eval / Selection | CLOSED | N/A | Yes |
| Phase 3 — Agent Tool-Calling Loop | CLOSED | Yes | Yes |
| Phase 4 — Reply-First / Push-Fallback | CLOSED (monitoring limitation recorded) | Yes | Yes |
| Phase 5 — LINE Image Understanding | NOT STARTED | No | Brief pending |

---

## 7. Related Documents

- `PROJECT_CONTEXT.md` — ความคืบหน้า, incident log ของ session 2026-08-28
- `implementation_plan.md` — as-built execution record ของ Phase 1–4
- `DEVELOPMENT_WORKFLOW.md` — canonical Docs → Brief → Build → Verify → Docs cycle

---

**สถานะ:** Phase 1–4 CLOSED / production current as of 2026-08-29; Phase 5 NOT STARTED — brief pending
**Priority:** High
