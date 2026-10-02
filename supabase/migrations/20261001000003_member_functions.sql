-- =====================================================================
-- Funciones para viajeros (sin cuenta)
-- ---------------------------------------------------------------------
-- Solo las ejecuta service_role (el servidor Nuxt). Reciben el token.
-- Errores (campo "message"):
--   MEMBER_NOT_FOUND   token inválido
--   DEADLINE_PASSED    pasó la fecha límite para confirmar y votar
--   INVALID_STATUS     respuesta distinta de accepted/declined
--   NOT_ACCEPTED       intenta votar sin haber confirmado
--   PLACE_NOT_FOUND    el lugar no existe o es de otro viaje
--   PLACE_NOT_VOTABLE  el lugar no está en votación
-- =====================================================================

create or replace function public._member_lock(p_token text)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_member from public.members where token = p_token for update;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_member;
end;
$$;

create or replace function public._member_find(p_token text)
returns public.members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_member from public.members where token = p_token;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_member;
end;
$$;

create or replace function public._member_assert_open(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.trips where id = p_trip_id and now() > rsvp_deadline) then
    raise exception 'DEADLINE_PASSED' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Ver viaje + itinerario (si está publicado)
-- ---------------------------------------------------------------------
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
        'title',      coalesce(s.title, p.name),
        'notes',      s.notes,
        'place_id',   s.place_id
      ) order by s.day, s.start_time nulls last, s.sort_order, s.created_at)
      from public.itinerary_stops s
      left join public.places p on p.id = s.place_id
      where s.trip_id = v_trip.id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Confirmar / declinar (cambiable hasta la fecha límite).
-- Al declinar, el trigger borra sus votos.
-- ---------------------------------------------------------------------
create or replace function public.member_respond(p_token text, p_status public.member_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  v_member := public._member_lock(p_token);
  perform public._member_assert_open(v_member.trip_id);

  if p_status is null or p_status not in ('accepted', 'declined') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  update public.members
  set status = p_status, responded_at = now()
  where id = v_member.id;

  return public.member_get_trip(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Lugares visibles para el viajero: los que están en votación y los
-- que forman parte del itinerario publicado.
--   vote_count  = total de votos (sin decir de quién)
--   voted       = si este viajero votó por él
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
      'ai_info',      case when p.ai_status = 'ready' then p.ai_info end,
      'vote_count',   (select count(*) from public.votes v where v.place_id = p.id),
      'voted',        exists (select 1 from public.votes v where v.place_id = p.id and v.member_id = v_member.id)
    ) order by p.sort_order, p.created_at)
    from public.places p
    where p.trip_id = v_member.trip_id
      and (
        p.votable
        or (v_published and exists (select 1 from public.itinerary_stops s where s.place_id = p.id))
      )
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- Votar / quitar voto (un voto por lugar)
-- ---------------------------------------------------------------------
create or replace function public.member_vote(p_token text, p_place_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_place  public.places;
begin
  v_member := public._member_lock(p_token);
  perform public._member_assert_open(v_member.trip_id);

  if v_member.status <> 'accepted' then
    raise exception 'NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  select * into v_place from public.places where id = p_place_id and trip_id = v_member.trip_id;
  if not found then
    raise exception 'PLACE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_place.votable then
    raise exception 'PLACE_NOT_VOTABLE' using errcode = 'P0001';
  end if;

  insert into public.votes (place_id, member_id, trip_id)
  values (p_place_id, v_member.id, v_member.trip_id)
  on conflict do nothing;

  return public.member_list_places(p_token);
end;
$$;

create or replace function public.member_unvote(p_token text, p_place_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  v_member := public._member_lock(p_token);
  perform public._member_assert_open(v_member.trip_id);

  delete from public.votes where place_id = p_place_id and member_id = v_member.id;

  return public.member_list_places(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos: solo service_role
-- ---------------------------------------------------------------------
revoke all on function public._member_lock(text)                            from public, anon, authenticated;
revoke all on function public._member_find(text)                            from public, anon, authenticated;
revoke all on function public._member_assert_open(uuid)                     from public, anon, authenticated;
revoke all on function public.member_get_trip(text)                         from public, anon, authenticated;
revoke all on function public.member_respond(text, public.member_status)    from public, anon, authenticated;
revoke all on function public.member_list_places(text)                      from public, anon, authenticated;
revoke all on function public.member_vote(text, uuid)                       from public, anon, authenticated;
revoke all on function public.member_unvote(text, uuid)                     from public, anon, authenticated;

grant execute on function public.member_get_trip(text)                      to service_role;
grant execute on function public.member_respond(text, public.member_status) to service_role;
grant execute on function public.member_list_places(text)                   to service_role;
grant execute on function public.member_vote(text, uuid)                    to service_role;
grant execute on function public.member_unvote(text, uuid)                  to service_role;
