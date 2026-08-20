# Task: หา + แก้สาเหตุ AI ตอบลูกค้าไม่สม่ำเสมอ ("ตอบได้บ้าง ไม่ได้บ้าง") ใน `line-webhook`

> เขียน 2026-08-20 โดย Claude (จาก session ของ `saas-product-hub` — อ่านโค้ด `line-webhook`/
> `_shared/ai-providers.ts`/`_shared/line-session-store.ts` จาก repo นี้ตรงๆ ผ่าน GitHub API ไม่ได้
> รันจริง ไม่มี log การใช้งานจริงให้ดู) — สั่งงานให้ Codex ไปตรวจและแก้ ให้เจ้าของงานนี้ (ผู้ดูแล KMO
> LINE OA) รีวิว diff ก่อน apply

---

## Goal

เจ้าของร้าน (CEO) รายงานว่า AI ในไลน์ตอบลูกค้าไม่สม่ำเสมอ — "ตอบได้บ้าง ไม่ได้บ้าง" ไม่รู้สาเหตุแน่ชัด
งานนี้คือ **ไปตรวจ 4 สมมติฐานด้านล่างกับสถานะจริงของระบบ (DB/logs/settings) แล้วแก้จุดที่พิสูจน์ว่าเป็นสาเหตุจริง**
ไม่ใช่แก้ทุกจุดแบบเดา — แต่ละข้อมีวิธีตรวจสอบที่ชัดเจนอยู่แล้ว ทำตามลำดับ

**Non-goal:** ไม่แตะ business logic เฉพาะร้าน (safety rules ในลิงก์จองคิว/สั่งผลิต, product matching,
queue density) เว้นแต่การตรวจสอบด้านล่างพิสูจน์ว่าจุดนั้นเป็นสาเหตุจริง

---

## 4 สมมติฐาน เรียงตามน้ำหนักหลักฐาน (จากอ่านโค้ดตรงๆ ใน `supabase/functions/`)

### 1. โมเดล AI หลักเป็น `gemma4:31b-cloud` (ไม่ใช่ flagship) — น่าจะเป็นสาเหตุหลัก

`_shared/ai-providers.ts`: ทุกคำตอบมาจาก Ollama Cloud โมเดล `gemma4:31b-cloud` ก่อนเสมอ Gemini เป็นแค่
fallback ตอน Ollama **error** เท่านั้น (ไม่ได้สลับเพราะคำตอบแย่) system prompt ที่ยัดให้โมเดลอ่านต่อ 1
ครั้ง (`buildSystemPrompt` ใน `line-webhook/index.ts`) ยาวและซับซ้อนมาก — รวม safety rules + FAQ +
สินค้าที่ match + คิวงาน + customer context ในครั้งเดียว โมเดลขนาด 31B ตาม instruction ซับซ้อนหลายชั้น
พร้อมกันได้ไม่เสถียรเท่าโมเดล flagship

**วิธีตรวจ:** เก็บตัวอย่างคำถามลูกค้าจริง 15-20 ข้อที่ CEO บอกว่า "ตอบแย่/ไม่ตอบ" ลองยิงซ้ำ system
prompt เดียวกันผ่าน Gemini ตรงๆ (ไม่ผ่าน Ollama) เทียบผลลัพธ์ ถ้า Gemini ตอบถูกต้อง/สม่ำเสมอกว่าชัดเจน
= ยืนยันว่าโมเดลคือสาเหตุ

**ถ้ายืนยันแล้ว แก้ยังไง:** พิจารณาสลับ Gemini เป็นตัวหลัก (ไม่ใช่ fallback), หรือลด system prompt ให้
สั้น/ตรงประเด็นกว่านี้ (ตัดส่วนที่ไม่จำเป็นต่อคำถามนั้นๆ ออกแบบ dynamic แทนยัดทุกอย่างทุกครั้ง)

### 2. ข้อมูล FAQ/สินค้าใน DB น้อยเกินไป — CEO เดาเองว่าอาจใช่

โค้ดสั่งห้าม AI เดาราคา/ข้อมูลสินค้าที่ไม่อยู่ใน DB เด็ดขาด (`buildSystemPrompt`: "ห้ามเดาราคาสินค้าที่
ไม่อยู่ในรายการนี้") เป็น anti-hallucination ตั้งใจ — ถ้า `shop_faqs`/`products` มีน้อย บอทจะตอบไม่ได้จริง
ไม่ใช่บั๊ก

**วิธีตรวจ:** `select count(*) from shop_faqs`, `select count(*) from products` เทียบกับจำนวนคำถามที่
ลูกค้าถามจริงในรอบ 1-2 สัปดาห์ (ดึงจาก `line_chat_sessions.history` หรือ log ถ้ามี) — กี่ % ของคำถามที่
ไม่มีคำตอบ/สินค้าตรงในระบบเลย

**ถ้ายืนยันแล้ว แก้ยังไง:** เพิ่มข้อมูลใน `shop_faqs`/`products` ตามคำถามที่พบบ่อยที่สุดที่ยังไม่มีคำตอบ
ไม่ใช่งานแก้โค้ด เป็นงาน data entry ที่ CEO/staff ต้องทำเอง

### 3. มีสวิตช์ที่ทำให้ "เงียบสนิท ไม่ตอบเลย" (ต่างจาก "ตอบแย่")

`line-webhook/index.ts`:
- `settings.line_ai_rollout` ถ้าเป็น `"owner_only"` → ตอบเฉพาะ `settings.line_ai_owner_uid` คนเดียว
  ลูกค้าคนอื่นเงียบสนิท (ไม่มี reply ใดๆ เลย ไม่ใช่แค่ fallback message)
- `customers.paused_until` ถ้า staff เคยกด pause ลูกค้าคนไหนไว้ (เช่นตอนรับสายเอง) แล้วลืมปลด →
  ลูกค้าคนนั้นเงียบสนิทจนกว่าจะหมดเวลา pause

**วิธีตรวจ:** `select line_ai_rollout, line_ai_owner_uid from shop_settings` (หรือตาราง settings จริง) +
`select line_uid, paused_until from customers where paused_until > now()` — ถ้ามีลูกค้าค้าง pause อยู่
เยอะ หรือ rollout ไม่ใช่ `"all"` นี่คือสาเหตุตรงของ "บางคนไม่ได้รับคำตอบเลย"

**ถ้ายืนยันแล้ว แก้ยังไง:** ปรับ `line_ai_rollout` ตามที่ CEO ต้องการจริง, สร้าง admin UI/query สำหรับดู
รายชื่อ paused customers เป็นระยะ (กัน pause ค้างลืมปลด)

### 4. ไม่มี timeout บน call AI — เสี่ยงตอบช้ามาก ไม่ใช่ไม่ตอบ

`callOllamaCloud`/`callGeminiFallback` ใน `_shared/ai-providers.ts` ไม่มี timeout เลย ถ้า Ollama Cloud
ช้า ระบบรอเฉยๆ จนกว่า LINE เองจะ timeout การเชื่อมต่อ (LINE คาดหวัง response ภายในไม่กี่วินาที) —
อาจโผล่เป็น "พิมพ์ไปแล้วเงียบนานผิดปกติ" ไม่ใช่ "ไม่ตอบเลย"

**ถ้ายืนยันแล้ว แก้ยังไง:** ใส่ `AbortController` + timeout (แนะนำ 8-10 วิ) บนทั้ง 2 provider call, ถ้า
timeout ให้ throw แล้วปล่อยให้ fallback chain เดิมทำงาน (ไป Gemini หรือ fallback message)

---

## ส่งกลับอะไร

1. ผลตรวจแต่ละข้อ (ยืนยัน/ตัดออก) พร้อมหลักฐาน (query result, ตัวอย่าง log, หรือผล A/B เทียบโมเดล)
2. Diff จริงสำหรับข้อที่ยืนยันแล้วว่าเป็นสาเหตุและแก้แล้ว
3. ถ้าข้อ 1 (โมเดล) ยืนยันและแก้โดยสลับ Gemini เป็นหลัก — บอก cost/latency ที่เปลี่ยนไปด้วย เพราะ
   Gemini กับ Ollama Cloud ราคาคนละแบบ

## สำหรับทีม saas-product-hub (ไม่ใช่ส่วนของ Codex)

ถ้าจุดไหนพิสูจน์แล้วว่าเป็น "ช่องว่างที่โมดูลกลาง (`line-oa-ai-module`) ควรมี" (ไม่ใช่ business logic
เฉพาะร้าน) เช่น timeout wrapper บน AI adapter call เป็น pattern ทั่วไปที่ทุก host ควรมี — ให้กลับไปเขียน
เป็นแผนใน `modules-hub/modules/line-oa-ai-module/DESIGN.md` แบบ generalize ไม่ผูก provider ใดๆ
เหมือนที่ทำกับ persistent session store ไปแล้ว ไม่ใช่ copy โค้ดจาก repo นี้ตรงๆ กลับไปใส่ core
