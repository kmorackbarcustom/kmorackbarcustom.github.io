-- Moves the products catalog into the same Supabase project as line-webhook/internal-proxy,
-- so the AI chat can query it directly without a second cross-project client.
-- Previously lived in the separate kmo-hr project (schema in supabase-hr/), now retired there.
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
  search_tags text,
  aliases text,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
