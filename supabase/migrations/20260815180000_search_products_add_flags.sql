drop function if exists public.search_products(text);

create or replace function public.search_products(customer_message text)
returns table (id text, brand text, model text, name text, price integer, category text, allow_booking boolean, allow_order boolean)
language sql
stable
as $$
  select distinct p.id, p.brand, p.model, p.name, p.price, p.category, p.allow_booking, p.allow_order
  from public.products p
  where
    (p.brand is not null and customer_message ilike '%' || p.brand || '%')
    or (p.model is not null and customer_message ilike '%' || p.model || '%')
    or exists (
      select 1 from unnest(string_to_array(coalesce(p.search_tags, ''), ',')) as tag
      where length(trim(tag)) > 1 and customer_message ilike '%' || trim(tag) || '%'
    )
    or exists (
      select 1 from unnest(string_to_array(coalesce(p.aliases, ''), ',')) as alias
      where length(trim(alias)) > 1 and customer_message ilike '%' || trim(alias) || '%'
    )
  order by p.brand, p.category
  limit 20;
$$;
