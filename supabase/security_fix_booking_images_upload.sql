-- Hardening (2026-07-12): add server-side file type/size limits to upload
-- buckets and scope the upload policy more tightly.

-- 1. Enforce image-only, 5MB cap at the Storage engine level.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'],
    file_size_limit = 5242880  -- 5MB
where id = 'booking-images';

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'],
    file_size_limit = 5242880
where id = 'vehicle-intake-images';

-- 2. Scope the upload policy to the expected object key format.
drop policy if exists "anon can upload booking images" on storage.objects;
create policy "anon can upload booking images"
on storage.objects for insert to anon
with check (
  bucket_id = 'booking-images'
  and name ~* '^[^/]+/[0-9]+-[0-9]+\.(jpg|jpeg|png|webp|heic|heif)$'
);
