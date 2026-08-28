# Project Context: KMO LINE Chat Agent Upgrade

**Last Updated:** 2026-08-28
**Current Phase:** Phase 0 — Discovery complete, plan drafted, not yet built
**Progress:** Planning 100% / Implementation 0%
**Next Session:** เริ่ม Phase 1 ตาม `implementation_plan.md` (รอ CEO อนุมัติแผนก่อน)

---

## 🎯 สถานะปัจจุบัน

### เสร็จแล้ว (Completed — 2026-08-28, นอกขอบเขต agent upgrade แต่ทำระหว่างเซสชันเดียวกัน)

| งาน | หมายเหตุ |
|---|---|
| แก้ AI มั่วลิงก์แผนที่ (commit 2623d0c) | เพิ่มกฎห้ามแต่ง URL/เบอร์ขึ้นเองใน LINE_AI_SAFETY_RULES |
| แก้ line-webhook 401 (verify_jwt) | flip เป็น false, deploy แล้ว — AI ตอบ LINE ได้ปกติ |
| แก้ internal-proxy 403 บน system_settings (commit 35582f5) | เพิ่ม GET-only carve-out ให้ admin-shop-config โหลดได้ |
| ล็อก internal-proxy ต้องขออนุญาตก่อนแก้ (commit 46985a9) | ตาม CEO instruction — ดู memory [[internal-proxy-locked]] |
| แก้ bookingdashboard รูปโหลดไม่ขึ้น (commit dd2669a) | เพิ่ม `booking-images` เข้า storage allowlist |
| แก้ lightbox กดดูรูปใหญ่ไม่ได้ (commit 037ce04) | onclick เดิมพังจาก JSON.stringify quote ชนกับ HTML attribute |
| รวมรหัสร้าน KMO เหลือ `kmo2017` ตัวเดียว | unify internal-proxy verifier + staff-reply STAFF_PASSCODE secret |
| แก้ rebuild_production_schedule crash (commit 8106827 + migration ตามหลัง) | order ค้าง in_progress เกิน due_date เคยล้มทั้งระบบ ตอนนี้ skip เฉยๆ ไม่แตะข้อมูล order |

### ⚠️ ปัญหาที่ยังไม่จบ (ต้อง CEO ทำเอง)

**Production data ที่แก้ไม่ได้ครบ:** ระหว่างแก้ crash bug ด้านบน migration รอบแรก (ที่ถูกแทนที่แล้ว) ได้เขียนทับ `start_date`/`due_date` ของ 3 order ที่ยังทำอยู่จริง (`ORD-20260816-F750`, `ORD-20260802-2DF5`, `ORD-20260822-46DE`) กู้คืนได้แค่ 1 ตัว (มีค่าบันทึกไว้ก่อนแก้) — **อีก 2 ตัว (Mei Fern, ช่างเบส) ค่าจริงหายไปแล้ว ไม่มี PITR กู้คืน (free tier)** CEO แจ้งว่าจะใส่ค่าที่ถูกต้องเอง — **ยังไม่ยืนยันว่าทำแล้วหรือยัง**

### ยังไม่ได้ทำ (Pending — scope ของเอกสารนี้)

| Phase | Tasks | Priority |
|---|---|---|
| Phase 1 | Identity model fix (line_display_name แยกจาก name) | High |
| Phase 1 | กติกาจับคู่ line_uid/เบอร์โทร แบบ exclusive-once-linked | High |
| Phase 2 | Eval gemma4 vs Gemini/DeepSeek เรื่อง tool-calling + rule-adherence | High (blocker ก่อน build agent) |
| Phase 3 | Agent tool-calling loop (3 tools, ≤3 รอบ) | High |
| Phase 4 | Reply-first / Push-fallback message strategy | Medium |

---

## 📝 Last Session Summary

**Session Date:** 2026-08-28

### ทำอะไรเสร็จไปบ้าง
- ✅ ไล่ debug + แก้บั๊ก production จริง 8 จุด (ตารางด้านบน)
- ✅ สัมภาษณ์ requirement เต็มรูปสำหรับ agent upgrade (5 หัวข้อ Vision → Data ตาม discovery-interview skill)
- ✅ ตรวจสอบทางเลือก Hermes/OpenClaw — สรุปว่าไม่เหมาะ (ไม่ใช่ always-on service)
- ✅ ตรวจสอบทางเลือกย้ายไป SaaS Product Hub (BK01) — สรุปว่ายังไม่พร้อม ไม่รอ
- ✅ ยืนยันกติกา identity/matching, tool-call round limit (3), Reply/Push strategy

### เจอปัญหาอะไร
- ⚠️ ผมยืนยันผิดว่า "ไม่มี order-status tool" ทั้งที่ `getCustomerContext` มีอยู่แล้ว — ต้องเปิดไฟล์อ่านจริงก่อนสรุป ไม่ใช่เดาจาก commit message
- ⚠️ แก้ crash bug เกินตัว — ไปเปลี่ยน due_date ของ order ที่ "กำลังทำอยู่จริง" ทั้งที่ควรแค่กันไม่ให้ crash เฉยๆ ไม่ควร mutate ข้อมูล production โดยไม่ถามก่อน
  - **บทเรียน:** แก้ crash-safety กับแก้ business data เป็นคนละเรื่อง ต้องแยกให้ชัดก่อนลงมือ โดยเฉพาะกับ order ที่มีสถานะ "active" อยู่

### บทเรียนที่ได้
- 💡 CEO ขอชัดเจน: เสนอแผนแก้ปัญหาเป็น**แผนระยะยาวเท่านั้น** ไม่เสนอกรอบ "เร็ว/ง่าย" อีก — บันทึกไว้ใน memory [[propose-longterm-only]]
- 💡 ก่อนแตะข้อมูล production ที่ "กำลังใช้งานจริง" (เช่น order ที่ in_progress) ต้องถามนโยบายก่อนเสมอ ไม่ตัดสินใจเอง

---

## 🚀 Next Steps

### ต้องทำอะไรต่อ (ลำดับความสำคัญ)
1. **High Priority:**
   - [ ] CEO ยืนยัน/แก้ due_date ของ Mei Fern (ORD-20260802-2DF5) และ ช่างเบส (ORD-20260822-46DE) ให้ตรงความจริง
   - [ ] CEO อนุมัติ `PRD.md` + `implementation_plan.md` ก่อนเริ่มโค้ดจริง
   - [ ] Eval gemma4:31b-cloud ว่ารองรับ tool-calling จริงไหม (ก่อน build ต่อ)

2. **Medium Priority:**
   - [ ] Backfill ชื่อ LINE ของ 7 ลูกค้าที่โดนทับ (K.9 และคนอื่น)

3. **Low Priority (deferred, ไม่ใช่เฟสนี้):**
   - [ ] Facebook Messenger integration (ต้องมี Facebook App/App Secret ก่อน)
   - [ ] pgvector semantic search
   - [ ] "ลูกค้าเลือกวันติดตั้งเอง" ใน CustomerOrder.html — ต้องคุยรายละเอียด schema ก่อน

---

## ❓ Open Questions / Decisions Needed

| คำถาม | ต้องตัดสินใจเมื่อ | Impact |
|---|---|---|
| gemma4:31b-cloud รองรับ tool-calling ดีพอไหม เทียบ DeepSeek/Gemini | ก่อนเริ่ม Phase 3 | เลือกโมเดลหลักของ agent |
| Push quota tracking (นับ+แจ้งเตือนใกล้เต็ม 300/เดือน) | ยังไม่ต้องตอนนี้ (usage ต่ำ) | รอปริมาณแชทโตขึ้นค่อยทำ |
| "ลูกค้าเลือกวันติดตั้งเอง" ออกแบบยังไงให้เข้ากับตัวจัดคิวผลิต | ก่อนเริ่มแก้ CustomerOrder.html | ต้อง session แยกออกแบบ schema |

---

## 📁 ไฟล์สำคัญในโปรเจค

| ไฟล์ | Path | หน้าที่ |
|---|---|---|
| PRD.md | `./PRD.md` | ภาพรวม/ขอบเขต/สถาปัตยกรรม |
| implementation_plan.md | `./implementation_plan.md` | ขั้นตอนทำจริง + verification |
| line-webhook | `../../supabase/functions/line-webhook/index.ts` | จุดที่ agent loop จะเข้าไปแทนที่ single-shot prompt |
| customer-context.ts | `../../supabase/functions/_shared/customer-context.ts` | ฟังก์ชันเดิมที่จะยกระดับเป็น tool เช็คสถานะออเดอร์ |
| ai-providers.ts | `../../supabase/functions/_shared/ai-providers.ts` | จุดสลับโมเดล (gemma4 ↔ DeepSeek/Gemini) |

---

**Template Version:** adapted from project-templates v1.0 (ตัดส่วน Hermes/OpenClaw mailbox ออกเพราะไม่ใช้ในโปรเจกต์นี้)
**Last Edited By:** Claude (session 2026-08-28)
