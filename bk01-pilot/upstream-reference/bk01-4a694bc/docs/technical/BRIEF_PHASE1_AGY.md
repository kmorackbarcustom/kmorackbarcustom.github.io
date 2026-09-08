# 📄 BRIEF PHASE 1: SYSTEM IMPLEMENTATION SPECIFICATION
## "Local Service Booking & LINE Automation SaaS"

> **ผู้พิจารณาอนุมัติ:** คุณฟรี (CEO)  
> **แหล่งความจริงเดียว (Single Source of Truth - SSOT):** อ้างอิงจาก [`PRODUCT_RULES_V1.md`](file:///D:/AI-Workspace/projects/local-service-booking-saas/PRODUCT_RULES_V1.md) เป็นหลักบังคับสูงสุด  
> **คำเตือนสถาปัตยกรรม:** ห้ามสร้างระบบต่อบนสมมติฐานเก่าเด็ดขาด! อ่านตารางสรุปการกลับทิศสถาปัตยกรรม (Architectural Pivots) ด้านล่างนี้ก่อนเริ่มเขียนโค้ด!

---

## 🚨 ตารางสรุปสิ่งที่กลับทิศจากข้อตกลงเดิม (ARCHITECTURAL REVERSALS & PIVOTS)

> ⚠️ **IMPORTANT FOR AGENTS & DEVELOPERS:**  
> โค้ดหรือสมมติฐานเดิมก่อนหน้านี้บางส่วนมีจุดที่ถูกยกเลิกและเปลี่ยนทิศทาง (Pivoted) เพื่อความปลอดภัย สเกลระบบ และ UX ของร้านค้า  
> **โปรดตรวจทานตารางนี้ก่อนรันคำสั่งหรือเขียนโค้ดต่อเด็ดขาด!**

| หัวข้อการพัฒนา | ❌ สมมติฐาน/โค้ดเดิม (Deprecated) | ✅ สถาปัตยกรรมใหม่ใน `PRODUCT_RULES_V1` (Mandatory SSOT) | เหตุผลและความจำเป็น |
| :--- | :--- | :--- | :--- |
| **1. LINE OA Architecture** | แต่ละร้านใส่ LINE Token/Secret ของตัวเองผ่านหน้า UI หลังบ้าน | **ใช้ LINE OA กลางของระบบตัวเดียว (`@central_oa_id`) สำหรับทุกร้านค้า** *(ลบช่องกรอก Token ร้านออกจาก UI)* | ร้านค้าไม่ต้องเซ็ตอัปเอง (0-Friction Onboarding) และป้องกัน Token รั่วไหล |
| **2. รหัสการจอง (Booking Code)** | รันหมายเลขคิวแยกร้านค้าได้ (เช่น `#BK-1042`) | **รหัสจองต้องเป็นรหัสสุ่ม `BK-` + 6 อักขระ ห้ามซ้ำกันทั้งระบบ (เช่น `BK-7K2M9Q`)** | LINE Webhook กลางตัวเดียวต้องแกะ `shop_id` จากรหัสจอง + `link_token` ทั้งระบบได้ทันที |
| **3. การนับโควตาคิวจอง** | นับโควตาตั้งแต่กดสร้างจองคิว หรือนับตอนสถานะ `hold` | **นับโควตาเฉพาะตอนสถานะเปลี่ยนเป็น `confirmed` เท่านั้น** | ป้องกันยิงจองสร้างค้าง (`hold`) เผาโควตาร้านจนหมด |
| **4. การคำนวณคิวว่าง (Availability)** | เช็คความว่างฝั่ง UI / ไม่ล็อกทรัพยากรช่างตั้งแต่แรก | **ล็อกคิว 15 นาที (`hold`) + ใช้ Exclusion Constraints บน Postgres DB + ผูกช่างโหมด "ใครก็ได้" ตั้งแต่ Hold** | ป้องกันคิวจองซ้ำซ้อน (Race Condition) 100% |
| **5. การคิดมัดจำ & กติกาสลิป** | รับยอดเงินมัดจำจากฝั่ง Client / โชว์สลิปแบบ Public | **คำนวณราคามัดจำฝั่ง Server เท่านั้น + บันทึกใน Private Bucket (Signed URL 5 นาที) + Unique Index บน `trans_ref`** | กันสลิปซ้ำ 100% และกัน Client ปลอมแปลงยอดเงินมัดจำ |
| **6. เส้นแบ่งแพ็กเกจ (Tier Line)** | มี/ไม่มี ระบบ LINE แจ้งเตือน | **ข้อความใบนัด LINE ได้ทุกแพ็กเกจ แต่ "Reminder เตือนก่อนนัด 24 ชม./1 ชม." เป็นของ Pro 990 เท่านั้น** | ทำให้แพ็กเกจ Basic 490 สมบูรณ์ใช้งานได้จริง ส่วน Pro ขายการแก้ปัญหา No-show |

---

## 🎯 ขอบเขตงาน Phase 1 (Core Engine & Refactoring Tasks)

อ้างอิงข้อกำหนดกติกาธุรกิจจาก [`PRODUCT_RULES_V1.md`](file:///D:/AI-Workspace/projects/local-service-booking-saas/PRODUCT_RULES_V1.md):

### 1. Database Schema & RPC Functions Layer
- [ ] **2-Axis Status Columns:** ปรับตาราง `bookings` ให้มี `status` (`hold`, `pending_review`, `confirmed`, `completed`, `cancelled`, `no_show`, `expired`) และ `deposit_status` (`not_required`, `awaiting`, `submitted`, `verified`, `rejected`, `refunded`)
- [ ] **Database State Machine Transition Trigger:** สร้าง Database Trigger บล็อกไม่ให้เปลี่ยนสถานะนอกเหนือจาก State Machine ในข้อ 1.3 และบันทึกทุกการเปลี่ยนแปลงลง `booking_status_history`
- [ ] **Exclusion Constraints:** สร้าง Postgres Range Exclusion Constraint กันจองเวลาซ้อนทับกันของช่างคนเดียวกันในช่วง `[start - buffer_before, end + buffer_after]`
- [ ] **System-wide Unique Trans Ref Index:** เพิ่ม `UNIQUE INDEX` บน `bookings.trans_ref` ป้องกันการใช้สลิปใบเดิมซ้ำทั้งระบบ
- [ ] **Global Unique Booking Code Generator:** สร้าง Database Function เจนรหัสจองรูปแบบ `BK-` + 6 อักขระสุ่ม (ตัด 0/O, 1/I ออก) ที่ไม่ซ้ำทั้งระบบ

### 2. Temporary Hold & Availability Engine
- [ ] **15-Min Temporary Hold:** สร้าง RPC Function `create_booking_hold()` สำหรับสร้างคิว `hold` 15 นาที + ล็อกช่างคนแรกที่ว่างที่สุดกรณีเลือกระบุช่างแบบ "ใครก็ได้" (คำนวณจากงานน้อยสุด ➔ ช่องว่างชิดงานเดิมที่สุด ➔ staff_id)
- [ ] **Query Availability Filter:** เขียน SQL Query คำนวณคิวว่างโดยกรองคิว `hold` ที่ `expires_at < NOW()` ออกทันทีโดยไม่ต้องรอ Background Cron Job
- [ ] **Auto-Extend Hold:** เพิ่มเวลา +5 นาทีอัตโนมัติเมื่อเริ่มอัปโหลดสลิป (ต่อได้ครั้งเดียว) และรีเซ็ต 15 นาทีใหม่เมื่อร้านค้าปฏิเสธสลิป

### 3. Central LINE OA Automation & Link Token Binding
- [ ] **Remove Shop LINE Access Tokens:** ถอดช่องกรอก LINE Channel Access Token / Secret ออกจากหน้าตั้งค่าร้านค้าใน UI Dashboard (เนื่องจากเปลี่ยนมาใช้ Central LINE Bot)
- [ ] **Auto-Populated LINE Add-Friend Link Generator:** สร้าง Utility สร้างลิงก์ผูกคิว:
  `https://line.me/R/oaMessage/@{central_oa_id}/?ผูกคิว%20{booking_code}-{link_token}`
  โดย `link_token` เป็นรหัสสุ่ม 4 อักขระ มีอายุ 24 ชม. และใช้ผูกได้ครั้งเดียว
- [ ] **Central LINE Webhook Handler (`/api/line/webhook`):** แกะข้อความที่ส่งเข้ามา ค้นหา `booking_code` และ `link_token` ทั้งระบบเพื่อผูก `line_user_id` เข้ากับ `booking` และ `customer`
- [ ] **Notification Job Queue:** สร้างตาราง `notification_jobs` รองรับการยิงแจ้งเตือนร้านค้าเมื่อคิวเข้า และยิง Reminder ให้ลูกค้าล่วงหน้า 24 ชม. และ 1 ชม. (เว้น Quiet Hours 21:00-08:00 น.)

### 4. Admin Dashboard & Customer UI Alignment
- [ ] **Customer UI Wording Standard:** ปรับหน้าเว็บฝั่งลูกค้าให้แสดงข้อความตามสถานะจริง:
  - `hold` ➔ *"จองไว้ให้แล้ว กรุณาโอนมัดจำภายใน X:XX นาที"*
  - `pending_review` ➔ *"ได้รับสลิปแล้ว กำลังตรวจสอบการชำระเงิน"*
  - `confirmed` ➔ *"ยืนยันคิวเรียบร้อย"*  
  *(ห้ามแสดงคำว่า "อนุมัติแล้ว" หรือ "สำเร็จ" ก่อนสถานะเป็น `confirmed`)*
- [ ] **Read-Only Shop Booking URL:** ปรับช่อง URL ร้านค้าใน Dashboard เป็นกล่องแสดงลิงก์อ่านอย่างเดียว (`/book/{slug}`) พร้อมปุ่มกดคัดลอกลิงก์ (Copy Link)

---

## 📌 เอกสารอ้างอิงประกอบโครงการ
1. **กติกาผลิตภัณฑ์ฉบับอนุมัติ (Master SSOT):** [`PRODUCT_RULES_V1.md`](file:///D:/AI-Workspace/projects/local-service-booking-saas/PRODUCT_RULES_V1.md)
2. **แผนธุรกิจ & โมเดลการเงิน:** [`OFFICIAL_BUSINESS_MODEL.md`](file:///D:/AI-Workspace/projects/local-service-booking-saas/docs/business/OFFICIAL_BUSINESS_MODEL.md)
3. **ข้อกำหนดราคา & สิทธิแพ็กเกจ:** [`PRICING_SPEC.md`](file:///D:/AI-Workspace/projects/local-service-booking-saas/docs/business/PRICING_SPEC.md)
