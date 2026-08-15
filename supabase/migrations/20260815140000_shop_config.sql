create table if not exists public.shop_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shop_faqs enable row level security;

-- security definer: lets internal-proxy's shared staff passcode write shop-info settings
-- without opening all of system_settings (which also holds line_ai_rollout etc.) to blind PATCH.
create or replace function public.update_shop_config_setting(setting_key text, setting_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if setting_key not in (
    'shop_name', 'shop_description', 'shop_address', 'shop_contact', 'shop_hours', 'ai_persona_prompt'
  ) then
    raise exception 'setting_key % is not an editable shop-config key', setting_key;
  end if;

  insert into public.system_settings (key, value)
  values (setting_key, setting_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

insert into public.system_settings (key, value, description) values
  ('shop_name', 'KMO Rack Bar Custom', 'ชื่อร้าน ใช้แนะนำตัวใน AI chat'),
  ('shop_description', 'ร้านทำแร็ค/บาร์/แคชบาร์แต่งมอเตอร์ไซค์', 'คำอธิบายร้านสั้นๆ ใช้ใน AI chat'),
  ('shop_address', '', 'ที่อยู่/พื้นที่ให้บริการ ใช้ใน AI chat'),
  ('shop_contact', '', 'เบอร์โทร/ช่องทางติดต่ออื่นๆ ใช้ใน AI chat'),
  ('shop_hours', '', 'เวลาเปิด-ปิด/วันหยุด ใช้ใน AI chat'),
  ('ai_persona_prompt', '', 'โทนการคุย, เรียกลูกค้าว่าอะไร, กฎเพิ่มเติมที่ต้องการให้ AI ทำตาม')
on conflict (key) do nothing;
