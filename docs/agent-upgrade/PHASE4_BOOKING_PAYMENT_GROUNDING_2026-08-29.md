# Phase 4 — Booking Payment Grounding

Status: PASS (local only)
Baseline: main @ f581ece
Deploy: not deployed

## Objective
Prevent LINE AI from treating an existing booking as fully confirmed when payment/deposit truth is not grounded in current business data.

## Changes
- `get_order_status` booking context now includes `deposit`, `deposit_paid`, `deposit_paid_at`, `total_amount`, `total_paid`.
- Payment facts are labeled explicitly for the model.
- Payment/deposit answers must be refreshed from `get_order_status` in the current turn; chat memory is not authoritative for money.
- Output guard blocks unsupported paid/unpaid claims.
- Output guard removes promise wording such as `เจอกันวันที่...`, `ลงคิวให้แล้ว`, `จองให้แล้ว`, `ยืนยันนัดให้แล้ว`.

## Intended customer wording
Report what the system currently says, for example:

`ตรวจสอบแล้วครับ พบข้อมูลการจองวันที่ 3 ก.ย. 2569 ในระบบ`
`สถานะคิว: ยืนยัน`
`แต่ตอนนี้ระบบยังไม่พบการยืนยันมัดจำครับ`

Do not turn a read-only status lookup into a new booking confirmation.

## Non-scope
No booking/order write, no migration, no payment mutation, no automatic deposit confirmation, no deploy.
