# Presupuesto del viaje — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la pestaña Presupuesto a la gestión del viaje: ítems con costo estimado y gasto real en varias monedas, reparto entre viajeros y vista de solo lectura para invitados cuando se publica.

**Architecture:** Tres tablas nuevas en Supabase con RLS por administrador del viaje, igual que `places` e `itinerary_stops`. Todos los cálculos (conversión, totales, reparto, liquidación) son funciones puras en `shared/utils/budget.ts`, usadas tanto por el panel de administración como por la vista del invitado. El tipo de cambio lo trae un endpoint del servidor desde `open.er-api.com` y se guarda por viaje.

**Tech Stack:** Nuxt 4, Nuxt UI 4, Supabase (Postgres + RLS), PGlite para pruebas de reglas, `node --test` para pruebas unitarias (Node 24 ejecuta TypeScript directo).

**Spec:** `docs/superpowers/specs/2026-10-12-presupuesto-design.md`

## Global Constraints

- Sin dependencias nuevas en `package.json`.
- Todo texto visible va en español, con el tono del resto del panel.
- Categorías fijas, en este orden: `lodging`, `transport`, `tickets`, `food`, `shopping`, `other` (Alojamiento, Transporte, Entradas, Comida, Compras, Otros).
- Monedas: código ISO 4217 de 3 letras mayúsculas. Moneda principal por defecto `CLP`.
- `rate` y `actual_rate` siempre significan: 1 unidad de la moneda del ítem = N unidades de la moneda principal.
- Solo administradores del viaje escriben; `anon` no accede a nada; los invitados leen solo mediante `member_get_trip` y solo si `budget_published`.
- Los imports desde `shared/utils/budget` son explícitos (`~~/shared/utils/budget`), no auto-import.
- `shared/utils/budget.ts` no importa nada (ni Vue ni Nuxt) y usa solo sintaxis TypeScript borrable (sin `enum` ni `namespace`), para que `node --test` lo ejecute directo.
- Los commits se hacen en la rama local `feat/presupuesto`, uno por tarea (los pasos "Commit" aplican tal cual). Nunca `git push`, ni commits en `main`.
- No agregar al commit `.env.example` ni la carpeta `claudeweb/`: tienen cambios ajenos a este plan. Usar siempre `git add` con rutas explícitas.

## Review Focus

- Ítem en una moneda sin tipo de cambio conocido → queda fuera de los totales y se informa en `missingRates`, no rompe ni cuenta como 0 silencioso. (Tarea 4, prueba `summarize: moneda sin tipo de cambio`.)
- Gasto pagado sin pagador (viajero borrado) o sin participantes → no entra al reparto. (Tarea 4, prueba `balances: ignora ítems sin pagador o sin participantes`; Tarea 2, prueba `borrar al pagador deja paid_by en null`.)
- Monto que no se divide exacto (100 entre 3 en CLP) → las partes suman exactamente el total y los saldos suman 0. (Tarea 4, pruebas `splitEqually` y `balances: suman cero`.)
- Quien paga no participa del gasto (pagó por otros) → se le debe el total. (Tarea 4, prueba `balances: el pagador no participa`.)
- Sumas con decimales (0,1 + 0,2 en USD) → sin errores de coma flotante en totales ni transferencias. (Tarea 4, prueba `summarize: decimales`.)

---

### Task 1: Reparar las pruebas de reglas de base

Hoy `npm run test:db` no corre en Windows (arma la ruta `F:\F:\...`) y tiene una sección "Ficha de IA" que quedó obsoleta cuando `member_list_places` pasó de `ai_info` a `info`. Sin esto no hay línea base para la Tarea 2.

**Files:**
- Modify: `supabase/tests/rules.test.mjs`

**Interfaces:**
- Produces: `npm run test:db` termina con `0 fallidas`.

- [ ] **Step 1: Confirmar la falla actual**

Run: `npm run test:db`
Expected: FAIL con `ENOENT ... scandir 'F:\F:\tripplanner\supabase\migrations'`.

- [ ] **Step 2: Corregir la ruta de las migraciones**

En `supabase/tests/rules.test.mjs`, reemplazar las líneas de imports y `MIG`:

```js
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG = fileURLToPath(new URL('../migrations', import.meta.url))
```

- [ ] **Step 3: Reemplazar la sección obsoleta "Ficha de IA"**

Borrar el bloque que empieza en `console.log('\nFicha de IA')` (5 líneas) y poner:

```js
console.log('\nInfo automática')
check('sin place_info, info = null', (await mplaces(tPedro)).find(p => p.id === pTorre).info === null)
await db.query(`insert into public.place_info (place_id, trip_id, history) values ($1,$2,'Torre icónica')`, [pTorre, trip.id])
check('con place_info, se muestra', (await mplaces(tPedro)).find(p => p.id === pTorre).info.history === 'Torre icónica')
```

- [ ] **Step 4: Verificar**

Run: `npm run test:db`
Expected: última línea `NN ok, 0 fallidas`, código de salida 0.

- [ ] **Step 5: Commit** (pendiente de autorización)

```bash
git add supabase/tests/rules.test.mjs
git commit -m "test: reparar pruebas de reglas en Windows y quitar sección obsoleta"
```

---

### Task 2: Migración de presupuesto y sus reglas

**Files:**
- Create: `supabase/migrations/20261012000001_budget.sql`
- Modify: `supabase/tests/rules.test.mjs`

**Interfaces:**
- Produces: tablas `budget_items`, `budget_item_shares`, `trip_exchange_rates`; columnas `trips.budget_currency`, `trips.budget_published`; enum `budget_category`; función `set_budget_item_shares(p_item_id uuid, p_member_ids uuid[]) returns void`; `member_get_trip` devuelve además `budget_published: boolean` y `budget: null | { currency, me, members: {id,name,status}[], items: {id, category, name, notes, currency, estimated_amount, actual_amount, actual_rate, paid_by, paid_on, member_ids}[], rates: {currency, rate}[] }`. Errores con nombre: `budget_item_has_amount`, `budget_item_rate_when_paid`, `budget_currency_locked`, `BUDGET_ITEM_NOT_FOUND`.

- [ ] **Step 1: Escribir las pruebas (fallarán)**

En `supabase/tests/rules.test.mjs`, insertar este bloque justo antes de `console.log('\nInfo automática')`:

```js
console.log('\nPresupuesto')
const [mJuan, mLucia, mPedro] = mem.map(r => r.id)
const uuids = ids => `{${ids.join(',')}}`
check('moneda principal CLP y presupuesto oculto por defecto', trip.budget_currency === 'CLP' && trip.budget_published === false)
const item = (await as('authenticated', A, `insert into public.budget_items (trip_id, category, name, currency, estimated_amount)
  values ($1,'lodging','Hotel','KRW',900000) returning *`, [trip.id])).rows[0]
check('admin crea ítem', item.category === 'lodging' && item.actual_amount === null)
check('C no crea ítems en viaje ajeno', /row-level security/.test(await err('authenticated', C, `insert into public.budget_items (trip_id, name, currency, estimated_amount) values ($1,'x','CLP',1)`, [trip.id])))
check('C no ve ítems ajenos', (await as('authenticated', C, 'select * from public.budget_items')).rows.length === 0)
check('anon sin acceso al presupuesto', /permission denied/.test(await err('anon', null, 'select * from public.budget_items')))
check('ítem sin montos rechazado', /budget_item_has_amount/.test(await err('authenticated', A, `insert into public.budget_items (trip_id, name, currency) values ($1,'x','CLP')`, [trip.id])))
check('moneda inválida rechazada', /budget_items_currency_check/.test(await err('authenticated', A, `insert into public.budget_items (trip_id, name, currency, estimated_amount) values ($1,'x','clp',1)`, [trip.id])))
check('gasto real sin tipo de cambio rechazado', /budget_item_rate_when_paid/.test(await err('authenticated', A, `update public.budget_items set actual_amount = 950000 where id = $1`, [item.id])))
const otherMember = (await as('authenticated', C, `insert into public.members (trip_id, name) values ($1,'Otro') returning id`, [otherTrip.id])).rows[0].id
check('pagador de otro viaje rechazado', /foreign key|violates/.test(await err('authenticated', A, `update public.budget_items set paid_by = $2 where id = $1`, [item.id, otherMember]) ?? ''))
await as('authenticated', A, `update public.budget_items set actual_amount = 950000, actual_rate = 0.73, paid_by = $2, paid_on = '2027-04-10' where id = $1`, [item.id, mJuan])
await as('authenticated', A, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([mJuan, mLucia, mPedro])])
await as('authenticated', A, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([mJuan, mLucia])])
check('set_budget_item_shares reemplaza a los participantes', (await db.query('select count(*)::int n from public.budget_item_shares where item_id = $1', [item.id])).rows[0].n === 2)
check('C no cambia participantes ajenos', /BUDGET_ITEM_NOT_FOUND/.test(await err('authenticated', C, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([mJuan])])))
check('participante de otro viaje rechazado', /foreign key|violates/.test(await err('authenticated', A, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([otherMember])]) ?? ''))
await as('authenticated', A, `insert into public.trip_exchange_rates (trip_id, currency, rate) values ($1,'KRW',0.73)`, [trip.id])
check('C no ve tipos de cambio ajenos', (await as('authenticated', C, 'select * from public.trip_exchange_rates')).rows.length === 0)
check('no se cambia la moneda principal con gastos pagados', /budget_currency_locked/.test(await err('authenticated', A, `update public.trips set budget_currency = 'USD' where id = $1`, [trip.id])))

const tmp = (await as('authenticated', A, `insert into public.members (trip_id, name) values ($1,'Temporal') returning id`, [trip.id])).rows[0].id
const tmpItem = (await as('authenticated', A, `insert into public.budget_items (trip_id, name, currency, actual_amount, actual_rate, paid_by)
  values ($1,'Taxi','CLP',10000,1,$2) returning id`, [trip.id, tmp])).rows[0].id
await as('authenticated', A, 'delete from public.members where id = $1', [tmp])
const orphan = (await db.query('select paid_by, trip_id from public.budget_items where id = $1', [tmpItem])).rows[0]
check('borrar al pagador deja paid_by en null y conserva el ítem', orphan.paid_by === null && orphan.trip_id === trip.id)
await as('authenticated', A, 'delete from public.budget_items where id = $1', [tmpItem])

g = await mget(tLucia)
check('presupuesto oculto mientras no se publica', g.budget_published === false && g.budget === null)
await as('authenticated', A, 'update public.trips set budget_published = true where id = $1', [trip.id])
g = await mget(tLucia)
check('presupuesto visible al publicar', g.budget_published === true && g.budget.currency === 'CLP' && g.budget.items.length === 1 && g.budget.items[0].member_ids.length === 2)
check('los montos llegan como número', g.budget.items[0].actual_amount === 950000 && g.budget.items[0].actual_rate === 0.73 && g.budget.items[0].estimated_amount === 900000)
check('incluye su id, los viajeros y los cambios, sin tokens', g.budget.me === mLucia && g.budget.members.length === 3 && g.budget.rates[0].currency === 'KRW' && !JSON.stringify(g.budget).includes(tJuan))
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm run test:db`
Expected: FAIL (excepción al leer `trip.budget_currency` o `relation "public.budget_items" does not exist`).

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20261012000001_budget.sql`:

```sql
-- =====================================================================
-- Presupuesto del viaje
--   budget_items         ítems con costo estimado y gasto real
--   budget_item_shares   qué viajeros participan de cada ítem
--   trip_exchange_rates  tipo de cambio de cada moneda hacia la principal
-- Mismo modelo de acceso que el resto: los administradores por RLS,
-- los viajeros solo leen vía member_get_trip (si está publicado).
-- "rate" siempre es: 1 unidad de la moneda = N de la moneda principal.
-- =====================================================================

create type public.budget_category as enum ('lodging', 'transport', 'tickets', 'food', 'shopping', 'other');

alter table public.trips
  add column budget_currency  text not null default 'CLP'
    constraint trips_budget_currency_check check (budget_currency ~ '^[A-Z]{3}$'),
  add column budget_published boolean not null default false;

grant update (budget_currency, budget_published) on public.trips to authenticated;

-- ---------------------------------------------------------------------
-- Ítems
-- ---------------------------------------------------------------------
create table public.budget_items (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  category          public.budget_category not null default 'other',
  name              text not null check (length(trim(name)) between 1 and 120),
  notes             text,
  currency          text not null constraint budget_items_currency_check check (currency ~ '^[A-Z]{3}$'),
  estimated_amount  numeric(14,2) check (estimated_amount >= 0),
  actual_amount     numeric(14,2) check (actual_amount >= 0),   -- null = todavía no se paga
  actual_rate       numeric(18,8) check (actual_rate > 0),      -- congelado al pagar
  paid_by           uuid,
  paid_on           date,
  place_id          uuid,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint budget_items_id_trip_uq unique (id, trip_id),
  foreign key (paid_by, trip_id) references public.members (id, trip_id) on delete set null (paid_by),
  foreign key (place_id, trip_id) references public.places (id, trip_id) on delete set null (place_id),
  constraint budget_item_has_amount check (estimated_amount is not null or actual_amount is not null),
  constraint budget_item_rate_when_paid check (actual_amount is null or actual_rate is not null)
);

create index budget_items_trip_idx on public.budget_items (trip_id, category, sort_order);

create trigger budget_items_updated_at before update on public.budget_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Participantes de cada ítem (reparto en partes iguales)
-- ---------------------------------------------------------------------
create table public.budget_item_shares (
  item_id    uuid not null,
  member_id  uuid not null,
  trip_id    uuid not null,
  primary key (item_id, member_id),
  foreign key (item_id, trip_id) references public.budget_items (id, trip_id) on delete cascade,
  foreign key (member_id, trip_id) references public.members (id, trip_id) on delete cascade
);

create index budget_item_shares_trip_idx on public.budget_item_shares (trip_id);
create index budget_item_shares_member_idx on public.budget_item_shares (member_id);

-- ---------------------------------------------------------------------
-- Tipos de cambio del viaje
-- ---------------------------------------------------------------------
create table public.trip_exchange_rates (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  rate        numeric(18,8) not null check (rate > 0),
  source      text not null default 'auto' check (source in ('auto', 'manual')),
  updated_at  timestamptz not null default now(),
  primary key (trip_id, currency)
);

-- Cambiar la moneda principal invalida los tipos de cambio guardados.
-- Con gastos ya pagados no se permite: su cambio congelado está
-- expresado en la moneda anterior.
create or replace function public.check_budget_currency_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.budget_items where trip_id = new.id and actual_amount is not null) then
    raise exception 'budget_currency_locked' using errcode = '23514';
  end if;
  delete from public.trip_exchange_rates where trip_id = new.id;
  return new;
end;
$$;

create trigger trips_budget_currency_change
  before update of budget_currency on public.trips
  for each row
  when (old.budget_currency is distinct from new.budget_currency)
  execute function public.check_budget_currency_change();

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
alter table public.budget_items enable row level security;
alter table public.budget_item_shares enable row level security;
alter table public.trip_exchange_rates enable row level security;

revoke all on public.budget_items, public.budget_item_shares, public.trip_exchange_rates from anon;
revoke all on public.budget_items, public.budget_item_shares, public.trip_exchange_rates from authenticated;

grant select, delete on public.budget_items to authenticated;
grant insert (trip_id, category, name, notes, currency, estimated_amount, actual_amount, actual_rate, paid_by, paid_on, place_id, sort_order)
  on public.budget_items to authenticated;
grant update (category, name, notes, currency, estimated_amount, actual_amount, actual_rate, paid_by, paid_on, place_id, sort_order)
  on public.budget_items to authenticated;

create policy budget_items_select on public.budget_items
  for select to authenticated using (public.is_trip_admin(trip_id));
create policy budget_items_insert on public.budget_items
  for insert to authenticated with check (public.is_trip_admin(trip_id));
create policy budget_items_update on public.budget_items
  for update to authenticated
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy budget_items_delete on public.budget_items
  for delete to authenticated using (public.is_trip_admin(trip_id));

grant select, insert, delete on public.budget_item_shares to authenticated;

create policy budget_item_shares_select on public.budget_item_shares
  for select to authenticated using (public.is_trip_admin(trip_id));
create policy budget_item_shares_insert on public.budget_item_shares
  for insert to authenticated with check (public.is_trip_admin(trip_id));
create policy budget_item_shares_delete on public.budget_item_shares
  for delete to authenticated using (public.is_trip_admin(trip_id));

grant select, insert, update, delete on public.trip_exchange_rates to authenticated;

create policy trip_exchange_rates_select on public.trip_exchange_rates
  for select to authenticated using (public.is_trip_admin(trip_id));
create policy trip_exchange_rates_insert on public.trip_exchange_rates
  for insert to authenticated with check (public.is_trip_admin(trip_id));
create policy trip_exchange_rates_update on public.trip_exchange_rates
  for update to authenticated
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy trip_exchange_rates_delete on public.trip_exchange_rates
  for delete to authenticated using (public.is_trip_admin(trip_id));

-- ---------------------------------------------------------------------
-- Reemplaza los participantes de un ítem en una sola transacción.
-- Corre con los permisos de quien llama: RLS decide si ve el ítem.
-- ---------------------------------------------------------------------
create or replace function public.set_budget_item_shares(p_item_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_ids     uuid[] := coalesce(p_member_ids, '{}');
begin
  select trip_id into v_trip_id from public.budget_items where id = p_item_id;
  if v_trip_id is null then
    raise exception 'BUDGET_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.budget_item_shares
  where item_id = p_item_id and not (member_id = any (v_ids));

  insert into public.budget_item_shares (item_id, member_id, trip_id)
  select p_item_id, m, v_trip_id from unnest(v_ids) as m
  on conflict do nothing;
end;
$$;

revoke all on function public.set_budget_item_shares(uuid, uuid[]) from public, anon;
grant execute on function public.set_budget_item_shares(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- member_get_trip: agrega 'budget_published' y 'budget' (si está
-- publicado). Resto de la función sin cambios.
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

- [ ] **Step 4: Verificar**

Run: `npm run test:db`
Expected: `✔ migración 20261012000001_budget.sql`, todas las pruebas de "Presupuesto" con ✔ y `0 fallidas`. Las secciones posteriores ("Fecha límite", "Borrar") siguen pasando: borrar el viaje borra en cascada también el presupuesto.

- [ ] **Step 5: Commit** (pendiente de autorización)

```bash
git add supabase/migrations/20261012000001_budget.sql supabase/tests/rules.test.mjs
git commit -m "feat(db): tablas, permisos y funciones del presupuesto"
```

---

### Task 3: Tipos compartidos

`npm run db:types` necesita el CLI de Supabase enlazado al proyecto, que puede no estar disponible; los tipos se agregan a mano con el mismo formato que genera el CLI.

**Files:**
- Modify: `shared/types/database.types.ts`
- Modify: `shared/types/trip.ts`

**Interfaces:**
- Produces: `Database['public']['Tables']['budget_items' | 'budget_item_shares' | 'trip_exchange_rates']`, `Database['public']['Enums']['budget_category']`, `Database['public']['Functions']['set_budget_item_shares']`; en `trip.ts`: `MemberBudget`, y `MemberTripView` con `budget_published: boolean` y `budget: MemberBudget | null`.

- [ ] **Step 1: Agregar las tablas a `database.types.ts`**

Dentro de `public.Tables`, antes de `itinerary_stops: {`, insertar:

```ts
      budget_item_shares: {
        Row: {
          item_id: string
          member_id: string
          trip_id: string
        }
        Insert: {
          item_id: string
          member_id: string
          trip_id: string
        }
        Update: {
          item_id?: string
          member_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_item_shares_item_id_trip_id_fkey"
            columns: ["item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "budget_item_shares_member_id_trip_id_fkey"
            columns: ["member_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
      budget_items: {
        Row: {
          actual_amount: number | null
          actual_rate: number | null
          category: Database["public"]["Enums"]["budget_category"]
          created_at: string
          currency: string
          estimated_amount: number | null
          id: string
          name: string
          notes: string | null
          paid_by: string | null
          paid_on: string | null
          place_id: string | null
          sort_order: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          actual_rate?: number | null
          category?: Database["public"]["Enums"]["budget_category"]
          created_at?: string
          currency: string
          estimated_amount?: number | null
          id?: string
          name: string
          notes?: string | null
          paid_by?: string | null
          paid_on?: string | null
          place_id?: string | null
          sort_order?: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          actual_rate?: number | null
          category?: Database["public"]["Enums"]["budget_category"]
          created_at?: string
          currency?: string
          estimated_amount?: number | null
          id?: string
          name?: string
          notes?: string | null
          paid_by?: string | null
          paid_on?: string | null
          place_id?: string | null
          sort_order?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_paid_by_trip_id_fkey"
            columns: ["paid_by", "trip_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "budget_items_place_id_trip_id_fkey"
            columns: ["place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "budget_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
```

Dentro de `public.Tables`, antes de `trips: {`, insertar:

```ts
      trip_exchange_rates: {
        Row: {
          currency: string
          rate: number
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          currency: string
          rate: number
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          currency?: string
          rate?: number
          source?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_exchange_rates_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Columnas nuevas de `trips`, función y enum**

En `trips`, agregar en orden alfabético (antes de `created_at`):
- `Row`: `budget_currency: string` y `budget_published: boolean`
- `Insert` y `Update`: `budget_currency?: string` y `budget_published?: boolean`

En `Functions`, después de `regenerate_member_token`:

```ts
      set_budget_item_shares: {
        Args: { p_item_id: string; p_member_ids: string[] }
        Returns: undefined
      }
```

En `Enums` (el tipo, cerca de la línea 479), antes de `member_status`:

```ts
      budget_category:
        | "lodging"
        | "transport"
        | "tickets"
        | "food"
        | "shopping"
        | "other"
```

En `Constants.public.Enums` (al final del archivo), antes de `member_status`:

```ts
      budget_category: [
        "lodging",
        "transport",
        "tickets",
        "food",
        "shopping",
        "other",
      ],
```

- [ ] **Step 3: Tipos de la vista del invitado**

En `shared/types/trip.ts`, agregar el import al inicio y los tipos al final; y en `MemberTripView`, después de `itinerary: MemberStop[]`, agregar `budget_published: boolean` y `budget: MemberBudget | null`.

```ts
import type { BudgetItemView } from '../utils/budget'
```

```ts
/** Presupuesto que ve el viajero (solo si está publicado) */
export interface MemberBudget {
  /** moneda principal del viaje */
  currency: string
  /** id del viajero que mira, para destacar lo suyo */
  me: string
  members: { id: string, name: string, status: MemberStatus }[]
  items: BudgetItemView[]
  rates: { currency: string, rate: number }[]
}
```

(`BudgetItemView` se crea en la Tarea 4; hasta entonces el typecheck falla en este import.)

- [ ] **Step 4: Commit** (pendiente de autorización; se verifica junto con la Tarea 4)

```bash
git add shared/types/database.types.ts shared/types/trip.ts
git commit -m "feat: tipos del presupuesto"
```

---

### Task 4: Cálculos del presupuesto

**Files:**
- Create: `shared/utils/budget.ts`
- Create: `tests/budget.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces (todo exportado desde `shared/utils/budget.ts`):
  - `BUDGET_CATEGORIES: readonly BudgetCategory[]`, `type BudgetCategory`
  - `BUDGET_CATEGORY_META: Record<BudgetCategory, { label: string, icon: string }>`
  - `BUDGET_CURRENCIES: readonly string[]`
  - `interface BudgetItemLike { id: string, category: BudgetCategory, currency: string, estimated_amount: number | null, actual_amount: number | null, actual_rate: number | null, paid_by: string | null, member_ids: string[] }`
  - `interface BudgetItemView extends BudgetItemLike { name: string, notes: string | null, paid_on: string | null }`
  - `type Rates = Record<string, number>`
  - `currencyDecimals(currency: string): number`
  - `roundMoney(amount: number, currency: string): number`
  - `rateFor(currency: string, base: string, rates: Rates): number | null`
  - `estimatedBase(item: BudgetItemLike, base: string, rates: Rates): number | null`
  - `actualBase(item: BudgetItemLike, base: string): number | null`
  - `summarize(items: BudgetItemLike[], base: string, rates: Rates, people: number): BudgetSummary` con `BudgetSummary { estimated, actual, variance, perPerson: number, byCategory: CategoryTotal[], missingRates: string[] }` y `CategoryTotal { category, estimated, actual, count }`
  - `splitEqually(total: number, ids: string[], currency: string): Map<string, number>`
  - `balances(items: BudgetItemLike[], base: string, memberIds: string[]): MemberBalance[]` con `MemberBalance { member_id: string, paid: number, owed: number, balance: number }`
  - `settle(list: MemberBalance[], currency: string): Transfer[]` con `Transfer { from: string, to: string, amount: number }`
  - `formatMoney(amount: number, currency: string): string`
  - `currencyLabel(code: string): string`

- [ ] **Step 1: Escribir las pruebas**

Crear `tests/budget.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actualBase, balances, currencyDecimals, estimatedBase, roundMoney, settle, splitEqually, summarize,
  type BudgetItemLike,
} from '../shared/utils/budget.ts'

const item = (over: Partial<BudgetItemLike>): BudgetItemLike => ({
  id: 'i1', category: 'other', currency: 'CLP',
  estimated_amount: null, actual_amount: null, actual_rate: null, paid_by: null, member_ids: [],
  ...over,
})
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

test('currencyDecimals: CLP, KRW y JPY sin decimales; USD con 2; código raro con 2', () => {
  assert.equal(currencyDecimals('CLP'), 0)
  assert.equal(currencyDecimals('KRW'), 0)
  assert.equal(currencyDecimals('JPY'), 0)
  assert.equal(currencyDecimals('USD'), 2)
  assert.equal(currencyDecimals('???'), 2)
})

test('roundMoney redondea a los decimales de la moneda', () => {
  assert.equal(roundMoney(1234.5, 'CLP'), 1235)
  assert.equal(roundMoney(12.346, 'USD'), 12.35)
})

test('estimatedBase: convierte con el cambio del viaje; misma moneda = 1', () => {
  assert.equal(estimatedBase(item({ currency: 'KRW', estimated_amount: 900000 }), 'CLP', { KRW: 0.73 }), 657000)
  assert.equal(estimatedBase(item({ estimated_amount: 5000 }), 'CLP', {}), 5000)
  assert.equal(estimatedBase(item({ currency: 'KRW', estimated_amount: 100 }), 'CLP', {}), null)
  assert.equal(estimatedBase(item({}), 'CLP', {}), null)
})

test('actualBase: usa el cambio congelado del ítem, no el del viaje', () => {
  assert.equal(actualBase(item({ currency: 'KRW', actual_amount: 1000, actual_rate: 0.7 }), 'CLP'), 700)
  assert.equal(actualBase(item({ actual_amount: 1000, actual_rate: 1 }), 'CLP'), 1000)
  assert.equal(actualBase(item({}), 'CLP'), null)
})

test('summarize: totales, diferencia, por categoría y por persona', () => {
  const s = summarize([
    item({ id: 'a', category: 'lodging', currency: 'KRW', estimated_amount: 900000, actual_amount: 950000, actual_rate: 0.7 }),
    item({ id: 'b', category: 'food', estimated_amount: 30000 }),
    item({ id: 'c', category: 'food', actual_amount: 12000, actual_rate: 1 }),
  ], 'CLP', { KRW: 0.73 }, 3)
  assert.equal(s.estimated, 687000) // 657.000 + 30.000
  assert.equal(s.actual, 677000) // 665.000 + 12.000
  assert.equal(s.variance, 8000) // solo el ítem con ambos montos: 665.000 − 657.000
  assert.equal(s.perPerson, 229000)
  assert.deepEqual(s.byCategory, [
    { category: 'lodging', estimated: 657000, actual: 665000, count: 1 },
    { category: 'food', estimated: 30000, actual: 12000, count: 2 },
  ])
  assert.deepEqual(s.missingRates, [])
})

test('summarize: moneda sin tipo de cambio queda fuera y se informa', () => {
  const s = summarize([
    item({ id: 'a', currency: 'THB', estimated_amount: 500 }),
    item({ id: 'b', estimated_amount: 1000 }),
  ], 'CLP', {}, 2)
  assert.equal(s.estimated, 1000)
  assert.deepEqual(s.missingRates, ['THB'])
})

test('summarize: decimales sin error de coma flotante; sin personas no divide', () => {
  const s = summarize([
    item({ id: 'a', currency: 'USD', estimated_amount: 0.1 }),
    item({ id: 'b', currency: 'USD', estimated_amount: 0.2 }),
  ], 'USD', {}, 0)
  assert.equal(s.estimated, 0.3)
  assert.equal(s.perPerson, 0)
})

test('splitEqually: el resto se reparte de a una unidad y la suma es exacta', () => {
  const parts = splitEqually(100, ['c', 'a', 'b'], 'CLP')
  assert.deepEqual([...parts], [['a', 34], ['b', 33], ['c', 33]])
  assert.equal(sum([...parts.values()]), 100)
  const usd = splitEqually(10, ['a', 'b', 'c'], 'USD')
  assert.deepEqual([...usd.values()], [3.34, 3.33, 3.33])
  assert.equal(splitEqually(100, [], 'CLP').size, 0)
  assert.deepEqual([...splitEqually(100, ['a', 'a'], 'CLP')], [['a', 100]])
})

test('balances: suman cero y reflejan quién pagó', () => {
  const list = balances([
    item({ id: 'a', actual_amount: 100, actual_rate: 1, paid_by: 'ana', member_ids: ['ana', 'beto', 'caro'] }),
    item({ id: 'b', actual_amount: 60, actual_rate: 1, paid_by: 'beto', member_ids: ['ana', 'beto'] }),
  ], 'CLP', ['ana', 'beto', 'caro'])
  assert.deepEqual(list, [
    { member_id: 'ana', paid: 100, owed: 64, balance: 36 },
    { member_id: 'beto', paid: 60, owed: 63, balance: -3 },
    { member_id: 'caro', paid: 0, owed: 33, balance: -33 },
  ])
  assert.equal(sum(list.map(b => b.balance)), 0)
})

test('balances: el pagador no participa del gasto', () => {
  const list = balances([
    item({ actual_amount: 90, actual_rate: 1, paid_by: 'ana', member_ids: ['beto', 'caro'] }),
  ], 'CLP', ['ana', 'beto', 'caro'])
  assert.deepEqual(list.map(b => b.balance), [90, -45, -45])
})

test('balances: ignora ítems sin pagador, sin participantes o sin gasto real', () => {
  const list = balances([
    item({ id: 'a', actual_amount: 100, actual_rate: 1, paid_by: null, member_ids: ['ana'] }),
    item({ id: 'b', actual_amount: 100, actual_rate: 1, paid_by: 'ana', member_ids: [] }),
    item({ id: 'c', estimated_amount: 100, paid_by: 'ana', member_ids: ['ana', 'beto'] }),
  ], 'CLP', ['ana', 'beto'])
  assert.deepEqual(list.map(b => b.balance), [0, 0])
})

test('settle: transferencias mínimas que dejan a todos en cero', () => {
  const t = settle([
    { member_id: 'ana', paid: 100, owed: 64, balance: 36 },
    { member_id: 'beto', paid: 60, owed: 63, balance: -3 },
    { member_id: 'caro', paid: 0, owed: 33, balance: -33 },
  ], 'CLP')
  assert.deepEqual(t, [
    { from: 'caro', to: 'ana', amount: 33 },
    { from: 'beto', to: 'ana', amount: 3 },
  ])
  assert.deepEqual(settle([{ member_id: 'ana', paid: 0, owed: 0, balance: 0 }], 'CLP'), [])
})

test('settle: con decimales no deja residuos', () => {
  const list = balances([
    item({ currency: 'USD', actual_amount: 10, actual_rate: 1, paid_by: 'ana', member_ids: ['ana', 'beto', 'caro'] }),
  ], 'USD', ['ana', 'beto', 'caro'])
  const t = settle(list, 'USD')
  assert.deepEqual(t, [
    { from: 'beto', to: 'ana', amount: 3.33 },
    { from: 'caro', to: 'ana', amount: 3.33 },
  ])
})
```

En `package.json`, agregar a `scripts` (después de `typecheck`):

```json
    "test": "node --test \"tests/**/*.test.ts\"",
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test`
Expected: FAIL con `Cannot find module ... shared/utils/budget.ts`.

- [ ] **Step 3: Implementar**

Crear `shared/utils/budget.ts`:

```ts
// Cálculos del presupuesto. Funciones puras: las usan el panel de
// administración, la vista del viajero y las pruebas. Sin imports.
// "rate" siempre es: 1 unidad de la moneda del ítem = N de la principal.

export const BUDGET_CATEGORIES = ['lodging', 'transport', 'tickets', 'food', 'shopping', 'other'] as const
export type BudgetCategory = typeof BUDGET_CATEGORIES[number]

export const BUDGET_CATEGORY_META: Record<BudgetCategory, { label: string, icon: string }> = {
  lodging: { label: 'Alojamiento', icon: 'i-lucide-bed-double' },
  transport: { label: 'Transporte', icon: 'i-lucide-plane' },
  tickets: { label: 'Entradas', icon: 'i-lucide-ticket' },
  food: { label: 'Comida', icon: 'i-lucide-utensils' },
  shopping: { label: 'Compras', icon: 'i-lucide-shopping-bag' },
  other: { label: 'Otros', icon: 'i-lucide-ellipsis' },
}

export const BUDGET_CURRENCIES = [
  'CLP', 'USD', 'EUR', 'KRW', 'JPY', 'CNY', 'GBP', 'ARS', 'PEN', 'BRL', 'MXN', 'COP', 'UYU',
  'BOB', 'CAD', 'AUD', 'NZD', 'CHF', 'THB', 'VND', 'SGD', 'HKD', 'TWD', 'IDR', 'MYR', 'PHP',
  'INR', 'TRY', 'AED', 'ZAR', 'SEK', 'NOK', 'DKK', 'CZK', 'PLN', 'HUF', 'ILS', 'EGP', 'MAD',
] as const

/** Lo mínimo de un ítem que necesitan los cálculos */
export interface BudgetItemLike {
  id: string
  category: BudgetCategory
  currency: string
  estimated_amount: number | null
  /** null = todavía no se paga */
  actual_amount: number | null
  /** tipo de cambio congelado al pagar */
  actual_rate: number | null
  paid_by: string | null
  /** viajeros entre los que se reparte */
  member_ids: string[]
}

/** Ítem tal como se muestra en la lista (admin y viajero) */
export interface BudgetItemView extends BudgetItemLike {
  name: string
  notes: string | null
  paid_on: string | null
}

/** moneda → tipo de cambio hacia la moneda principal */
export type Rates = Record<string, number>

export interface CategoryTotal { category: BudgetCategory, estimated: number, actual: number, count: number }

export interface BudgetSummary {
  estimated: number
  actual: number
  /** gastado − estimado, solo en ítems que tienen ambos montos */
  variance: number
  perPerson: number
  byCategory: CategoryTotal[]
  /** monedas con ítems estimados pero sin tipo de cambio */
  missingRates: string[]
}

export interface MemberBalance { member_id: string, paid: number, owed: number, balance: number }
export interface Transfer { from: string, to: string, amount: number }

/** Decimales que usa la moneda: 0 para CLP, KRW, JPY; 2 para la mayoría */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  }
  catch {
    return 2
  }
}

const factor = (currency: string) => 10 ** currencyDecimals(currency)

export function roundMoney(amount: number, currency: string): number {
  const f = factor(currency)
  return Math.round(amount * f) / f
}

export function rateFor(currency: string, base: string, rates: Rates): number | null {
  if (currency === base) return 1
  const r = rates[currency]
  return r && r > 0 ? r : null
}

/** Costo estimado en la moneda principal, con el cambio actual del viaje */
export function estimatedBase(item: BudgetItemLike, base: string, rates: Rates): number | null {
  if (item.estimated_amount == null) return null
  const r = rateFor(item.currency, base, rates)
  return r == null ? null : roundMoney(item.estimated_amount * r, base)
}

/** Gasto real en la moneda principal, con el cambio congelado del ítem */
export function actualBase(item: BudgetItemLike, base: string): number | null {
  if (item.actual_amount == null) return null
  const r = item.currency === base ? 1 : item.actual_rate
  return r == null ? null : roundMoney(item.actual_amount * r, base)
}

export function summarize(items: BudgetItemLike[], base: string, rates: Rates, people: number): BudgetSummary {
  const cats = new Map<BudgetCategory, CategoryTotal>(
    BUDGET_CATEGORIES.map(category => [category, { category, estimated: 0, actual: 0, count: 0 }]),
  )
  const missing = new Set<string>()
  let variance = 0

  for (const it of items) {
    const row = cats.get(it.category)!
    row.count++
    const est = estimatedBase(it, base, rates)
    const act = actualBase(it, base)
    if (it.estimated_amount != null && est == null) missing.add(it.currency)
    if (est != null) row.estimated += est
    if (act != null) row.actual += act
    if (est != null && act != null) variance += act - est
  }

  const byCategory = [...cats.values()]
    .filter(c => c.count > 0)
    .map(c => ({ ...c, estimated: roundMoney(c.estimated, base), actual: roundMoney(c.actual, base) }))
  const estimated = roundMoney(byCategory.reduce((t, c) => t + c.estimated, 0), base)
  const actual = roundMoney(byCategory.reduce((t, c) => t + c.actual, 0), base)

  return {
    estimated,
    actual,
    variance: roundMoney(variance, base),
    perPerson: people > 0 ? roundMoney(estimated / people, base) : 0,
    byCategory,
    missingRates: [...missing].sort(),
  }
}

/**
 * Divide en partes iguales en la unidad mínima de la moneda. Lo que sobra
 * se reparte de a una unidad entre los primeros (ordenados por id), así
 * la suma de las partes es exactamente el total y el resultado es estable.
 */
export function splitEqually(total: number, ids: string[], currency: string): Map<string, number> {
  const out = new Map<string, number>()
  const sorted = [...new Set(ids)].sort()
  if (!sorted.length) return out
  const f = factor(currency)
  const units = Math.round(total * f)
  const share = Math.floor(units / sorted.length)
  let rest = units - share * sorted.length
  for (const id of sorted) {
    out.set(id, (share + (rest > 0 ? 1 : 0)) / f)
    if (rest > 0) rest--
  }
  return out
}

/**
 * Por viajero: cuánto pagó, cuánto le toca y su saldo (pagó − le toca).
 * Solo cuentan los ítems con gasto real, pagador y al menos un participante.
 */
export function balances(items: BudgetItemLike[], base: string, memberIds: string[]): MemberBalance[] {
  const f = factor(base)
  const paid = new Map<string, number>()
  const owed = new Map<string, number>()
  const add = (map: Map<string, number>, id: string, units: number) => map.set(id, (map.get(id) ?? 0) + units)

  for (const it of items) {
    const total = actualBase(it, base)
    if (total == null || !it.paid_by || !it.member_ids.length) continue
    add(paid, it.paid_by, Math.round(total * f))
    for (const [id, part] of splitEqually(total, it.member_ids, base)) add(owed, id, Math.round(part * f))
  }

  const ids = [...new Set([...memberIds, ...paid.keys(), ...owed.keys()])]
  return ids.map((id) => {
    const p = paid.get(id) ?? 0
    const o = owed.get(id) ?? 0
    return { member_id: id, paid: p / f, owed: o / f, balance: (p - o) / f }
  })
}

/** Transferencias para saldar: el que más debe le paga al que más tiene a favor */
export function settle(list: MemberBalance[], currency: string): Transfer[] {
  const f = factor(currency)
  const units = list.map(b => ({ id: b.member_id, u: Math.round(b.balance * f) }))
  const debtors = units.filter(x => x.u < 0).map(x => ({ id: x.id, u: -x.u }))
  const creditors = units.filter(x => x.u > 0)
  const bySize = (a: { id: string, u: number }, b: { id: string, u: number }) => b.u - a.u || (a.id < b.id ? -1 : 1)

  const out: Transfer[] = []
  while (debtors.length && creditors.length) {
    debtors.sort(bySize)
    creditors.sort(bySize)
    const d = debtors[0]!
    const c = creditors[0]!
    const pay = Math.min(d.u, c.u)
    out.push({ from: d.id, to: c.id, amount: pay / f })
    d.u -= pay
    c.u -= pay
    if (!d.u) debtors.shift()
    if (!c.u) creditors.shift()
  }
  return out
}

/** "CLP 12.500", "USD 12,50": con el código, porque $ sirve para varias monedas */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)
  }
  catch {
    return `${currency} ${amount}`
  }
}

/** "KRW — won surcoreano" */
export function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames('es', { type: 'currency' }).of(code)
    return name && name !== code ? `${code} — ${name}` : code
  }
  catch {
    return code
  }
}
```

- [ ] **Step 4: Verificar**

Run: `npm test`
Expected: todas las pruebas pasan (`fail 0`).

Run: `npm run typecheck`
Expected: sin errores (ahora el import de `BudgetItemView` en `shared/types/trip.ts` resuelve).

- [ ] **Step 5: Commit** (pendiente de autorización)

```bash
git add shared/utils/budget.ts tests/budget.test.ts package.json
git commit -m "feat: cálculos del presupuesto con pruebas"
```

---

### Task 5: Tipos de cambio (servidor)

**Files:**
- Create: `server/utils/exchangeRates.ts`
- Create: `server/api/admin/trips/[id]/rates.post.ts`

**Interfaces:**
- Consumes: tablas `trips.budget_currency`, `budget_items.currency`, `trip_exchange_rates` (Tarea 2); tipos `Database` (Tarea 3).
- Produces: `fetchRates(base: string, currencies: string[]): Promise<Record<string, number>>` (lanza `Error('RATES_UNAVAILABLE')` si la API no responde; omite monedas desconocidas). `POST /api/admin/trips/:id/rates` con cuerpo opcional `{ currencies?: string[] }` → devuelve todas las filas de `trip_exchange_rates` del viaje, ordenadas por moneda. Errores: 401 sin sesión, 404 viaje no visible, 502 si la API de cambio falla.

- [ ] **Step 1: Utilidad de consulta**

Crear `server/utils/exchangeRates.ts`:

```ts
/**
 * Tipos de cambio desde open.er-api.com (gratis, sin clave, ~166 monedas,
 * se actualiza una vez al día; pide atribución con enlace).
 * La API entrega 6 decimales: se calcula en la dirección que conserva
 * más precisión (invertir un 0.000750 pierde casi todos los dígitos).
 */

const API = 'https://open.er-api.com/v6/latest'

interface ErApiResponse { result?: string, rates?: Record<string, number> }

async function table(base: string): Promise<Record<string, number> | null> {
  const res = await $fetch<ErApiResponse>(`${API}/${base}`, { timeout: 8_000 }).catch(() => null)
  return res?.result === 'success' && res.rates ? res.rates : null
}

const round8 = (n: number) => Math.round(n * 1e8) / 1e8

/**
 * Para cada moneda: 1 unidad = N de `base`.
 * Omite las que la API no conoce. Lanza si la API no responde.
 */
export async function fetchRates(base: string, currencies: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const wanted = [...new Set(currencies)].filter(c => c !== base)
  if (!wanted.length) return out

  const fromBase = await table(base) // 1 base = N moneda
  if (!fromBase) throw new Error('RATES_UNAVAILABLE')

  for (const cur of wanted) {
    const inverse = fromBase[cur]
    if (!inverse || inverse <= 0) continue
    if (inverse >= 1) {
      out[cur] = round8(1 / inverse)
      continue
    }
    // La moneda vale más que la principal: se pide su tabla directo
    const direct = (await table(cur))?.[base]
    out[cur] = round8(direct && direct > 0 ? direct : 1 / inverse)
  }
  return out
}
```

- [ ] **Step 2: Endpoint**

Crear `server/api/admin/trips/[id]/rates.post.ts`:

```ts
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODE_RE = /^[A-Z]{3}$/

/**
 * POST /api/admin/trips/:id/rates  { currencies?: string[] }
 * Actualiza los tipos de cambio automáticos del viaje: los de las monedas
 * usadas en el presupuesto, los ya guardados y los que se pidan en el cuerpo
 * (para conocer el cambio de una moneda antes de guardar su primer ítem).
 * Los marcados como "manual" no se tocan. Devuelve todos los del viaje.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Debes iniciar sesión.' })

  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID_RE.test(id)) throw createError({ statusCode: 404, message: 'Viaje no encontrado.' })

  // Todo con el cliente del usuario: RLS decide si es administrador del viaje.
  const client = await serverSupabaseClient<Database>(event)
  const { data: trip } = await client.from('trips').select('id, budget_currency').eq('id', id).maybeSingle()
  if (!trip) throw createError({ statusCode: 404, message: 'Viaje no encontrado.' })

  const body = await readBody<{ currencies?: unknown } | null>(event).catch(() => null)
  const asked = body?.currencies
  const extra = Array.isArray(asked)
    ? asked.filter((c): c is string => typeof c === 'string' && CODE_RE.test(c))
    : []

  const [{ data: items }, { data: existing }] = await Promise.all([
    client.from('budget_items').select('currency').eq('trip_id', id),
    client.from('trip_exchange_rates').select('currency, source').eq('trip_id', id),
  ])
  const manual = new Set((existing ?? []).filter(r => r.source === 'manual').map(r => r.currency))
  const wanted = [...new Set([
    ...(items ?? []).map(i => i.currency),
    ...(existing ?? []).map(r => r.currency),
    ...extra,
  ])].filter(c => c !== trip.budget_currency && !manual.has(c))

  if (wanted.length) {
    const rates = await fetchRates(trip.budget_currency, wanted).catch(() => null)
    if (!rates) throw createError({ statusCode: 502, message: 'No se pudo consultar el tipo de cambio. Intenta más tarde.' })

    const now = new Date().toISOString()
    const rows = Object.entries(rates).map(([currency, rate]) => ({ trip_id: id, currency, rate, source: 'auto', updated_at: now }))
    if (rows.length) {
      const { error } = await client.from('trip_exchange_rates').upsert(rows)
      if (error) {
        console.error('[trip-rates]', error)
        throw createError({ statusCode: 500, message: 'No se pudo guardar el tipo de cambio.' })
      }
    }
  }

  const { data } = await client.from('trip_exchange_rates').select('*').eq('trip_id', id).order('currency')
  return data ?? []
})
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

Comprobar la API real y la regla de precisión (no depende de la base de datos):

Run: `curl -s https://open.er-api.com/v6/latest/CLP | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).rates;console.log('KRW',r.KRW,'USD',r.USD)})"`
Expected: `KRW` ≥ 1 (se invierte: 1 KRW ≈ 0,7 CLP) y `USD` < 1 (se pide la tabla de USD directo).

- [ ] **Step 4: Commit** (pendiente de autorización)

```bash
git add server/utils/exchangeRates.ts "server/api/admin/trips/[id]/rates.post.ts"
git commit -m "feat: tipos de cambio automáticos por viaje"
```

---

### Task 6: Datos del presupuesto en el contexto del viaje

**Files:**
- Modify: `app/composables/useTripAdmin.ts`
- Modify: `app/utils/errors.ts`

**Interfaces:**
- Consumes: `summarize`, `balances`, `settle`, `Rates` (Tarea 4); tipos de tablas (Tarea 3).
- Produces en el contexto (`useTripCtx()`): `budgetItems: ComputedRef<BudgetItem[]>`, `exchangeRates: ComputedRef<ExchangeRate[]>`, `rates: ComputedRef<Rates>`, `baseCurrency: ComputedRef<string>`, `budgetPeople: ComputedRef<number>`, `budgetSummary: ComputedRef<BudgetSummary>`, `budgetBalances: ComputedRef<MemberBalance[]>`, `budgetTransfers: ComputedRef<Transfer[]>`, y `stats.value.budgetItems: number`. Tipos exportados: `BudgetItemRow`, `BudgetItem = BudgetItemRow & { member_ids: string[] }`, `ExchangeRate`.

- [ ] **Step 1: Tipos e import**

En `app/composables/useTripAdmin.ts`, agregar el import y los tipos junto a los existentes:

```ts
import { balances, settle, summarize, type Rates } from '~~/shared/utils/budget'
```

```ts
export type BudgetItemRow = Database['public']['Tables']['budget_items']['Row']
export type BudgetItem = BudgetItemRow & { member_ids: string[] }
export type ExchangeRate = Database['public']['Tables']['trip_exchange_rates']['Row']
```

- [ ] **Step 2: Cargar las tres tablas**

Reemplazar el bloque `useAsyncData` por:

```ts
  const { data, error, refresh, status } = await useAsyncData(`trip-admin-${tripId}`, async () => {
    const [trip, members, places, stops, votes, admins, placeInfo, budgetItems, budgetShares, exchangeRates] = await Promise.all([
      client.from('trips').select('*, owner:profiles!trips_owner_id_fkey(email, full_name)').eq('id', tripId).maybeSingle(),
      client.from('members').select('*').eq('trip_id', tripId).order('created_at'),
      client.from('places').select('*').eq('trip_id', tripId).order('sort_order').order('created_at'),
      client.from('itinerary_stops').select('*').eq('trip_id', tripId).order('day').order('start_time', { nullsFirst: false }).order('sort_order').order('created_at'),
      client.from('votes').select('*').eq('trip_id', tripId),
      client.from('trip_admins').select('user_id, created_at, profile:profiles!trip_admins_user_id_fkey(email, full_name)').eq('trip_id', tripId).order('created_at'),
      client.from('place_info').select('*').eq('trip_id', tripId),
      client.from('budget_items').select('*').eq('trip_id', tripId).order('sort_order').order('created_at'),
      client.from('budget_item_shares').select('item_id, member_id').eq('trip_id', tripId),
      client.from('trip_exchange_rates').select('*').eq('trip_id', tripId).order('currency'),
    ])
    for (const r of [trip, members, places, stops, votes, admins, placeInfo, budgetItems, budgetShares, exchangeRates]) {
      if (r.error) throw r.error
    }
    return {
      trip: trip.data as unknown as (Trip & { owner: OwnerProfile | null }) | null,
      members: (members.data ?? []) as Member[],
      places: (places.data ?? []) as unknown as Place[],
      stops: (stops.data ?? []) as Stop[],
      votes: (votes.data ?? []) as Vote[],
      admins: (admins.data ?? []) as unknown as TripAdminRow[],
      placeInfo: (placeInfo.data ?? []) as PlaceInfoRow[],
      budgetItems: (budgetItems.data ?? []) as BudgetItemRow[],
      budgetShares: budgetShares.data ?? [],
      exchangeRates: (exchangeRates.data ?? []) as ExchangeRate[],
    }
  })
```

- [ ] **Step 3: Derivados**

`stats` necesita el conteo, así que el bloque de presupuesto va después de `memberById` y antes de `stats`. Agregar:

```ts
  // ---- Presupuesto ----
  const baseCurrency = computed(() => trip.value?.budget_currency ?? 'CLP')
  const exchangeRates = computed(() => data.value?.exchangeRates ?? [])
  const rates = computed<Rates>(() => Object.fromEntries(exchangeRates.value.map(r => [r.currency, r.rate])))

  const budgetItems = computed<BudgetItem[]>(() => {
    const byItem = new Map<string, string[]>()
    for (const s of data.value?.budgetShares ?? []) {
      const list = byItem.get(s.item_id) ?? []
      list.push(s.member_id)
      byItem.set(s.item_id, list)
    }
    return (data.value?.budgetItems ?? []).map(i => ({ ...i, member_ids: byItem.get(i.id) ?? [] }))
  })

  /** Entre cuántos se divide el "costo por persona": los que aceptaron, o todos si nadie ha aceptado */
  const budgetPeople = computed(() => members.value.filter(m => m.status === 'accepted').length || members.value.length)
  const budgetSummary = computed(() => summarize(budgetItems.value, baseCurrency.value, rates.value, budgetPeople.value))
  const budgetBalances = computed(() => balances(budgetItems.value, baseCurrency.value, members.value.map(m => m.id)))
  const budgetTransfers = computed(() => settle(budgetBalances.value, baseCurrency.value))
```

En `stats`, agregar la propiedad `budgetItems: budgetItems.value.length,` después de `stops`.

En el `return`, agregar la línea:

```ts
    budgetItems, exchangeRates, rates, baseCurrency, budgetPeople, budgetSummary, budgetBalances, budgetTransfers,
```

- [ ] **Step 4: Mensajes de error**

En `app/utils/errors.ts`, agregar a `CONSTRAINTS`:

```ts
  budget_currency_locked: 'No se puede cambiar la moneda principal porque ya hay gastos pagados registrados en la moneda actual.',
  budget_item_has_amount: 'El ítem necesita un costo estimado o un gasto real.',
  budget_item_rate_when_paid: 'Falta el tipo de cambio del gasto.',
  BUDGET_ITEM_NOT_FOUND: 'Ese ítem del presupuesto ya no existe.',
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit** (pendiente de autorización)

```bash
git add app/composables/useTripAdmin.ts app/utils/errors.ts
git commit -m "feat: datos y cálculos del presupuesto en el contexto del viaje"
```

---

### Task 7: Componentes de lectura (lista y cuentas)

Los usan tanto el panel de administración como la vista del invitado, por eso reciben todo por props y no leen el contexto.

**Files:**
- Create: `app/components/budget/BudgetItemList.vue`
- Create: `app/components/budget/BudgetBalances.vue`

**Interfaces:**
- Consumes: de `~~/shared/utils/budget`: `BUDGET_CATEGORIES`, `BUDGET_CATEGORY_META`, `actualBase`, `estimatedBase`, `formatMoney`, `roundMoney`, tipos `BudgetItemView`, `Rates`, `MemberBalance`, `Transfer`.
- Produces:
  - `<BudgetItemList :items :base :rates :member-names :me-id? >` con slot `#actions="{ item }"`. Props: `items: T[]` (genérico `T extends BudgetItemView`), `base: string`, `rates: Rates`, `memberNames: Record<string, string>`, `meId?: string | null`.
  - `<BudgetBalances :balances :transfers :base :member-names :me-id? />`. Props: `balances: MemberBalance[]`, `transfers: Transfer[]`, `base: string`, `memberNames: Record<string, string>`, `meId?: string | null`.

- [ ] **Step 1: Lista de ítems**

Crear `app/components/budget/BudgetItemList.vue`:

```vue
<script setup lang="ts" generic="T extends BudgetItemView">
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_META, actualBase, estimatedBase, formatMoney, roundMoney,
  type BudgetItemView, type Rates,
} from '~~/shared/utils/budget'

// Lista de ítems agrupada por categoría, de solo lectura.
// El panel de administración agrega el menú de acciones con el slot #actions.
const props = defineProps<{
  items: T[]
  /** moneda principal del viaje */
  base: string
  rates: Rates
  memberNames: Record<string, string>
  /** viajero que mira (vista del invitado): destaca en qué participa */
  meId?: string | null
}>()

const groups = computed(() => BUDGET_CATEGORIES.map((category) => {
  const items = props.items.filter(i => i.category === category)
  const total = (value: (i: T) => number | null) =>
    roundMoney(items.reduce((t, i) => t + (value(i) ?? 0), 0), props.base)
  return {
    category,
    meta: BUDGET_CATEGORY_META[category],
    items,
    estimated: total(i => estimatedBase(i, props.base, props.rates)),
    actual: total(i => actualBase(i, props.base)),
  }
}).filter(g => g.items.length))

/** Equivalente en la moneda principal, solo si el ítem está en otra moneda */
function estimatedHint(i: T) {
  if (i.currency === props.base || i.estimated_amount == null) return null
  const v = estimatedBase(i, props.base, props.rates)
  return v == null ? 'Sin tipo de cambio' : `≈ ${formatMoney(v, props.base)}`
}

function actualHint(i: T) {
  if (i.currency === props.base || i.actual_amount == null) return null
  const v = actualBase(i, props.base)
  return v == null ? 'Sin tipo de cambio' : `= ${formatMoney(v, props.base)}`
}

function people(i: T) {
  const n = i.member_ids.length
  if (!n) return 'Sin participantes'
  return n === 1 ? (props.memberNames[i.member_ids[0]!] ?? '1 persona') : `Entre ${n}`
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="g in groups" :key="g.category" class="overflow-hidden rounded-lg border border-default bg-default">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default bg-elevated/50 px-3 py-2">
        <p class="flex items-center gap-2 text-sm font-semibold">
          <UIcon :name="g.meta.icon" class="size-4 text-primary" />
          {{ g.meta.label }}
        </p>
        <p class="text-xs text-muted">
          Estimado {{ formatMoney(g.estimated, base) }} · Gastado {{ formatMoney(g.actual, base) }}
        </p>
      </div>

      <ul class="divide-y divide-default">
        <li v-for="i in g.items" :key="i.id" class="flex items-start gap-3 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="font-medium leading-snug">
              {{ i.name }}
            </p>
            <p v-if="i.notes" class="mt-0.5 whitespace-pre-line text-xs text-muted">
              {{ i.notes }}
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <UBadge v-if="i.actual_amount != null && i.paid_by" color="success" variant="subtle" size="sm" icon="i-lucide-check">
                Pagó {{ memberNames[i.paid_by] ?? 'alguien' }}
              </UBadge>
              <UBadge v-else-if="i.actual_amount != null" color="warning" variant="subtle" size="sm" icon="i-lucide-circle-alert">
                Falta quién pagó
              </UBadge>
              <UBadge v-else color="neutral" variant="outline" size="sm">
                Por pagar
              </UBadge>
              <UBadge :color="i.member_ids.length ? 'neutral' : 'warning'" variant="subtle" size="sm" icon="i-lucide-users">
                {{ people(i) }}
              </UBadge>
              <UBadge v-if="meId && i.member_ids.includes(meId)" color="primary" variant="subtle" size="sm">
                Participas
              </UBadge>
            </div>
          </div>

          <div class="shrink-0 text-right text-sm">
            <template v-if="i.actual_amount != null">
              <p class="font-semibold">
                {{ formatMoney(i.actual_amount, i.currency) }}
              </p>
              <p v-if="actualHint(i)" class="text-xs text-muted">
                {{ actualHint(i) }}
              </p>
              <p v-if="i.estimated_amount != null" class="text-xs text-dimmed">
                Estimado {{ formatMoney(i.estimated_amount, i.currency) }}
              </p>
            </template>
            <template v-else-if="i.estimated_amount != null">
              <p class="font-semibold">
                {{ formatMoney(i.estimated_amount, i.currency) }}
              </p>
              <p v-if="estimatedHint(i)" class="text-xs text-muted">
                {{ estimatedHint(i) }}
              </p>
            </template>
          </div>

          <slot name="actions" :item="i" />
        </li>
      </ul>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Cuentas**

Crear `app/components/budget/BudgetBalances.vue`:

```vue
<script setup lang="ts">
import { formatMoney, type MemberBalance, type Transfer } from '~~/shared/utils/budget'

// Cuentas del grupo: quién le paga a quién y el saldo de cada viajero.
const props = defineProps<{
  balances: MemberBalance[]
  transfers: Transfer[]
  /** moneda principal del viaje */
  base: string
  memberNames: Record<string, string>
  /** viajero que mira (vista del invitado): destaca sus filas */
  meId?: string | null
}>()

const name = (id: string) => props.memberNames[id] ?? 'Viajero borrado'
const active = computed(() => props.balances.filter(b => b.paid || b.owed))
</script>

<template>
  <div>
    <p v-if="!active.length" class="text-sm text-muted">
      Todavía no hay gastos pagados para repartir.
    </p>

    <template v-else>
      <p v-if="!transfers.length" class="flex items-center gap-2 text-sm text-success">
        <UIcon name="i-lucide-circle-check" class="size-4" />
        Están a mano: nadie le debe a nadie.
      </p>
      <ul v-else class="space-y-1.5">
        <li
          v-for="t in transfers"
          :key="`${t.from}-${t.to}`"
          class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-2 text-sm"
          :class="meId && (t.from === meId || t.to === meId) ? 'bg-primary/10' : 'bg-elevated/60'"
        >
          <span class="font-medium">{{ name(t.from) }}</span>
          <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
          <span class="font-medium">{{ name(t.to) }}</span>
          <span class="ml-auto font-semibold">{{ formatMoney(t.amount, base) }}</span>
        </li>
      </ul>

      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted">
              <th class="py-1.5 pr-3 font-medium">
                Viajero
              </th>
              <th class="px-3 py-1.5 text-right font-medium">
                Pagó
              </th>
              <th class="px-3 py-1.5 text-right font-medium">
                Le toca
              </th>
              <th class="py-1.5 pl-3 text-right font-medium">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="b in active" :key="b.member_id" :class="{ 'font-semibold': meId === b.member_id }">
              <td class="py-1.5 pr-3">
                {{ name(b.member_id) }}
              </td>
              <td class="px-3 py-1.5 text-right">
                {{ formatMoney(b.paid, base) }}
              </td>
              <td class="px-3 py-1.5 text-right">
                {{ formatMoney(b.owed, base) }}
              </td>
              <td class="py-1.5 pl-3 text-right" :class="b.balance > 0 ? 'text-success' : b.balance < 0 ? 'text-error' : 'text-muted'">
                {{ b.balance > 0 ? 'Le deben ' : b.balance < 0 ? 'Debe ' : '' }}{{ formatMoney(Math.abs(b.balance), base) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit** (pendiente de autorización)

```bash
git add app/components/budget/BudgetItemList.vue app/components/budget/BudgetBalances.vue
git commit -m "feat: lista de ítems y cuentas del presupuesto"
```

---

### Task 8: Panel de administración

**Files:**
- Create: `app/components/budget/BudgetItemFormModal.vue`
- Create: `app/components/budget/BudgetRates.vue`
- Create: `app/components/budget/BudgetPanel.vue`
- Modify: `app/pages/admin/viajes/[id].vue`

**Interfaces:**
- Consumes: contexto de la Tarea 6; componentes de la Tarea 7; `POST /api/admin/trips/:id/rates` (Tarea 5); `rpc('set_budget_item_shares', { p_item_id, p_member_ids })` (Tarea 2).
- Produces: `<BudgetItemFormModal v-model:open :item />` (prop `item: BudgetItem | null`; refresca el contexto al guardar), `<BudgetRates :loading @refresh />`, `<BudgetPanel />`, y la pestaña `presupuesto` en la página del viaje.

- [ ] **Step 1: Formulario de ítem**

Crear `app/components/budget/BudgetItemFormModal.vue`:

```vue
<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { BudgetItem, ExchangeRate } from '~/composables/useTripAdmin'
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_META, BUDGET_CURRENCIES, currencyLabel, formatMoney, roundMoney,
  type BudgetCategory,
} from '~~/shared/utils/budget'

const props = defineProps<{ item: BudgetItem | null }>()
const open = defineModel<boolean>('open', { default: false })

const { trip, members, places, budgetItems, baseCurrency, rates, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const state = reactive({
  category: 'other' as BudgetCategory,
  name: '',
  currency: 'CLP',
  estimated: '' as string | number,
  notes: '',
  placeId: '',
  paid: false,
  actual: '' as string | number,
  rate: '' as string | number,
  paidBy: '',
  paidOn: '',
  memberIds: [] as string[],
})
const loading = ref(false)
const fetchingRate = ref(false)

const categoryItems = BUDGET_CATEGORIES.map(c => ({ label: BUDGET_CATEGORY_META[c].label, value: c, icon: BUDGET_CATEGORY_META[c].icon }))
const currencyItems = BUDGET_CURRENCIES.map(c => ({ label: currencyLabel(c), value: c }))
const memberItems = computed(() => members.value.map(m => ({ label: m.name, value: m.id })))
const placeItems = computed(() => places.value.map(p => ({ label: p.name, value: p.id })))
const foreign = computed(() => state.currency !== baseCurrency.value)

/** '' → null; texto no numérico → NaN (lo rechaza validate) */
function num(v: string | number): number | null {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const i = props.item
  const accepted = members.value.filter(m => m.status === 'accepted').map(m => m.id)
  state.category = i?.category ?? 'other'
  state.name = i?.name ?? ''
  state.currency = i?.currency ?? baseCurrency.value
  state.estimated = i?.estimated_amount ?? ''
  state.notes = i?.notes ?? ''
  state.placeId = i?.place_id ?? ''
  state.paid = i?.actual_amount != null
  state.actual = i?.actual_amount ?? ''
  state.rate = i?.actual_rate ?? ''
  state.paidBy = i?.paid_by ?? ''
  state.paidOn = i?.paid_on ?? ''
  state.memberIds = i ? [...i.member_ids] : (accepted.length ? accepted : members.value.map(m => m.id))
}, { immediate: true })

// Al marcar "ya se pagó" (o cambiar de moneda) se propone el cambio vigente;
// si el viaje todavía no conoce esa moneda, se le pide al servidor.
watch(() => [state.paid, state.currency, open.value] as const, async ([paid, currency, isOpen]) => {
  if (!isOpen || !paid || !foreign.value) return
  const frozen = props.item?.currency === currency ? props.item.actual_rate : null
  if (frozen) return void (state.rate = frozen)
  if (rates.value[currency]) return void (state.rate = rates.value[currency]!)
  if (!trip.value) return
  state.rate = ''
  fetchingRate.value = true
  try {
    const rows = await $fetch<ExchangeRate[]>(`/api/admin/trips/${trip.value.id}/rates`, { method: 'POST', body: { currencies: [currency] } })
    const found = rows.find(r => r.currency === currency)
    if (found && state.currency === currency) state.rate = found.rate
  }
  catch { /* se ingresa a mano */ }
  finally {
    fetchingRate.value = false
  }
})

const actualInBase = computed(() => {
  const a = num(state.actual)
  const r = num(state.rate)
  return foreign.value && a && r && a > 0 && r > 0 ? formatMoney(roundMoney(a * r, baseCurrency.value), baseCurrency.value) : null
})

function toggleMember(id: string, on: boolean | 'indeterminate') {
  state.memberIds = on === true ? [...new Set([...state.memberIds, id])] : state.memberIds.filter(x => x !== id)
}

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  const est = num(s.estimated)
  const act = num(s.actual)
  const rate = num(s.rate)
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Ponle un nombre al ítem' })
  if (est != null && !(est >= 0)) errors.push({ name: 'estimated', message: 'Ingresa un monto válido' })
  if (!s.paid && est == null) errors.push({ name: 'estimated', message: 'Ingresa el costo estimado' })
  if (s.paid) {
    if (act == null || !(act >= 0)) errors.push({ name: 'actual', message: 'Ingresa cuánto se pagó' })
    if (foreign.value && !(rate != null && rate > 0)) errors.push({ name: 'rate', message: 'Ingresa el tipo de cambio' })
    if (!s.paidBy) errors.push({ name: 'paidBy', message: 'Elige quién pagó' })
  }
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!trip.value) return
  loading.value = true
  const d = e.data
  const fields = {
    category: d.category,
    name: d.name.trim(),
    notes: d.notes.trim() || null,
    currency: d.currency,
    estimated_amount: num(d.estimated),
    actual_amount: d.paid ? num(d.actual) : null,
    actual_rate: d.paid ? (foreign.value ? num(d.rate) : 1) : null,
    paid_by: d.paid ? d.paidBy || null : null,
    paid_on: d.paid ? d.paidOn || null : null,
    place_id: d.placeId || null,
  }

  try {
    let id = props.item?.id
    if (id) {
      const { error } = await client.from('budget_items').update(fields).eq('id', id)
      if (error) throw error
    }
    else {
      const { data, error } = await client.from('budget_items').insert({
        ...fields,
        trip_id: trip.value.id,
        sort_order: Math.max(0, ...budgetItems.value.map(i => i.sort_order)) + 1,
      }).select('id').single()
      if (error || !data) throw error
      id = data.id
    }

    const { error: sharesError } = await client.rpc('set_budget_item_shares', { p_item_id: id, p_member_ids: d.memberIds })
    if (sharesError) throw sharesError

    // Primera vez que el viaje usa esta moneda: traer su tipo de cambio
    if (foreign.value && !rates.value[d.currency]) {
      await $fetch(`/api/admin/trips/${trip.value.id}/rates`, { method: 'POST' }).catch(() => {
        toast.add({ color: 'warning', title: 'Sin tipo de cambio', description: `No se pudo traer el cambio de ${d.currency}. Ingrésalo a mano en "Tipos de cambio".` })
      })
    }

    toast.add({ color: 'success', title: props.item ? 'Ítem actualizado' : 'Ítem agregado' })
    open.value = false
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(err) })
  }
  finally {
    loading.value = false
    await refresh()
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="item ? 'Editar ítem' : 'Agregar ítem al presupuesto'">
    <template #body>
      <UForm id="budget-item-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Categoría" name="category" required>
            <USelect v-model="state.category" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="name" required>
            <UInput v-model="state.name" placeholder="Hotel en Myeongdong, tren a Busan…" class="w-full" autofocus />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Moneda" name="currency" required>
            <USelectMenu v-model="state.currency" :items="currencyItems" value-key="value" :search-input="{ placeholder: 'Buscar moneda…' }" class="w-full" />
          </UFormField>
          <UFormField label="Costo estimado" name="estimated" :help="`Total del ítem en ${state.currency}`">
            <UInput v-model="state.estimated" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Lugar (opcional)" name="placeId">
          <div class="flex gap-2">
            <USelectMenu
              v-model="state.placeId"
              :items="placeItems"
              value-key="value"
              placeholder="Sin lugar asociado"
              :search-input="{ placeholder: 'Buscar…' }"
              class="flex-1"
            />
            <UButton v-if="state.placeId" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Quitar lugar" @click="state.placeId = ''" />
          </div>
        </UFormField>

        <UFormField label="Nota" name="notes">
          <UTextarea v-model="state.notes" :rows="2" autoresize placeholder="Reserva con cancelación gratis, incluye desayuno…" class="w-full" />
        </UFormField>

        <div class="rounded-lg border border-default p-3">
          <USwitch v-model="state.paid" label="Ya se pagó" description="Registra el gasto real y quién lo pagó." />
          <div v-if="state.paid" class="mt-4 space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Monto pagado" name="actual" required :help="actualInBase ? `Equivale a ${actualInBase}` : undefined">
                <UInput v-model="state.actual" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
              </UFormField>
              <UFormField
                v-if="foreign"
                label="Tipo de cambio"
                name="rate"
                required
                :help="`1 ${state.currency} en ${baseCurrency}. Corrígelo si pagaste con otro cambio.`"
              >
                <UInput v-model="state.rate" type="number" min="0" step="any" inputmode="decimal" :loading="fetchingRate" class="w-full" />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Quién pagó" name="paidBy" required>
                <USelectMenu v-model="state.paidBy" :items="memberItems" value-key="value" placeholder="Elige un viajero" class="w-full" />
                <template v-if="!members.length" #help>
                  Primero agrega viajeros en la pestaña Viajeros.
                </template>
              </UFormField>
              <UFormField label="Fecha" name="paidOn">
                <UInput v-model="state.paidOn" type="date" class="w-full" />
              </UFormField>
            </div>
          </div>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <p class="text-sm font-medium">
              Se reparte entre
            </p>
            <div class="flex gap-1">
              <UButton size="xs" color="neutral" variant="ghost" @click="state.memberIds = members.map(m => m.id)">
                Todos
              </UButton>
              <UButton size="xs" color="neutral" variant="ghost" @click="state.memberIds = []">
                Ninguno
              </UButton>
            </div>
          </div>
          <p v-if="!members.length" class="text-sm text-muted">
            Aún no hay viajeros en este viaje.
          </p>
          <div v-else class="grid gap-2 sm:grid-cols-2">
            <UCheckbox
              v-for="m in members"
              :key="m.id"
              :model-value="state.memberIds.includes(m.id)"
              :label="m.name"
              @update:model-value="toggleMember(m.id, $event)"
            />
          </div>
          <p class="mt-1.5 text-xs text-muted">
            En partes iguales. Desmarca a quien no participa de este gasto.
          </p>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="budget-item-form" :loading="loading">
          {{ item ? 'Guardar' : 'Agregar' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Tipos de cambio**

Crear `app/components/budget/BudgetRates.vue`:

```vue
<script setup lang="ts">
import type { ExchangeRate } from '~/composables/useTripAdmin'

// Tipos de cambio del viaje: se traen solos, pero se pueden fijar a mano.
defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()

const { trip, exchangeRates, baseCurrency, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const draft = reactive<Record<string, string | number>>({})
const saving = ref<string | null>(null)

watch(exchangeRates, (rows) => {
  for (const r of rows) draft[r.currency] = r.rate
}, { immediate: true })

const changed = (r: ExchangeRate) => Number(draft[r.currency]) !== r.rate

async function save(r: ExchangeRate) {
  const rate = Number(draft[r.currency])
  if (!trip.value || !(rate > 0)) return toast.add({ color: 'error', title: 'Ingresa un tipo de cambio válido' })
  saving.value = r.currency
  const { error } = await client.from('trip_exchange_rates')
    .update({ rate, source: 'manual', updated_at: new Date().toISOString() })
    .eq('trip_id', trip.value.id).eq('currency', r.currency)
  saving.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
  toast.add({ title: `Tipo de cambio de ${r.currency} fijado a mano` })
  await refresh()
}

async function backToAuto(r: ExchangeRate) {
  if (!trip.value) return
  saving.value = r.currency
  const { error } = await client.from('trip_exchange_rates')
    .update({ source: 'auto' }).eq('trip_id', trip.value.id).eq('currency', r.currency)
  saving.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar', description: errorMessage(error) })
  emit('refresh')
}
</script>

<template>
  <div>
    <p v-if="!exchangeRates.length" class="text-sm text-muted">
      Todos los ítems están en {{ baseCurrency }}. Cuando agregues uno en otra moneda, su tipo de cambio aparecerá aquí.
    </p>
    <ul v-else class="space-y-2">
      <li v-for="r in exchangeRates" :key="r.currency" class="flex flex-wrap items-center gap-2 text-sm">
        <span class="w-16 font-medium">1 {{ r.currency }} =</span>
        <UInput v-model="draft[r.currency]" type="number" min="0" step="any" inputmode="decimal" size="sm" class="w-36" />
        <span class="text-muted">{{ baseCurrency }}</span>
        <UBadge :color="r.source === 'manual' ? 'warning' : 'neutral'" variant="subtle" size="sm">
          {{ r.source === 'manual' ? 'A mano' : 'Automático' }}
        </UBadge>
        <span class="text-xs text-dimmed">{{ new Date(r.updated_at).toLocaleDateString('es-CL') }}</span>
        <UButton v-if="changed(r)" size="xs" :loading="saving === r.currency" @click="save(r)">
          Guardar
        </UButton>
        <UButton v-else-if="r.source === 'manual'" size="xs" color="neutral" variant="ghost" :loading="saving === r.currency" @click="backToAuto(r)">
          Volver a automático
        </UButton>
      </li>
    </ul>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="loading" @click="emit('refresh')">
        Actualizar tipos de cambio
      </UButton>
      <ULink to="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" class="text-xs text-dimmed">
        Rates By Exchange Rate API
      </ULink>
    </div>
    <p class="mt-2 text-xs text-muted">
      Los costos estimados usan estos valores. Los gastos ya pagados conservan el cambio con que se registraron.
    </p>
  </div>
</template>
```

- [ ] **Step 3: Panel**

Crear `app/components/budget/BudgetPanel.vue`:

```vue
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BudgetItem } from '~/composables/useTripAdmin'
import { BUDGET_CURRENCIES, currencyLabel, formatMoney } from '~~/shared/utils/budget'

const {
  trip, members, refresh, budgetItems, baseCurrency, rates, exchangeRates,
  budgetSummary, budgetBalances, budgetTransfers, budgetPeople,
} = useTripCtx()
const { client } = useDb()
const toast = useToast()

const formOpen = ref(false)
const formItem = ref<BudgetItem | null>(null)
const deleteTarget = ref<BudgetItem | null>(null)
const pendingCurrency = ref<string | null>(null)
const busy = ref(false)
const publishing = ref(false)
const refreshingRates = ref(false)

const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })
const currencyOpen = computed({ get: () => !!pendingCurrency.value, set: (v) => { if (!v) pendingCurrency.value = null } })

const memberNames = computed(() => Object.fromEntries(members.value.map(m => [m.id, m.name])))
const currencyItems = BUDGET_CURRENCIES.map(c => ({ label: currencyLabel(c), value: c }))
const hasPaid = computed(() => budgetItems.value.some(i => i.actual_amount != null))

function add() {
  formItem.value = null
  formOpen.value = true
}

function edit(i: BudgetItem) {
  formItem.value = i
  formOpen.value = true
}

function menu(i: BudgetItem): DropdownMenuItem[][] {
  return [
    [{ label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => edit(i) }],
    [{ label: 'Borrar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = i } }],
  ]
}

async function togglePublish(value: boolean) {
  if (!trip.value) return
  publishing.value = true
  const { error } = await client.from('trips').update({ budget_published: value }).eq('id', trip.value.id)
  publishing.value = false
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar', description: errorMessage(error) })
  toast.add({
    color: value ? 'success' : 'neutral',
    title: value ? 'Presupuesto publicado' : 'Presupuesto oculto',
    description: value ? 'Los viajeros ya pueden verlo desde su link.' : 'Los viajeros ya no lo ven.',
  })
  await refresh()
}

async function refreshRates(silent = false) {
  if (!trip.value) return
  refreshingRates.value = true
  try {
    await $fetch(`/api/admin/trips/${trip.value.id}/rates`, { method: 'POST' })
    if (!silent) toast.add({ title: 'Tipos de cambio actualizados' })
  }
  catch (err) {
    if (!silent) toast.add({ color: 'error', title: 'No se pudo actualizar el tipo de cambio', description: errorMessage(err) })
  }
  finally {
    refreshingRates.value = false
    await refresh()
  }
}

function askCurrency(code: string) {
  if (code !== baseCurrency.value) pendingCurrency.value = code
}

async function confirmCurrency() {
  const code = pendingCurrency.value
  if (!trip.value || !code) return
  busy.value = true
  const { error } = await client.from('trips').update({ budget_currency: code }).eq('id', trip.value.id)
  busy.value = false
  pendingCurrency.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar la moneda', description: errorMessage(error) })
  toast.add({ title: `Moneda principal: ${code}` })
  await refreshRates(true)
}

async function confirmDelete() {
  const i = deleteTarget.value
  if (!i) return
  busy.value = true
  const { error } = await client.from('budget_items').delete().eq('id', i.id)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
  toast.add({ title: 'Ítem borrado' })
  await refresh()
}

// Al abrir: traer los cambios que falten o tengan más de un día
onMounted(() => {
  const used = new Set(budgetItems.value.map(i => i.currency).filter(c => c !== baseCurrency.value))
  const missing = [...used].some(c => !rates.value[c])
  const stale = exchangeRates.value.some(r => r.source === 'auto' && Date.now() - new Date(r.updated_at).getTime() > 86_400_000)
  if (missing || stale) refreshRates(true)
})
</script>

<template>
  <div class="space-y-4">
    <UCard :ui="{ body: 'p-4 sm:p-4' }">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <USwitch
          :model-value="trip?.budget_published ?? false"
          :loading="publishing"
          label="Presupuesto visible para los viajeros"
          :description="trip?.budget_published ? 'Los viajeros lo ven desde su link.' : 'Mientras esté oculto, solo lo ven los administradores.'"
          @update:model-value="togglePublish"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UTooltip :text="hasPaid ? 'Con gastos ya pagados no se puede cambiar la moneda principal' : 'Moneda en que se muestran los totales'">
            <USelectMenu
              :model-value="baseCurrency"
              :items="currencyItems"
              value-key="value"
              :disabled="hasPaid"
              :search-input="{ placeholder: 'Buscar moneda…' }"
              class="w-56"
              @update:model-value="askCurrency"
            />
          </UTooltip>
          <UButton icon="i-lucide-plus" @click="add">
            Agregar ítem
          </UButton>
        </div>
      </div>
    </UCard>

    <UEmpty
      v-if="!budgetItems.length"
      icon="i-lucide-wallet"
      title="Aún no hay presupuesto"
      description="Agrega los costos del viaje: alojamiento, transporte, entradas, comida. Después registra lo que se vaya pagando y quién lo pagó."
      class="rounded-lg border border-dashed border-default bg-default py-10"
    />

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Total estimado
          </p>
          <p class="mt-1 text-xl font-bold">
            {{ formatMoney(budgetSummary.estimated, baseCurrency) }}
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Gastado hasta ahora
          </p>
          <p class="mt-1 text-xl font-bold">
            {{ formatMoney(budgetSummary.actual, baseCurrency) }}
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Diferencia en lo ya pagado
          </p>
          <p class="mt-1 text-xl font-bold" :class="budgetSummary.variance > 0 ? 'text-error' : budgetSummary.variance < 0 ? 'text-success' : ''">
            {{ budgetSummary.variance > 0 ? '+' : '' }}{{ formatMoney(budgetSummary.variance, baseCurrency) }}
          </p>
          <p class="text-xs text-muted">
            {{ budgetSummary.variance > 0 ? 'Más de lo estimado' : budgetSummary.variance < 0 ? 'Menos de lo estimado' : 'Igual a lo estimado' }}
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Estimado por persona
          </p>
          <p class="mt-1 text-xl font-bold">
            {{ formatMoney(budgetSummary.perPerson, baseCurrency) }}
          </p>
          <p class="text-xs text-muted">
            Entre {{ budgetPeople }} {{ budgetPeople === 1 ? 'viajero' : 'viajeros' }}
          </p>
        </UCard>
      </div>

      <UAlert
        v-if="budgetSummary.missingRates.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Falta tipo de cambio"
        :description="`Los ítems en ${budgetSummary.missingRates.join(', ')} no están sumados en los totales. Actualiza los tipos de cambio o ingrésalos a mano más abajo.`"
      />

      <BudgetItemList :items="budgetItems" :base="baseCurrency" :rates="rates" :member-names="memberNames">
        <template #actions="{ item }">
          <UDropdownMenu :items="menu(item)" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Acciones" />
          </UDropdownMenu>
        </template>
      </BudgetItemList>

      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Cuentas
          </h3>
        </template>
        <BudgetBalances :balances="budgetBalances" :transfers="budgetTransfers" :base="baseCurrency" :member-names="memberNames" />
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Tipos de cambio
          </h3>
        </template>
        <BudgetRates :loading="refreshingRates" @refresh="refreshRates()" />
      </UCard>
    </template>

    <BudgetItemFormModal v-model:open="formOpen" :item="formItem" />

    <ConfirmModal
      v-model:open="deleteOpen"
      :title="`¿Borrar ${deleteTarget?.name}?`"
      description="Se quitará del presupuesto y de las cuentas."
      confirm-label="Borrar"
      :loading="busy"
      @confirm="confirmDelete"
    />

    <ConfirmModal
      v-model:open="currencyOpen"
      :title="`¿Cambiar la moneda principal a ${pendingCurrency}?`"
      description="Los totales se mostrarán en la nueva moneda y los tipos de cambio se volverán a traer. Los que hayas fijado a mano se pierden."
      confirm-label="Cambiar"
      :loading="busy"
      @confirm="confirmCurrency"
    />
  </div>
</template>
```

Nota: los componentes de `app/components/budget/` se usan con su nombre de archivo (`BudgetPanel`, `BudgetItemList`…) porque `nuxt.config.ts` tiene `components: [{ path: '~/components', pathPrefix: false }]`.

- [ ] **Step 4: Pestaña en la página del viaje**

En `app/pages/admin/viajes/[id].vue`:

Agregar la pestaña después de la de Itinerario:

```ts
  { label: 'Presupuesto', icon: 'i-lucide-wallet', value: 'presupuesto', slot: 'presupuesto' as const, badge: stats.value.budgetItems || undefined },
```

Agregar la insignia después del bloque `v-if="trip.itinerary_published"` / `v-else`:

```vue
          <UBadge v-if="trip.budget_published" color="success" variant="subtle" icon="i-lucide-wallet">
            Presupuesto publicado
          </UBadge>
```

Agregar el contenido después de `<template #itinerario>…</template>`:

```vue
      <template #presupuesto>
        <BudgetPanel class="pt-6" />
      </template>
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit** (pendiente de autorización)

```bash
git add app/components/budget "app/pages/admin/viajes/[id].vue"
git commit -m "feat: pestaña Presupuesto en la gestión del viaje"
```

---

### Task 9: Vista del invitado

**Files:**
- Modify: `app/pages/v/[token].vue`

**Interfaces:**
- Consumes: `MemberTripView.budget_published` y `.budget` (Tareas 2 y 3); `BudgetItemList`, `BudgetBalances` (Tarea 7); `summarize`, `balances`, `settle`, `formatMoney`, `Rates` (Tarea 4).

- [ ] **Step 1: Script**

Agregar el import:

```ts
import { balances, formatMoney, settle, summarize, type Rates } from '~~/shared/utils/budget'
```

Cambiar el tipo de `tab`:

```ts
const tab = ref<'lugares' | 'itinerario' | 'presupuesto'>('lugares')
```

Agregar, después del bloque `// ---------- Itinerario ----------` y sus computados:

```ts
// ---------- Presupuesto ----------
const budget = computed(() => view.value?.budget ?? null)
const bRates = computed<Rates>(() => Object.fromEntries((budget.value?.rates ?? []).map(r => [r.currency, r.rate])))
const bNames = computed(() => Object.fromEntries((budget.value?.members ?? []).map(m => [m.id, m.name])))
const bPeople = computed(() => {
  const all = budget.value?.members ?? []
  return all.filter(m => m.status === 'accepted').length || all.length
})
const bSummary = computed(() => budget.value ? summarize(budget.value.items, budget.value.currency, bRates.value, bPeople.value) : null)
const bBalances = computed(() => budget.value ? balances(budget.value.items, budget.value.currency, budget.value.members.map(m => m.id)) : [])
const bTransfers = computed(() => budget.value ? settle(bBalances.value, budget.value.currency) : [])
const myBalance = computed(() => bBalances.value.find(b => b.member_id === budget.value?.me) ?? null)
```

- [ ] **Step 2: Pestaña**

En el `v-for` de las pestañas, reemplazar el arreglo, el `@click` y el candado:

```vue
            v-for="t in [{ v: 'lugares', l: 'Lugares', i: 'i-lucide-map-pin', n: votable.length }, { v: 'itinerario', l: 'Itinerario', i: 'i-lucide-calendar-days', n: 0 }, { v: 'presupuesto', l: 'Presupuesto', i: 'i-lucide-wallet', n: 0 }]"
```

```vue
            @click="tab = t.v as 'lugares' | 'itinerario' | 'presupuesto'"
```

```vue
            <UIcon v-if="(t.v === 'itinerario' && !view.itinerary_published) || (t.v === 'presupuesto' && !view.budget_published)" name="i-lucide-lock" class="size-3.5" />
```

- [ ] **Step 3: Sección**

Después del cierre `</section>` de Itinerario y antes de `</main>`, agregar:

```vue
        <!-- Presupuesto -->
        <section v-show="tab === 'presupuesto'" class="pt-5">
          <UEmpty
            v-if="!budget || !bSummary"
            icon="i-lucide-wallet"
            title="El presupuesto está en preparación"
            description="Quien organiza el viaje lo publicará cuando esté listo."
            class="rounded-lg border border-dashed border-default py-12"
          />
          <template v-else>
            <div class="mb-4 grid gap-3 sm:grid-cols-3">
              <UCard :ui="{ body: 'p-4 sm:p-4' }">
                <p class="text-xs text-muted">
                  Costo estimado por persona
                </p>
                <p class="mt-1 text-xl font-bold">
                  {{ formatMoney(bSummary.perPerson, budget.currency) }}
                </p>
                <p class="text-xs text-muted">
                  Total del viaje {{ formatMoney(bSummary.estimated, budget.currency) }}
                </p>
              </UCard>
              <UCard :ui="{ body: 'p-4 sm:p-4' }">
                <p class="text-xs text-muted">
                  Tu parte de lo ya pagado
                </p>
                <p class="mt-1 text-xl font-bold">
                  {{ formatMoney(myBalance?.owed ?? 0, budget.currency) }}
                </p>
                <p class="text-xs text-muted">
                  Has pagado {{ formatMoney(myBalance?.paid ?? 0, budget.currency) }}
                </p>
              </UCard>
              <UCard :ui="{ body: 'p-4 sm:p-4' }">
                <p class="text-xs text-muted">
                  Tu saldo
                </p>
                <p class="mt-1 text-xl font-bold" :class="(myBalance?.balance ?? 0) > 0 ? 'text-success' : (myBalance?.balance ?? 0) < 0 ? 'text-error' : ''">
                  {{ formatMoney(Math.abs(myBalance?.balance ?? 0), budget.currency) }}
                </p>
                <p class="text-xs text-muted">
                  {{ (myBalance?.balance ?? 0) > 0 ? 'Te deben' : (myBalance?.balance ?? 0) < 0 ? 'Debes' : 'Estás a mano' }}
                </p>
              </UCard>
            </div>

            <UEmpty
              v-if="!budget.items.length"
              icon="i-lucide-wallet"
              title="Aún no hay ítems en el presupuesto"
              class="rounded-lg border border-dashed border-default py-10"
            />
            <BudgetItemList
              v-else
              :items="budget.items"
              :base="budget.currency"
              :rates="bRates"
              :member-names="bNames"
              :me-id="budget.me"
            />

            <UCard class="mt-4">
              <template #header>
                <h3 class="font-semibold">
                  Cuentas del grupo
                </h3>
              </template>
              <BudgetBalances
                :balances="bBalances"
                :transfers="bTransfers"
                :base="budget.currency"
                :member-names="bNames"
                :me-id="budget.me"
              />
            </UCard>
          </template>
        </section>
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm test` y `npm run test:db`
Expected: ambas sin fallas.

- [ ] **Step 5: Commit** (pendiente de autorización)

```bash
git add "app/pages/v/[token].vue"
git commit -m "feat: presupuesto de solo lectura para los viajeros"
```

---

### Task 10: Aplicar la migración y probar en el navegador

**Files:** ninguno nuevo.

- [ ] **Step 1: Aplicar la migración en Supabase**

La migración se aplica en el proyecto remoto con el conector de Supabase (`apply_migration`, requiere que Pablo lo autorice de nuevo en `/mcp`) o con el CLI:

Run: `npx supabase db push`
Expected: `Applying migration 20261012000001_budget.sql...` y `Finished supabase db push.`

Si ninguna de las dos vías está disponible, detenerse y pedírselo a Pablo: sin la migración aplicada la página del viaje falla al cargar, porque consulta tablas que aún no existen.

- [ ] **Step 2: Regenerar tipos si el CLI está enlazado**

Run: `npm run db:types && npm run typecheck`
Expected: sin errores. Si el archivo generado difiere del editado a mano en la Tarea 3, se queda el generado.

- [ ] **Step 3: Prueba manual (administrador)**

Run: `npm run dev` y abrir un viaje con al menos 3 viajeros, pestaña Presupuesto. Comprobar:

1. Estado vacío visible; "Agregar ítem" abre el formulario.
2. Crear "Hotel" en Alojamiento, KRW 900000, repartido entre todos → aparece con su equivalente "≈ CLP …" y los totales se actualizan.
3. Crear "Cena" en Comida, CLP 30000, entre 2 viajeros.
4. Editar "Hotel": marcar "Ya se pagó", monto 950000 → el tipo de cambio se propone solo; elegir quién pagó; guardar → "Gastado" y "Diferencia" cambian, y "Cuentas" muestra las transferencias.
5. En "Tipos de cambio", cambiar KRW a mano → queda "A mano"; el estimado del hotel cambia y el gasto ya pagado no.
6. Intentar cambiar la moneda principal → el selector está deshabilitado con su explicación.
7. Borrar un ítem → desaparece de la lista y de las cuentas.
8. Sin conexión a internet (o con la API caída), "Actualizar tipos de cambio" muestra el aviso de error y los valores anteriores siguen.

- [ ] **Step 4: Prueba manual (invitado)**

1. Con el presupuesto oculto, abrir el link de un viajero → la pestaña Presupuesto tiene candado y muestra "en preparación".
2. Publicar desde el panel y recargar → se ven los ítems, "Tu parte", "Tu saldo" y las cuentas del grupo con sus filas destacadas.
3. Revisar en el ancho de un teléfono (375 px): sin desbordes horizontales.

- [ ] **Step 5: Commit final** (pendiente de autorización)

```bash
git add shared/types/database.types.ts
git commit -m "chore: tipos regenerados tras la migración de presupuesto"
```
