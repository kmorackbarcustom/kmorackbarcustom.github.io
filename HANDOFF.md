# Handoff — 2026-08-15 session

> เขียนโดย Claude Code (Sonnet 5) ปิดท้าย session ที่ทำงานยาวต่อเนื่อง อ่านไฟล์นี้ก่อนเริ่ม session ถัดไป
> ดู context ลึกกว่านี้ได้ที่ vault: `06-Agent-Logs/KMO-RackbarCustom/session-2026-08-15-shop-config-and-staff-notify.md`
> (เขียนตอนกลาง session — ไม่ครอบคลุมงานหลัง products migration เป็นต้นไป ไฟล์นี้ครอบคลุมครบกว่า)

---

## สถานะตอนนี้ — ทุกอย่าง live บน production แล้ว

### สถาปัตยกรรมเปลี่ยนไปจากเดิม
- **`products` table ย้ายมาอยู่ project `KMO-Booking` (`xfhpwxjywqgqefbncumm`) แล้ว** — ไม่ได้อยู่ `kmo-hr` (`ybyseaenceyswjnwdmdf`) อีกต่อไป เหตุผล: จะได้ให้ `line-webhook` query ตรงได้โดยไม่ต้องมี Supabase client ตัวที่สอง
- `admin-products.html` ชี้ไป `internal-proxy` (project `KMO-Booking`) แทน `products-proxy` เดิม (ยังอยู่ใน `kmo-hr` แต่ไม่มีใครเรียกใช้แล้ว ไม่ได้ลบทิ้ง)
- `kmo-hr` project เหลือแค่ table ที่เกี่ยวกับ HR จริงๆ (employees, leave_*, bonus_*)

### AI Chat (LINE) — ฟีเจอร์ที่เพิ่ม/แก้รอบนี้
1. **Session TTL enforce จริง** — ปรับได้เองจากหน้า `admin-shop-config.html` (key `session_ttl_hours`, default 6 ชม.) มี cron (`line-chat-sessions-cleanup`, รันทุกชั่วโมง) ลบ session ที่หมดอายุทิ้งจริงด้วย ไม่ใช่แค่เช็คตอน read
2. **Memory ต่อบทสนทนา 40 ข้อความ** (เดิม 20) — ปรับใน vendored `state-manager.ts` เพราะ CEO อยากให้จำได้นานขึ้นสำหรับลูกค้าที่คุยยาว ยอมรับ token cost ที่เพิ่มขึ้น
3. **แจ้งเตือนทีมงานผ่าน Telegram จริง** เมื่อ AI ตอบลูกค้าไม่ได้ (เดิมพูดลอยๆ ไม่มีกลไกจริง)
4. **Shop Config pattern** — ชื่อร้าน/ที่อยู่/เบอร์/เวลาเปิด/โทน AI/FAQ/TTL แก้ผ่าน `admin-shop-config.html` ได้เอง ไม่ต้องแก้โค้ด (กฎความปลอดภัยหลัก เช่น ลิงก์ถูก/ห้ามยืนยันจองสำเร็จ ยัง hardcode ไว้ตั้งใจ ไม่ให้แก้ผ่านหน้าเว็บ)
5. **Product catalog จริง 340 รายการ** — import จากไฟล์ที่ CEO ทำเอง (`Master_Catalog.csv`) แทนของเก่าที่เป็นแค่ประวัติงาน 195 รายการไม่มีราคา มีคอลัมน์ `search_tags`/`aliases` เพิ่มสำหรับช่วย AI จับคำเรียกเพี้ยน/ชื่อไทย
6. **AI ตอบราคาสินค้าจริงได้** ผ่าน RPC `search_products` — ค้นจาก brand/model/name/search_tags/aliases พร้อมจัดกลุ่มตาม `allow_booking`/`allow_order` ให้ AI ส่งลิงก์ถูกต้องอัตโนมัติ (ดูหัวข้อ "บั๊กใหญ่ที่แก้รอบนี้" ด้านล่าง — ผ่านการทดสอบหลายรอบมาก)
7. **AI ตอบเรื่องคิว/ออเดอร์แน่นไหมได้** ผ่าน RPC `get_upcoming_queue_density` (ดูข้อมูล 7 วันข้างหน้าจาก `production_allocations` เทียบ capacity 2.5 หน่วย/วันที่ใช้อยู่แล้วในแดชบอร์ดแอดมิน)

---

## บั๊กใหญ่ที่แก้รอบนี้ — link routing ผิด (สำคัญ อ่านให้ครบ)

**อาการ:** AI ส่งลิงก์ "สั่งผลิต" (order) ผิด ทั้งที่สินค้าบางชิ้นควรเป็นลิงก์ "จองคิว" (booking) โดยเฉพาะตอนคุยหลายรอบต่อเนื่อง (follow-up message) หรือถามหลายชิ้นพร้อมกัน

**Root cause (ยืนยันด้วย 3-agent parallel diagnosis — Codex/AGY/Qwen พร้อมกัน คนละมุม แล้วสรุปตรงกัน):**
`search_products` RPC เดิมรับแค่ข้อความล่าสุดข้อความเดียว ไม่เห็นบทสนทนาก่อนหน้าเลย พอลูกค้าพิมพ์ตามด้วยข้อความสั้นๆ ที่ไม่มีชื่อยี่ห้อ/รุ่นรถ (เช่น "แล้วแร็คท้ายล่ะ") → RPC คืนค่าว่าง → ทั้ง product data และกฎ "ห้ามส่งลิงก์เดียวรวมทุกชิ้น" หายไปจาก prompt ทั้งหมด (อยู่ใน `if (products.length > 0)`) → AI เดาใช้ลิงก์ล่าสุดที่เคยส่งซ้ำ

**แก้แล้วด้วย 4 จุด (ทุกจุดจำเป็น ขาดจุดไหนจุดหนึ่งบั๊กจะกลับมา):**
1. เอาประวัติ user message ทั้งหมดใน session (ไม่ใช่แค่ล่าสุด) มารวมค้นหาด้วย (`buildProductSearchMessage`)
2. `search_products` เพิ่มการค้นจากชื่อสินค้า (`name`) ที่ไม่เคย search มาก่อน (ค้นได้แค่ brand/model/tags/aliases)
3. จัดอันดับผลลัพธ์ให้แถวที่ตรง brand/model จริงขึ้นก่อนเสมอ — ไม่งั้นพอเปิดค้นจาก `name` ยี่ห้ออื่นที่มีสินค้าชื่อเดียวกันจะแซงคิวออกนอก `limit 20`
4. ถ้าค้นแล้วไม่เจอสินค้าเลย ห้าม AI เดาลิงก์จากบทสนทนาเก่า ให้ถามลูกค้ากลับแทน (fail-closed แทน fail-open)

ทดสอบ empirically แล้วด้วย curl ยิง RPC ตรงกับข้อความจริงที่เคยพังก่อน deploy — ผ่าน ดู commit `4d7d451` สำหรับรายละเอียดเต็ม

---

## Deploy checklist ที่ต้องจำ (บทเรียนจาก session นี้)

- **`line-webhook` ต้อง deploy ด้วย `--no-verify-jwt` เสมอ** — ไม่งั้น LINE โดนบล็อคที่ Supabase gateway ทันที (เกิดขึ้นจริงแล้วรอบนี้ ไม่มีลูกค้าโดนกระทบเพราะ rollout ยังเป็น `owner_only`)
- **เช็ค `verify_jwt` เดิมด้วย `list_edge_functions` ก่อน deploy ทุกครั้ง** ห้ามเดา — แต่ละ function ไม่เหมือนกัน (`internal-proxy` ต้อง `true` เพราะเรียกด้วย anon key อยู่แล้ว, `line-webhook` ต้อง `false`)
- ถ้า RPC ที่ `returns void` แล้วยิงผ่าน `internal-proxy` จะเจอ error "Response with null body status cannot have body" (PostgREST คืน 204, Deno ห้าม pass body คู่กับ 204) — เปลี่ยน RPC ให้ `returns boolean` แทน

---

## Rollout — เปิดให้ลูกค้าจริงทุกคนแล้ว (2026-08-15 13:29 UTC)

`line_ai_rollout` = `all` แล้ว (เดิม `owner_only`) — CEO สั่งเปิดเองหลังทดสอบ/แก้บั๊ก link routing จนพอใจ AI ตอบแชทลูกค้าจริงทุกคนที่ทักเข้ามาตอนนี้ ไม่ใช่แค่ CEO อีกต่อไป

ถ้าต้องปิดกลับเป็นเฉพาะ CEO: `UPDATE system_settings SET value='owner_only' WHERE key='line_ai_rollout'` บน project `xfhpwxjywqgqefbncumm` (ไม่ต้อง redeploy, มีผลทันที)

## ของค้างไม่เร่งด่วน

- **คุยกันต่อเรื่อง "ให้บอทหยุดอัตโนมัติเมื่อมีแอดมินตอบ"** — ตอนนี้ทำแค่คำสั่ง manual `/pause <ชื่อ>` / `/resume <ชื่อ>` ผ่าน Telegram ไปก่อน (ดู commit `632a933`) เพราะทีมงานตอบผ่าน LINE OA Manager โดยตรงซึ่งไม่ยิง webhook มาเลย เลยตรวจจับอัตโนมัติไม่ได้ด้วยข้อมูลที่มีตอนนี้ — ถ้าอยากได้ auto-detect จริงๆ ต้องคุยเพิ่มว่าจะเอาสัญญาณอะไรมาใช้ (เช่น เปลี่ยนช่องทางที่ทีมงานตอบ หรือหาทางอื่น)
- RLS ปิดอยู่บน 3 table โบนัสใน `kmo-hr` (`bonus_settings`, `bonus_calculations`, `bonus_history`) — CEO ยืนยันยังไม่ได้ใช้งาน ไม่เร่งด่วน
- `admin-shop-config.html` ยังกรอกไม่ครบทุก field (ที่อยู่/เบอร์/โทน AI ยังว่างอยู่บางส่วน)
- ยังไม่ได้รัน `deno test` จริงบน `line-session-store.test.ts` (เครื่อง dev ไม่มี Deno CLI ติดตั้ง)
- `products-proxy` (edge function เก่าใน `kmo-hr`) ไม่ได้ลบทิ้ง แค่ไม่มีใครเรียกแล้ว เก็บไว้เผื่ออยากดูย้อนหลัง

## Credential

- `STAFF_PASSCODE` (Supabase secret, project `xfhpwxjywqgqefbncumm`) — ตั้งใหม่รอบนี้ ไม่เก็บค่าจริงไว้ในเอกสาร ถามหน้างานหรือดู password manager ถ้าลืมตั้งใหม่ทับได้เลย (`supabase secrets set STAFF_PASSCODE=<ค่าใหม่> --project-ref xfhpwxjywqgqefbncumm`)
- `OLLAMA_API_KEY`, `GEMINI_API_KEY` — ตั้งไว้แล้วบน project `xfhpwxjywqgqefbncumm` ไม่ต้อง set ซ้ำ

---
*เขียนโดย Claude Code (Sonnet 5), 2026-08-15*
