# baseline ฐานข้อมูลสด KMO-Booking (2026-11-15)

สำเนานิยามจริงของฝั่งจอง+คิวผลิต ดึงแบบอ่านอย่างเดียว (Management API `read_only:true`) ก่อนแก้อะไรทั้งสิ้น
ตาราง: bookings, holidays, production_allocations, orders · project ref `xfhpwxjywqgqefbncumm`

- `functions.sql` function ใน schema public ที่อ้างถึง 4 ตารางนี้ / trigger เรียก / อยู่ในรายชื่อบรีฟ T1 (บรรทัดหัวบล็อก = owner, security definer, volatility, config, acl)
- `tables.sql` คอลัมน์ · constraint · index · `policies-rls.sql` RLS + acl ตาราง + policy · `triggers.sql` trigger
- `cron-jobs.md` ชื่อ+ตารางเวลา+active เท่านั้น (ไม่มี command)
- `manifest.json` sha256 ของแต่ละบล็อกหลัง normalize (ตัดช่องว่างท้ายบรรทัด)

เช็กว่าสดยังตรง baseline: `node scripts/db-drift-check.mjs` → 0 ตรง · 1 drift · 2 เรียกสดไม่ได้ · 3 พบค่าลับ (ต้องมี token ใน env `SUPABASE_ACCESS_TOKEN`)

ไม่ครอบคลุม: สิทธิ์ระดับคอลัมน์ · view · sequence · ตารางอื่น (เช่น customers) · cron command · edge function

## function นอกขอบเขต (ลงชื่ออย่างเดียว ไม่ดึงนิยาม) — 11 ตัว
- `public.commit_next_doc_number(p_doc_type text, p_year integer)`
- `public.get_line_token()`
- `public.line_append_chat_history(p_user_id text, p_message jsonb, p_max_history integer, p_event_ids text[])`
- `public.line_image_batch_append(p_line_uid text, p_message_id text, p_reply_token text, p_event_timestamp bigint, p_provider_type text, p_webhook_event_id text)`
- `public.line_image_batch_claim(p_line_uid text, p_since timestamp with time zone, p_max_wait_seconds integer)`
- `public.line_webhook_event_claim(p_event_id text, p_event_type text, p_reclaim_after_seconds integer)`
- `public.peek_next_doc_number(p_doc_type text, p_year integer)`
- `public.search_products(customer_message text)`
- `public.send_line(target_id text, message_text text)`
- `public.trigger_calculate_queue()`
- `public.update_shop_config_setting(setting_key text, setting_value text)`
