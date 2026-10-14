-- ---------------------------------------------------------------------
-- Lugares públicos del catálogo dentro de la zona visible del mapa.
-- Si p_west > p_east la zona cruza el antimeridiano. Los más cercanos al
-- centro van primero. p_exclude_trip: no listar lo que ese viaje ya tiene.
-- ---------------------------------------------------------------------
create or replace function public.catalog_in_bounds(
  p_south        double precision,
  p_west         double precision,
  p_north        double precision,
  p_east         double precision,
  p_exclude_trip uuid default null,
  p_limit        int default 200
)
returns setof public.catalog_place_row
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
  from public.catalog_places_visible() v
  where v.is_public
    and v.latitude between p_south and p_north
    and case when p_west <= p_east then v.longitude between p_west and p_east
             else v.longitude >= p_west or v.longitude <= p_east end
    and (
      p_exclude_trip is null
      or not public.is_trip_admin(p_exclude_trip)
      or not exists (select 1 from public.places p where p.trip_id = p_exclude_trip and p.catalog_place_id = v.id)
    )
  order by public._distance_m((p_south + p_north) / 2, (p_west + p_east) / 2, v.latitude, v.longitude), v.name
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

revoke all on function public.catalog_in_bounds(double precision, double precision, double precision, double precision, uuid, int) from public, anon;
grant execute on function public.catalog_in_bounds(double precision, double precision, double precision, double precision, uuid, int) to authenticated;
