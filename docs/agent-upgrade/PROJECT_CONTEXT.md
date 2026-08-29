# Project Context: KMO LINE Chat Agent Upgrade

**Last Updated:** 2026-08-29 — documentation truth reconciliation
**Current Phase:** Phase 1–4 CLOSED in production; monitoring continues. Phase 5 — LINE Image Understanding is NOT STARTED and requires a separate brief.
**Progress:** Phase 1–4 implementation/deploy complete; production model hardening complete through HEAD `927c18d`; documentation truth reconciliation completed 2026-08-29.
**Next Session:** create and approve the Phase 5 brief only after this documentation reconciliation is committed cleanly.

---

## 🎯 สถานะปัจจุบัน

### Phase Status Ledger

| Phase | Status | Production | Docs synced |
|---|---|---:|---:|
| Phase 1 — Identity Model Fix | CLOSED | Yes | Yes |
| Phase 2 — Model Eval / Selection | CLOSED | N/A | Yes |
| Phase 3 — Agent Tool-Calling Loop | CLOSED | Yes | Yes |
| Phase 4 — Reply-First / Push-Fallback | CLOSED (monitoring limitation recorded) | Yes | Yes |
| Phase 5 — LINE Image Understanding | NOT STARTED | No | Brief pending |


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

**Production data ที่แก้ไม่ได้ครบ:** ระหว่างแก้ crash bug ด้านบน migration รอบแรก (ที่ถูกแทนที่แล้ว) ได้เขียนทับ `start_date`/`due_date` ของ 3 order ที่ยังทำอยู่จริง (`ORD-20260816-F750`, `ORD-20260802-2DF5`, `ORD-20260822-46DE`) — **✅ CEO ใส่ค่าที่ถูกต้องเองแล้ว 2026-08-28 (~17:59 ICT)**: Mei Fern start 08-26/due 08-30, อรรถพล(F750) 08-27/08-27, ช่างเบส 08-28/08-28. ปิดเคสนี้ (หมายเหตุ: F750 กับ 46DE start=due วันเดียวกัน — ถ้าตั้งใจ = งานรีบ 1 วัน ก็โอเค)

### เสร็จแล้ว (Implementation — 2026-08-28 session 2)

| Phase | งาน | Commit | Verify |
|---|---|---|---|
| 1 | `customers.line_display_name` แยกจาก `name`; helper `upsertLineCustomer`; trigger comment; migration `20260828160000` | 38efad7 | 29 line customers มี line_display_name ครบ; 8 ที่โดนทับ (K.9=บุณยสิทธิ์ ฯลฯ) กู้ชื่อ LINE จริงจาก getProfile() แล้ว |
| 1 | admin-line-reply + staff-reply แสดง 2 ชื่อ | 38efad7 | staff-reply `list` คืน line_display_name, ทดสอบด้วย anon key ของหน้าจริง — เห็น "บุณยสิทธิ์ วรุตม์พงศ์ / LINE:K.9" |
| 2 | Eval + production model selection | d294b30 / b317d22 / 423794c | initial Gemma eval ผ่าน แต่ final head-to-head เลือก `deepseek-v4-flash:0731-cloud`; เพิ่ม degenerate guard + Gemini fallback |
| 3 | Agent loop (`generateLineReplyAgent`, ≤3 รอบ), 3 tools (`search_products`,`get_order_status`,`check_queue`), FAQ inline | b083cd1 | E2E signed webhook → 200, agent เรียก tool + ตอบจริง (4.7s). exclusive-once-linked: stranger เห็น 0 rows, เจ้าของเห็น 1 |
| 3 | `getCustomerContext` exclusive-once-linked (แยก own vs phone-unlinked query แทน OR) | b083cd1 | SQL proof |
| 4 | Reply-first → Push-fallback เมื่อ LINE Reply ล้มเหลว | 9a6e194 | handler path อยู่ใน production; ยังไม่เจอ expired reply token จริง จึงคงเป็น monitoring limitation |

### Post-deploy AI hardening (2026-08-28/29)

| งาน | Commit | Current truth |
|---|---|---|
| ป้องกัน token-loop / repeated-chunk garbage | 423794c | `isDegenerateText()` guard ทำให้ Ollama failure ตกไป Gemini fallback |
| สลับ production model เป็น DeepSeek dated tag | d294b30 | `deepseek-v4-flash:0731-cloud` คือ chat/agent model ปัจจุบัน |
| บันทึก final model-eval verdict | b317d22 | `phase2-model-eval.md` ต้องอ่าน final addendum เป็น authoritative verdict |
| ใส่ current Thai date ใน system prompt | 92bc3f5 | ลดการตีความ due/pickup date ผิดบริบทเวลา |
| log คำตอบ AI สำเร็จ | 927c18d | มี success logging สำหรับ post-deploy monitoring ไม่ใช่ log เฉพาะ error |

### ⚠️ Incident (session 2) — verify_jwt reset

`supabase functions deploy --use-api` reset `verify_jwt` → `true` (default) ทุกครั้ง เพราะไม่มี `supabase/config.toml` pin ไว้ → LINE/Telegram webhook โดน gateway ตอบ 401 (ไม่มี JWT). line-webhook เป็น `true` อยู่ ~1 ชม. ระหว่าง deploy Phase 1 จนพบและแก้ (ข้อความ LINE ในช่วงนั้น AI ไม่ตอบ — ปริมาณต่ำ, ตรวจ log ไม่ได้เพราะ Supabase logs API ล่มตอนนั้น). แก้: สร้าง `supabase/config.toml` pin `verify_jwt=false` ให้ line-webhook/telegram-webhook/telegram-notify (commit 32dbca7). ยืนยันแล้วว่า deploy รอบถัดไป verify_jwt ยัง false.

---

## 📝 Last Session Summary

**Session 3 — 2026-08-29 (truth reconciliation + pre-Phase 5 verification)**
- ✅ Reconciled docs against production code/HEAD `927c18d`: chat model is DeepSeek, not Gemma; degenerate guard + Gemini fallback + success logging are live.
- ✅ Verified `gemma4:31b-cloud` image capability directly through Ollama native `/api/chat` and OpenAI-compatible `/v1/chat/completions`; controlled images were read correctly with no degenerate output in the test set.
- ✅ Confirmed current LINE webhook only processes `message.type === "text"`; image handling is not implemented yet.
- ⛔ No Phase 5 code started. Next action after clean docs commit is a separate Phase 5 brief.

**Session 2 — 2026-08-28 (implementation)**
- ✅ Phase 1–4 ทั้งหมด: build + deploy production + verify (ดูตาราง "เสร็จแล้ว" ด้านบน) commits 38efad7 / b083cd1 / 9a6e194
- ✅ Phase 2 initial eval พิสูจน์ว่า Gemma tool-calling ได้; subsequent head-to-head + production hardening สรุป final เป็น `deepseek-v4-flash:0731-cloud` (`phase2-model-eval.md`)
- ⚠️ Incident: deploy รีเซ็ต verify_jwt → true, LINE webhook เงียบ ~1 ชม. แก้ด้วย `supabase/config.toml` (commit 32dbca7)
- บทเรียน: ทุก `supabase functions deploy` ต้องเช็ค verify_jwt หลัง deploy จนกว่าจะมั่นใจ config.toml ครอบคลุมทุก fn

**Session 1 — 2026-08-28 (discovery)**

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
1. **Immediate — documentation gate:**
   - [x] Reconcile Phase 1–4 docs ให้ตรง production model/tool/runtime truth
   - [ ] ตรวจ diff + consistency แล้ว commit documentation reconciliation ให้ working tree clean
   - [ ] หลังจากนั้นค่อยสร้าง **BRIEF Phase 5 — LINE Image Understanding**; ห้ามเริ่ม implementation ก่อน brief ถูกล็อก

2. **Standing production monitoring:**
   - [ ] ตรวจ success logs ของ DeepSeek agent ต่อเนื่อง: tool discipline, hallucination, degenerate output/fallback, latency
   - [ ] เก็บ evidence ถ้า Reply ล้มเหลวและ Push fallback ถูกใช้จริง
   - [ ] Push quota tracking — ยัง deferred เพราะ usage ต่ำ

3. **Deferred / separate scopes:**
   - [ ] Facebook Messenger integration
   - [ ] pgvector semantic search
   - [ ] "ลูกค้าเลือกวันติดตั้งเอง" ใน CustomerOrder.html — ต้องออกแบบ schema/queue policy แยก

---

## ❓ Open Questions / Decisions Needed

| คำถาม | ต้องตัดสินใจเมื่อ | Impact |
|---|---|---|
| Phase 5 จะกำหนด image input contract / size limit / structured vision output / failure path อย่างไร | ตอนเขียน Phase 5 brief | ป้องกัน vision output กลายเป็น business truth โดยไม่ผ่าน DeepSeek/tools |
| Push quota tracking (นับ+แจ้งเตือนใกล้เต็ม 300/เดือน) | ยังไม่ต้องตอนนี้ (usage ต่ำ) | รอปริมาณแชทโตขึ้นค่อยทำ |
| "ลูกค้าเลือกวันติดตั้งเอง" ออกแบบยังไงให้เข้ากับตัวจัดคิวผลิต | ก่อนเริ่มแก้ CustomerOrder.html | ต้อง session แยกออกแบบ schema |

---

## 📁 ไฟล์สำคัญในโปรเจค

| ไฟล์ | Path | หน้าที่ |
|---|---|---|
| PRD.md | `./PRD.md` | ภาพรวม/ขอบเขต/สถาปัตยกรรม |
| implementation_plan.md | `./implementation_plan.md` | ขั้นตอนทำจริง + verification |
| line-webhook | `../../supabase/functions/line-webhook/index.ts` | agent loop entry + reply/push fallback |
| line-agent-tools.ts | `../../supabase/functions/_shared/line-agent-tools.ts` | tool schemas + executors (search_products / get_order_status / check_queue) |
| ai-providers.ts | `../../supabase/functions/_shared/ai-providers.ts` | `generateLineReplyAgent` (tool loop) + `generateLineReply` (single-shot) + Gemini fallback |
| customer-context.ts | `../../supabase/functions/_shared/customer-context.ts` | `getCustomerContext` (exclusive-once-linked) + `upsertLineCustomer` (identity) |
| config.toml | `../../supabase/config.toml` | pins verify_jwt=false for webhook fns — DO NOT delete |
| phase2-model-eval.md | `./phase2-model-eval.md` | model selection + pre-Phase 5 vision capability evidence |
| DEVELOPMENT_WORKFLOW.md | `./DEVELOPMENT_WORKFLOW.md` | canonical phase workflow + gates |

---

**Template Version:** adapted from project-templates v1.0 (ตัดส่วน Hermes/OpenClaw mailbox ออกเพราะไม่ใช้ในโปรเจกต์นี้)
**Last Edited By:** GPT-5.6 Sol (2026-08-29 truth reconciliation)
