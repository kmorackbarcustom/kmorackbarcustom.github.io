# Task: เพิ่ม edit/delete ให้หน้าแอดมินสินค้า (Phase 2)

> เขียน 2026-07-16 โดย Claude (Commander) — ต่อยอดจาก `CODEX_TASK_catalog_supabase_migration.md`
> ที่ทำ create-only ไปแล้ว (live แล้ว, table `products` อยู่ HR project `ybyseaenceyswjnwdmdf`)
> CEO ทดลองใช้แล้วโอเค ขอเพิ่มแค่ edit/delete ที่ตัดสโคปไว้ก่อนหน้านี้

---

## Goal

`admin-products.html` ตอนนี้เพิ่มสินค้าใหม่ได้อย่างเดียว แก้ไขสินค้าเดิมต้องไปเปิด Supabase
Table Editor เอง (ใช้ได้แต่ไม่สะดวก) — เพิ่มปุ่ม **แก้ไข** และ **ลบ** ในตาราง list สินค้าเดิม
ให้ทำได้จากหน้าแอดมินเลย ไม่ต้องสลับไปเปิด Supabase dashboard

**Non-goal:**
- ไม่ต้องทำ bulk edit/import
- ไม่ต้องทำ undo/history log
- ไม่แตะ RLS policy ที่ตั้งไว้แล้ว (anon select only, เขียนผ่าน proxy เท่านั้น)
- ไม่แตะ capacity logic หรือไฟล์ upload-security ที่ยังค้างรีวิวอยู่ (`booking.html`, `hr-staff.html`,
  `vehicle-intake/src/main.js`) — คนละงานกัน ไฟล์พวกนั้นยังไม่ได้ push

---

## สถานะปัจจุบัน (เช็คแล้ว)

- `supabase-hr/supabase/functions/products-proxy/index.ts` — ตอนนี้รับแค่ `POST` (insert อย่างเดียว)
  `corsHeaders["Access-Control-Allow-Methods"] = "POST, OPTIONS"` และมี guard
  `if (req.method !== "POST") return 405` บล็อกไว้ตรงๆ
- `admin-products.html` — มีฟอร์ม add + list read-only (ไม่มีปุ่ม edit/delete ในตาราง)
- deploy อยู่แล้วที่ project `ybyseaenceyswjnwdmdf`, function ชื่อ `products-proxy`

---

## ขอบเขตงาน

### Step 1 — เปิด method PATCH/DELETE ใน edge function

แก้ `supabase-hr/supabase/functions/products-proxy/index.ts`:
- `Access-Control-Allow-Methods` เพิ่มเป็น `"POST, PATCH, DELETE, OPTIONS"`
- ลบ guard ที่บล็อกเฉพาะ POST ออก เปลี่ยนเป็นอนุญาต `POST`, `PATCH`, `DELETE` เท่านั้น
  (method อื่นเช่น GET ยังไม่ต้องเปิด เพราะ read ทำผ่าน anon key ตรงอยู่แล้วไม่ผ่าน proxy)
- ที่เหลือ (staff-key gate, allowedPaths จำกัดแค่ `products`, forward ไป service_role) ใช้โครงเดิม
  ไม่ต้องแก้อะไรเพิ่ม

### Step 2 — เพิ่มปุ่ม แก้ไข/ลบ ใน `admin-products.html`

ในตาราง "สินค้าที่มีอยู่" (`renderProductList`):
- เพิ่มคอลัมน์ action ท้ายตาราง มีปุ่ม **แก้ไข** และ **ลบ** ต่อแถว
- **ปุ่มแก้ไข**: โหลดข้อมูลแถวนั้นเข้าฟอร์มเดิมด้านบน (ใช้ฟอร์มเดียวกับตอนเพิ่มสินค้า ไม่ต้องสร้างฟอร์มใหม่)
  เปลี่ยนปุ่ม submit จาก "เพิ่มสินค้า" เป็น "บันทึกการแก้ไข" ชั่วคราว พร้อมปุ่ม "ยกเลิกแก้ไข" กลับไปโหมดเพิ่มสินค้า
  ตอน submit ให้ยิง `PATCH` ไปที่ `${PRODUCTS_PROXY_URL}?id=eq.<id เดิม>` แทนการสร้าง id ใหม่
  (ห้ามให้แก้ไข `id` ได้จากฟอร์ม — ล็อกช่อง id ไว้ตอน edit mode กันสร้างแถวซ้ำโดยไม่ตั้งใจ)
- **ปุ่มลบ**: `confirm()` ก่อนทุกครั้ง (native browser confirm พอ ไม่ต้องทำ modal เอง) แล้วยิง
  `DELETE` ไปที่ `${PRODUCTS_PROXY_URL}?id=eq.<id>` — ลบสำเร็จแล้ว reload list ทันที
- ทั้ง edit และ delete ต้องมี staff passcode header เหมือน create (`x-staff-key`) — ใช้ logic เดิมที่มีอยู่
  (เช็ค passcode ก่อน submit, จัดการ 401 แบบเดียวกับตอน add)

### Step 3 — Verify

1. `node --check` ไม่เกี่ยวเพราะเป็น HTML/inline script — เปิดเบราว์เซอร์ทดสอบจริงแทน:
   - แก้สินค้า 1 แถว (เช่นเปลี่ยน `image_url`) → กด บันทึก → เช็คใน Supabase Table Editor ว่าค่าที่ table เปลี่ยนจริง
   - ลบสินค้าทดสอบ (สร้างแถวทดสอบใหม่ก่อน แล้วลบแถวนั้น ไม่ลบสินค้าจริงของ CEO ระหว่างเทส)
   - ทดสอบใส่ staff passcode ผิด → PATCH/DELETE ต้องโดน 401 เหมือน POST
2. เช็คว่า PATCH ที่ไม่ได้แก้ `id` จริงๆ (id เดิม, เปลี่ยนแค่ field อื่น) ไม่สร้างแถวใหม่ซ้อน
3. รายงานกลับพร้อม diff — ยังไม่ deploy edge function ใหม่/push เอง รอ Claude ตรวจก่อน

---

## Where things live

- Production/admin repo: `D:\AI-Workspace\projects\kmorackbarcustom.github.io\`
- Edge function: `supabase-hr/supabase/functions/products-proxy/index.ts` (deploy ไป project `ybyseaenceyswjnwdmdf`)
- Admin page: `admin-products.html`
- อ้างอิง Supabase PATCH/DELETE syntax: REST filter `?id=eq.<value>` เหมือนที่ `loadProducts()` ใช้
  `select=*&order=...` อยู่แล้วในไฟล์เดียวกัน
