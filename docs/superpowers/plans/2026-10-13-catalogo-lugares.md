# Catálogo compartido de lugares — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un lugar exista una sola vez en un catálogo común y cada viaje guarde aparte su votación, orden y nota, para que los organizadores reutilicen lugares en vez de duplicarlos.

**Architecture:** Tabla nueva `catalog_places` con los datos del lugar; `places` queda como vínculo viaje↔lugar y conserva su `id`, así votos y paradas no cambian. El navegador no lee ni escribe la tabla del catálogo: todo pasa por funciones de base (`trip_add_place`, `catalog_place_update`, `catalog_places_visible`, `catalog_search`, `catalog_near`, `trip_covers`) que aplican visibilidad y bloqueo. En la app, todo acceso al catálogo vive en un composable, `useCatalog`, y `useTripAdmin` entrega un `Place` aplanado con los nombres de campo de siempre.

**Tech Stack:** Nuxt 4, Nuxt UI 4, Supabase (Postgres, RLS, funciones `security definer`), TypeScript. Pruebas de base con PGlite (`npm run test:db`) y de funciones puras con `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-13-catalogo-lugares-design.md`

## Global Constraints

- Rama de trabajo: `feat/catalogo-lugares`. Mensajes de commit en español, estilo `feat: …` / `test: …`.
- Sin dependencias nuevas. Sin PostGIS: la distancia se calcula con trigonometría en SQL.
- **No aplicar las migraciones a la base remota hasta la Task 6**, y ahí solo con confirmación explícita del usuario. Hasta entonces la verificación es `npm run test:db`, `npm test`, `npm run typecheck` y `npm run build`; la app no se puede probar contra la base remota porque todavía tiene la estructura anterior.
- Esta rama no se puede desplegar ni fusionar sin aplicar antes la migración: código y base cambian juntos.
- `authenticated` no tiene ningún permiso directo sobre `catalog_places`. Nunca se le entregan `created_by` ni `origin_trip_id`.
- Códigos de error de las funciones, tal cual: `PLACE_NOT_FOUND`, `PLACE_LOCKED`, `PLACE_SHARED`, `PLACE_DUPLICATE`.
- Un lugar es editable solo si el usuario es `created_by`, el viaje de origen existe y su `end_date` es hoy o posterior en la zona horaria de ese viaje.
- Radio de "lugares cercanos": 100 m. Búsqueda en el catálogo: mínimo 2 caracteres, máximo 5 resultados.
- `mapbox_id` real: no vacío y no con la forma `"lat,lng"`.
- En la app, toda llamada a las funciones del catálogo va por `app/composables/useCatalog.ts`. `shared/types/database.types.ts` no se edita a mano: se regenera en la Task 6.
- Textos de interfaz en español, tratando de "tú".
- Antes de empezar, corre `npm run test:db`, `npm test` y `npm run typecheck` y anota los resultados como estado inicial.

## Review Focus

- Datos reales al migrar: los 10 lugares conservan su `id`, sus votos, sus paradas, su foto y su ficha, y la vista del viajero devuelve la misma forma que antes. → Task 1 (prueba de forma) y Task 6 (conteos antes y después).
- Guardar el formulario de un lugar bloqueado o ajeno: debe guardar votación y nota sin intentar editar el catálogo (si lo intenta, falla con `PLACE_LOCKED` y no guarda nada). → Task 4.
- Borrar de un viaje un lugar público con foto: la foto no se borra del almacenamiento, porque otros viajes la usan. → Task 4.
- Texto de búsqueda con `%`, `_` o de un solo carácter: no devuelve todo el catálogo ni falla. → Task 2.
- Agregar dos veces el mismo lugar del catálogo al mismo viaje (doble clic): devuelve el mismo vínculo, sin duplicar ni fallar. → Task 2.

---

### Task 1: Estructura del catálogo y migración de datos

**Files:**
- Create: `supabase/migrations/20261013000001_catalog_places.sql`
- Modify: `supabase/tests/rules.test.mjs`

**Interfaces:**
- Consumes: `public.is_trip_admin(uuid)`, `public.set_updated_at()`, `public._member_find(text)`, tablas `places`, `place_info`, `trips`, `profiles`.
- Produces:
  - Tabla `public.catalog_places (id, name, address, latitude, longitude, mapbox_id, category, photo_path, is_public, created_by, origin_trip_id, created_at, updated_at)`.
  - `public.places` con `catalog_place_id uuid not null` y sin `name`, `address`, `latitude`, `longitude`, `mapbox_id`, `category`, `photo_path`, `ai_*`.
  - `public.place_info` con clave `catalog_place_id` (sin `place_id` ni `trip_id`).
  - `public.catalog_place_visible(p_id uuid) returns boolean`.
  - `public.trip_add_place(p_trip_id uuid, p_catalog_place_id uuid default null, p_new jsonb default null, p_votable boolean default true, p_description text default null) returns jsonb` → `{ "place_id": uuid, "catalog_place_id": uuid, "created": boolean }`. `p_new` lleva `name`, `address`, `latitude`, `longitude`, `mapbox_id`, `category`, `is_public`.
  - `member_get_trip` y `member_list_places` con la misma forma de salida que antes.

- [ ] **Step 1: Adaptar las pruebas existentes (quedan en rojo)**

En `supabase/tests/rules.test.mjs`:

a) Después de la línea `const mplaces = …`, agrega el ayudante:

```js
const addPlace = async (uid, tripId, fields, opts = {}) => (await as('authenticated', uid,
  'select public.trip_add_place($1, null, $2::jsonb, $3, $4) r',
  [tripId, JSON.stringify(fields), opts.votable ?? true, opts.description ?? null])).rows[0].r
```

b) Reemplaza el bloque que va desde `const places = (await as('authenticated', B, \`insert into public.places …` hasta la línea `check('admin no puede escribir ai_info directo', …)` (inclusive) por:

```js
const added = []
for (const [name, latitude, longitude, votable] of [
  ['Gyeongbokgung', 37.5796, 126.9770, true],
  ['N Seoul Tower', 37.5512, 126.9882, true],
  ['Hotel Myeongdong', 37.5636, 126.9850, false],
]) added.push(await addPlace(B, trip.id, { name, latitude, longitude }, { votable }))
const [pPalacio, pTorre, pHotel] = added.map(r => r.place_id)
const [, cTorre] = added.map(r => r.catalog_place_id)
check('trip_add_place crea el lugar y lo marca como nuevo', added.every(r => r.created === true))
check('los lugares quedan en orden de llegada', (await db.query('select sort_order from public.places where trip_id = $1 order by sort_order', [trip.id])).rows.map(r => r.sort_order).join() === '1,2,3')
check('coordenadas fuera de rango rechazadas', /catalog_places_latitude_check/.test(await err('authenticated', A, 'select public.trip_add_place($1, null, $2::jsonb)', [trip.id, JSON.stringify({ name: 'x', latitude: 95, longitude: 0 })])))
check('admin no inserta lugares directo', /permission denied/.test(await err('authenticated', A, 'insert into public.places (trip_id, catalog_place_id) values ($1,$2)', [trip.id, cTorre])))
check('admin no lee la tabla del catálogo directo', /permission denied/.test(await err('authenticated', A, 'select * from public.catalog_places')))
check('admin solo cambia votación, orden y nota del lugar', /permission denied/.test(await err('authenticated', A, 'update public.places set catalog_place_id = $2 where id = $1', [pPalacio, cTorre])))
```

c) Reemplaza la línea de `otherPlace` por:

```js
const otherPlace = (await addPlace(C, otherTrip.id, { name: 'Busan', latitude: 35.1, longitude: 129.0 })).place_id
```

d) En la sección "Info automática", reemplaza el `insert into public.place_info …` por:

```js
await db.query(`insert into public.place_info (catalog_place_id, history) values ($1,'Torre icónica')`, [cTorre])
```

y agrega al final de esa sección:

```js
check('el viajero recibe los mismos campos de siempre', Object.keys((await mplaces(tPedro))[0]).sort().join() === 'address,category,description,id,in_itinerary,info,latitude,longitude,name,photo_path,vote_count,votable,voted')
check('la parada sin título toma el nombre del lugar', (await mget(tPedro)).itinerary.some(s => s.title === 'Gyeongbokgung' || s.title === 'N Seoul Tower'))
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:db`
Expected: FAIL. Las migraciones cargan, y la primera llamada a `public.trip_add_place` lanza `function public.trip_add_place(...) does not exist`.

- [ ] **Step 3: Escribir la migración**

Crea `supabase/migrations/20261013000001_catalog_places.sql`:

```sql
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
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:db`
Expected: PASS. Todas las migraciones cargan (`✔ migración 20261013000001_catalog_places.sql`) y termina con `0 fallidas`.

Run: `npm test`
Expected: mismo resultado que el estado inicial.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013000001_catalog_places.sql supabase/tests/rules.test.mjs
git commit -m "feat: tabla del catálogo de lugares y migración de los lugares existentes"
```

---

### Task 2: Reglas del catálogo (edición, bloqueo, búsqueda, cercanía, portadas, fotos)

**Files:**
- Create: `supabase/migrations/20261013000002_catalog_rules.sql`
- Modify: `supabase/tests/rules.test.mjs`

**Interfaces:**
- Consumes: todo lo de la Task 1; `public.storage_trip_id(text)`; las policies `place_photos_insert`, `place_photos_update`, `place_photos_delete`, `place_photos_select` de `storage.objects`.
- Produces:
  - `public.catalog_place_editable(p_id uuid) returns boolean`.
  - Tipo `public.catalog_place_row (id uuid, name text, address text, latitude double precision, longitude double precision, mapbox_id text, category text, photo_path text, is_public boolean, is_mine boolean, editable boolean, used_elsewhere boolean)`.
  - `public.catalog_places_visible() returns setof public.catalog_place_row`.
  - `public.catalog_search(p_query text, p_lat double precision default null, p_lng double precision default null, p_exclude_trip uuid default null, p_limit int default 5) returns setof public.catalog_place_row`.
  - `public.catalog_near(p_lat double precision, p_lng double precision, p_meters double precision default 100, p_exclude_trip uuid default null) returns setof public.catalog_place_row`.
  - `public.catalog_place_update(p_id uuid, p_patch jsonb) returns void`. Claves opcionales del parche: `name`, `address`, `category`, `photo_path`, `is_public`. Errores: `PLACE_LOCKED`, `PLACE_SHARED`, `PLACE_DUPLICATE`.
  - `public.trip_covers() returns table (trip_id uuid, photo_path text, info_photo_url text)`.
  - Las fotos en `catalog/<catalog_place_id>/…` solo las escribe quien puede editar ese lugar.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `supabase/tests/rules.test.mjs`, inserta esta sección justo antes de `console.log('\nStorage')`:

```js
console.log('\nCatálogo compartido')
const visible = async uid => (await as('authenticated', uid, 'select * from public.catalog_places_visible()')).rows
const patch = (uid, id, fields) => err('authenticated', uid, 'select public.catalog_place_update($1, $2::jsonb)', [id, JSON.stringify(fields)])
const useExisting = async (uid, tripId, catId) => (await as('authenticated', uid, 'select public.trip_add_place($1, $2) r', [tripId, catId])).rows[0].r
const catCount = async id => (await db.query('select count(*)::int n from public.catalog_places where id = $1', [id])).rows[0].n

// Visibilidad (B creó la torre en el viaje de A; C es otro organizador)
check('C ve los lugares públicos de otros, sin poder editarlos', (await visible(C)).some(r => r.id === cTorre && r.is_mine === false && r.editable === false))
check('quien lo creó lo ve como suyo y editable', (await visible(B)).some(r => r.id === cTorre && r.is_mine === true && r.editable === true))
check('el dueño del viaje no es el creador: no lo edita', (await visible(A)).some(r => r.id === cTorre && r.is_mine === false && r.editable === false))
check('la fila visible no expone creador ni viaje de origen', !('created_by' in (await visible(C))[0]) && !('origin_trip_id' in (await visible(C))[0]))
check('C lee la ficha de un lugar público', (await as('authenticated', C, 'select * from public.place_info where catalog_place_id = $1', [cTorre])).rows.length === 1)

const priv = await addPlace(A, trip.id, { name: 'Casa de Ana', latitude: 37.5, longitude: 127.0, is_public: false })
check('C no ve un lugar privado ajeno', !(await visible(C)).some(r => r.id === priv.catalog_place_id))
check('B (co-admin del viaje) sí ve el privado', (await visible(B)).some(r => r.id === priv.catalog_place_id))
check('C no puede sumar a su viaje un lugar privado ajeno', /PLACE_NOT_FOUND/.test(await err('authenticated', C, 'select public.trip_add_place($1, $2)', [otherTrip.id, priv.catalog_place_id])))

// Reutilizar
const reuse = await useExisting(C, otherTrip.id, cTorre)
check('C suma a su viaje un lugar del catálogo sin duplicarlo', reuse.catalog_place_id === cTorre && reuse.created === false && (await db.query(`select count(*)::int n from public.catalog_places where name = 'N Seoul Tower'`)).rows[0].n === 1)
check('sumarlo dos veces devuelve el mismo vínculo', (await useExisting(C, otherTrip.id, cTorre)).place_id === reuse.place_id)
check('C no suma lugares a un viaje ajeno', /No administras/.test(await err('authenticated', C, 'select public.trip_add_place($1, $2)', [trip.id, cTorre])))

const m1 = await addPlace(A, trip.id, { name: 'Lotte Tower', latitude: 37.5125, longitude: 127.1025, mapbox_id: 'dXJuOm1ieHBvaTox' })
const m2 = await addPlace(C, otherTrip.id, { name: 'Lotte World Tower', latitude: 37.5126, longitude: 127.1026, mapbox_id: 'dXJuOm1ieHBvaTox' })
check('mismo identificador de Mapbox: se reutiliza sin preguntar', m2.catalog_place_id === m1.catalog_place_id && m2.created === false)
const f1 = await addPlace(A, trip.id, { name: 'Punto A', latitude: 37.6, longitude: 127.2, mapbox_id: '37.6,127.2' })
const f2 = await addPlace(C, otherTrip.id, { name: 'Punto B', latitude: 37.6, longitude: 127.2, mapbox_id: '37.6,127.2' })
check('un id de respaldo "lat,lng" no une lugares ni se guarda', f1.catalog_place_id !== f2.catalog_place_id && (await db.query('select mapbox_id from public.catalog_places where id = $1', [f1.catalog_place_id])).rows[0].mapbox_id === null)

// Edición
check('el creador edita', (await patch(B, cTorre, { name: 'Namsan Tower' })) === null)
check('el cambio lo ven los demás viajes', (await visible(C)).find(r => r.id === cTorre).name === 'Namsan Tower')
check('otro organizador no edita', /PLACE_LOCKED/.test(await patch(C, cTorre, { name: 'x' })))
check('no se puede volver privado un lugar que usa otro viaje', /PLACE_SHARED/.test(await patch(B, cTorre, { is_public: false })))
check('used_elsewhere avisa solo al creador', (await visible(B)).find(r => r.id === cTorre).used_elsewhere === true && (await visible(C)).find(r => r.id === cTorre).used_elsewhere === false)
check('el parche no toca lo que no trae', (await db.query('select latitude from public.catalog_places where id = $1', [cTorre])).rows[0].latitude === 37.5512)

// Bloqueo al terminar el viaje de origen
const pastTrip = (await as('authenticated', A, `insert into public.trips (name, start_date, end_date, time_zone, rsvp_deadline) values ('Pasado', '2020-01-01', '2020-01-05', 'UTC', now()) returning id`)).rows[0]
const oldPlace = await addPlace(A, pastTrip.id, { name: 'Lugar viejo', latitude: 1, longitude: 1 })
check('terminado el viaje de origen, ni el creador edita', /PLACE_LOCKED/.test(await patch(A, oldPlace.catalog_place_id, { name: 'x' })))
const todayTrip = (await as('authenticated', A, `insert into public.trips (name, start_date, end_date, time_zone, rsvp_deadline) values ('Hoy', (now() at time zone 'utc')::date, (now() at time zone 'utc')::date, 'UTC', now()) returning id`)).rows[0]
const todayPlace = await addPlace(A, todayTrip.id, { name: 'Lugar de hoy', latitude: 2, longitude: 2 })
check('el día en que termina el viaje todavía se puede editar', (await patch(A, todayPlace.catalog_place_id, { category: 'mirador' })) === null)
await as('authenticated', A, 'delete from public.trips where id = $1', [todayTrip.id])
check('borrar el viaje de origen conserva el lugar público', (await catCount(todayPlace.catalog_place_id)) === 1)
check('y lo deja bloqueado', /PLACE_LOCKED/.test(await patch(A, todayPlace.catalog_place_id, { name: 'x' })))

// Quitar de un viaje
await as('authenticated', A, 'delete from public.places where id = $1', [priv.place_id])
check('un lugar privado se borra al quitarlo de su último viaje', (await catCount(priv.catalog_place_id)) === 0)
await as('authenticated', C, 'delete from public.places where id = $1', [reuse.place_id])
check('uno público sigue en el catálogo al quitarlo de un viaje', (await catCount(cTorre)) === 1)

// Búsqueda y cercanía
const search = async (uid, q, tripId) => (await as('authenticated', uid, 'select id from public.catalog_search($1, $2, $3, $4)', [q, 37.55, 126.98, tripId])).rows.map(r => r.id)
check('la búsqueda encuentra por nombre sin distinguir mayúsculas', (await search(C, 'namsan', otherTrip.id)).includes(cTorre))
check('la búsqueda no lista lo que el viaje ya tiene', !(await search(A, 'namsan', trip.id)).includes(cTorre))
check('con menos de 2 caracteres no devuelve nada', (await search(C, 'n', otherTrip.id)).length === 0)
check('los comodines del texto se buscan literales', (await search(C, '%%', otherTrip.id)).length === 0 && (await search(C, '__', otherTrip.id)).length === 0)
check('la búsqueda devuelve como máximo 5', (await search(C, 'a', null)).length <= 5)
const near = async (lat, lng) => (await as('authenticated', C, 'select id from public.catalog_near($1, $2, 100, $3)', [lat, lng, otherTrip.id])).rows.map(r => r.id)
check('cercanía: a unos metros lo encuentra', (await near(37.5513, 126.9883)).includes(cTorre))
check('cercanía: a más de 100 m no', !(await near(37.5612, 126.9882)).includes(cTorre))

// Portadas y fotos
check('el creador guarda la foto del lugar', (await patch(B, cTorre, { photo_path: `catalog/${cTorre}/a.webp` })) === null)
const covers = async uid => (await as('authenticated', uid, 'select * from public.trip_covers()')).rows
check('trip_covers entrega la foto de mis viajes', (await covers(A)).find(r => r.trip_id === trip.id).photo_path === `catalog/${cTorre}/a.webp`)
check('trip_covers no muestra viajes ajenos', !(await covers(C)).some(r => r.trip_id === trip.id))
check('el creador sube foto a su lugar', !(await err('authenticated', B, `insert into storage.objects (bucket_id, name) values ('place-photos', $1)`, [`catalog/${cTorre}/a.webp`])))
check('otro organizador no sube foto a un lugar ajeno', /row-level security/.test(await err('authenticated', C, `insert into storage.objects (bucket_id, name) values ('place-photos', $1)`, [`catalog/${cTorre}/x.webp`])))
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:db`
Expected: FAIL en la sección "Catálogo compartido", con `function public.catalog_places_visible() does not exist`.

- [ ] **Step 3: Escribir la migración**

Crea `supabase/migrations/20261013000002_catalog_rules.sql`:

```sql
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
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
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
  where v.latitude between p_lat - 0.01 and p_lat + 0.01
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
    where c.id = p_id and p.trip_id is distinct from c.origin_trip_id
  ) then
    raise exception 'PLACE_SHARED' using errcode = 'P0001';
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
  )
  with check (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
  );

create policy place_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'place-photos'
    and (
      public.is_trip_admin(public.storage_trip_id(name))
      or public.catalog_place_editable(public.storage_catalog_place_id(name))
    )
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
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:db`
Expected: PASS, `0 fallidas`, con las 37 comprobaciones nuevas de "Catálogo compartido" en verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013000002_catalog_rules.sql supabase/tests/rules.test.mjs
git commit -m "feat: reglas del catálogo: edición, bloqueo, búsqueda, cercanía y fotos"
```

---

### Task 3: La app lee del catálogo

**Files:**
- Create: `shared/types/catalog.ts`
- Create: `app/utils/mapbox-id.ts`
- Create: `app/composables/useCatalog.ts`
- Test: `tests/mapbox-id.test.ts`
- Modify: `app/composables/useTripAdmin.ts`
- Modify: `app/composables/usePlacePhotos.ts`
- Modify: `server/api/admin/places/[id]/enrich.post.ts`
- Modify: `app/pages/admin/index.vue`

**Interfaces:**
- Consumes: las funciones de base de las Tasks 1 y 2.
- Produces:
  - `shared/types/catalog.ts`: `CatalogPlace`, `NewCatalogPlace`, `CatalogPatch`, `AddPlaceResult`, `TripCover`.
  - `realMapboxId(id: string | null | undefined): string | null`.
  - `useCatalog()` → `{ byIds(ids: string[]): Promise<CatalogPlace[]>, infoByIds(ids: string[]): Promise<PlaceInfoRow[]>, search(q: string, near: { latitude: number, longitude: number } | null | undefined, tripId: string): Promise<CatalogPlace[]>, near(latitude: number, longitude: number, tripId: string): Promise<CatalogPlace[]>, addExisting(tripId: string, catalogPlaceId: string): Promise<AddPlaceResult>, addNew(tripId: string, place: NewCatalogPlace, votable: boolean, description: string | null): Promise<AddPlaceResult>, update(id: string, patch: CatalogPatch): Promise<void>, covers(): Promise<TripCover[]> }`. Todas lanzan `Error` con mensaje en español si la base falla.
  - `Place` (de `useTripAdmin`): los campos del vínculo (`id`, `trip_id`, `catalog_place_id`, `votable`, `sort_order`, `description`, `created_at`, `updated_at`) más los del catálogo (`name`, `address`, `latitude`, `longitude`, `mapbox_id`, `category`, `photo_path`, `is_public`, `is_mine`, `editable`, `used_elsewhere`). `Place.id` es el id del vínculo.
  - `PlaceInfoRow`: la fila de `place_info` con `catalog_place_id` en vez de `place_id` y `trip_id`.
  - `usePlacePhotos()`: `upload(catalogPlaceId: string, blob: Blob): Promise<string>` y `replace(place: { catalog_place_id: string, photo_path: string | null }, blob: Blob): Promise<string>`.

- [ ] **Step 1: Prueba de `realMapboxId` (falla)**

Crea `tests/mapbox-id.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { realMapboxId } from '../app/utils/mapbox-id.ts'

test('realMapboxId: deja pasar un identificador de Mapbox', () => {
  assert.equal(realMapboxId('dXJuOm1ieHBvaTox'), 'dXJuOm1ieHBvaTox')
  assert.equal(realMapboxId('  dXJuOm1ieHBvaTox  '), 'dXJuOm1ieHBvaTox')
})

test('realMapboxId: vacío o ausente es null', () => {
  assert.equal(realMapboxId(''), null)
  assert.equal(realMapboxId('   '), null)
  assert.equal(realMapboxId(null), null)
  assert.equal(realMapboxId(undefined), null)
})

test('realMapboxId: el id de respaldo "lat,lng" no es un identificador', () => {
  assert.equal(realMapboxId('37.5512,126.9882'), null)
  assert.equal(realMapboxId('-33.45,-70.65'), null)
})
```

Run: `npm test`
Expected: FAIL en `tests/mapbox-id.test.ts` con `Cannot find module … mapbox-id.ts`.

- [ ] **Step 2: Implementar `realMapboxId`**

Crea `app/utils/mapbox-id.ts`:

```ts
/**
 * Identificador de Mapbox apto para reconocer "el mismo lugar".
 * useMapbox arma un id de respaldo "lat,lng" cuando Mapbox no entrega uno,
 * y un punto marcado a mano llega con id vacío: ninguno de los dos sirve.
 */
export function realMapboxId(id: string | null | undefined): string | null {
  const v = (id ?? '').trim()
  if (!v || /^-?[0-9.]+,-?[0-9.]+$/.test(v)) return null
  return v
}
```

Run: `npm test`
Expected: PASS en todas.

- [ ] **Step 3: Tipos del catálogo**

Crea `shared/types/catalog.ts`:

```ts
// Catálogo compartido de lugares: lo que el navegador recibe y envía.

/** Lugar del catálogo tal como lo entrega la base (sin creador ni viaje de origen) */
export interface CatalogPlace {
  id: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  mapbox_id: string | null
  category: string | null
  photo_path: string | null
  is_public: boolean
  /** lo creó el usuario que mira */
  is_mine: boolean
  /** el usuario puede cambiar nombre, dirección, categoría, foto y visibilidad */
  editable: boolean
  /** solo para el creador: lo usa un viaje distinto del de origen */
  used_elsewhere: boolean
}

export interface NewCatalogPlace {
  name: string
  address: string | null
  latitude: number
  longitude: number
  mapbox_id: string | null
  category: string | null
  is_public: boolean
}

/** Solo lo que cambia */
export interface CatalogPatch {
  name?: string
  address?: string | null
  category?: string | null
  photo_path?: string | null
  is_public?: boolean
}

export interface AddPlaceResult {
  /** id del lugar dentro del viaje (el que usan votos y paradas) */
  place_id: string
  catalog_place_id: string
  /** false si ya existía en el catálogo y solo se sumó al viaje */
  created: boolean
}

export interface TripCover {
  trip_id: string
  photo_path: string | null
  info_photo_url: string | null
}
```

- [ ] **Step 4: `app/composables/useCatalog.ts`**

```ts
import type { AddPlaceResult, CatalogPatch, CatalogPlace, NewCatalogPlace, TripCover } from '~~/shared/types/catalog'
import type { PlaceInfoRow } from '~/composables/useTripAdmin'

const MESSAGES: Record<string, string> = {
  PLACE_NOT_FOUND: 'Ese lugar ya no está disponible.',
  PLACE_LOCKED: 'Este lugar ya no se puede editar.',
  PLACE_SHARED: 'Otro viaje ya usa este lugar: no se puede dejar solo para este viaje.',
  PLACE_DUPLICATE: 'Ya existe un lugar público igual en el catálogo.',
}

/** Único punto de acceso al catálogo compartido de lugares */
export function useCatalog() {
  const { client } = useDb()
  // Las funciones y columnas del catálogo no están en database.types.ts hasta
  // regenerarlo con la migración aplicada; por eso este cliente va sin tipos
  // y cada función declara lo que devuelve.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any

  function unwrap<T>(res: { data: unknown, error: { message: string } | null }): T {
    if (res.error) throw new Error(MESSAGES[res.error.message] ?? res.error.message)
    return res.data as T
  }

  async function byIds(ids: string[]): Promise<CatalogPlace[]> {
    if (!ids.length) return []
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_places_visible').in('id', ids)) ?? []
  }

  async function infoByIds(ids: string[]): Promise<PlaceInfoRow[]> {
    if (!ids.length) return []
    return unwrap<PlaceInfoRow[]>(await db.from('place_info').select('*').in('catalog_place_id', ids)) ?? []
  }

  async function search(q: string, near: { latitude: number, longitude: number } | null | undefined, tripId: string): Promise<CatalogPlace[]> {
    if (q.trim().length < 2) return []
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_search', {
      p_query: q.trim().slice(0, 100),
      p_lat: near?.latitude ?? null,
      p_lng: near?.longitude ?? null,
      p_exclude_trip: tripId,
      p_limit: 5,
    })) ?? []
  }

  async function near(latitude: number, longitude: number, tripId: string): Promise<CatalogPlace[]> {
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_near', {
      p_lat: latitude, p_lng: longitude, p_meters: 100, p_exclude_trip: tripId,
    })) ?? []
  }

  async function addExisting(tripId: string, catalogPlaceId: string): Promise<AddPlaceResult> {
    return unwrap<AddPlaceResult>(await db.rpc('trip_add_place', { p_trip_id: tripId, p_catalog_place_id: catalogPlaceId }))
  }

  async function addNew(tripId: string, place: NewCatalogPlace, votable: boolean, description: string | null): Promise<AddPlaceResult> {
    return unwrap<AddPlaceResult>(await db.rpc('trip_add_place', {
      p_trip_id: tripId, p_new: place, p_votable: votable, p_description: description,
    }))
  }

  async function update(id: string, patch: CatalogPatch): Promise<void> {
    unwrap<null>(await db.rpc('catalog_place_update', { p_id: id, p_patch: patch }))
  }

  async function covers(): Promise<TripCover[]> {
    return unwrap<TripCover[]>(await db.rpc('trip_covers')) ?? []
  }

  return { byIds, infoByIds, search, near, addExisting, addNew, update, covers }
}
```

- [ ] **Step 5: `app/composables/useTripAdmin.ts`**

a) Reemplaza las declaraciones de `Place` y `PlaceInfoRow`:

```ts
/** Vínculo viaje ↔ lugar: lo propio de este viaje */
export type PlaceLink = Pick<Database['public']['Tables']['places']['Row'], 'id' | 'trip_id' | 'votable' | 'sort_order' | 'description' | 'created_at' | 'updated_at'> & { catalog_place_id: string }
/** Lugar de un viaje con los datos del catálogo aplanados. `id` es el del vínculo. */
export type Place = Omit<CatalogPlace, 'id'> & PlaceLink
export type PlaceInfoRow = Omit<Database['public']['Tables']['place_info']['Row'], 'place_id' | 'trip_id'> & { catalog_place_id: string }
```

y agrega el import:

```ts
import type { CatalogPlace } from '~~/shared/types/catalog'
```

b) Dentro de `useTripAdmin`, junto a `const { client, userId } = useDb()`:

```ts
  const catalog = useCatalog()
```

c) En el `Promise.all`:

- La consulta de lugares pasa a:

```ts
      client.from('places').select('id, trip_id, catalog_place_id, votable, sort_order, description, created_at, updated_at').eq('trip_id', tripId).order('sort_order').order('created_at'),
```

- Quita la consulta `client.from('place_info').select('*').eq('trip_id', tripId),` y quita `placeInfo` de la lista de variables desestructuradas y del `for (const r of […])` que revisa errores.

d) Reemplaza en el objeto devuelto las líneas de `places` y `placeInfo` por lo siguiente, calculado justo antes del `return`:

```ts
    // Los datos del lugar viven en el catálogo: se traen aparte y se aplanan sobre el vínculo
    const links = (places.data ?? []) as unknown as PlaceLink[]
    const ids = links.map(l => l.catalog_place_id)
    const [catalogRows, infoRows] = await Promise.all([catalog.byIds(ids), catalog.infoByIds(ids)])
    const byCatalogId = new Map(catalogRows.map(c => [c.id, c]))
```

y en el objeto:

```ts
      places: links.flatMap((l): Place[] => {
        const c = byCatalogId.get(l.catalog_place_id)
        return c ? [{ ...c, ...l }] : []
      }),
      placeInfo: infoRows,
```

e) Reemplaza `placeInfoByPlace`:

```ts
  /** id del lugar en el viaje → su ficha (que se guarda por lugar del catálogo) */
  const placeInfoByPlace = computed(() => {
    const byCatalog = new Map(placeInfo.value.map(pi => [pi.catalog_place_id, pi]))
    const map = new Map<string, PlaceInfoRow>()
    for (const p of places.value) {
      const info = byCatalog.get(p.catalog_place_id)
      if (info) map.set(p.id, info)
    }
    return map
  })
```

(`places` debe estar declarado antes de este `computed`; si no, muévelo debajo de `const places = computed(…)`.)

- [ ] **Step 6: `app/composables/usePlacePhotos.ts`**

Reemplaza `upload` y `replace`, y agrega `const catalog = useCatalog()` junto a `const { client } = useDb()`:

```ts
  /** Sube la foto de un lugar del catálogo. Solo puede quien lo puede editar. */
  async function upload(catalogPlaceId: string, blob: Blob): Promise<string> {
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `catalog/${catalogPlaceId}/${crypto.randomUUID()}.${ext}`
    const { error } = await bucket().upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
    if (error) throw error
    return path
  }
```

```ts
  /** Reemplaza la foto de un lugar ya guardado y borra la anterior */
  async function replace(place: { catalog_place_id: string, photo_path: string | null }, blob: Blob) {
    const path = await upload(place.catalog_place_id, blob)
    try {
      await catalog.update(place.catalog_place_id, { photo_path: path })
    }
    catch (err) {
      await remove(path)
      throw err
    }
    await remove(place.photo_path)
    return path
  }
```

Si `client` deja de usarse fuera de `bucket()`, se conserva: `bucket()` lo necesita.

- [ ] **Step 7: `server/api/admin/places/[id]/enrich.post.ts`**

Reemplaza desde el comentario `// Se lee con el cliente del usuario…` hasta la línea `const admin = serverSupabaseServiceRole<Database>(event)` (inclusive) por:

```ts
  // El vínculo se lee con el cliente del usuario: RLS decide si administra ese viaje.
  // Las columnas nuevas no están en los tipos generados hasta regenerarlos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userDb = (await serverSupabaseClient<Database>(event)) as any
  const { data: link } = await userDb.from('places').select('id, catalog_place_id').eq('id', id).maybeSingle()
  if (!link) throw createError({ statusCode: 404, message: 'Lugar no encontrado.' })

  // Los datos del lugar y su ficha son del catálogo: se leen con el rol de servicio.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = serverSupabaseServiceRole<Database>(event) as any
  const { data: place } = await admin
    .from('catalog_places')
    .select('id, name, mapbox_id, latitude, longitude')
    .eq('id', link.catalog_place_id)
    .maybeSingle()
  if (!place) throw createError({ statusCode: 404, message: 'Lugar no encontrado.' })

  const { data: cached } = await admin.from('place_info').select('*').eq('catalog_place_id', place.id).maybeSingle()
  // ?force=1 (búsqueda manual) ignora la caché y vuelve a consultar las fuentes.
  const force = !!getQuery(event).force
  if (!force && cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_DAYS * 86_400_000) {
    return cached
  }

  const result = await enrichPlace({ name: place.name, latitude: place.latitude, longitude: place.longitude })

  const row = {
    catalog_place_id: place.id,
    mapbox_id: place.mapbox_id,
    history: result.history,
    history_source: result.historySource,
    opening_hours: result.openingHours,
    website: result.website,
    phone: result.phone,
    photo_url: result.photo?.url ?? null,
    photo_credit: result.photo?.credit ?? null,
    wikipedia_url: result.wikipediaUrl,
    wikidata_id: result.wikidataId,
    updated_at: new Date().toISOString(),
  }
```

El resto del archivo (`const { data, error } = await admin.from('place_info').upsert(row)…` en adelante) no cambia.

- [ ] **Step 8: `app/pages/admin/index.vue`**

a) El tipo `TripRow` vuelve a:

```ts
type TripRow = Tables<'trips'> & { members: { count: number }[], places: { count: number }[] }
```

b) Agrega `const catalog = useCatalog()` junto a `const photoUrl = usePlacePhotoUrl()`.

c) Reemplaza el `useAsyncData('admin-trips', …)` y `coverOf` por:

```ts
const { data, status } = await useAsyncData('admin-trips', async () => {
  const [tripsRes, covers] = await Promise.all([
    client.from('trips').select('*, members(count), places(count)').order('start_date', { ascending: true }),
    catalog.covers(),
  ])
  if (tripsRes.error) throw tripsRes.error
  return { trips: tripsRes.data as unknown as TripRow[], covers }
})
const trips = computed(() => data.value?.trips ?? null)

/** Portada de un viaje: la primera foto subida, en el orden del organizador; si no hay, una de las fichas */
const coverByTrip = computed(() => new Map((data.value?.covers ?? []).map(c => [c.trip_id, c])))
function coverOf(t: TripRow) {
  const c = coverByTrip.value.get(t.id)
  return coverPhoto([{ photo_url: photoUrl(c?.photo_path) }, { photo_url: c?.info_photo_url }])
}
```

- [ ] **Step 9: Verificar**

Run: `npm run typecheck`
Expected: sin errores. `PlaceFormModal.vue` todavía inserta en `places` con las columnas antiguas y compila solo porque los tipos generados aún describen la estructura anterior; contra la base nueva fallaría, y se reescribe en la Task 4.

Run: `npm test`
Expected: PASS, con las 3 pruebas nuevas.

- [ ] **Step 10: Commit**

```bash
git add shared/types/catalog.ts app/utils/mapbox-id.ts app/composables/useCatalog.ts tests/mapbox-id.test.ts app/composables/useTripAdmin.ts app/composables/usePlacePhotos.ts "server/api/admin/places/[id]/enrich.post.ts" app/pages/admin/index.vue
git commit -m "feat: el panel lee los lugares desde el catálogo compartido"
```

---

### Task 4: Formulario y panel de lugares

**Files:**
- Modify: `app/components/place/PlaceFormModal.vue`
- Modify: `app/components/place/PlacesPanel.vue`

**Interfaces:**
- Consumes: `useCatalog()`, `realMapboxId`, `Place` con `catalog_place_id`, `is_public`, `is_mine`, `editable`, `used_elsewhere` (Task 3); `usePlacePhotos().upload(catalogPlaceId, blob)`.
- Produces: `PlaceFormModal` sigue emitiendo `saved: [placeId: string, created: boolean]` con el id del lugar en el viaje.

- [ ] **Step 1: Script de `PlaceFormModal.vue`**

a) Junto a `const photos = usePlacePhotos()`:

```ts
const catalog = useCatalog()
```

b) El estado gana la visibilidad:

```ts
const state = reactive({ name: '', address: '', category: '', description: '', votable: true, isPublic: true })
```

c) Después de `const editing = computed(…)`:

```ts
// Nombre, dirección, categoría, foto y visibilidad son del catálogo: los cambia solo
// quien creó el lugar y solo mientras su viaje de origen no haya terminado.
const canEditShared = computed(() => !editing.value || editing.value.editable)
const lockReason = computed(() => {
  const p = editing.value
  if (!p || p.editable) return ''
  return p.is_mine ? 'El viaje donde se creó este lugar ya terminó' : 'Este lugar lo creó otro organizador'
})
```

d) En el `watch(open, …)`, después de `state.votable = p?.votable ?? true`:

```ts
  state.isPublic = p?.is_public ?? true
```

e) Reemplaza el cuerpo de `onSubmit` completo:

```ts
async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!trip.value || !coords.value) return
  loading.value = true
  let uploaded: string | null = null
  const description = e.data.description.trim() || null
  const shared = {
    name: e.data.name.trim(),
    address: e.data.address.trim() || null,
    category: e.data.category.trim() || null,
  }
  try {
    const p = editing.value
    if (p) {
      // Lo propio del viaje se guarda siempre
      const { error } = await client.from('places').update({ votable: e.data.votable, description }).eq('id', p.id)
      if (error) throw error
      // Lo del catálogo, solo si el usuario puede: si no, catalog.update fallaría con PLACE_LOCKED
      if (p.editable) {
        let photoPath = p.photo_path
        if (newPhoto.value) photoPath = uploaded = await photos.upload(p.catalog_place_id, newPhoto.value)
        else if (removePhoto.value) photoPath = null
        await catalog.update(p.catalog_place_id, { ...shared, photo_path: photoPath, is_public: e.data.isPublic })
        if (p.photo_path && p.photo_path !== photoPath) await photos.remove(p.photo_path)
      }
      toast.add({ color: 'success', title: 'Lugar actualizado' })
      open.value = false
      emit('saved', p.id, false)
    }
    else {
      const res = await catalog.addNew(trip.value.id, {
        ...shared,
        latitude: coords.value.latitude,
        longitude: coords.value.longitude,
        mapbox_id: realMapboxId(props.draft?.result?.id),
        is_public: e.data.isPublic,
      }, e.data.votable, description)
      // La foto va después de crear el lugar: su ruta lleva el id del catálogo.
      // Si el lugar ya existía (mismo identificador de Mapbox), se respeta la foto que tiene.
      if (newPhoto.value && res.created) {
        uploaded = await photos.upload(res.catalog_place_id, newPhoto.value)
        await catalog.update(res.catalog_place_id, { photo_path: uploaded })
      }
      toast.add(res.created
        ? { color: 'success', title: 'Lugar agregado', description: 'Buscando información del lugar…' }
        : { color: 'success', title: 'Lugar agregado', description: 'Ya estaba en el catálogo: se sumó a tu viaje con sus datos.' })
      open.value = false
      emit('saved', res.place_id, true)
    }
  }
  catch (err) {
    if (uploaded) await photos.remove(uploaded)
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(err) })
  }
  finally {
    loading.value = false
  }
}
```

f) Si `places` (de `useTripCtx()`) deja de usarse en el script, quítalo de la desestructuración.

- [ ] **Step 2: Template de `PlaceFormModal.vue`**

a) Justo después del `<p v-if="coords" …>…</p>`:

```vue
        <UAlert
          v-if="lockReason"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :title="lockReason"
          description="Puedes cambiar la votación y tu nota. El nombre, la dirección, la categoría y la foto son comunes a todos los viajes que usan este lugar."
        />
```

b) Los tres campos del catálogo se desactivan cuando no se pueden editar:

```vue
          <UInput v-model="state.name" placeholder="Palacio Gyeongbokgung" class="w-full" autofocus :disabled="!canEditShared" />
```

```vue
          <UInput v-model="state.address" class="w-full" :disabled="!canEditShared" />
```

```vue
            <UInput v-model="state.category" placeholder="museo, mirador, hotel…" class="w-full" :disabled="!canEditShared" />
```

c) Después del `UFormField` de "Nota para los viajeros":

```vue
        <UFormField v-if="canEditShared" name="isPublic" label="Visibilidad">
          <USwitch
            :model-value="!state.isPublic"
            :disabled="!!editing?.used_elsewhere"
            label="Solo para este viaje"
            :description="editing?.used_elsewhere ? 'Otro viaje ya usa este lugar: no se puede dejar solo para este viaje.' : 'Otros organizadores no podrán verlo ni usarlo.'"
            class="pt-1.5"
            @update:model-value="state.isPublic = !$event"
          />
        </UFormField>
```

d) En el bloque de la foto, el `<div class="flex flex-col gap-1.5">` que contiene los botones "Subir foto", "Desde URL" y "Quitar" gana `v-if="canEditShared"`, y el `<div v-if="urlMode" …>` pasa a `v-if="urlMode && canEditShared"`.

- [ ] **Step 3: `PlacesPanel.vue`**

a) En la fila de cada lugar, después del `UBadge` "No votable" (y su `v-if` hermano), agrega:

```vue
                <UBadge v-if="!p.is_public" color="neutral" variant="outline" size="sm" icon="i-lucide-lock">
                  Privado
                </UBadge>
                <UBadge v-else-if="!p.is_mine" color="neutral" variant="outline" size="sm" icon="i-lucide-users">
                  De otro organizador
                </UBadge>
```

b) En la ficha del lugar (`UModal` "Ficha del lugar"), el `<div>` que envuelve los botones "Subir foto" y "Foto desde URL" gana `v-if="detailPlace?.editable"`, y el `<div v-if="detailUrlMode" …>` pasa a `v-if="detailUrlMode && detailPlace?.editable"`.

c) `deleteWarning` termina explicando qué pasa con el lugar. Reemplaza su `return`:

```ts
  const base = parts.length ? `También se borrarán ${parts.join(' y ')}.` : 'Se quitará de este viaje.'
  return `${base} ${p.is_public ? 'El lugar sigue disponible en el catálogo para otros viajes.' : 'Como es privado, se elimina del todo.'}`
```

d) En `confirmDelete`, la foto solo se borra si el lugar era privado (uno público la siguen usando otros viajes):

```ts
  if (!error && !p.is_public) await photos.remove(p.photo_path)
```

(reemplaza la línea `if (!error) await photos.remove(p.photo_path)`).

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm test` y `npm run build`
Expected: todas las pruebas pasan; el build termina sin errores.

Revisa leyendo `onSubmit` que, con `editing.value.editable === false`, el único acceso a la base es el `update` de `places` (votación y nota): ninguna llamada a `catalog.update` ni a `photos.upload`.

- [ ] **Step 5: Commit**

```bash
git add app/components/place/PlaceFormModal.vue app/components/place/PlacesPanel.vue
git commit -m "feat: crear y editar lugares sobre el catálogo, con lugares privados y bloqueo de edición"
```

---

### Task 5: Buscar en el catálogo y sugerir lugares cercanos

**Files:**
- Modify: `app/components/map/PlaceSearch.vue`
- Modify: `app/components/place/PlacesPanel.vue`

**Interfaces:**
- Consumes: `useCatalog().search`, `.near`, `.addExisting` (Task 3); `CatalogPlace`.
- Produces: `PlaceSearch` gana la prop `tripId: string` y el evento `selectCatalog: [place: CatalogPlace]`.

- [ ] **Step 1: `PlaceSearch.vue`, script**

a) Imports y props:

```ts
import type { PlaceSearchResult } from '~/composables/useMapbox'
import type { CatalogPlace } from '~~/shared/types/catalog'

// Buscador de lugares: primero lo ya guardado en el catálogo compartido, después Mapbox
const props = defineProps<{ tripId: string, near?: { latitude: number, longitude: number } | null }>()
const emit = defineEmits<{ select: [result: PlaceSearchResult], selectCatalog: [place: CatalogPlace] }>()

const { enabled, search } = useMapbox()
const catalog = useCatalog()
const photoUrl = usePlacePhotoUrl()
const q = ref('')
const results = ref<PlaceSearchResult[]>([])
const saved = ref<CatalogPlace[]>([])
```

b) En el `watch(q, …)`, donde se vacían los resultados por texto corto, agrega `saved.value = []`. Reemplaza el bloque `try { … }` del temporizador por:

```ts
    try {
      // Si el catálogo falla, la búsqueda en Mapbox sigue funcionando
      const [fromCatalog, fromMapbox] = await Promise.all([
        catalog.search(value, props.near, props.tripId).catch(() => [] as CatalogPlace[]),
        search(value, props.near),
      ])
      if (mine !== seq) return
      saved.value = fromCatalog
      results.value = fromMapbox
      open.value = true
    }
```

c) Agrega junto a `pick`:

```ts
function pickSaved(c: CatalogPlace) {
  emit('selectCatalog', c)
  q.value = ''
  results.value = []
  saved.value = []
  open.value = false
}
```

y en `pick`, agrega `saved.value = []` junto a `results.value = []`.

- [ ] **Step 2: `PlaceSearch.vue`, template**

a) El `@focus` del `UInput` pasa a:

```vue
      @focus="(results.length || saved.length) && (open = true)"
```

b) Reemplaza el contenido del `<div v-if="open" … role="listbox">` por:

```vue
      <p v-if="!results.length && !saved.length" class="px-3 py-3 text-sm text-muted">
        Sin resultados. Prueba con otro nombre o marca el punto en el mapa.
      </p>

      <template v-if="saved.length">
        <p class="bg-elevated/50 px-3 py-1.5 text-xs font-medium text-muted">
          Ya guardados por otros organizadores
        </p>
        <button
          v-for="c in saved"
          :key="c.id"
          type="button"
          role="option"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-elevated focus:bg-elevated focus:outline-none"
          @mousedown.prevent="pickSaved(c)"
        >
          <img v-if="photoUrl(c.photo_path)" :src="photoUrl(c.photo_path)!" alt="" class="size-9 shrink-0 rounded-sm object-cover">
          <span v-else class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-elevated">
            <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ c.name }}</span>
            <span v-if="c.address" class="block truncate text-xs text-muted">{{ c.address }}</span>
          </span>
          <span class="shrink-0 text-xs font-medium text-primary">Agregar</span>
        </button>
      </template>

      <template v-if="results.length">
        <p v-if="saved.length" class="bg-elevated/50 px-3 py-1.5 text-xs font-medium text-muted">
          Mapbox
        </p>
        <button
          v-for="r in results"
          :key="r.id"
          type="button"
          role="option"
          class="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-elevated focus:bg-elevated focus:outline-none"
          @mousedown.prevent="pick(r)"
        >
          <UIcon name="i-lucide-map-pin" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ r.name }}</span>
            <span v-if="r.address" class="block truncate text-xs text-muted">{{ r.address }}</span>
          </span>
        </button>
      </template>
```

- [ ] **Step 3: `PlacesPanel.vue`, sumar desde el catálogo**

a) Agrega `trip` a lo que se toma de `useTripCtx()` y, junto a los demás composables:

```ts
const catalog = useCatalog()
```

b) Agrega junto a `onSearchSelect`:

```ts
/** Suma al viaje un lugar que ya está en el catálogo, con su foto y su ficha */
async function addFromCatalog(c: CatalogPlace) {
  if (!trip.value) return
  try {
    const res = await catalog.addExisting(trip.value.id, c.id)
    toast.add({ color: 'success', title: 'Lugar agregado', description: `${c.name} ya estaba en el catálogo.` })
    await refresh()
    selectedId.value = res.place_id
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo agregar', description: errorMessage(err) })
  }
}
```

con el import:

```ts
import type { CatalogPlace } from '~~/shared/types/catalog'
```

c) En el template, el buscador pasa a:

```vue
        <PlaceSearch v-if="trip" :trip-id="trip.id" :near="near" @select="onSearchSelect" @select-catalog="addFromCatalog" />
```

- [ ] **Step 4: `PlacesPanel.vue`, lugares cercanos al marcar en el mapa**

a) Estado nuevo, junto a `formDraft`:

```ts
// Al marcar un punto a mano: lugares del catálogo a 100 m o menos, para no duplicar
const nearby = ref<CatalogPlace[]>([])
const nearbyDraft = ref<PlaceDraft | null>(null)
const nearbyOpen = computed({ get: () => nearby.value.length > 0, set: (v) => { if (!v) closeNearby() } })
function closeNearby() {
  nearby.value = []
  nearbyDraft.value = null
  if (!formOpen.value) pendingPin.value = null
}
function createFromNearby() {
  formDraft.value = nearbyDraft.value
  nearby.value = []
  nearbyDraft.value = null
  formOpen.value = true
}
async function useNearby(c: CatalogPlace) {
  nearby.value = []
  nearbyDraft.value = null
  pendingPin.value = null
  await addFromCatalog(c)
}
```

b) En `onPick`, reemplaza las dos líneas finales (`formDraft.value = { … }` y `formOpen.value = true`) por:

```ts
  const draft: PlaceDraft = {
    result: { id: '', name, address, category, latitude: coords.latitude, longitude: coords.longitude },
  }
  // Si la consulta falla, se sigue al formulario como siempre
  const found = trip.value ? await catalog.near(coords.latitude, coords.longitude, trip.value.id).catch(() => []) : []
  if (found.length) {
    nearbyDraft.value = draft
    nearby.value = found
    return
  }
  formDraft.value = draft
  formOpen.value = true
```

c) En el template, antes del `<PlaceFormModal …>`:

```vue
    <UModal v-model:open="nearbyOpen" title="¿Es alguno de estos?" description="Ya hay lugares guardados muy cerca del punto que marcaste.">
      <template #body>
        <ul class="divide-y divide-default overflow-hidden rounded-md border border-default">
          <li v-for="c in nearby" :key="c.id" class="flex items-center gap-3 px-3 py-2.5">
            <img v-if="photoUrl(c.photo_path)" :src="photoUrl(c.photo_path)!" alt="" class="size-10 shrink-0 rounded-sm object-cover">
            <span v-else class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-elevated">
              <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">
                {{ c.name }}
              </p>
              <p v-if="c.address" class="truncate text-xs text-muted">
                {{ c.address }}
              </p>
            </div>
            <UButton size="sm" variant="soft" @click="useNearby(c)">
              Usar este
            </UButton>
          </li>
        </ul>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="nearbyOpen = false">
            Cancelar
          </UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-plus" @click="createFromNearby">
            No, crear uno nuevo
          </UButton>
        </div>
      </template>
    </UModal>
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`, `npm test`, `npm run build`
Expected: sin errores; todas las pruebas pasan; el build termina.

- [ ] **Step 6: Commit**

```bash
git add app/components/map/PlaceSearch.vue app/components/place/PlacesPanel.vue
git commit -m "feat: buscar en el catálogo compartido y sugerir lugares cercanos al marcar un punto"
```

---

### Task 6: Aplicar la migración, regenerar tipos y revisión con dos cuentas

**ALTO: esta task cambia la base de datos remota y no se puede deshacer con un `git revert`. No la empieces sin que el usuario lo confirme expresamente en ese momento.**

**Files:**
- Modify: `shared/types/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: las dos migraciones y todo el código de las Tasks 3 a 5.
- Produces: la base remota con el catálogo y los tipos al día.

- [ ] **Step 1: Foto del estado antes de migrar**

Con acceso de lectura a la base, guarda el resultado de:

```sql
select
  (select count(*) from public.places) as lugares,
  (select count(*) from public.votes) as votos,
  (select count(*) from public.itinerary_stops where place_id is not null) as paradas_con_lugar,
  (select count(*) from public.place_info) as fichas,
  (select count(*) from public.places where photo_path is not null) as con_foto,
  (select md5(string_agg(id::text, ',' order by id)) from public.places) as huella_ids;
```

Los conteos y la huella de ids no detectan un nombre, una coordenada o una foto asignados al lugar equivocado. Guarda además la huella de contenido de los lugares y de las fichas:

```sql
select
  (select md5(string_agg(concat_ws('|', id, name, address, latitude, longitude, category, photo_path, description, votable, sort_order), ';' order by id)) from public.places) as huella_contenido,
  (select md5(string_agg(concat_ws('|', place_id, history, opening_hours, website, phone, photo_url, photo_credit, wikipedia_url), ';' order by place_id)) from public.place_info) as huella_fichas;
```

Respaldo obligatorio (no opcional): exporta a un archivo JSON, fuera del repo, las filas completas de `public.places` y `public.place_info`. La migración elimina 12 columnas de `places` y no tiene vuelta atrás.

Lista también, para mostrárselo al usuario:

- Los viajes cuyo `end_date` ya pasó: sus lugares nacen bloqueados (ni su creador podrá renombrarlos, cambiarles la foto o volverlos privados).
- Los lugares con `mapbox_id` repetido, y los lugares repetidos por nombre dentro de un mismo viaje.
- Todos los lugares por nombre y categoría: tras migrar quedan públicos y visibles para cualquier organizador registrado. Los que el usuario indique como privados se marcan `is_public = false` justo después de aplicar, dentro de la misma transacción.

Y, para un link de viajero de prueba, guarda la respuesta de `/api/v/<token>/places` (nombres, fotos y votos).

- [ ] **Step 2: Pedir confirmación y aplicar**

Muéstrale al usuario los números del Step 1 y pídele confirmación para aplicar. Recomiéndale tener un respaldo reciente de la base (panel de Supabase → Database → Backups).

Con su confirmación, aplica `20261013000001_catalog_places.sql` y `20261013000002_catalog_rules.sql`, en ese orden, **dentro de una sola transacción explícita** (`begin; … commit;`): los archivos no traen `begin/commit` y eliminan columnas, así que no pueden quedar aplicados a medias. Si cualquier sentencia falla, toda la transacción se revierte y la base queda como estaba. Dentro de la misma transacción, después del segundo archivo, marca como privados los lugares que el usuario haya indicado.

- [ ] **Step 3: Comprobar que no se perdió nada**

```sql
select
  (select count(*) from public.places) as lugares,
  (select count(*) from public.catalog_places) as en_catalogo,
  (select count(*) from public.votes) as votos,
  (select count(*) from public.itinerary_stops where place_id is not null) as paradas_con_lugar,
  (select count(*) from public.place_info) as fichas,
  (select count(*) from public.catalog_places where photo_path is not null) as con_foto,
  (select count(*) from public.catalog_places where created_by is null or origin_trip_id is null) as sin_origen,
  (select md5(string_agg(id::text, ',' order by id)) from public.places) as huella_ids;
```

Expected: `lugares`, `votos`, `paradas_con_lugar`, `fichas`, `con_foto` y `huella_ids` iguales a los del Step 1; `en_catalogo` igual a `lugares`; `sin_origen` = 0.

Compara también las huellas de contenido, ahora leyendo los datos del lugar desde el catálogo. Deben ser idénticas a las del Step 1:

```sql
select
  (select md5(string_agg(concat_ws('|', p.id, c.name, c.address, c.latitude, c.longitude, c.category, c.photo_path, p.description, p.votable, p.sort_order), ';' order by p.id))
     from public.places p join public.catalog_places c on c.id = p.catalog_place_id) as huella_contenido,
  (select md5(string_agg(concat_ws('|', p.id, pi.history, pi.opening_hours, pi.website, pi.phone, pi.photo_url, pi.photo_credit, pi.wikipedia_url), ';' order by p.id))
     from public.places p join public.place_info pi on pi.catalog_place_id = p.catalog_place_id) as huella_fichas;
```

La respuesta de `/api/v/<token>/places` del mismo viajero debe ser idéntica a la guardada.

Si algo no coincide: detente y avisa al usuario antes de seguir.

- [ ] **Step 4: Regenerar los tipos**

Run: `npm run db:types`
Run: `npm run typecheck` y `npm run build`
Expected: sin errores. `shared/types/database.types.ts` ahora incluye `catalog_places`, las funciones nuevas y `places` sin las columnas movidas.

```bash
git add shared/types/database.types.ts
git commit -m "chore: regenerar los tipos de la base con el catálogo de lugares"
```

- [ ] **Step 5: Revisión manual con dos cuentas de organizador**

Run: `npm run dev`. Con la cuenta 1 (la que tiene los viajes actuales) y una cuenta 2 nueva con un viaje propio:

1. Cuenta 1: la pestaña Lugares muestra los mismos lugares, fotos, fichas y votos de antes. El mapa y el itinerario se ven igual.
2. Cuenta 1: agrega un lugar buscándolo en Mapbox. Queda con ficha y sin insignias.
3. Cuenta 2: busca ese lugar por nombre. Aparece bajo "Ya guardados por otros organizadores"; un clic lo suma con su foto y su ficha, y queda con la insignia "De otro organizador".
4. Cuenta 2: abre "Editar" en ese lugar. Nombre, dirección, categoría y foto en solo lectura, con el aviso; cambia la nota y la votación y guarda: se guarda sin error.
5. Cuenta 1: cambia el nombre del lugar. Cuenta 2: recarga y ve el nombre nuevo.
6. Cuenta 1: crea un lugar marcando el mapa, con "Solo para este viaje" activado. Queda con la insignia "Privado". Cuenta 2: no lo encuentra al buscarlo.
7. Cuenta 2: marca un punto en el mapa a pocos metros del lugar del paso 2. Aparece "¿Es alguno de estos?"; "Usar este" lo suma y "No, crear uno nuevo" abre el formulario.
8. Cuenta 2: "Borrar definitivamente" el lugar compartido. Cuenta 1: el lugar sigue en su viaje, con su foto.
9. Link de un viajero de la cuenta 1: lugares, itinerario y votación funcionan como antes.

Si algún paso falla, corrige en el archivo de la task correspondiente, vuelve a correr `npm run test:db`, `npm test`, `npm run typecheck` y `npm run build`, y confirma el arreglo en un commit propio.
