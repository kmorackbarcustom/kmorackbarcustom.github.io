# KMO Agent Upgrade — Development Workflow

**Effective:** 2026-08-29
**Rule:** Docs → Brief → Build → Verify → Docs → Next Brief

## Canonical cycle

1. **Truth Reconcile** — ตรวจ code, production behavior, git HEAD และเอกสารปัจจุบันก่อน
2. **Update Current Docs** — แก้ PRD / implementation record / project context ให้ตรงของจริง
3. **Phase Brief** — สร้าง brief แยกสำหรับ phase ถัดไปก่อนเขียนโค้ด
4. **Build** — implement เฉพาะ scope ใน brief; ห้าม scope creep
5. **Verify** — tests + E2E/live evidence ตาม Definition of Done
6. **Close Phase** — บันทึก commit/deploy/evidence/known limitations
7. **Sync Docs** — อัปเดตเอกสารให้สะท้อนสิ่งที่เกิดขึ้นจริง
8. **Consistency Gate** — docs = code = production = git state
9. **Next Brief** — ค่อยสร้าง brief ของ phase ถัดไป แล้ววนใหม่

## Gate A — ก่อน Build

Brief ต้องมีอย่างน้อย: current HEAD/state, problem, objective, in-scope, out-of-scope, files/components affected, architecture/data flow, safety constraints, test cases, Definition of Done, deploy/rollback plan และ explicit do-not-touch list.

ถ้ายังตอบหัวข้อที่จำเป็นไม่ได้ ให้ถือว่า phase ยัง `NOT STARTED` และห้าม implement.

## Gate B — ก่อน Phase CLOSED

Phase จะปิดได้เมื่อมีครบ:

- Code complete ตาม brief
- Required tests ผ่าน
- E2E/live verification ผ่าน หรือ limitation ถูกบันทึกชัดเจน
- Production state ถูกตรวจหลัง deploy
- Commit/HEAD ถูกบันทึก
- Docs ถูก sync
- Known issues / deferred work ถูกบันทึก
- Working tree ไม่มีการเปลี่ยนแปลงที่ไม่เกี่ยวข้องหรือไม่ทราบที่มา

## Status vocabulary

- `NOT STARTED` — ยังไม่มี implementation; brief อาจยัง pending
- `IN PROGRESS` — brief ถูกล็อกและกำลัง implement/verify
- `CLOSED` — ผ่าน Gate B แล้ว
- `CLOSED (monitoring limitation recorded)` — implementation จบ แต่มี behavior ที่ต้องรอหลักฐานจาก traffic จริงและไม่ block การใช้งานปัจจุบัน

## Production safety

- ห้าม mutate order/booking ที่ active เพื่อ “แก้ข้อมูลให้ดูถูก” โดยไม่มี policy/approval ชัดเจน
- ถ้าแตะ `internal-proxy` ต้องผ่าน policy ที่ล็อกไว้ก่อน
- ทุก deploy ของ webhook ต้องยืนยัน `verify_jwt=false` ตาม `supabase/config.toml`
- AI eval ก่อน deploy ไม่แทน post-deploy monitoring; success reply logging ต้องคงอยู่
