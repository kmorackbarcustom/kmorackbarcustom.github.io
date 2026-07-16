# Task: ย้าย product catalog จาก CSV → Supabase table + หน้าแอดมินกรอกสินค้า

> เขียน 2026-07-15 โดย Claude (Commander) — สั่งงานให้ Codex ทำ แล้ว Claude ตรวจ diff เองก่อน push
> คุยกับ CEO แล้วยืนยัน 2 จุด: (1) ใช้ Supabase project **HR เดิม** (`ybyseaenceyswjnwdmdf`) แยก table
> ใหม่ ไม่สร้าง project ใหม่ (2) หน้าแอดมินกรอกสินค้า ใช้ staff-passcode gate แบบเดียวกับ
> `vehicle-intake` (ไม่ทำ Supabase Auth login เต็มรูปแบบ)
> งานนี้ข้าม 2 repo — อ่านให้ครบก่อนเริ่ม

---

## Goal

ตอนนี้สินค้า 195 รายการอยู่ใน `kmo-landing-page/assets/product_catalog_template.csv` แก้แล้วต้อง
commit+push ผ่าน git ถึงจะขึ้นเว็บ — CEO อยากแก้ผ่านหน้าเว็บง่ายๆ (กรอกฟอร์ม กด submit ขึ้นเว็บเลย)
ไม่อยากยุ่งกับ git

**เป้าหมาย:**
1. สร้าง table `products` ใหม่ใน Supabase project HR (`ybyseaenceyswjnwdmdf`)
2. ทำหน้า HTML แอดมิน**ธรรมดาที่สุด** (ตามที่ CEO เรียกว่า "หน้า html โง่ๆ") ให้กรอกสินค้าใหม่ยิงเข้า table
3. เปลี่ยน `kmo-landing-page/app.js` ให้ดึงสินค้าจาก Supabase แทนการ parse CSV

**Non-goal — ระวังจุดนี้:**
- **ห้ามแตะ table/ฟีเจอร์ HR เดิม** (`employees`, `leave_quota`, `leave_requests`, bucket `medical-certs`,
  `hr-staff.html`) — CEO ยังไม่ได้ตัดสินใจจะเอา HR ออกจริงหรือเปล่า ตอนนี้แค่ "แทรก" table ใหม่เข้าไปอยู่
  ข้างๆ เท่านั้น ห้ามลบ/แก้/ปิดอะไรที่เกี่ยวกับ HR เดิมเด็ดขาด
- **v1 ทำแค่ "เพิ่มสินค้า" (create) เท่านั้น ไม่ต้องทำ edit/delete ในรอบนี้** — ตาม lazy scope ที่ CEO
  ขอ ("หน้า html โง่ๆ") ถ้าจะทำ edit/delete ทีหลัง ค่อยเปิดบรีฟใหม่แยก
- ห้ามลบไฟล์ `assets/product_catalog_template.csv` ในรอบนี้ (เก็บไว้เป็น snapshot/fallback อ้างอิง
  แม้จะเลิกใช้เป็น source of truth แล้วก็ตาม)
- ห้ามแตะ capacity logic (`buildPoolUsage`, `DAILY_CAP`, `MIN_BOOKING_DAYS`, `DENSE_THRESHOLD`) ในไฟล์ไหนทั้งสิ้น

---

## สถานะที่เช็คแล้วก่อนเขียนบรีฟ (ใช้เป็น reference ตอนทำ)

- HR project connection (จาก `hr-staff.html:471-472`):
  ```js
  const SUPA_URL = 'https://ybyseaenceyswjnwdmdf.supabase.co';
  const SUPA_KEY = 'eyJhbGci...' // anon key, hardcode ใน hr-staff.html อยู่แล้ว ใช้ตัวเดียวกันได้
  ```
- Pattern staff-passcode gate ที่มีอยู่แล้ว ให้ก็อปโครงมาปรับ ไม่ต้องคิดใหม่:
  `kmorackbarcustom.github.io/supabase/functions/internal-proxy/index.ts`
  — ฟังก์ชันนี้ deploy อยู่บน Supabase project **booking** (`xfhpwxjywqgqefbncumm`) ล็อก CORS ไว้ที่
  origin `https://kmorackbarcustom.github.io` เท่านั้น และ `allowedPaths` จำกัดไว้เฉพาะ
  orders/bookings/vehicle_intake_forms — **ห้ามแก้ไฟล์นี้หรือเพิ่ม path `products` เข้าไปในนี้**
  เพราะเป็นคนละ Supabase project กับ HR ใช้ไม่ได้ ต้อง deploy edge function ใหม่แยกไปที่ project HR
- Supabase MCP ที่ agent มีตอนนี้**ไม่ authorize ทั้ง project booking และ HR** — งานที่ต้องรัน SQL/deploy
  edge function จริงบน production ต้องเตรียมให้ Claude/CEO รันเอง (ดู Step 4/5)

---

## ขอบเขตงาน

### Step 1 — SQL สร้าง table `products` (project: HR `ybyseaenceyswjnwdmdf`)

เตรียมไฟล์ `.sql` ใหม่ (ยังไม่รัน) ที่ path `kmorackbarcustom.github.io/supabase-hr/products_setup.sql`
(สร้างโฟลเดอร์ `supabase-hr/` แยกจาก `supabase/` เดิม กันสับสนว่าไฟล์ไหน deploy ไป project ไหน — ใส่
comment หัวไฟล์บอกชัดว่า "รันกับ project HR ybyseaenceyswjnwdmdf เท่านั้น"):

- Table `products` schema ตาม CSV เดิม + primary key:
  `id text primary key, brand text, model text, name text, price integer default 0, category text,
  description text, image_url text, shopee_url text, allow_booking boolean default true,
  allow_order boolean default true, featured boolean default false, created_at timestamptz default now()`
- RLS: เปิด RLS, policy `select` ให้ `anon` อ่านได้ทุกแถว (ต้อง public เพราะหน้า catalog ลูกค้าใช้ anon key)
  **ห้ามเปิด insert/update/delete ให้ anon** — เขียนได้เฉพาะผ่าน `service_role` (ผ่าน edge function Step 2 เท่านั้น)

### Step 2 — Edge function ใหม่ (deploy ไป project HR)

สร้างที่ `kmorackbarcustom.github.io/supabase-hr/functions/products-proxy/index.ts`
(ก็อปโครงจาก `supabase/functions/internal-proxy/index.ts` มาปรับ ไม่ต้องเขียนใหม่ทั้งหมด):

- `ALLOWED_ORIGIN` เปลี่ยนเป็น `https://gutumrod.github.io` (origin ของ landing page ที่หน้าแอดมินจะอยู่ —
  ดู Step 3 ว่าหน้าแอดมินจริงๆ จะ deploy อยู่ repo ไหน ปรับ origin ให้ตรง)
- `allowedPaths` จำกัดเหลือแค่ `["products"]` เท่านั้น (ห้ามเปิดกว้างกว่านี้)
- ใช้ `STAFF_PASSCODE` env var + header `x-staff-key` เหมือนเดิมเป๊ะ (ตั้ง secret ใหม่บน project HR
  แยกจาก secret ของ project booking แม้จะใช้ค่า passcode เดียวกันก็ได้ — CEO เป็นคนตั้งค่า secret เอง
  ตอน deploy จริง ไม่ใช่ hardcode ในโค้ด)
- เตรียมคำสั่ง deploy ไว้ในรายงานกลับ (`supabase functions deploy products-proxy --project-ref ybyseaenceyswjnwdmdf`)
  **ห้าม deploy เองถ้าไม่มีสิทธิ์ authorize project นี้จริง** — เตรียมไฟล์+คำสั่งให้ Claude/CEO รันแทน

### Step 3 — หน้าแอดมินกรอกสินค้า

สร้างที่ `kmorackbarcustom.github.io/admin-products.html` (อยู่ repo เดียวกับ `hr-staff.html`,
`bookingdashboard.html`, `AdminOrderDashboard.html` — ตามธรรมเนียมเดิมของ repo นี้ที่รวม admin tool
ทุกตัวไว้ที่นี่ แม้ table จะเกี่ยวกับ landing catalog ก็ตาม)

- หน้าตาเรียบง่ายที่สุด (ตามคำขอ "หน้า html โง่ๆ"):
  - prompt/input ให้กรอก staff passcode ก่อนเข้าใช้งาน (เก็บไว้ใน memory ของ session/localStorage
    ระหว่างใช้งาน ไม่ต้อง login ซ้ำทุกครั้งที่ submit)
  - ฟอร์มกรอก: brand, model, name, price, category (dropdown ตาม category ที่มีอยู่: rear/side/
    crashbar/accessory/gear/service), description, image_url, shopee_url, checkbox allow_booking/
    allow_order/featured
  - ปุ่ม submit → POST ไป `products-proxy` (header `x-staff-key`) → insert แถวใหม่
  - โชว์ list สินค้าที่มีอยู่แล้วแบบ read-only ใต้ฟอร์ม (ดึงจาก Supabase ตรงด้วย anon key เพราะเป็น
    public read อยู่แล้ว ไม่ต้องผ่าน proxy) — **แค่โชว์ ไม่ต้องทำปุ่ม edit/delete ตาม non-goal**
- ไม่ต้องสวย ไม่ต้องตรงธีม industrial ของ landing page (เป็นเครื่องมือแอดมินภายใน ไม่ใช่หน้าลูกค้า)

### Step 4 — Migrate ข้อมูล 195 แถวเดิมจาก CSV → table

เตรียม SQL insert statement จาก `assets/product_catalog_template.csv` ปัจจุบัน (195 แถว) ไว้ในไฟล์
`kmorackbarcustom.github.io/supabase-hr/products_seed.sql` — **เตรียมไว้เท่านั้น ห้ามรันเอง**
(ต้องรันหลัง Step 1 สร้าง table เสร็จแล้วเท่านั้น และต้องรันโดย Claude/CEO ที่มีสิทธิ์จริง)

### Step 5 — เปลี่ยน `kmo-landing-page/app.js` ให้ดึงจาก Supabase

**⚠️ ไฟล์นี้อยู่คนละ repo (`kmo-landing-page`, remote `Gutumrod/kmo-landing-page`) เช็ค
`git remote -v` ให้ตรงก่อนแก้**

- เปลี่ยน `loadProductsFromCSV()` (บรรทัด ~130) ให้ fetch จาก
  `GET {SUPA_URL}/rest/v1/products?select=*` ด้วย anon key แทนการโหลด/parse ไฟล์ CSV
- โครงสร้างข้อมูลที่ได้จาก Supabase (JSON) ต้อง map เข้ากับ shape เดิมที่ `renderCatalog`/
  `getFilteredProducts`/`renderFeaturedProducts` ใช้อยู่ (field name ต้องตรงกับที่ตั้งไว้ Step 1
  ซึ่งตั้งใจให้ตรงกับ CSV column เดิมอยู่แล้วเพื่อลด mapping code)
- `FALLBACK_PRODUCTS` (hardcode 7 รายการ, บรรทัด ~25-91) **เก็บไว้เหมือนเดิม** เป็น fallback ตอน fetch
  Supabase fail (เปลี่ยนแค่ error path จาก "CSV โหลดไม่ได้" เป็น "Supabase โหลดไม่ได้")
- ลบโค้ด `parseCSV()` และการ fetch ไฟล์ CSV ทิ้งได้ (ไม่ใช้แล้ว) แต่**ไม่ต้องลบไฟล์ CSV เอง** (Non-goal)
- bump cache `app.js?v=...` ใน `index.html` ตามเดิม

### Step 6 — อัปเดตเอกสาร

- `PROJECT_CONTEXT.md`/`CODEX_HANDOFF.md` (landing repo) — เปลี่ยน "Source of truth" จาก CSV เป็น
  Supabase table `products` (HR project), อัปเดตตาราง "Open Decisions" แถว Google Sheet ให้สะท้อน
  สถานะใหม่ (ยังไม่ใช้ Sheet เหมือนเดิม แต่ตอนนี้ก็ไม่ใช้ local CSV เป็น source of truth แล้วด้วย)

---

## Verify ก่อนถือว่าจบงาน

1. `node --check app.js` (landing repo) ผ่าน
2. ตรวจ SQL (Step 1, 4) ด้วยตา — schema ตรงกับ CSV, RLS policy ไม่เปิด insert ให้ anon
3. ตรวจ edge function code (Step 2) — `allowedPaths` มีแค่ `products`, ไม่ได้ไปแก้ `internal-proxy` เดิม
4. เปิด `admin-products.html` local เช็คว่าไม่มี passcode ใส่ error ชัดเจน ไม่ crash แบบเงียบๆ
5. Verify จริงบน production ทำไม่ได้จนกว่า Claude/CEO จะรัน SQL + deploy edge function จริง —
   ระบุในรายงานว่าขั้นตอนไหน blocked รออะไรอยู่ ห้ามบอกว่า "เสร็จแล้ว" ทั้งที่ยังไม่ได้ verify จริงบนเว็บ

---

## Where things live

- Production/admin repo: `D:\AI-Workspace\projects\kmorackbarcustom.github.io\` (remote `kmorackbarcustom/kmorackbarcustom.github.io`)
- Landing/catalog repo: `D:\AI-Workspace\projects\kmo-landing-page\` (remote `Gutumrod/kmo-landing-page`)
- Supabase HR project: `ybyseaenceyswjnwdmdf` — anon key อยู่ใน `hr-staff.html:472`
- Supabase booking project (ห้ามแตะในงานนี้): `xfhpwxjywqgqefbncumm`
- Pattern อ้างอิง: `supabase/functions/internal-proxy/index.ts`, `vehicle-intake/src/supabase.js`
