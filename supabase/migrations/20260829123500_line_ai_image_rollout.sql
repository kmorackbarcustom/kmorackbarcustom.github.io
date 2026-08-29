-- Phase 5 kill switch. Keep image AI disabled on deploy; owner-only live E2E must pass before `all`.
insert into public.system_settings (key, value, description)
values ('line_ai_image_rollout', 'off', 'LINE image AI rollout stage: off | owner_only | all')
on conflict (key) do nothing;
