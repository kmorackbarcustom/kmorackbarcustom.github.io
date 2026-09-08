# 🗺️ MASTER ROADMAP: Local Service Booking & LINE Automation SaaS (V2 - V4)

> **ผู้พิจารณาอนุมัติ:** คุณฟรี (CEO)  
> **สถานะโครงการ:** Checkpoint V3 Completed (LINE OA Integration & Clean UI) + Approved Business Model & Architecture (`OFFICIAL_BUSINESS_MODEL.md`)

---

## 📌 OVERVIEW MILESTONES

| Checkpoint | รายละเอียด Milestone | สถานะ |
| :--- | :--- | :--- |
| **V1 Setup** | Monorepo setup, Database Schema, 3-Step Booking Page, Admin Dashboard Basic | ✅ COMPLETED |
| **V2 Engine** | Dynamic Slot Calculator, Staff Schedules, Lunch Breaks (12:00-13:00), Shop Weekly Off & Special Holidays | ✅ COMPLETED |
| **V3 LINE OA** | LINE Flex Message Card Receipts, Central LINE Bot Architecture, Webhook Security, Clean Customer UI | ✅ COMPLETED |
| **V4 Verification** | 100% Automated Slip Verification API (EasySlip / SlipOK) & Stripe Subscription Billing Integration | 🟡 NEXT TARGET |

---

## 🎯 DETAILS BY CHECKPOINT

### 🟢 Checkpoint V1 & V2 (Completed)
- [x] Structure Next.js 16 Monorepo (`apps/booking-consumer`, `apps/booking-admin`)
- [x] Initial PostgreSQL SQL Migration Scripts (`20260805000000_local_service_initial_schema.sql`, `20260805010000_staff_schedules.sql`)
- [x] Dynamic Slot Calculator filtering out lunch breaks (12:00-13:00), staff weekly off days, and shop holidays
- [x] Dashboard Filter Views ("คิวทั้งหมด", "คิววันนี้", "คิวล่วงหน้า")
- [x] Security Hotfix: Removed plain-text secrets from client DOM
- [x] Merged Shop Profile & Services Management Tab with Shop Opening/Closing Hours (09:00 - 20:00)

---

### 🟢 Checkpoint V3: LINE OA Integration & Central Bot Architecture (Completed)
- [x] LINE Flex Message Card generator utility (`lib/line-flex.ts`) for Customer Receipt Cards
- [x] Next.js Route Handler Webhook (`/api/line/webhook`) with HMAC-SHA256 signature verification
- [x] Database Schema Migration (`20260805020000_line_notifications.sql`) for LINE User Accounts & Logs
- [x] Clean Customer UI: Removed preview/debug buttons, displaying clean receipt card with `@goodcutsbarber` LINE OA link
- [x] **Zero-Friction Central LINE Bot Architecture:** Central system bot sends notifications automatically (เตือนทันทีเมื่อจอง + เตือน 1 ชม. ก่อนนัด) โดยร้านค้าไม่ต้องสมัคร LINE Developers หรือเซ็ตอัป Token เอง

---

### 🟡 Checkpoint V4: 100% Auto Slip Verification & Stripe Subscription Billing (Next Target)
- [ ] Integration with 3rd-party Slip Verification API (EasySlip / SlipOK API)
- [ ] Automated PromptPay QR slip reader & transaction amount matching
- [ ] Stripe Checkout Integration for Subscription Tiers (Basic 490 THB/mo, Pro 990 THB/mo)
- [ ] Stripe Customer Portal for self-service subscription management & billing invoices
- [ ] Top-up Add-on Packs Purchasing Flow (+100 Bookings = 199 THB, +100 Auto-Slips = 99 THB)
- [ ] Day-10 Free Trial ROI Summary Report Generator & Early-Bird Discount Nudge Engine

---

## 💰 APPROVED PRICING & STAFF QUOTA SPECIFICATION
- **Free Trial (14 วัน):** 50 คิว / **พนักงาน 5 คน** / ทดลอง LINE OA & ตรวจสลิปออโต้ 10 ครั้ง
- **Basic Starter (490 บาท/เดือน):** 100 คิว/เดือน / **พนักงาน 5 คน** / PromptPay QR / ตรวจสลิปมือผ่าน Dashboard
- **Pro Plan (990 บาท/เดือน):** 500 คิว/เดือน / **พนักงาน 10 คน** / Central LINE OA อัตโนมัติ / ตรวจสลิปออโต้ 100 ครั้ง/เดือน
- **Top-up Add-ons:** `+100 คิว = 199 บาท` / `+100 เครดิตตรวจสลิป = 99 บาท` (ทบได้ ไม่มีวันหมดอายุ)
