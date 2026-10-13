-- =====================================================================
-- Catálogo compartido de lugares (1/2): estructura y migración de datos
--   catalog_places  el lugar en sí: uno solo para todos los viajes
--   places          pasa a ser "este viaje usa este lugar": conserva su
--                   id (votos y paradas no cambian) y lo propio del viaje
--   place_info      la ficha cuelga del lugar del catálogo
-- authenticated no toca catalog_places: todo pasa por funciones.
-- =====================================================================

create table public.catalog_places (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) between 1 and 160),
  address         text,
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  mapbox_id       text check (mapbox_id is null or length(trim(mapbox_id)) > 0),
  category        text,
  photo_path      text,          -- bucket "place-photos"
  is_public       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  origin_trip_id  uuid references public.trips (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Un solo lugar público por identificador de Mapbox
create unique index catalog_places_public_mapbox_uq
  on public.catalog_places (mapbox_id) where is_public and mapbox_id is not null;
create index catalog_places_geo_idx on public.catalog_places (latitude, longitude);
create index catalog_places_origin_idx on public.catalog_places (origin_trip_id);

create trigger catalog_places_updated_at before update on public.catalog_places
  for each row execute function public.set_updated_at();

alter table public.catalog_places enable row level security;
revoke all on public.catalog_places from anon, authenticated;

-- ---------------------------------------------------------------------
-- Mover los lugares existentes al catálogo: uno por lugar, públicos,
-- con el dueño del viaje como creador. No se une nada.
-- ---------------------------------------------------------------------
alter table public.places add column catalog_place_id uuid;
update public.places set catalog_place_id = gen_random_uuid();

with src as (
  select p.*, t.owner_id,
         case when nullif(trim(p.mapbox_id), '') is not null
               and trim(p.mapbox_id) !~ '^-?[0-9.]+,-?[0-9.]+$'
              then trim(p.mapbox_id) end as real_mapbox
  from public.places p
  join public.trips t on t.id = p.trip_id
), ranked as (
  select *, row_number() over (partition by real_mapbox order by created_at, id) as rn from src
)
insert into public.catalog_places
  (id, name, address, latitude, longitude, mapbox_id, category, photo_path, is_public, created_by, origin_trip_id, created_at)
select catalog_place_id, name, address, latitude, longitude,
       -- si dos lugares traían el mismo identificador, solo el primero lo conserva
       case when real_mapbox is not null and rn = 1 then real_mapbox end,
       category, photo_path, true, owner_id, trip_id, created_at
from ranked;

alter table public.places
  alter column catalog_place_id set not null,
  add constraint places_catalog_place_fk foreign key (catalog_place_id)
    references public.catalog_places (id) on delete restrict,
  add constraint places_trip_catalog_uq unique (trip_id, catalog_place_id);
create index places_catalog_idx on public.places (catalog_place_id);

-- ---------------------------------------------------------------------
-- place_info: de "por lugar del viaje" a "por lugar del catálogo"
-- ---------------------------------------------------------------------
drop policy place_info_select on public.place_info;
alter table public.place_info add column catalog_place_id uuid;
update public.place_info pi set catalog_place_id = p.catalog_place_id
  from public.places p where p.id = pi.place_id;
delete from public.place_info where catalog_place_id is null;
alter table public.place_info
  drop constraint place_info_pkey,
  drop column place_id,
  drop column trip_id,
  alter column catalog_place_id set not null,
  add primary key (catalog_place_id),
  add constraint place_info_catalog_place_fk foreign key (catalog_place_id)
    references public.catalog_places (id) on delete cascade;

-- ---------------------------------------------------------------------
-- places: fuera lo que pasó al catálogo y las columnas ai_* sin uso.
-- Los lugares se crean solo con trip_add_place; al editar, el viaje
-- cambia únicamente su votación, orden y nota.
-- ---------------------------------------------------------------------
alter table public.places
  drop column name, drop column address, drop column latitude, drop column longitude,
  drop column mapbox_id, drop column category, drop column photo_path,
  drop column ai_info, drop column ai_status, drop column ai_error,
  drop column ai_requested_at, drop column ai_generated_at;

drop policy places_insert on public.places;
revoke insert, update on public.places from authenticated;
grant update (votable, sort_order, description) on public.places to authenticated;

-- ---------------------------------------------------------------------
-- ¿Puede el usuario ver este lugar del catálogo?
-- Público, o lo creó, o administra un viaje que lo usa.
-- ---------------------------------------------------------------------
create or replace function public.catalog_place_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catalog_places c
    where c.id = p_id
      and (
        c.is_public
        or c.created_by = (select auth.uid())
        or exists (
          select 1 from public.places p
          where p.catalog_place_id = c.id and public.is_trip_admin(p.trip_id)
        )
      )
  );
$$;

revoke all on function public.catalog_place_visible(uuid) from public, anon;
grant execute on function public.catalog_place_visible(uuid) to authenticated;

create policy place_info_select on public.place_info
  for select to authenticated using (public.catalog_place_visible(catalog_place_id));

-- ---------------------------------------------------------------------
-- trip_add_place: única vía para sumar un lugar a un viaje.
--   p_catalog_place_id  usa un lugar que ya existe en el catálogo
--   p_new               crea uno nuevo (o reutiliza el público con el
--                       mismo identificador de Mapbox)
-- Devuelve { place_id, catalog_place_id, created }.
-- ---------------------------------------------------------------------
create or replace function public.trip_add_place(
  p_trip_id          uuid,
  p_catalog_place_id uuid default null,
  p_new              jsonb default null,
  p_votable          boolean default true,
  p_description      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_cat     uuid;
  v_place   uuid;
  v_created boolean := false;
  v_public  boolean;
  v_mapbox  text;
begin
  if not public.is_trip_admin(p_trip_id) then
    raise exception 'No administras este viaje' using errcode = '42501';
  end if;

  if p_catalog_place_id is not null then
    if not public.catalog_place_visible(p_catalog_place_id) then
      raise exception 'PLACE_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_cat := p_catalog_place_id;
  else
    if p_new is null then
      raise exception 'Faltan los datos del lugar' using errcode = '22023';
    end if;
    v_public := coalesce((p_new->>'is_public')::boolean, true);
    v_mapbox := nullif(trim(p_new->>'mapbox_id'), '');
    -- useMapbox arma un id de respaldo "lat,lng" cuando Mapbox no entrega uno: no es un identificador
    if v_mapbox ~ '^-?[0-9.]+,-?[0-9.]+$' then
      v_mapbox := null;
    end if;

    if v_public and v_mapbox is not null then
      select id into v_cat from public.catalog_places where is_public and mapbox_id = v_mapbox;
    end if;

    if v_cat is null then
      begin
        insert into public.catalog_places
          (name, address, latitude, longitude, mapbox_id, category, is_public, created_by, origin_trip_id)
        values (
          trim(p_new->>'name'),
          nullif(trim(p_new->>'address'), ''),
          (p_new->>'latitude')::double precision,
          (p_new->>'longitude')::double precision,
          v_mapbox,
          nullif(trim(p_new->>'category'), ''),
          v_public, v_uid, p_trip_id
        )
        returning id into v_cat;
        v_created := true;
      exception when unique_violation then
        -- otro organizador creó el mismo lugar de Mapbox en este instante
        select id into v_cat from public.catalog_places where is_public and mapbox_id = v_mapbox;
      end;
    end if;
  end if;

  insert into public.places (trip_id, catalog_place_id, votable, description, sort_order)
  values (
    p_trip_id, v_cat, coalesce(p_votable, true), nullif(trim(p_description), ''),
    coalesce((select max(sort_order) from public.places where trip_id = p_trip_id), 0) + 1
  )
  on conflict (trip_id, catalog_place_id) do nothing
  returning id into v_place;

  if v_place is null then
    select id into v_place from public.places where trip_id = p_trip_id and catalog_place_id = v_cat;
  end if;

  return jsonb_build_object('place_id', v_place, 'catalog_place_id', v_cat, 'created', v_created);
end;
$$;

revoke all on function public.trip_add_place(uuid, uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.trip_add_place(uuid, uuid, jsonb, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Funciones del viajero: leen los datos del lugar desde el catálogo.
-- La forma de lo que devuelven no cambia.
-- ---------------------------------------------------------------------
create or replace function public.member_list_places(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member    public.members;
  v_published boolean;
begin
  v_member := public._member_find(p_token);
  select itinerary_published into v_published from public.trips where id = v_member.trip_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           p.id,
      'name',         c.name,
      'address',      c.address,
      'latitude',     c.latitude,
      'longitude',    c.longitude,
      'category',     c.category,
      'description',  p.description,
      'photo_path',   c.photo_path,
      'votable',      p.votable,
      'in_itinerary', exists (select 1 from public.itinerary_stops s where s.place_id = p.id),
      'info', case when pi.catalog_place_id is not null then jsonb_build_object(
        'history',       pi.history,
        'opening_hours', pi.opening_hours,
        'website',       pi.website,
        'phone',         pi.phone,
        'photo_url',     pi.photo_url,
        'photo_credit',  pi.photo_credit,
        'wikipedia_url', pi.wikipedia_url
      ) end,
      'vote_count',   (select count(*) from public.votes v where v.place_id = p.id),
      'voted',        exists (select 1 from public.votes v where v.place_id = p.id and v.member_id = v_member.id)
    ) order by p.sort_order, p.created_at)
    from public.places p
    join public.catalog_places c on c.id = p.catalog_place_id
    left join public.place_info pi on pi.catalog_place_id = p.catalog_place_id
    where p.trip_id = v_member.trip_id
      and (
        p.votable
        or (v_published and exists (select 1 from public.itinerary_stops s where s.place_id = p.id))
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.member_get_trip(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_trip   public.trips;
begin
  v_member := public._member_find(p_token);
  select * into v_trip from public.trips where id = v_member.trip_id;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'name',         v_member.name,
      'status',       v_member.status,
      'responded_at', v_member.responded_at
    ),
    'trip', jsonb_build_object(
      'name',          v_trip.name,
      'destination',   v_trip.destination,
      'description',   v_trip.description,
      'start_date',    v_trip.start_date,
      'end_date',      v_trip.end_date,
      'time_zone',     v_trip.time_zone,
      'rsvp_deadline', v_trip.rsvp_deadline
    ),
    'is_open',             now() <= v_trip.rsvp_deadline,
    'itinerary_published', v_trip.itinerary_published,
    'my_votes', (select count(*) from public.votes where member_id = v_member.id),
    'itinerary', case when v_trip.itinerary_published then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         s.id,
        'day',        s.day,
        'start_time', to_char(s.start_time, 'HH24:MI'),
        'end_time',   to_char(s.end_time, 'HH24:MI'),
        'title',      coalesce(s.title, c.name),
        'notes',      s.notes,
        'place_id',   s.place_id
      ) order by s.day, s.start_time nulls last, s.sort_order, s.created_at)
      from public.itinerary_stops s
      left join public.places p on p.id = s.place_id
      left join public.catalog_places c on c.id = p.catalog_place_id
      where s.trip_id = v_trip.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'budget_published', v_trip.budget_published,
    'budget', case when v_trip.budget_published then jsonb_build_object(
      'currency', v_trip.budget_currency,
      'me',       v_member.id,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'status', m.status) order by m.created_at)
        from public.members m where m.trip_id = v_trip.id
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',               i.id,
          'category',         i.category,
          'name',             i.name,
          'notes',            i.notes,
          'currency',         i.currency,
          'estimated_amount', i.estimated_amount,
          'extras',           i.extras,
          'actual_amount',    i.actual_amount,
          'actual_rate',      i.actual_rate,
          'paid_by',          i.paid_by,
          'paid_on',          i.paid_on,
          'member_ids', coalesce((
            select jsonb_agg(sh.member_id) from public.budget_item_shares sh where sh.item_id = i.id
          ), '[]'::jsonb)
        ) order by i.sort_order, i.created_at)
        from public.budget_items i where i.trip_id = v_trip.id
      ), '[]'::jsonb),
      'rates', coalesce((
        select jsonb_agg(jsonb_build_object('currency', r.currency, 'rate', r.rate) order by r.currency)
        from public.trip_exchange_rates r where r.trip_id = v_trip.id
      ), '[]'::jsonb)
    ) end
  );
end;
$$;
