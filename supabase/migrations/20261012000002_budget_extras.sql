-- =====================================================================
-- Extras de las entradas
--   budget_items.extras  cargos adicionales de un ítem de categoría
--                        'tickets': [{ "name": text, "amount": number }]
-- Comparten moneda, pagador y reparto con el ítem. El estimado del ítem
-- es estimated_amount + la suma de sus extras (se calcula en la app).
-- =====================================================================

create or replace function public.budget_extras_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) > 20 then false
    else not exists (
      select 1
      from jsonb_array_elements(p) as e
      where case
        when jsonb_typeof(e) <> 'object' then true
        when (select count(*) from jsonb_object_keys(e)) <> 2 then true
        when jsonb_typeof(e -> 'name') is distinct from 'string' then true
        when jsonb_typeof(e -> 'amount') is distinct from 'number' then true
        when length(trim(e ->> 'name')) not between 1 and 120 then true
        when (e ->> 'amount')::numeric < 0 or (e ->> 'amount')::numeric >= 1e12 then true
        else false
      end
    )
  end;
$$;

-- El check corre con los permisos de quien escribe: authenticated debe poder ejecutarla.
revoke all on function public.budget_extras_valid(jsonb) from public, anon;
grant execute on function public.budget_extras_valid(jsonb) to authenticated, service_role;

alter table public.budget_items
  add column extras jsonb not null default '[]'::jsonb
    constraint budget_items_extras_valid check (public.budget_extras_valid(extras)),
  add constraint budget_items_extras_only_tickets check (category = 'tickets' or extras = '[]'::jsonb);

grant insert (extras), update (extras) on public.budget_items to authenticated;

-- ---------------------------------------------------------------------
-- member_get_trip: cada ítem del presupuesto incluye 'extras'.
-- Resto de la función sin cambios.
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
