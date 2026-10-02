-- =====================================================================
-- Seguridad para administradores: helpers, RLS, permisos de columnas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (security definer para no caer en recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips
    where id = p_trip_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_trip_admin(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips
    where id = p_trip_id and owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.trip_admins
    where trip_id = p_trip_id and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_trip_owner(uuid) from public, anon;
revoke all on function public.is_trip_admin(uuid) from public, anon;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.is_trip_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Activar RLS en todo
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_admins      enable row level security;
alter table public.members          enable row level security;
alter table public.places           enable row level security;
alter table public.itinerary_stops  enable row level security;
alter table public.votes            enable row level security;

-- anon no toca ninguna tabla
revoke all on public.profiles, public.trips, public.trip_admins,
              public.members, public.places, public.itinerary_stops, public.votes
  from anon;

-- Partimos de cero para authenticated y damos solo lo necesario
revoke all on public.profiles, public.trips, public.trip_admins,
              public.members, public.places, public.itinerary_stops, public.votes
  from authenticated;

-- ---------------------------------------------------------------------
-- profiles: ves el tuyo y el de quienes administran viajes contigo
-- ---------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.trips p
      left join public.trip_admins pa on pa.trip_id = p.id
      where (p.owner_id = profiles.id or pa.user_id = profiles.id)
        and public.is_trip_admin(p.id)
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- trips
--   crear: cualquier usuario (queda como dueño)
--   ver/editar: dueño o co-admin
--   borrar: solo el dueño
--   owner_id no es editable
-- ---------------------------------------------------------------------
grant select, insert, delete on public.trips to authenticated;
grant update (name, destination, description, start_date, end_date, time_zone, rsvp_deadline, itinerary_published)
  on public.trips to authenticated;

-- Nota: se compara owner_id directo además del helper, porque en un
-- INSERT ... RETURNING (insert().select() en supabase-js) el helper
-- todavía no ve la fila recién creada.
create policy trips_select on public.trips
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_trip_admin(id));

create policy trips_insert on public.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy trips_update on public.trips
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_trip_admin(id))
  with check (owner_id = (select auth.uid()) or public.is_trip_admin(id));

create policy trips_delete on public.trips
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- trip_admins
--   ver: cualquier admin de ese viaje
--   agregar/quitar: solo el dueño (agregar se hace con add_trip_admin
--   porque hay que buscar al usuario por email)
--   Un co-admin puede quitarse a sí mismo (salir del viaje)
-- ---------------------------------------------------------------------
grant select, delete on public.trip_admins to authenticated;

create policy trip_admins_select on public.trip_admins
  for select to authenticated
  using (public.is_trip_admin(trip_id));

create policy trip_admins_delete on public.trip_admins
  for delete to authenticated
  using (public.is_trip_owner(trip_id) or user_id = (select auth.uid()));

create or replace function public.add_trip_admin(p_trip_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Solo el creador del viaje puede asignar administradores'
      using errcode = '42501';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No existe un usuario registrado con ese correo'
      using errcode = 'P0002';
  end if;

  if v_user_id = (select auth.uid()) then
    raise exception 'Ya eres el creador de este viaje'
      using errcode = 'P0001';
  end if;

  insert into public.trip_admins (trip_id, user_id)
  values (p_trip_id, v_user_id)
  on conflict do nothing;

  return v_user_id;
end;
$$;

revoke all on function public.add_trip_admin(uuid, text) from public, anon;
grant execute on function public.add_trip_admin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- members
--   El admin edita nombre y nota. El estado lo escribe solo el viajero.
-- ---------------------------------------------------------------------
grant select, delete on public.members to authenticated;
grant insert (trip_id, name, notes) on public.members to authenticated;
grant update (name, notes) on public.members to authenticated;

create policy members_select on public.members
  for select to authenticated using (public.is_trip_admin(trip_id));
create policy members_insert on public.members
  for insert to authenticated with check (public.is_trip_admin(trip_id));
create policy members_update on public.members
  for update to authenticated
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy members_delete on public.members
  for delete to authenticated using (public.is_trip_admin(trip_id));

-- Regenerar el link de un miembro (invalida el anterior)
create or replace function public.regenerate_member_token(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  update public.members m
  set token = replace(gen_random_uuid()::text, '-', '')
  where m.id = p_member_id
    and public.is_trip_admin(m.trip_id)
  returning m.token into v_token;

  if v_token is null then
    raise exception 'Miembro no encontrado' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;

revoke all on function public.regenerate_member_token(uuid) from public, anon;
grant execute on function public.regenerate_member_token(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- places
--   Los campos ai_* los escribe solo el servidor (service_role) al
--   generar la ficha con Gemini.
-- ---------------------------------------------------------------------
grant select, delete on public.places to authenticated;
grant insert (trip_id, name, address, latitude, longitude, mapbox_id, category,
              description, photo_path, votable, sort_order)
  on public.places to authenticated;
grant update (name, address, latitude, longitude, mapbox_id, category,
              description, photo_path, votable, sort_order)
  on public.places to authenticated;

create policy places_select on public.places
  for select to authenticated using (public.is_trip_admin(trip_id));
create policy places_insert on public.places
  for insert to authenticated with check (public.is_trip_admin(trip_id));
create policy places_update on public.places
  for update to authenticated
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy places_delete on public.places
  for delete to authenticated using (public.is_trip_admin(trip_id));

-- ---------------------------------------------------------------------
-- itinerary_stops
-- ---------------------------------------------------------------------
grant select, delete on public.itinerary_stops to authenticated;
grant insert (trip_id, place_id, title, day, start_time, end_time, notes, sort_order)
  on public.itinerary_stops to authenticated;
grant update (place_id, title, day, start_time, end_time, notes, sort_order)
  on public.itinerary_stops to authenticated;

create policy itinerary_stops_select on public.itinerary_stops
  for select to authenticated using (public.is_trip_admin(trip_id));
create policy itinerary_stops_insert on public.itinerary_stops
  for insert to authenticated with check (public.is_trip_admin(trip_id));
create policy itinerary_stops_update on public.itinerary_stops
  for update to authenticated
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy itinerary_stops_delete on public.itinerary_stops
  for delete to authenticated using (public.is_trip_admin(trip_id));

-- ---------------------------------------------------------------------
-- votes
--   El admin ve quién votó qué. Votar: solo el viajero (member_vote).
-- ---------------------------------------------------------------------
grant select on public.votes to authenticated;

create policy votes_select on public.votes
  for select to authenticated using (public.is_trip_admin(trip_id));
