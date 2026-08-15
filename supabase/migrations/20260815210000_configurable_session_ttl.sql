-- Session TTL (line_chat_sessions) was hardcoded at 30 min in code. CEO wants it tunable
-- (thinking 6-24h) without a redeploy, same pattern as other shop-config settings.
insert into public.system_settings (key, value, description) values
  ('session_ttl_hours', '6', 'จำนวนชั่วโมงที่ AI จำบทสนทนาต่อเนื่องได้ก่อนเริ่มใหม่ (ลูกค้าเงียบเกินนี้ = สนทนาใหม่)')
on conflict (key) do nothing;

create or replace function public.update_shop_config_setting(setting_key text, setting_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if setting_key not in (
    'shop_name', 'shop_description', 'shop_address', 'shop_contact', 'shop_hours', 'ai_persona_prompt',
    'session_ttl_hours'
  ) then
    raise exception 'setting_key % is not an editable shop-config key', setting_key;
  end if;

  insert into public.system_settings (key, value)
  values (setting_key, setting_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return true;
end;
$$;
