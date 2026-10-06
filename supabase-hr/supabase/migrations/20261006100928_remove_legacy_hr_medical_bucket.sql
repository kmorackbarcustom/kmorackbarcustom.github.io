-- Applied to Supabase project kmo-hr (ybyseaenceyswjnwdmdf)
-- Remove the unused legacy HR medical certificate bucket.
-- The bucket was verified empty before removal.

set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'medical-certs';
delete from storage.buckets where id = 'medical-certs';
