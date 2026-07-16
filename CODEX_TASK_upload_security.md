# Task: ปิดช่องโหว่อัปโหลดไฟล์ฝั่ง server (booking-images / vehicle-intake-images / medical-certs)

> เขียน 2026-07-15 โดย Claude (Commander) — สั่งงานให้ Codex ทำ แล้ว Claude ตรวจ diff เองก่อน push
> อ้างอิงจาก handoff `agents/claude/handoff/2026-07-14-kmo-booking-capacity-fix-and-cart-prefill-live.md`
> ข้อ 9 ("Validate ไฟล์อัปโหลดสลิปฝั่ง server — ยังไม่มีใครแก้")

---

## Goal

ตอนนี้ **client-side เท่านั้น** ที่เช็คชนิดไฟล์/ขนาดไฟล์ก่อนอัปโหลดขึ้น Supabase Storage
(เช่น `booking.html` เช็ค `file.type.startsWith('image/')` และ `file.size > 5MB` ในเบราว์เซอร์)
ซึ่ง**ข้ามได้ง่าย** (แก้ request ตรง ๆ ด้วย curl/devtools ก็อัปโหลดไฟล์อะไรก็ได้ ขนาดเท่าไหร่ก็ได้
เพราะ endpoint เป็น anon key สาธารณะที่ hardcode อยู่ใน HTML อยู่แล้ว)

**เป้าหมาย:** บังคับ type/size ที่ **server (Supabase Storage engine)** ให้ครบทุก bucket ที่รับอัปโหลดจากฝั่ง client
ไม่ใช่แค่ bucket เดียว — เจอแล้วว่ามี bucket ที่ยังไม่ถูกแก้เลยด้วย (ดูข้อ 2 ด้านล่าง)

**Non-goal:** ไม่แตะ capacity logic (`buildPoolUsage`, `DAILY_CAP`, `MIN_BOOKING_DAYS`, `DENSE_THRESHOLD`)
ในไฟล์ไหนเด็ดขาด — ไม่เกี่ยวกับงานนี้ และเคยพลาดมาแล้วในบั๊กอื่น (ดู "บทเรียน" ใน handoff เดิม)

---

## สถานะที่เจอตอนสำรวจ (สำคัญ — อย่าข้าม)

### 1. มี draft SQL อยู่แล้วแต่ "ไม่รู้ว่าเคย apply ขึ้น production Supabase จริงหรือยัง"

ไฟล์ `supabase/security_fix_booking_images_upload.sql` (ลง comment ว่าเขียนไว้ 2026-07-12) มี SQL
ที่ทำสิ่งที่ต้องการอยู่แล้วสำหรับ 2 bucket:

```sql
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'],
    file_size_limit = 5242880  -- 5MB
where id = 'booking-images';

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'],
    file_size_limit = 5242880
where id = 'vehicle-intake-images';

drop policy if exists "anon can upload booking images" on storage.objects;
create policy "anon can upload booking images"
on storage.objects for insert to anon
with check (
  bucket_id = 'booking-images'
  and name ~* '^[^/]+/[0-9]+-[0-9]+\.(jpg|jpeg|png|webp|heic|heif)$'
);
```

**ห้ามสมมติว่ามันถูก apply ไปแล้ว** — ไฟล์ .sql อยู่ใน repo ไม่ได้แปลว่ารันบน production DB จริง
(Supabase MCP ที่ agent มีอยู่ตอนนี้**ไม่ได้ authorize project `xfhpwxjywqgqefbncumm`** ที่ระบบ booking ใช้จริง
— มีแค่ `craftbikelab-saas-hub` กับ `Craftbikelab bike data` เท่านั้น ดู handoff เดิมข้อ "Where things live")

### 2. เจอ bucket ที่ยังไม่ถูกแก้เลย — `medical-certs`

กวาดทุกไฟล์ HTML ที่เรียก `storage/v1/object/` เจอ 3 bucket ทั้งหมด:

| Bucket | ใช้ที่ไฟล์ | อยู่ใน SQL fix เดิมหรือยัง |
|---|---|---|
| `booking-images` | `booking.html`, `bookingdashboard.html` | ✅ อยู่แล้ว |
| `vehicle-intake-images` | `vehicle-intake/index.html` | ✅ อยู่แล้ว |
| `medical-certs` | `hr-staff.html` (บรรทัด ~652) | ❌ **ไม่อยู่ใน SQL fix เดิม เลย** |

`medical-certs` เก็บ**ใบรับรองแพทย์พนักงาน** — ข้อมูลอ่อนไหวกว่ารูปสลิป/รูปรถอีก ควรใส่ mime/size limit
ให้ครบเหมือนกัน (ดูโครงสร้าง object key ที่ `hr-staff.html` ใช้จริงก่อนเขียน regex policy)

**⚠️ แก้ไข 2026-07-15 หลัง verify จริง — `medical-certs` อยู่คนละ Supabase project**
`booking-images` และ `vehicle-intake-images` อยู่ใน booking project `xfhpwxjywqgqefbncumm`
แต่ `hr-staff.html` ใช้ HR project `ybyseaenceyswjnwdmdf` (`SUPA_URL`/`SUPA_KEY` คนละชุด)
ดังนั้น SQL ของ `medical-certs` ต้องรันกับ HR project เท่านั้น ห้ามรันรวมกับ SQL ของ booking project

---

## ขอบเขตงาน (ทำตามลำดับ)

### Step 1 — สืบสถานะจริงบน production Supabase ก่อนแก้อะไร

Agent ที่ไม่มี Supabase MCP สำหรับ project นี้ ให้ curl เช็คด้วย anon key (ดึงจาก `booking.html`
ตัวแปร `SUPABASE_URL`/anon key ที่ hardcode ไว้) — anon key **อ่าน bucket config ไม่ได้โดยตรง**
(ต้อง service role) ดังนั้นวิธีตรวจทางอ้อมคือ:

**⚠️ แก้ไข 2026-07-15 หลัง verify จริง — `vehicle-intake-images` ทดสอบคนละวิธีจาก 2 bucket แรก**
`vehicle-intake-images` **ไม่ได้**รับ upload ตรงจาก browser ด้วย anon key แบบ `booking-images`/
`medical-certs` — มันเดินผ่าน `supabase/functions/internal-proxy/index.ts` ซึ่งใช้ `service_role`
+ ตรวจ `x-staff-key` ก่อนถึงจะเขียนลง storage ได้ ถ้าทดสอบ bucket นี้ด้วย anon direct upload แล้ว
โดนปฏิเสธ **อย่าเพิ่งสรุปว่า mime/size limit ทำงานแล้ว** — อาจเป็นเพราะ anon ถูกปิดสิทธิ์เขียนบน
bucket นี้อยู่แล้ว (policy คนละชั้นกับที่เราต้องการเช็ค) ต้องแยก test ให้ตรงชั้นจริง:

- **`booking-images`**: ยิง Storage API ตรงด้วย anon key จาก `booking.html` ได้เลย
  ```
  POST {SUPABASE_URL}/storage/v1/object/booking-images/test-security-check/<timestamp>.txt
  ```
  ลองไฟล์ที่**ไม่ใช่ประเภทที่อนุญาต** (เช่น `.txt`) และไฟล์เกิน 5MB —
  ถ้า**สำเร็จ (2xx)** = ยังไม่มีการบังคับที่ server, SQL fix ยังไม่ถูก apply
  ถ้า**โดนปฏิเสธ (4xx พร้อม error เกี่ยวกับ mime/size)** = apply ไปแล้ว

- **`medical-certs`**: ยิง Storage API ตรงด้วย anon key จาก `hr-staff.html` เท่านั้น เพราะอยู่ HR project
  `ybyseaenceyswjnwdmdf` ไม่ใช่ booking project `xfhpwxjywqgqefbncumm`
  ```
  POST {SUPA_URL}/storage/v1/object/medical-certs/security-test/<timestamp>.txt
  ```
  ถ้าใช้ key จาก `booking.html` จะได้ `Bucket not found` ซึ่งแปลว่าใช้ project ผิด ไม่ใช่ bucket ไม่มีจริง

- **`vehicle-intake-images`**: ทดสอบ 2 ชั้นแยกกัน
  1. anon direct upload (เหมือนข้างบน) — ใช้เช็คแค่ว่า anon ถูกปิดสิทธิ์เขียนตรงหรือยัง
     (คาดว่าควรโดนปฏิเสธเสมอ ไม่ว่า mime/size limit จะถูกตั้งหรือไม่ — ผลนี้ตีความเรื่อง mime/size ไม่ได้)
  2. ทดสอบผ่าน flow จริง (`internal-proxy` + `x-staff-key`/`STAFF_PASSCODE`) ด้วยไฟล์ผิดประเภท/เกินขนาด
     ถ้าไม่มี staff key สำหรับทดสอบ ให้ระบุในรายงานว่า **"bucket นี้ยังไม่ได้ verify เรื่อง mime/size
     limit เพราะไม่มีสิทธิ์ทดสอบผ่าน proxy จริง"** ห้ามเดา/ห้ามถือว่าปลอดภัยแล้วเฉยๆ

- **ลบไฟล์ทดสอบทิ้งทันทีหลังเช็คทุก bucket** (อย่าทิ้งขยะไว้ใน production bucket)
- บันทึกผลไว้ในรายงานตอนส่งกลับ (สำเร็จ/ไม่สำเร็จ/ทดสอบไม่ได้ ของแต่ละ bucket แยกกันชัดๆ)

### Step 2 — เขียน/แก้ SQL ให้ครบทั้ง 3 bucket

- ถ้า Step 1 พบว่า `booking-images`/`vehicle-intake-images` ยังไม่ได้ apply → เตรียม SQL เดิมไว้ให้พร้อมรัน
- เพิ่ม SQL ใหม่สำหรับ `medical-certs` ในไฟล์ใหม่ที่ตั้งชื่อสอดคล้องกัน
  (เช่น `supabase/security_fix_medical_certs_upload.sql`) — โครงสร้างเดียวกับของเดิม แต่:
  **ต้องมี header เตือนว่า SQL นี้รันกับ HR project `ybyseaenceyswjnwdmdf` เท่านั้น**
  **⚠️ แก้ไข 2026-07-15 — ห้ามใช้ image-only** verify แล้วว่า `hr-staff.html:652` ใช้
  `accept="image/*,.pdf"` และ UI บอกผู้ใช้ตรงๆ ว่า "JPG, PNG, PDF ไม่เกิน 5MB" ดังนั้น
  `allowed_mime_types` ต้องมีอย่างน้อย `image/jpeg`, `image/png`, `application/pdf`
  (จะรวม `image/webp`/`image/heic`/`image/heif` เพิ่มให้สอดคล้องกับ bucket รูปอื่นก็ได้ แต่ต้องมี PDF เสมอ
  — ถ้าตั้ง image-only ตามแบบ `booking-images` ตรงๆ จะพังการอัปโหลดใบรับรองแพทย์ที่เป็น PDF ทันที)
  - `file_size_limit` 5MB ตาม UI
  - policy `insert` scope เฉพาะ role ที่ควรอัปโหลดได้จริง (เช็คโค้ดจริงว่าใช้ anon หรือ authenticated)
- **ห้ามรัน SQL ไป production เอง** — เตรียมไฟล์ .sql ให้พร้อม แล้วส่งกลับให้ Claude/CEO ตรวจก่อนรัน
  (บัคเก็ตนี้เป็น production live ผลกระทบจริงต่อธุรกิจ ต้องมีคนตรวจ diff ก่อนเสมอตามมาตรฐานเดิม)

### Step 3 — เพิ่ม client-side validation ให้แน่นขึ้น (defense in depth, ไม่ใช่ตัวหลัก)

ของเดิมมีอยู่แล้วบางส่วน (5MB check ใน `booking.html`) — เสริมให้ครบ/สม่ำเสมอทุกไฟล์ที่มี upload:
- เช็ค extension ไฟล์ ไม่ใช่แค่ `file.type` (เบราว์เซอร์บาง case ให้ mime type ผิดได้)
- โชว์ error message ที่ชัดเจนเมื่อไฟล์ถูกปฏิเสธจาก server (กัน UX พัง เงียบ ๆ ตอน server ปฏิเสธไฟล์)

### Step 4 — รายงานกลับ

ส่งกลับมาเป็น diff + ไฟล์ .sql ที่เตรียมไว้ (ยังไม่รัน) + ผลทดสอบ Step 1 ของทั้ง 3 bucket
**ห้ามบอกว่า "เสร็จแล้ว"** จนกว่า SQL จะถูกรันจริงบน production และ Step 1 re-test แล้วผลเปลี่ยนเป็นปฏิเสธไฟล์แปลกปลอม

---

## Verify ก่อนถือว่าจบงาน

1. Re-run test อัปโหลดไฟล์ปลอม (`.txt`, ไฟล์ >limit) ทั้ง 3 bucket → ต้องโดนปฏิเสธหมด (4xx)
2. อัปโหลดรูปจริงขนาดปกติผ่าน `booking.html`/`vehicle-intake/index.html`/`hr-staff.html` จริงในเบราว์เซอร์
   → ต้องยังอัปโหลดสำเร็จเหมือนเดิม (ไม่ทำ regression กับ user จริง)
3. ลบไฟล์ทดสอบทั้งหมดออกจาก bucket ก่อนปิดงาน

---

## Where things live (อ้างอิงจาก handoff เดิม)

- Production repo: `D:\AI-Workspace\projects\kmorackbarcustom.github.io\` (remote `kmorackbarcustom/kmorackbarcustom.github.io`)
- Supabase project จริง: `xfhpwxjywqgqefbncumm` — anon key/URL อยู่ใน `booking.html` ตรง ๆ
- ไม่มี Supabase MCP authorize project นี้ — ใช้ curl ตรงเท่านั้น
