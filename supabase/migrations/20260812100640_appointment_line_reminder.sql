-- New setting, following the existing pickup_reminder_hour pattern.
insert into public.system_settings (key, value, description)
values ('appointment_reminder_hour', '10', 'Bangkok hour (0-23) to run appointment-reminder cron job')
on conflict (key) do nothing;

-- Required for the customers upsert in line-webhook (onConflict: line_uid).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_line_uid_key'
  ) then
    alter table public.customers add constraint customers_line_uid_key unique (line_uid);
  end if;
end $$;

-- pg_cron job — mirrors the existing pickup-reminder job's exact shape (same project,
-- same anon key literal already used by that job — confirmed by reading cron.job directly).
select cron.schedule(
  'appointment-reminder',
  '0 3 * * *',  -- 03:00 UTC = 10:00 Asia/Bangkok (matches appointment_reminder_hour=10 above)
  $cron$
  select net.http_post(
    url := 'https://xfhpwxjywqgqefbncumm.supabase.co/functions/v1/appointment-reminder',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmaHB3eGp5d3FncWVmYm5jdW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjIxMTQsImV4cCI6MjA4ODM5ODExNH0.GRfJ8aY9FgfMw18Vld4m2R6mE2cOwUsJw3OXOJEt0is"}'::jsonb
  );
  $cron$
);
