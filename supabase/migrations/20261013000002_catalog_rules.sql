-- =====================================================================
-- Catálogo compartido de lugares (2/2): reglas
--   quién ve, quién edita y hasta cuándo, búsqueda, cercanía,
--   portadas de viaje y permisos de las fotos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Editable: solo quien lo creó, y solo hasta que termina el viaje donde
-- se creó (en la zona horaria de ese viaje). Sin viaje de origen: bloqueado.
-- ---------------------------------------------------------------------
create or replace function public.catalog_place_editable(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_places c
    join public.trips t on t.id = c.origin_trip_id
    where c.id = p_id
      and c.created_by = (select auth.uid())
      and public.is_trip_admin(c.origin_trip_id)
      and t.end_date >= (now() at time zone t.time_zone)::date
  );
$$;

revoke all on function public.catalog_place_editable(uuid) from public, anon;
grant execute on function public.catalog_place_editable(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lo que el navegador recibe de un lugar. Sin created_by ni
-- origin_trip_id: revelarían quién organiza qué.
-- ---------------------------------------------------------------------
create type public.catalog_place_row as (
  id             uuid,
  name           text,
  address        text,
  latitude       double precision,
  longitude      double precision,
  mapbox_id      text,
  category       text,
  photo_path     text,
  is_public      boolean,
  is_mine        boolean,
  editable       boolean,
  -- solo para el creador: lo usa un viaje distinto del de origen
  used_elsewhere boolean
);

create or replace function public.catalog_places_visible()
returns setof public.catalog_place_row
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.address, c.latitude, c.longitude, c.mapbox_id, c.category, c.photo_path, c.is_public,
         coalesce(c.created_by = (select auth.uid()), false),
         public.catalog_place_editable(c.id),
         coalesce(c.created_by = (select auth.uid()), false) and exists (
           select 1 from public.places p
           where p.catalog_place_id = c.id and p.trip_id is distinct from c.origin_trip_id
         )
  from public.catalog_places c
  where c.is_public
     or c.created_by = (select auth.uid())
     or exists (
       select 1 from public.places p
       where p.catalog_place_id = c.id and public.is_trip_admin(p.trip_id)
     );
$$;

revoke all on function public.catalog_places_visible() from public, anon;
grant execute on function public.catalog_places_visible() to authenticated;

-- Distancia en metros entre dos puntos (haversine)
create or replace function public._distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- ---------------------------------------------------------------------
-- Buscar en el catálogo por nombre o dirección. Los más cercanos al
-- punto dado van primero. p_exclude_trip: no listar lo que ese viaje ya tiene.
-- ---------------------------------------------------------------------
create or replace function public.catalog_search(
  p_query        text,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_exclude_trip uuid default null,
  p_limit        int default 5
)
returns setof public.catalog_place_row
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    -- % y _ se buscan literales
    select '%' || replace(replace(replace(trim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           length(trim(coalesce(p_query, ''))) as len
  )
  select v.*
  from public.catalog_places_visible() v, q
  where q.len >= 2
    and v.is_public
    and (v.name ilike q.pat or v.address ilike q.pat)
    and (
      p_exclude_trip is null
      or not public.is_trip_admin(p_exclude_trip)
      or not exists (select 1 from public.places p where p.trip_id = p_exclude_trip and p.catalog_place_id = v.id)
    )
  order by case when p_lat is null or p_lng is null then 0
                else public._distance_m(p_lat, p_lng, v.latitude, v.longitude) end,
           v.name
  limit least(greatest(coalesce(p_limit, 5), 1), 5);
$$;

revoke all on function public.catalog_search(text, double precision, double precision, uuid, int) from public, anon;
grant execute on function public.catalog_search(text, double precision, double precision, uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- Lugares del catálogo a p_meters o menos de un punto (máximo 1 km).
-- ---------------------------------------------------------------------
create or replace function public.catalog_near(
  p_lat          double precision,
  p_lng          double precision,
  p_meters       double precision default 100,
  p_exclude_trip uuid default null
)
returns setof public.catalog_place_row
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
  from public.catalog_places_visible() v
  -- recorte grueso antes de calcular la distancia exacta (0,01° ≈ 1,1 km)
  where v.is_public
    and v.latitude between p_lat - 0.01 and p_lat + 0.01
    and v.longitude between p_lng - 0.01 / greatest(cos(radians(p_lat)), 0.01)
                        and p_lng + 0.01 / greatest(cos(radians(p_lat)), 0.01)
    and public._distance_m(p_lat, p_lng, v.latitude, v.longitude) <= least(greatest(coalesce(p_meters, 100), 1), 1000)
    and (
      p_exclude_trip is null
      or not public.is_trip_admin(p_exclude_trip)
      or not exists (select 1 from public.places p where p.trip_id = p_exclude_trip and p.catalog_place_id = v.id)
    )
  order by public._distance_m(p_lat, p_lng, v.latitude, v.longitude)
  limit 5;
$$;

revoke all on function public.catalog_near(double precision, double precision, double precision, uuid) from public, anon;
grant execute on function public.catalog_near(double precision, double precision, double precision, uuid) to authenticated;

-- Id del lugar del catálogo al que pertenece una ruta catalog/<id>/<archivo>
-- (null para cualquier otra ruta, como las antiguas <trip_id>/<archivo>).
create or replace function public.storage_catalog_place_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_id text := split_part(p_name, '/', 2);
begin
  if split_part(p_name, '/', 1) = 'catalog'
     and v_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_id::uuid;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Editar un lugar del catálogo. p_patch trae solo lo que cambia:
-- name, address, category, photo_path, is_public.
-- ---------------------------------------------------------------------
create or replace function public.catalog_place_update(p_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.catalog_place_editable(p_id) then
    raise exception 'PLACE_LOCKED' using errcode = '42501';
  end if;

  if p_patch ? 'is_public' and not (p_patch->>'is_public')::boolean and exists (
    select 1
    from public.places p
    join public.catalog_places c on c.id = p.catalog_place_id
    where c.id = p_id and c.is_public and p.trip_id is distinct from c.origin_trip_id
  ) then
    raise exception 'PLACE_SHARED' using errcode = 'P0001';
  end if;

  -- la foto solo puede ser: ninguna, la que ya tiene o un archivo de la carpeta de este lugar
  if p_patch ? 'photo_path'
     and coalesce(p_patch->>'photo_path', '') <> ''
     and (p_patch->>'photo_path') is distinct from (select c.photo_path from public.catalog_places c where c.id = p_id)
     and public.storage_catalog_place_id(p_patch->>'photo_path') is distinct from p_id then
    raise exception 'Ruta de foto no válida' using errcode = '22023';
  end if;

  begin
    update public.catalog_places c set
      name       = case when p_patch ? 'name' then trim(p_patch->>'name') else c.name end,
      address    = case when p_patch ? 'address' then nullif(trim(p_patch->>'address'), '') else c.address end,
      category   = case when p_patch ? 'category' then nullif(trim(p_patch->>'category'), '') else c.category end,
      photo_path = case when p_patch ? 'photo_path' then nullif(p_patch->>'photo_path', '') else c.photo_path end,
      is_public  = case when p_patch ? 'is_public' then (p_patch->>'is_public')::boolean else c.is_public end
    where c.id = p_id;
  exception when unique_violation then
    -- volverlo público chocó con otro lugar público del mismo identificador de Mapbox
    raise exception 'PLACE_DUPLICATE' using errcode = 'P0001';
  end;
end;
$$;

revoke all on function public.catalog_place_update(uuid, jsonb) from public, anon;
grant execute on function public.catalog_place_update(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Un lugar privado desaparece al quitarlo de su último viaje.
-- ---------------------------------------------------------------------
create or replace function public.places_drop_private_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.catalog_places c
  where c.id = old.catalog_place_id
    and not c.is_public
    and not exists (select 1 from public.places p where p.catalog_place_id = c.id);
  return null;
end;
$$;

create trigger places_drop_private_catalog after delete on public.places
  for each row execute function public.places_drop_private_catalog();

-- ---------------------------------------------------------------------
-- Portada de cada viaje que administro: la primera foto subida, en el
-- orden del organizador, y la primera foto de ficha.
-- ---------------------------------------------------------------------
create or replace function public.trip_covers()
returns table (trip_id uuid, photo_path text, info_photo_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
    (select c.photo_path
       from public.places p join public.catalog_places c on c.id = p.catalog_place_id
      where p.trip_id = t.id and c.photo_path is not null
      order by p.sort_order, p.created_at limit 1),
    (select pi.photo_url
       from public.places p join public.place_info pi on pi.catalog_place_id = p.catalog_place_id
      where p.trip_id = t.id and pi.photo_url is not null
      order by p.sort_order, p.created_at limit 1)
  from public.trips t
  where public.is_trip_admin(t.id);
$$;

revoke all on function public.trip_covers() from public, anon;
grant execute on function public.trip_covers() to authenticated;

-- ---------------------------------------------------------------------
-- Fotos: las nuevas van en catalog/<catalog_place_id>/<archivo> y las
-- escribe solo quien puede editar ese lugar. Las rutas antiguas
-- (<trip_id>/<archivo>) conservan su regla.
-- ---------------------------------------------------------------------
-- Un archivo que algún lugar del catálogo todavía muestra no se toca: los
-- flujos legítimos mueven la referencia (photo_path) antes de borrar el viejo.
create or replace function public.storage_photo_unreferenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.catalog_places c where c.photo_path = p_name);
$$;

revoke all on function public.storage_photo_unreferenced(text) from public, anon;
grant execute on function public.storage_photo_unreferenced(text) to authenticated;

drop policy place_photos_insert on storage.objects;
drop policy place_photos_update on storage.objects;
drop policy place_photos_delete on storage.objects;
drop policy place_photos_select on storage.objects;

create policy place_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
  );

create policy place_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
    and public.storage_photo_unreferenced(name)
  )
  with check (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
    and public.storage_photo_unreferenced(name)
  );

create policy place_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
    and public.storage_photo_unreferenced(name)
  );

create policy place_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
  );
