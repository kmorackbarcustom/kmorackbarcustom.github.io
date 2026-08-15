-- Reuses the 2.5 units/day capacity threshold already established in get_schedule_health()
-- for the admin dashboard, so "busy" means the same thing everywhere in the system.
create or replace function public.get_upcoming_queue_density(from_date date, days integer default 7)
returns table (work_date date, units numeric, is_over_capacity boolean)
language sql
stable
as $$
  select
    d::date as work_date,
    coalesce(sum(pa.units), 0)::numeric(6,2) as units,
    coalesce(sum(pa.units), 0) > 2.5 as is_over_capacity
  from generate_series(from_date, from_date + (days - 1), interval '1 day') d
  left join public.production_allocations pa on pa.work_date = d::date
  group by d
  order by d;
$$;
