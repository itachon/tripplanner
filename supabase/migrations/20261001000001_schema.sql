-- =====================================================================
-- Planificador de viajes — esquema base
-- =====================================================================
-- Modelo de acceso (igual que el sistema de invitaciones):
--   * Administradores: usuarios de Supabase Auth, acceso por RLS.
--   * Viajeros (miembros): SIN cuenta. Entran con su link único. Nunca
--     tocan las tablas: el servidor Nuxt llama a las funciones member_*
--     con la service key, pasando el token.
--   * El rol "anon" no tiene acceso a nada.
-- =====================================================================

create type public.member_status as enum ('pending', 'accepted', 'declined');

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Viajes
--   time_zone: zona del destino. Se usa para mostrar la fecha límite y
--   saber qué día del viaje es "hoy". Los horarios del itinerario se
--   guardan en hora local del lugar (date + time), sin conversiones.
-- ---------------------------------------------------------------------
create table public.trips (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid()
                         references public.profiles (id) on delete cascade,
  name                 text not null check (length(trim(name)) between 1 and 120),
  destination          text check (destination is null or length(destination) <= 160),
  description          text,
  start_date           date not null,
  end_date             date not null,
  time_zone            text not null default 'America/Santiago',
  rsvp_deadline        timestamptz not null,
  itinerary_published  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint trip_dates_valid check (end_date >= start_date),
  constraint trip_length_valid check (end_date - start_date <= 120)
);

create index trips_owner_idx on public.trips (owner_id);

-- Valida que la zona horaria exista (pg_timezone_names)
create or replace function public.check_trip_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Zona horaria no válida: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger trips_time_zone_check
  before insert or update of time_zone on public.trips
  for each row execute function public.check_trip_time_zone();

-- ---------------------------------------------------------------------
-- Co-administradores (los asigna solo el creador)
-- ---------------------------------------------------------------------
create table public.trip_admins (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_admins_user_idx on public.trip_admins (user_id);

-- ---------------------------------------------------------------------
-- Miembros del viaje (siempre individuales)
-- ---------------------------------------------------------------------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status        public.member_status not null default 'pending',
  responded_at  timestamptz,
  notes         text,          -- nota interna, el viajero no la ve
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint members_id_trip_uq unique (id, trip_id)
);

create index members_trip_idx on public.members (trip_id);

-- ---------------------------------------------------------------------
-- Lugares (puntos en el mapa)
--   votable = aparece en la lista de destinos para votar
--   ai_info = ficha generada por Gemini (se genera una vez y se guarda)
-- ---------------------------------------------------------------------
create table public.places (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 160),
  address          text,
  latitude         double precision not null check (latitude between -90 and 90),
  longitude        double precision not null check (longitude between -180 and 180),
  mapbox_id        text,
  category         text,
  description      text,          -- nota del administrador
  photo_path       text,          -- bucket "place-photos"
  votable          boolean not null default true,
  sort_order       int not null default 0,
  ai_info          jsonb,
  ai_status        text check (ai_status in ('pending', 'ready', 'error')),
  ai_error         text,
  ai_requested_at  timestamptz,
  ai_generated_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint places_id_trip_uq unique (id, trip_id)
);

create index places_trip_idx on public.places (trip_id, sort_order);

-- ---------------------------------------------------------------------
-- Itinerario: paradas por día, en hora local
--   Una parada puede apuntar a un lugar del mapa o ser libre
--   ("Vuelo Santiago → Seúl", "Tiempo libre").
-- ---------------------------------------------------------------------
create table public.itinerary_stops (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  place_id    uuid,
  title       text check (title is null or length(trim(title)) between 1 and 160),
  day         date not null,
  start_time  time,
  end_time    time,
  notes       text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (place_id, trip_id) references public.places (id, trip_id) on delete cascade,
  constraint stop_has_subject check (place_id is not null or title is not null),
  constraint stop_times_valid check (end_time is null or start_time is null or end_time > start_time)
);

create index itinerary_stops_trip_idx on public.itinerary_stops (trip_id, day, start_time, sort_order);

-- La parada debe caer dentro de las fechas del viaje
create or replace function public.check_stop_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trips
    where id = new.trip_id and new.day between start_date and end_date
  ) then
    raise exception 'stop_day_outside_trip' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger itinerary_stops_day_check
  before insert or update of day, trip_id on public.itinerary_stops
  for each row execute function public.check_stop_day();

-- No se pueden acortar las fechas del viaje dejando paradas fuera
create or replace function public.check_trip_dates_vs_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.itinerary_stops
    where trip_id = new.id and (day < new.start_date or day > new.end_date)
  ) then
    raise exception 'stops_outside_new_dates' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trips_dates_vs_stops
  before update of start_date, end_date on public.trips
  for each row execute function public.check_trip_dates_vs_stops();

-- ---------------------------------------------------------------------
-- Votos: un voto por miembro por lugar
-- ---------------------------------------------------------------------
create table public.votes (
  place_id    uuid not null,
  member_id   uuid not null,
  trip_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (place_id, member_id),
  foreign key (place_id, trip_id) references public.places (id, trip_id) on delete cascade,
  foreign key (member_id, trip_id) references public.members (id, trip_id) on delete cascade
);

create index votes_trip_idx on public.votes (trip_id);
create index votes_member_idx on public.votes (member_id);

-- Solo votan miembros que aceptaron, en lugares votables
create or replace function public.check_vote_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members where id = new.member_id and status = 'accepted') then
    raise exception 'NOT_ACCEPTED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.places where id = new.place_id and votable) then
    raise exception 'PLACE_NOT_VOTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger votes_check
  before insert or update on public.votes
  for each row execute function public.check_vote_allowed();

-- Si un miembro declina (o vuelve a pendiente), se borran sus votos
create or replace function public.clear_votes_when_not_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'accepted' then
    delete from public.votes where member_id = new.id;
  end if;
  return new;
end;
$$;

create trigger members_clear_votes
  after update of status on public.members
  for each row
  when (old.status is distinct from new.status)
  execute function public.clear_votes_when_not_accepted();

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger itinerary_stops_updated_at before update on public.itinerary_stops
  for each row execute function public.set_updated_at();
