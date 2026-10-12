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
