-- Adding p.name as a match field means generic product-type words ("แคชบาร์") now match every
-- brand, and the fixed limit 20 was crowding out the actually-relevant vehicle's rows (e.g. bmw
-- c400gt) behind alphabetically-earlier brands that only matched on the generic name. Rank rows
-- that also match brand/model (the vehicle actually being discussed) ahead of name-only matches.
drop function if exists public.search_products(text);

create or replace function public.search_products(customer_message text)
returns table (id text, brand text, model text, name text, price integer, category text, allow_booking boolean, allow_order boolean)
language sql
stable
as $$
  select p.id, p.brand, p.model, p.name, p.price, p.category, p.allow_booking, p.allow_order
  from public.products p
  where
    (p.brand is not null and customer_message ilike '%' || p.brand || '%')
    or (p.model is not null and customer_message ilike '%' || p.model || '%')
    or (length(trim(p.name)) > 1 and customer_message ilike '%' || trim(p.name) || '%')
    or exists (
      select 1 from unnest(string_to_array(coalesce(p.search_tags, ''), ',')) as tag
      where length(trim(tag)) > 1 and customer_message ilike '%' || trim(tag) || '%'
    )
    or exists (
      select 1 from unnest(string_to_array(coalesce(p.aliases, ''), ',')) as alias
      where length(trim(alias)) > 1 and customer_message ilike '%' || trim(alias) || '%'
    )
  order by
    (case when p.brand is not null and customer_message ilike '%' || p.brand || '%' then 1 else 0 end
     + case when p.model is not null and customer_message ilike '%' || p.model || '%' then 1 else 0 end) desc,
    p.brand, p.category
  limit 20;
$$;
