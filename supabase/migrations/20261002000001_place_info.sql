-- =====================================================================
-- Info automática de lugares (sin IA): caché de Overpass/Wikidata/
-- Wikipedia/Commons/Pexels. Reemplaza a la ficha generada con Gemini.
-- =====================================================================

create table public.place_info (
  place_id        uuid primary key references public.places (id) on delete cascade,
  trip_id         uuid not null references public.trips (id) on delete cascade,
  mapbox_id       text,
  history         text,
  history_source  text,          -- 'wikipedia' | 'wikidata'
  opening_hours   text,          -- formato OSM, ej. "Mo-Fr 09:00-18:00"
  website         text,
  phone           text,
  photo_url       text,
  photo_credit    text,
  wikipedia_url   text,
  wikidata_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index place_info_trip_idx on public.place_info (trip_id);

alter table public.place_info enable row level security;

-- Mismo modelo que el resto: anon no toca nada, authenticated solo lee
-- lo de sus propios viajes, y solo el servidor (service_role) escribe.
revoke all on public.place_info from anon;
revoke all on public.place_info from authenticated;
grant select on public.place_info to authenticated;

create policy place_info_select on public.place_info
  for select to authenticated using (public.is_trip_admin(trip_id));

-- ---------------------------------------------------------------------
-- member_list_places: cambia 'ai_info' (ficha de Gemini) por 'info'
-- (datos de place_info). Resto de la función sin cambios.
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
      'name',         p.name,
      'address',      p.address,
      'latitude',     p.latitude,
      'longitude',    p.longitude,
      'category',     p.category,
      'description',  p.description,
      'photo_path',   p.photo_path,
      'votable',      p.votable,
      'in_itinerary', exists (select 1 from public.itinerary_stops s where s.place_id = p.id),
      'info', case when pi.place_id is not null then jsonb_build_object(
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
    left join public.place_info pi on pi.place_id = p.id
    where p.trip_id = v_member.trip_id
      and (
        p.votable
        or (v_published and exists (select 1 from public.itinerary_stops s where s.place_id = p.id))
      )
  ), '[]'::jsonb);
end;
$$;
