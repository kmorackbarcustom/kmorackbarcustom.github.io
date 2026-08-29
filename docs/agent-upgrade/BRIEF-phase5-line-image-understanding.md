# BRIEF — Phase 5: LINE Image Understanding

**Repository:** `kmorackbarcustom/kmorackbarcustom.github.io`
**Local:** `D:\AI-Workspace\projects\kmorackbarcustom.github.io`
**Branch:** `main`
**Baseline HEAD:** `1d9e58f` (`docs(line-ai): reconcile production truth and phase workflow`)
**Status:** APPROVED — CEO approved 2026-08-29; implementation authorized under this locked scope
**Workflow:** `DEVELOPMENT_WORKFLOW.md` Gate A applies

---

## 1. Objective

เพิ่มความสามารถให้ KMO LINE AI รับรูปจากลูกค้าในแชท 1:1 แล้วใช้รูปเป็นบริบทในการตอบ โดยคง production chat/agent model ปัจจุบัน (`deepseek-v4-flash:0731-cloud`) และใช้ `gemma4:31b-cloud` เป็น vision extractor เท่านั้น

เป้าหมายสำคัญ:
- ลูกค้าส่งรูปรถ/อุปกรณ์/ชิ้นส่วน/ข้อความบนภาพ แล้ว AI เข้าใจสิ่งที่มองเห็นในระดับช่วยสนทนาได้
- รูป follow-up ต้องต่อเนื่องกับ history ก่อนหน้า เช่น ลูกค้าถาม “รุ่นนี้ทำได้ไหม” แล้วส่งรูปตามมา
- ราคา, compatibility, order status, queue และ business truth ต้องยังมาจาก DeepSeek + tools/ข้อมูลจริง ไม่ใช่จาก Gemma vision
- ถ้า vision ล้มเหลว ลูกค้าต้องไม่เงียบ และต้องมี safe human-followup path

---

## 2. Verified Current Truth

- `line-webhook/index.ts` รับ AI เฉพาะ `event.message.type === "text"`; รูปถูก ignore อยู่ในปัจจุบัน
- `_shared/line.ts` ยังไม่มี LINE Content API binary download helper
- Production chat/agent model = `deepseek-v4-flash:0731-cloud`
- Gemini 2.5 Flash = text fallback ปัจจุบัน
- `isDegenerateText()` guard อยู่ใน production path แล้ว
- `gemma4:31b-cloud` vision ถูกยิงจริง 2026-08-29 ผ่านทั้ง Ollama native `/api/chat` และ OpenAI-compatible `/v1/chat/completions`; controlled cases `KMO 27`, `TEST 842`, `BIKE 913` อ่านได้ถูกและไม่พบ degenerate output ในชุดทดสอบนั้น
- `PostgresSessionStore` เก็บ history เป็น text เท่านั้น ซึ่งเหมาะกับการเก็บ structured observation แทน raw image
- Vendored `LineOaWebhookHandler` process AI เฉพาะ text message; Phase 5 ห้ามแก้ vendor module เพื่อเพิ่ม image support

---

## 3. Target Architecture

```text
LINE image webhook (signed)
        ↓
1:1 user + rollout/pause gate
        ↓
LINE Content API by messageId
        ↓
size cap + magic-byte MIME validation
        ↓
gemma4:31b-cloud (vision only)
        ↓
structured VisionObservation
        ↓
synthetic user context + existing session history
        ↓
deepseek-v4-flash:0731-cloud agent
        ↓
existing read-only tools when business truth is needed
        ↓
Reply first → Push fallback on Reply failure
```

Gemma output is **untrusted observation**, not authoritative business data.

## 4. In Scope

1. รับ `message.type === "image"` เฉพาะ `source.type === "user"`
2. โหลด binary จาก LINE Content API ด้วย `event.message.id`
3. รองรับเฉพาะ content ที่ LINE เป็นผู้ถือ (`contentProvider.type` absent/`line`); ห้าม server-side fetch external user URL
4. จำกัดรูปสูงสุด **10 MiB** และ enforce ทั้ง `Content-Length` (ถ้ามี) + streamed byte cap
5. ตรวจไฟล์จาก magic bytes; รองรับ JPEG / PNG / WebP เท่านั้น
6. ส่งรูปเข้า `gemma4:31b-cloud` ผ่าน Ollama OpenAI-compatible endpoint ที่ verify แล้ว
7. บังคับ vision response เป็น structured observation และ parse แบบ fail-closed
8. ส่ง observation ต่อให้ DeepSeek agent ตัวเดิมพร้อม session history + tools เดิม
9. บันทึก synthetic image observation ลง chat history แทน raw image/base64
10. ใช้ Reply-first / Push-fallback เดิม
11. เพิ่ม image rollout kill switch แยก: `line_ai_image_rollout = off | owner_only | all`, default `off`
12. เพิ่ม unit/integration tests + owner-only live E2E ก่อนเปิด `all`

---

## 5. Out of Scope

- เปลี่ยน production chat model ออกจาก DeepSeek
- เพิ่ม write tools / จอง / ยกเลิก / แก้ order ผ่านรูป
- image generation หรือ image editing
- เก็บรูปลง Supabase Storage/DB
- OCR pipeline แยกหรือ OCR เป็น authoritative source
- Gemini vision fallback ใน Phase 5; vision fail ให้ใช้ safe human fallback ก่อน
- group/room image handling
- video/audio/file/sticker handling
- admin UI สำหรับ image rollout
- pgvector / embedding จากรูป

## 6. Vision Contract

สร้าง type ใหม่ใน `_shared/vision.ts`:

```ts
type VisionConfidence = "low" | "medium" | "high";

type VisionObservation = {
  summary: string;
  visible_text: string[];
  vehicle_or_part_hints: Array<{
    label: string;
    confidence: VisionConfidence;
  }>;
  notable_details: string[];
  uncertainties: string[];
};
```

กติกา prompt ของ Gemma:
- บรรยายเฉพาะสิ่งที่มองเห็นหรืออ่านข้อความได้จากภาพ
- ห้ามตอบลูกค้า, ห้ามเสนอราคา, ห้ามตัดสิน compatibility, ห้ามแต่งข้อมูลร้าน
- ถ้าไม่แน่ใจให้ใส่ `uncertainties` และลด confidence
- visible text เป็น observation ที่อาจ OCR ผิด; ห้าม DeepSeek ถือเป็น fact 100%
- response ต้องเป็น JSON object ตาม contract เท่านั้น

Parser ต้อง reject empty/invalid shape/oversized fields และใช้ `isDegenerateText()` ก่อน parse.

## 7. LINE Content Download Contract

เพิ่ม helper ใน `_shared/line.ts` สำหรับ:

```text
GET https://api-data.line.me/v2/bot/message/{messageId}/content
Authorization: Bearer <LINE_CHANNEL_ACCESS_TOKEN>
```

Requirements:
- validate `messageId` ว่ามีค่าและใช้ `encodeURIComponent` ตอนประกอบ path
- timeout 8s
- non-2xx = throw typed/diagnosable error โดย log status แต่ห้าม log token/body binary
- ถ้า `Content-Length > 10 MiB` reject ก่อนอ่าน body
- ถ้าไม่มี/เชื่อถือ `Content-Length` ไม่ได้ ให้ stream และหยุดทันทีเมื่อเกิน 10 MiB
- detect JPEG/PNG/WebP จาก magic bytes; header `Content-Type` เป็น hint ไม่ใช่ authority เดียว
- return `{ bytes, mimeType, byteLength }`
- raw bytes ต้องอยู่ใน memory ชั่วคราวเท่านั้นและปล่อย reference หลัง vision call

ห้ามใช้ URL ที่มากับ webhook สำหรับ `contentProvider.type === "external"`; Phase 5 ตอบ safe fallback/ส่งต่อคนแทน เพื่อไม่เปิด SSRF surface.

---

## 8. Conversation / Session Behavior

Image path ต้องใช้ `PostgresSessionStore` เดิมและ `StateManager` เดิมโดย import มาใช้ ห้ามแก้ vendored handler.

Flow ต้อง mirror text path:
1. `getSession(userId)` ก่อน append current image
2. สร้าง synthetic user message จาก `VisionObservation` เช่น `[IMAGE_OBSERVATION] ...`
3. append synthetic message เข้า history
4. เรียก DeepSeek agent โดยส่ง **history ก่อน current image** + synthetic message เป็น `userMessage`
5. append assistant reply เข้า history

ผลคือรูป follow-up จะอ้างอิงข้อความก่อนหน้าได้ และข้อความถัดไปจะเห็น observation ของรูปโดยไม่ต้องเก็บรูปจริง

Synthetic message ต้องระบุชัด:
- “ข้อมูลต่อไปนี้เป็นการสังเกตจาก vision model อาจคลาดเคลื่อน”
- ห้ามใช้ observation เป็นราคา/compatibility/order/queue truth
- ถ้าคำถามต้องใช้ business truth ให้เรียก tool เดิม
- ถ้าระบุรุ่น/ชิ้นส่วนไม่มั่นใจ ให้ตอบเชิงความเป็นไปได้และขอข้อมูลเพิ่ม

---

## 9. Rollout / Kill Switch

เพิ่ม migration ใหม่ที่ insert setting เท่านั้น:

```text
line_ai_image_rollout = off
```

ไม่มี schema table ใหม่ และห้ามแก้ `internal-proxy`/admin UI เพื่อควบคุม setting นี้ใน Phase 5.

Rollout sequence:
1. deploy code while `line_ai_image_rollout=off`
2. verify text-chat regression + `verify_jwt=false`
3. set image rollout to `owner_only` ผ่าน controlled SQL/service-role path
4. owner ส่งรูปจริงและผ่าน Live E2E matrix
5. review logs/evidence
6. เปลี่ยนเป็น `all` เฉพาะเมื่อ Gate ผ่าน

ถ้ามีปัญหา production ให้ set `line_ai_image_rollout=off` เป็น rollback แรกโดยไม่กระทบ text AI.

---

## 10. Failure Behavior

กรณี download/validation/vision/parse fail:
- ห้ามเงียบ
- ห้ามส่ง raw exception ให้ลูกค้า
- ตอบข้อความ safe fallback ว่าอ่านรูปนี้ไม่สำเร็จและให้ทีมงานช่วยตรวจ
- trigger staff follow-up notification ด้วย context ว่าเป็น image message
- ถ้า Reply call fail ให้ใช้ Push fallback เดิม

DeepSeek failure หลัง vision สำเร็จให้ใช้ failure policy เดิมของ agent/text path; ห้ามให้ Gemma ตอบลูกค้าแทนโดยตรง.

---

## 11. Logging / Privacy

อนุญาต log: message ID, MIME, byte count, vision latency, agent latency, success/failure class, rollout stage.

ห้าม log: raw bytes, base64 data URL, LINE access token, full image payload.

## 12. Expected Files

Modify:
- `supabase/functions/line-webhook/index.ts` — image event orchestration, rollout gate, session/history integration, reply/push path
- `supabase/functions/_shared/line.ts` — binary LINE Content API helper + bounded read / MIME detection

Create:
- `supabase/functions/_shared/vision.ts` — Gemma vision call, strict observation parser/formatter
- `supabase/functions/_shared/vision.test.ts` — vision parser/guard/format tests
- `supabase/functions/_shared/line.test.ts` — content download/size/MIME tests where practical with mocked fetch
- `supabase/migrations/<timestamp>_line_ai_image_rollout.sql` — insert default-off kill switch

Possibly modify only if needed for testability, with behavior-preserving refactor:
- text completion block inside `line-webhook/index.ts` may be extracted into a local reusable helper so text/image paths call the same DeepSeek agent logic

Do **not** modify vendored `line-oa-ai-module` files.

---

## 13. Required Automated Tests

### LINE content helper
- 200 image download returns exact bytes + detected MIME
- non-2xx throws safe error
- timeout handled
- `Content-Length` over 10 MiB rejected before body read
- stream exceeding 10 MiB rejected even without trusted length
- JPEG / PNG / WebP magic bytes accepted
- SVG / text / arbitrary binary rejected

### Vision layer
- valid JSON maps to `VisionObservation`
- fenced JSON accepted only after deterministic extraction
- missing/wrong field shape rejected
- empty content rejected
- degenerate token-loop/repeated-chunk rejected
- provider timeout/non-2xx rejected
- observation formatter never includes raw base64

### Webhook/orchestration
- group/room image ignored
- image rollout `off` ignored without model call
- `owner_only` permits owner and rejects other users
- paused customer remains paused
- valid image → vision → DeepSeek → Reply
- Reply failure → Push fallback
- vision failure → safe fallback + staff follow-up
- synthetic image observation + assistant reply persisted in history; raw image not persisted
- existing text webhook path regression remains passing

---

## 14. Live Owner-Only E2E Gate

หลัง deploy ขณะ `line_ai_image_rollout=owner_only` ให้ owner account ส่งจริงอย่างน้อย:

1. รูปรถเต็มคันที่มีรุ่น/รายละเอียดพอมองเห็น
2. รูปชิ้นส่วน/อุปกรณ์ close-up
3. รูปที่มีข้อความ/เลขบนภาพ
4. ส่งข้อความก่อน แล้วส่งรูปตาม เพื่อพิสูจน์ session continuity
5. รูปที่ไม่เกี่ยวกับร้าน เพื่อดูว่า AI ไม่แต่ง service/product ขึ้นเอง

ทุกเคสต้องตรวจ reply จริง + Supabase function logs + session history.

Live gate ต้อง fail ถ้า:
- โมเดลมั่วราคา/รุ่นรองรับ/สถานะจากภาพโดยไม่เรียก tool
- OCR text ถูกนำไปยืนยันเป็น fact ทั้งที่ไม่แน่ใจ
- image observation หลุด raw base64 ลง log/history
- image path ทำให้ text reply เดิมพังหรือ latency/fallback regression
- `verify_jwt` ถูกเปลี่ยนกลับเป็น true

---

## 15. Definition of Done

Phase 5 ปิดได้เมื่อครบทั้งหมด:

- [ ] code ตาม scope complete
- [ ] automated tests ใหม่ทั้งหมด pass
- [ ] existing `_shared` tests pass
- [ ] signed text webhook regression pass
- [ ] deploy ด้วย image rollout `off` สำเร็จ
- [ ] ยืนยัน `line-webhook verify_jwt=false` หลัง deploy
- [ ] owner-only live E2E ครบ 5 เคส
- [ ] ไม่มี raw image/base64 persistence หรือ logging
- [ ] ไม่มี business hallucination จาก vision observation ใน E2E
- [ ] Reply/Push failure behavior ไม่ทำให้ลูกค้าเงียบ
- [ ] เปิด `line_ai_image_rollout=all` เฉพาะหลัง owner-only gate ผ่าน
- [ ] commit/deploy evidence ถูกบันทึก
- [ ] `PRD.md`, `PROJECT_CONTEXT.md`, `implementation_plan.md` อัปเดตหลังจบงาน
- [ ] Phase Status Ledger เปลี่ยน Phase 5 เป็น `CLOSED`

---

## 16. Rollback

Rollback priority:
1. set `line_ai_image_rollout=off` ทันที — text AI ต้องทำงานต่อเหมือนเดิม
2. ถ้าจำเป็น revert Phase 5 code commit และ redeploy `line-webhook`
3. ยืนยัน `verify_jwt=false` หลัง rollback deploy

Migration ของ Phase 5 เป็น additive setting row เท่านั้น จึงไม่ต้อง drop schema ตอน rollback.

---

## 17. Explicit Do-Not-Touch

- ห้ามเปลี่ยน `deepseek-v4-flash:0731-cloud` เป็น chat model อื่นใน Phase 5
- ห้ามลบ/ลด `isDegenerateText()` guard หรือ Gemini text fallback
- ห้ามแก้ `internal-proxy`
- ห้ามแก้ production order/booking active data
- ห้ามเพิ่ม write tools
- ห้ามแก้ vendored `line-oa-ai-module`
- ห้ามเก็บรูปลง DB/Storage โดยไม่มี brief ใหม่
- ห้าม fetch arbitrary/external image URL จาก webhook
- ห้าม deploy โดยลืมตรวจ `supabase/config.toml` / `verify_jwt=false`
- ห้ามเปิด image rollout `all` ก่อน owner-only E2E ผ่าน

---

## 18. Execution Order

1. Baseline verification: HEAD/tree/config/current text webhook tests
2. Add migration kill switch default `off`
3. Build/test bounded LINE Content API helper
4. Build/test Gemma vision extractor + strict parser
5. Integrate image branch + session/history + DeepSeek agent
6. Run automated regression suite
7. Deploy with image feature `off`; verify text production health
8. Set `owner_only`; execute live image E2E + collect evidence
9. ถ้า owner-only gate ผ่าน ให้เปิด `all` และ verify 1 real-customer-style smoke case โดยไม่แตะข้อมูล order/booking
10. ปิด Phase: เก็บ evidence, update docs/ledger, commit แยกก้อน

---

## 19. Stop Condition

CEO approved this brief on 2026-08-29. Implementation is authorized only within this locked scope.

เมื่อได้รับอนุมัติ ให้ implement Phase 5 ตาม brief นี้เท่านั้น หากพบ requirement ใหม่ที่เปลี่ยน architecture/security/data policy ให้หยุดและแก้ brief ก่อนเขียนต่อ ตาม `DEVELOPMENT_WORKFLOW.md`.

**Current decision:** Gemma = vision-only candidate; DeepSeek = production conversation/agent brain; tools/database = business truth.

