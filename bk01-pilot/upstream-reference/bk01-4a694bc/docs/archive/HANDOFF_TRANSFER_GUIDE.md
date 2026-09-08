# 📦 เอกสารส่งต่อโครงการ (Project Handoff & Transfer Guide)
## "Local Service Booking & LINE Automation SaaS"
> **วันที่จัดทำ:** 2026-08-05  
> **จัดทำโดย:** Antigravity Agent (AGY)  
> **สถานะโครงการ:** Phase 1 Completed (Repository Initialized & Database Schema Ready)

---

## 🎯 1. ภาพรวมโครงการและกลยุทธ์ (Project Strategy)

โครงการนี้เป็น **Micro-SaaS ทำเงินอัตโนมัติสำหรับตัวคนเดียว (Solopreneur)** ออกแบบมาเพื่อกลุ่มร้านค้าบริการท้องถิ่น (Local Service Businesses) เช่น ร้านตัดผม, สปา, คลินิก, คาร์แคร์ และร้านบริการทั่วไป

### 🔑 จุดขายหลัก (Killer Features)
1. **ระบบจองคิวระบุช่าง/บริการ:** หน้า Web Booking มอบความสะดวกแก่ลูกค้าบนสมาร์ตโฟน
2. **แนบสลิป/มัดจำ PromptPay QR:** บังคับมัดจำก่อนยืนยันคิว เพื่อแก้ปัญหา **No-show** และการจองทิ้ง 100%
3. **ระบบแจ้งเตือน LINE OA อัตโนมัติ:** ส่งข้อความยืนยันคิวและแจ้งเตือนล่วงหน้าเข้า LINE ลูกค้า + แจ้งเตือนร้านค้า
4. **100% Self-service Subscription Model:** ให้ทดลองใช้ฟรี 14 วัน -> สมัครสมาชิกตัดเงินรายเดือนอัตโนมัติ (490 - 990 บาท/เดือน) โดยไม่ต้องใช้เซลส์โทรขาย

---

## 📁 2. โครงสร้างไฟล์และไดเรกทอรี (Directory Structure)

```text
D:\AI-Workspace\projects\local-service-booking-saas\
├── package.json                   # Root Monorepo Configuration (Workspaces)
├── README.md                      # เอกสารสรุปคำสั่งและภาพรวมสถาปัตยกรรม
├── HANDOFF_TRANSFER_GUIDE.md      # เอกสารส่งต่อโครงการฉบับนี้
└── supabase/
    └── migrations/
        └── 20260805000000_local_service_initial_schema.sql  # Database Schema & RLS Policies
```

---

## 🗄️ 3. Supabase Database Schema (พร้อมใช้สำหรับเซ็ตอัปบน Supabase)

ไฟล์ SQL Migration ถูกเตรียมไว้อย่างสมบูรณ์ที่:  
`supabase/migrations/20260805000000_local_service_initial_schema.sql`

### โครงสร้างตารางหลัก (Tables Breakdown)
| ชื่อตาราง (Table Name) | หน้าที่และรายละเอียด |
| :--- | :--- |
| **`local_service.shops`** | เก็บข้อมูลร้านค้า, Subdomain Slug, เลข PromptPay, การตั้งค่ายอดมัดจำ, วันหมดช่วงทดลองใช้ฟรี (`trial_ends_at`) |
| **`local_service.shop_users`** | เก็บสิทธิ์ผู้ใช้งานร้านค้า (`owner`, `admin`, `staff`) เชื่อมกับ `auth.users` |
| **`local_service.services`** | รายการบริการ, ระยะเวลา (นาที), ราคาเต็ม, ยอดมัดจำเฉพาะบริการ |
| **`local_service.staff`** | รายชื่อพนักงาน/ช่าง/ช่องบริการประจำร้าน |
| **`local_service.customers`** | เบอร์โทรศัพท์, ชื่อ, LINE User ID, ประวัติ Blacklist |
| **`local_service.bookings`** | รายการจองคิว, สถานะมัดจำ (`pending`, `verified`), URL สลิปโอนเงิน, วันเวลาจอง |

---

## 💻 4. ขั้นตอนการตั้งค่าในเครื่องใหม่ (Setup Guide for New Machine)

เมื่อย้ายโฟลเดอร์โครงการไปที่เครื่องใหม่ (แนะนำให้อยู่ในไดรฟ์ `D:\AI-Workspace\projects\local-service-booking-saas` หรือตามความสะดวก):

### Step 1: ติดตั้ง Dependencies
เปิด Terminal ในโฟลเดอร์โครงการ แล้วรันคำสั่ง:
```bash
npm install
```

### Step 2: รัน Supabase Migration
หากมี Supabase CLI หรือใช้ Supabase Dashboard:
- คัดลอกโค้ด SQL จากไฟล์ `supabase/migrations/20260805000000_local_service_initial_schema.sql` ไปรันใน **SQL Editor** ของ Supabase project ใหม่
- หรือรันผ่าน CLI:
```bash
npx supabase db push
```

### Step 3: คำสั่งรันระบบ (Commands)
```bash
# รันแอปสำหรับลูกค้าจองคิว (Customer Booking App - Port 3000)
npm run dev:shop

# รันระบบหลังบ้านเจ้าของร้าน (Shop Admin Dashboard - Port 3001)
npm run dev:admin

# รัน Build ตรวจสอบความถูกต้อง
npm run build
```

---

## 🗺️ 5. แผนงานสำหรับ AI Agent ในเครื่องใหม่ (Roadmap for Next AI Session)

เมื่อเปิดเซสชันใหม่กับ AI Agent ในเครื่องใหม่ ให้ส่งคำสั่งนี้แก่ AI:

```text
เปิดอ่านไฟล์ HANDOFF_TRANSFER_GUIDE.md ในโปรเจกต์ D:\AI-Workspace\projects\local-service-booking-saas แล้วลุย Phase 2: พัฒนา Next.js Web App ต่อได้เลย
```

### 📋 งานที่ต้องทำต่อใน Phase 2:
1. **สร้างแอป `apps/booking-consumer` (Next.js App Router):**
   - หน้า Mobile-first Booking Flow (เลือกบริการ -> เลือกช่าง/เวลา -> โอนมัดจำ QR -> แนบสลิป)
   - เชื่อมต่อ LINE Login / LINE Messaging API SDK
2. **สร้างแอป `apps/booking-admin` (Next.js App Router):**
   - หน้า Sign-up / Self-service Shop Setup
   - หน้า Dashboard จัดการคิวประจำวัน + ปุ่มกดอนุมัติสลิปมัดจำ
   - หน้าตั้งค่าบริการ & ช่างประจำร้าน
   - หน้าจัดการ Subscription & Trial Banner 14 วัน
