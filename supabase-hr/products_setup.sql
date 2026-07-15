-- KMO catalog products setup
--
-- IMPORTANT:
-- - Run this against the HR Supabase project only:
--   ybyseaenceyswjnwdmdf
-- - Do not run this against the booking project:
--   xfhpwxjywqgqefbncumm
-- - This creates the public-read catalog table used by the landing page.

create table if not exists public.products (
  id text primary key,
  brand text,
  model text,
  name text not null,
  price integer not null default 0,
  category text not null,
  description text,
  image_url text,
  shopee_url text,
  allow_booking boolean not null default true,
  allow_order boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "anon can read products" on public.products;
create policy "anon can read products"
on public.products
for select
to anon
using (true);

-- Explicit grants keep the table exposed through the Data API while RLS still
-- controls row access. Do not grant anon insert/update/delete.
grant usage on schema public to anon;
grant select on table public.products to anon;
