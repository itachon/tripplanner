# Extras en las entradas del presupuesto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un ítem de presupuesto de categoría Entradas pueda llevar extras (nombre + monto estimado) que se suman a su estimado.

**Architecture:** Los extras viven en una columna `extras` jsonb de `budget_items`, validada por un `check` en la base, y se guardan en la misma escritura que el ítem. Todo el cálculo pasa por una función pura nueva, `estimatedTotal`, que `estimatedBase` ya usa, así los totales existentes los incluyen sin más cambios. El formulario delega la lectura de las filas a otra función pura, `parseExtraRows`, para poder probarla sin montar componentes.

**Tech Stack:** Nuxt 4, Nuxt UI 4, Supabase (Postgres + RLS), TypeScript. Pruebas con `node --test` (cálculos) y PGlite (reglas de base).

**Spec:** `docs/superpowers/specs/2026-10-12-extras-entradas-design.md`

## Global Constraints

- Rama de trabajo: `feat/presupuesto` (la actual). Mensajes de commit en español, estilo `feat: …` / `fix: …` / `test: …`.
- Sin dependencias nuevas.
- `shared/utils/budget.ts` no importa nada (lo usan el panel, la vista del viajero y las pruebas).
- Un extra es exactamente `{ "name": string, "amount": number }`. `name`: 1 a 120 caracteres después de `trim`. `amount`: ≥ 0 y < 1e12. Máximo 20 extras por ítem.
- Solo los ítems de categoría `tickets` pueden tener extras; en los demás `extras` es `[]`.
- Los extras usan la moneda, el pagador y el reparto del ítem. No tienen monto pagado propio.
- Textos de la interfaz en español, tratando de "tú".
- Nombre de la migración: `supabase/migrations/20261012000002_budget_extras.sql`.
- Comandos de verificación: `npm test`, `npm run test:db`, `npm run typecheck`. Estado inicial: 14 pruebas de cálculo y 80 checks de base, todos en verde.

## Review Focus

- Ítem sin la clave `extras` (respuesta antigua de `member_get_trip`, ítems de prueba): se calcula igual que un ítem sin extras, sin errores. → Task 1.
- Extra con monto 0 ("incluido en la entrada"): es un extra válido; un ítem que solo tiene ese extra estima 0, no `null`. → Task 1.
- Fila de extra con coma decimal ("1,5"), texto no numérico o monto vacío: la coma se acepta; lo demás marca error en la fila y nunca se guarda `NaN`. → Task 1.
- Cambiar la categoría de una entrada que tiene extras: la base lo rechaza si no se vacían en la misma escritura, y lo acepta si se vacían. → Task 2.
- Un cliente que se salta el formulario y manda `amount` como texto, claves de más, `null` o un objeto en vez de un arreglo: la base lo rechaza. → Task 2.

---

### Task 1: Cálculos y lectura de filas (`shared/utils/budget.ts`)

**Files:**
- Modify: `shared/utils/budget.ts`
- Test: `tests/budget.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces (todo exportado desde `shared/utils/budget.ts`):
  - `type BudgetExtra = { name: string, amount: number }`
  - `BudgetItemLike.extras?: BudgetExtra[]`
  - `const MAX_BUDGET_EXTRAS = 20`
  - `interface ExtraRow { name: string, amount: string | number }`
  - `interface ExtraRowError { index: number, field: 'name' | 'amount', message: string }`
  - `extrasTotal(item: BudgetItemLike): number`
  - `estimatedTotal(item: BudgetItemLike): number | null`
  - `parseExtraRows(rows: ExtraRow[]): { extras: BudgetExtra[], errors: ExtraRowError[] }`

- [ ] **Step 1: Escribir las pruebas que fallan**

En `tests/budget.test.ts`, reemplaza el `import` del principio por:

```ts
import {
  actualBase, balances, currencyDecimals, estimatedBase, estimatedTotal, extrasTotal, parseExtraRows,
  roundMoney, settle, splitEqually, summarize,
  type BudgetItemLike,
} from '../shared/utils/budget.ts'
```

Y agrega al final del archivo:

```ts
test('estimatedTotal: precio base más extras, en la moneda del ítem', () => {
  const extras = [{ name: 'Audioguía', amount: 3000 }, { name: 'Foto', amount: 1500 }]
  assert.equal(extrasTotal(item({ estimated_amount: 20000, extras })), 4500)
  assert.equal(estimatedTotal(item({ estimated_amount: 20000, extras })), 24500)
  assert.equal(estimatedTotal(item({ estimated_amount: 20000, extras: [] })), 20000)
  assert.equal(estimatedTotal(item({ currency: 'USD', estimated_amount: 0.1, extras: [{ name: 'x', amount: 0.2 }] })), 0.3)
})

test('estimatedTotal: ítem sin la clave extras se calcula como sin extras', () => {
  assert.equal(extrasTotal(item({ estimated_amount: 20000 })), 0)
  assert.equal(estimatedTotal(item({ estimated_amount: 20000 })), 20000)
  assert.equal(estimatedTotal(item({})), null)
  assert.equal(estimatedTotal(item({ extras: [] })), null)
})

test('estimatedTotal: extras sin precio base; un extra de monto 0 cuenta', () => {
  assert.equal(estimatedTotal(item({ extras: [{ name: 'Audioguía', amount: 3000 }] })), 3000)
  assert.equal(estimatedTotal(item({ extras: [{ name: 'Incluido', amount: 0 }] })), 0)
})

test('estimatedBase: convierte el total con extras con el cambio del viaje', () => {
  const it = item({ currency: 'KRW', estimated_amount: 20000, extras: [{ name: 'Audioguía', amount: 3000 }] })
  assert.equal(estimatedBase(it, 'CLP', { KRW: 0.73 }), 16790) // 23.000 × 0,73
  assert.equal(estimatedBase(it, 'CLP', {}), null)
})

test('summarize: los extras entran en el estimado, la diferencia y el costo por persona', () => {
  const s = summarize([
    item({ id: 'a', category: 'tickets', estimated_amount: 20000, extras: [{ name: 'Audioguía', amount: 3000 }], actual_amount: 25000, actual_rate: 1 }),
  ], 'CLP', {}, 2)
  assert.equal(s.estimated, 23000)
  assert.equal(s.actual, 25000)
  assert.equal(s.variance, 2000)
  assert.equal(s.perPerson, 11500)
})

test('summarize: informa la moneda sin cambio aunque el ítem solo tenga extras', () => {
  const s = summarize([
    item({ id: 'a', category: 'tickets', currency: 'THB', actual_amount: 100, actual_rate: 40, extras: [{ name: 'Audioguía', amount: 50 }] }),
  ], 'CLP', {}, 1)
  assert.deepEqual(s.missingRates, ['THB'])
})

test('balances: los extras no cambian el reparto, que depende del monto pagado', () => {
  const base = { actual_amount: 100, actual_rate: 1, paid_by: 'ana', member_ids: ['ana', 'beto'] }
  assert.deepEqual(
    balances([item({ ...base, extras: [{ name: 'Audioguía', amount: 30 }] })], 'CLP', ['ana', 'beto']),
    balances([item(base)], 'CLP', ['ana', 'beto']),
  )
})

test('parseExtraRows: recorta nombres, acepta coma decimal y números, ignora filas vacías', () => {
  const r = parseExtraRows([
    { name: ' Audioguía ', amount: '3000' },
    { name: '', amount: '' },
    { name: 'Foto', amount: '1,5' },
    { name: 'Incluido', amount: 0 },
    { name: 'Foto', amount: 2 },
  ])
  assert.deepEqual(r.extras, [
    { name: 'Audioguía', amount: 3000 },
    { name: 'Foto', amount: 1.5 },
    { name: 'Incluido', amount: 0 },
    { name: 'Foto', amount: 2 },
  ])
  assert.deepEqual(r.errors, [])
})

test('parseExtraRows: marca el error en la fila y el campo, y no guarda la fila', () => {
  const r = parseExtraRows([
    { name: '', amount: '10' },
    { name: 'Sin monto', amount: '' },
    { name: 'Texto', amount: 'abc' },
    { name: 'Negativo', amount: '-1' },
    { name: 'x'.repeat(121), amount: '1' },
    { name: '  ', amount: 'abc' },
  ])
  assert.deepEqual(r.extras, [])
  assert.deepEqual(r.errors, [
    { index: 0, field: 'name', message: 'Ponle un nombre al extra' },
    { index: 1, field: 'amount', message: 'Ingresa un monto válido' },
    { index: 2, field: 'amount', message: 'Ingresa un monto válido' },
    { index: 3, field: 'amount', message: 'Ingresa un monto válido' },
    { index: 4, field: 'name', message: 'Máximo 120 caracteres' },
    { index: 5, field: 'name', message: 'Ponle un nombre al extra' },
    { index: 5, field: 'amount', message: 'Ingresa un monto válido' },
  ])
})

test('parseExtraRows: no deja pasar más de 20 extras', () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ name: `Extra ${i}`, amount: '1' }))
  const r = parseExtraRows(rows)
  assert.equal(r.extras.length, 20)
  assert.deepEqual(r.errors, [{ index: 20, field: 'name', message: 'Máximo 20 extras' }])
})
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `npm test`
Expected: FAIL — `SyntaxError: The requested module '../shared/utils/budget.ts' does not provide an export named 'estimatedTotal'`.

- [ ] **Step 3: Implementar**

En `shared/utils/budget.ts`:

a) Antes de `/** Lo mínimo de un ítem que necesitan los cálculos */` agrega:

```ts
export const MAX_BUDGET_EXTRAS = 20

/** Cargo adicional de una entrada. Es alias y no interface para que sea asignable a Json al guardar */
export type BudgetExtra = { name: string, amount: number }

/** Fila de extra tal como se edita en el formulario */
export interface ExtraRow { name: string, amount: string | number }
export interface ExtraRowError { index: number, field: 'name' | 'amount', message: string }
```

b) Dentro de `BudgetItemLike`, después de `member_ids: string[]`:

```ts
  /** cargos adicionales (solo en entradas), en la moneda del ítem */
  extras?: BudgetExtra[]
```

c) Reemplaza la función `estimatedBase` completa por:

```ts
const cents = (amount: number) => Math.round(amount * 100) / 100

/** Suma de los extras, en la moneda del ítem */
export function extrasTotal(item: BudgetItemLike): number {
  return cents((item.extras ?? []).reduce((t, e) => t + e.amount, 0))
}

/** Estimado del ítem en su moneda: precio base + extras. null si no tiene ninguno de los dos */
export function estimatedTotal(item: BudgetItemLike): number | null {
  if (item.estimated_amount == null && !item.extras?.length) return null
  return cents((item.estimated_amount ?? 0) + extrasTotal(item))
}

/** Costo estimado (con extras) en la moneda principal, con el cambio actual del viaje */
export function estimatedBase(item: BudgetItemLike, base: string, rates: Rates): number | null {
  const total = estimatedTotal(item)
  if (total == null) return null
  const r = rateFor(item.currency, base, rates)
  return r == null ? null : roundMoney(total * r, base)
}
```

d) En `summarize`, reemplaza la línea

```ts
    if (it.estimated_amount != null && est == null) missing.add(it.currency)
```

por

```ts
    if (estimatedTotal(it) != null && est == null) missing.add(it.currency)
```

e) Al final del archivo agrega:

```ts
/**
 * Lee las filas de extras del formulario. Una fila con nombre y monto
 * vacíos se ignora; las demás deben tener ambos. Solo las filas válidas
 * quedan en `extras`.
 */
export function parseExtraRows(rows: ExtraRow[]): { extras: BudgetExtra[], errors: ExtraRowError[] } {
  const extras: BudgetExtra[] = []
  const errors: ExtraRowError[] = []
  rows.forEach((row, index) => {
    const name = row.name.trim()
    const raw = String(row.amount ?? '').trim().replace(',', '.')
    if (!name && !raw) return
    const amount = raw === '' ? Number.NaN : Number(raw)
    const amountOk = Number.isFinite(amount) && amount >= 0 && amount < 1e12
    const nameOk = name.length >= 1 && name.length <= 120
    if (!name) errors.push({ index, field: 'name', message: 'Ponle un nombre al extra' })
    else if (!nameOk) errors.push({ index, field: 'name', message: 'Máximo 120 caracteres' })
    if (!amountOk) errors.push({ index, field: 'amount', message: 'Ingresa un monto válido' })
    if (!nameOk || !amountOk) return
    if (extras.length >= MAX_BUDGET_EXTRAS) errors.push({ index, field: 'name', message: `Máximo ${MAX_BUDGET_EXTRAS} extras` })
    else extras.push({ name, amount })
  })
  return { extras, errors }
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Run: `npm test`
Expected: PASS — `tests 24`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add shared/utils/budget.ts tests/budget.test.ts
git commit -m "feat: cálculo del estimado con extras y lectura de filas de extras"
```

---

### Task 2: Migración y reglas de base

**Files:**
- Create: `supabase/migrations/20261012000002_budget_extras.sql`
- Test: `supabase/tests/rules.test.mjs`

`npm run test:db` levanta un Postgres en memoria (PGlite) y aplica en orden todos los `.sql` de `supabase/migrations`, así que la migración nueva se prueba con solo crear el archivo. No toca la base remota.

**Interfaces:**
- Consumes: tablas y funciones de `20261012000001_budget.sql`.
- Produces:
  - Columna `public.budget_items.extras jsonb not null default '[]'`.
  - Constraints `budget_items_extras_valid` y `budget_items_extras_only_tickets`.
  - Función `public.budget_extras_valid(p jsonb) returns boolean`.
  - `member_get_trip` devuelve `extras` (arreglo) en cada elemento de `budget.items`.

- [ ] **Step 1: Escribir los checks que fallan**

En `supabase/tests/rules.test.mjs`, inmediatamente después de la línea del check `'incluye su id, los viajeros y los cambios, sin tokens'` y antes de `console.log('\nInfo automática')`, agrega:

```js

console.log('\nExtras de las entradas')
const ex = v => JSON.stringify(v)
check('ítem existente queda sin extras', Array.isArray(item.extras) && item.extras.length === 0)
const ticket = (await as('authenticated', A, `insert into public.budget_items (trip_id, category, name, currency, estimated_amount, extras)
  values ($1,'tickets','Palacio','KRW',20000,$2::text::jsonb) returning *`, [trip.id, ex([{ name: 'Audioguía', amount: 3000 }])])).rows[0]
check('admin crea una entrada con extras', ticket.extras.length === 1 && ticket.extras[0].name === 'Audioguía' && ticket.extras[0].amount === 3000)
const setExtras = v => err('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1', [ticket.id, ex(v)])
check('extra sin nombre rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: '  ', amount: 1 }])))
check('extra con nombre de 121 caracteres rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x'.repeat(121), amount: 1 }])))
check('extra con monto negativo rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x', amount: -1 }])))
check('extra con monto como texto rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x', amount: '3000' }])))
check('extra sin monto rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x' }])))
check('extra con claves de más rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x', amount: 1, paid_by: 'y' }])))
check('extras que no son un arreglo rechazados', /budget_items_extras_valid/.test(await setExtras({ name: 'x', amount: 1 })))
check('extras con null de JSON rechazados', /budget_items_extras_valid/.test(await setExtras(null)))
const many = n => Array.from({ length: n }, (_, i) => ({ name: `Extra ${i}`, amount: 1 }))
check('más de 20 extras rechazados', /budget_items_extras_valid/.test(await setExtras(many(21))))
check('20 extras aceptados', (await as('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1 returning jsonb_array_length(extras) n', [ticket.id, ex(many(20))])).rows[0].n === 20)
check('extras en un ítem que no es entrada rechazados', /budget_items_extras_only_tickets/.test(await err('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1', [item.id, ex([{ name: 'x', amount: 1 }])])))
check('cambiar la categoría sin quitar los extras se rechaza', /budget_items_extras_only_tickets/.test(await err('authenticated', A, `update public.budget_items set category = 'other' where id = $1`, [ticket.id])))
check('C no modifica extras ajenos', (await as('authenticated', C, `update public.budget_items set extras = '[]'::jsonb where id = $1 returning id`, [ticket.id])).rows.length === 0)
await as('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1', [ticket.id, ex([{ name: 'Audioguía', amount: 3000 }, { name: 'Foto', amount: 1500 }])])
g = await mget(tLucia)
const gTicket = g.budget.items.find(i => i.id === ticket.id)
check('el viajero ve los extras en orden y con monto numérico', gTicket.extras.length === 2 && gTicket.extras[0].name === 'Audioguía' && gTicket.extras[1].amount === 1500)
check('al viajero los ítems sin extras le llegan con []', g.budget.items.find(i => i.id === item.id).extras.length === 0)
check('cambiar la categoría quitando los extras funciona', (await as('authenticated', A, `update public.budget_items set category = 'other', extras = '[]'::jsonb where id = $1 returning category`, [ticket.id])).rows[0].category === 'other')
await as('authenticated', A, 'delete from public.budget_items where id = $1', [ticket.id])
```

El `$2::text::jsonb` es a propósito: así el parámetro viaja como texto y PGlite no lo vuelve a serializar.

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:db`
Expected: FAIL — el script se corta con un error (el primer check lee `item.extras`, que no existe, o el `insert` responde `column "extras" of relation "budget_items" does not exist`).

- [ ] **Step 3: Escribir la migración**

Crea `supabase/migrations/20261012000002_budget_extras.sql`:

```sql
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
```

La única diferencia de `member_get_trip` con la versión de `20261012000001_budget.sql` es la línea `'extras', i.extras,`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:db`
Expected: PASS — última línea `98 ok, 0 fallidas`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261012000002_budget_extras.sql supabase/tests/rules.test.mjs
git commit -m "feat: columna extras en budget_items con sus reglas"
```

---

### Task 3: Tipos y carga en el panel

**Files:**
- Modify: `shared/types/database.types.ts`
- Modify: `app/composables/useTripAdmin.ts`

Los tipos se editan a mano con exactamente lo que emite el generador; en la Task 6 se regeneran contra la base real para confirmarlo.

**Interfaces:**
- Consumes: `BudgetExtra` de `~~/shared/utils/budget` (Task 1).
- Produces: `BudgetItem = Omit<BudgetItemRow, 'extras'> & { extras: BudgetExtra[], member_ids: string[] }`, exportado desde `~/composables/useTripAdmin`. `budgetItems` (de `useTripCtx()`) entrega ítems con `extras` ya tipado.

- [ ] **Step 1: Actualizar `shared/types/database.types.ts`**

Dentro de `budget_items`:

En `Row`, después de `estimated_amount: number | null`:

```ts
          extras: Json
```

En `Insert` y en `Update`, después de `estimated_amount?: number | null` (en ambos):

```ts
          extras?: Json
```

En `Functions`, después de `add_trip_admin: { … }` y antes de `is_trip_admin`:

```ts
      budget_extras_valid: { Args: { p: Json }; Returns: boolean }
```

- [ ] **Step 2: Actualizar `app/composables/useTripAdmin.ts`**

Reemplaza la línea de import de `budget`:

```ts
import { balances, settle, summarize, type BudgetExtra, type Rates } from '~~/shared/utils/budget'
```

Reemplaza la definición de `BudgetItem`:

```ts
export type BudgetItem = Omit<BudgetItemRow, 'extras'> & { extras: BudgetExtra[], member_ids: string[] }
```

Y en el `computed` de `budgetItems`, reemplaza el `return`:

```ts
    return (data.value?.budgetItems ?? []).map(i => ({
      ...i,
      // la columna llega como Json; la base garantiza la forma (budget_items_extras_valid)
      extras: (i.extras ?? []) as unknown as BudgetExtra[],
      member_ids: byItem.get(i.id) ?? [],
    }))
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add shared/types/database.types.ts app/composables/useTripAdmin.ts
git commit -m "feat: tipos y carga de los extras del presupuesto"
```

---

### Task 4: Extras en el formulario del ítem

**Files:**
- Modify: `app/components/budget/BudgetItemFormModal.vue`

El proyecto no tiene pruebas de componentes: la lógica de las filas ya está probada en `parseExtraRows` (Task 1) y este componente se verifica con `npm run typecheck` y la prueba manual de la Task 6.

**Interfaces:**
- Consumes: `MAX_BUDGET_EXTRAS`, `parseExtraRows` de `~~/shared/utils/budget`; `BudgetItem.extras` (Task 3); columna `extras` (Task 2).
- Produces: el `insert`/`update` de `budget_items` incluye `extras: BudgetExtra[]` (`[]` si la categoría no es `tickets`).

- [ ] **Step 1: Script — imports, estado y carga**

Reemplaza el import de `budget`:

```ts
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_META, BUDGET_CURRENCIES, MAX_BUDGET_EXTRAS,
  currencyLabel, formatMoney, parseExtraRows, roundMoney,
  type BudgetCategory,
} from '~~/shared/utils/budget'
```

En `reactive({ … })`, después de `estimated: '',`:

```ts
  extras: [] as { name: string, amount: string }[],
```

En el `watch(open, …)`, después de la línea que asigna `state.estimated`:

```ts
  state.extras = (i?.extras ?? []).map(e => ({ name: e.name, amount: String(e.amount) }))
```

- [ ] **Step 2: Script — valores derivados**

Después de `const foreign = computed(…)`:

```ts
const isTickets = computed(() => state.category === 'tickets')

/** "Total con extras" bajo el costo estimado; null si no hay extras válidos */
const totalWithExtras = computed(() => {
  const { extras } = parseExtraRows(state.extras)
  if (!isTickets.value || !extras.length) return null
  const est = num(state.estimated)
  const base = est != null && est >= 0 ? est : 0
  return formatMoney(base + extras.reduce((t, e) => t + e.amount, 0), state.currency)
})

/** Extras cargados que se perderán porque la categoría ya no es Entradas */
const droppedExtras = computed(() =>
  isTickets.value ? 0 : state.extras.filter(e => e.name.trim() || String(e.amount ?? '').trim()).length)
```

(`num` es una declaración `function`, así que se puede usar aunque esté definida más abajo.)

- [ ] **Step 3: Script — validación y guardado**

En `validate`, antes de `return errors`:

```ts
  if (s.category === 'tickets') {
    for (const e of parseExtraRows(s.extras).errors) errors.push({ name: `extras.${e.index}.${e.field}`, message: e.message })
  }
```

En `onSubmit`, dentro del objeto `fields`, después de `estimated_amount: num(d.estimated),`:

```ts
    extras: d.category === 'tickets' ? parseExtraRows(d.extras).extras : [],
```

- [ ] **Step 4: Template — ayuda del costo estimado**

Reemplaza la etiqueta de apertura del campo "Costo estimado":

```vue
          <UFormField
            label="Costo estimado"
            name="estimated"
            :help="totalWithExtras ? `Total con extras: ${totalWithExtras}` : `Total del ítem en ${state.currency}`"
          >
```

- [ ] **Step 5: Template — sección Extras y aviso**

Inmediatamente después del `</div>` que cierra la grilla de "Moneda" y "Costo estimado", y antes del `<UFormField label="Lugar (opcional)" …>`:

```vue
        <div v-if="isTickets" class="rounded-lg border border-default p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-medium">
                Extras
              </p>
              <p class="text-xs text-muted">
                Cargos adicionales de la entrada, en {{ state.currency }}. Se suman al costo estimado.
              </p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="subtle"
              icon="i-lucide-plus"
              :disabled="state.extras.length >= MAX_BUDGET_EXTRAS"
              @click="state.extras.push({ name: '', amount: '' })"
            >
              Agregar extra
            </UButton>
          </div>
          <div v-if="state.extras.length" class="mt-3 space-y-2">
            <div v-for="(extra, idx) in state.extras" :key="idx" class="flex items-start gap-2">
              <UFormField :name="`extras.${idx}.name`" class="min-w-0 flex-1">
                <UInput
                  v-model="extra.name"
                  maxlength="120"
                  placeholder="Audioguía, visita guiada…"
                  :aria-label="`Nombre del extra ${idx + 1}`"
                  class="w-full"
                />
              </UFormField>
              <UFormField :name="`extras.${idx}.amount`" class="w-32 shrink-0">
                <UInput
                  v-model="extra.amount"
                  type="number"
                  min="0"
                  step="any"
                  inputmode="decimal"
                  placeholder="Monto"
                  :aria-label="`Monto del extra ${idx + 1}`"
                  class="w-full"
                />
              </UFormField>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :aria-label="`Quitar extra ${idx + 1}`"
                @click="state.extras.splice(idx, 1)"
              />
            </div>
          </div>
        </div>
        <UAlert
          v-else-if="droppedExtras"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="droppedExtras === 1
            ? 'Al guardar se quitará el extra: solo las entradas pueden tenerlos.'
            : `Al guardar se quitarán los ${droppedExtras} extras: solo las entradas pueden tenerlos.`"
        />
```

- [ ] **Step 6: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores. Si TypeScript reclama que `extra.amount` puede ser número (Nuxt UI entrega número en `type="number"`), cambia el tipo del estado a `{ name: string, amount: string | number }[]`; `parseExtraRows` ya acepta ambos.

- [ ] **Step 7: Commit**

```bash
git add app/components/budget/BudgetItemFormModal.vue
git commit -m "feat: extras en el formulario de las entradas del presupuesto"
```

---

### Task 5: Extras en la lista de ítems

**Files:**
- Modify: `app/components/budget/BudgetItemList.vue`

Este componente lo usan el panel de administración (`BudgetPanel.vue`) y la vista del viajero (`app/pages/v/[token].vue`); el cambio sirve a los dos.

**Interfaces:**
- Consumes: `estimatedTotal` de `~~/shared/utils/budget`; `BudgetItemView.extras?` (Task 1).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Script**

Reemplaza el import:

```ts
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_META, actualBase, estimatedBase, estimatedTotal, formatMoney, roundMoney,
  type BudgetItemView, type Rates,
} from '~~/shared/utils/budget'
```

En `estimatedHint`, reemplaza la primera línea del cuerpo:

```ts
  if (i.currency === props.base || estimatedTotal(i) == null) return null
```

- [ ] **Step 2: Template — extras bajo el nombre**

Después del `<p class="font-medium leading-snug">…</p>` del nombre y antes del `<p v-if="i.notes" …>`:

```vue
            <ul v-if="i.extras?.length" class="mt-0.5 space-y-0.5 text-xs text-muted">
              <li v-for="(extra, idx) in i.extras" :key="idx">
                + {{ extra.name }} · {{ formatMoney(extra.amount, i.currency) }}
              </li>
            </ul>
```

- [ ] **Step 3: Template — el estimado mostrado es el total**

Reemplaza el bloque `<div class="shrink-0 text-right text-sm">…</div>` completo por:

```vue
          <div class="shrink-0 text-right text-sm">
            <template v-if="i.actual_amount != null">
              <p class="font-semibold">
                {{ formatMoney(i.actual_amount, i.currency) }}
              </p>
              <p v-if="actualHint(i)" class="text-xs text-muted">
                {{ actualHint(i) }}
              </p>
              <p v-if="estimatedTotal(i) != null" class="text-xs text-dimmed">
                Estimado {{ formatMoney(estimatedTotal(i)!, i.currency) }}
              </p>
            </template>
            <template v-else-if="estimatedTotal(i) != null">
              <p class="font-semibold">
                {{ formatMoney(estimatedTotal(i)!, i.currency) }}
              </p>
              <p v-if="estimatedHint(i)" class="text-xs text-muted">
                {{ estimatedHint(i) }}
              </p>
            </template>
          </div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/components/budget/BudgetItemList.vue
git commit -m "feat: mostrar los extras y el estimado total en la lista del presupuesto"
```

---

### Task 6: Base remota y verificación final

**Files:**
- Modify (solo si el generador difiere): `shared/types/database.types.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la base de Supabase con la columna `extras` y la función terminada.

- [ ] **Step 1: Suite completa en local**

Run: `npm test` → `tests 24`, `fail 0`.
Run: `npm run test:db` → `98 ok, 0 fallidas`.
Run: `npm run typecheck` → sin errores.

- [ ] **Step 2: Aplicar la migración al proyecto de Supabase**

**Pide confirmación al usuario antes de este paso**: modifica la base real. Con su visto bueno, aplica el contenido de `supabase/migrations/20261012000002_budget_extras.sql` con la herramienta MCP `apply_migration` (nombre `budget_extras`). Luego comprueba:

```sql
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='budget_items' and column_name='extras') as col,
  (select count(*) from pg_constraint where conname in ('budget_items_extras_valid','budget_items_extras_only_tickets')) as checks,
  (select position('''extras''' in pg_get_functiondef('public.member_get_trip(text)'::regprocedure)) > 0) as fn;
```

Expected: `col = 1`, `checks = 2`, `fn = true`.

- [ ] **Step 3: Regenerar los tipos y comparar**

Genera los tipos con la herramienta MCP `generate_typescript_types` y compáralos con `shared/types/database.types.ts`. Solo debe diferir el comentario de cabecera de dos líneas del archivo. Si hay otra diferencia, deja el archivo igual al generado (conservando la cabecera), corre `npm run typecheck` y haz commit:

```bash
git add shared/types/database.types.ts
git commit -m "fix: tipos de la base regenerados"
```

- [ ] **Step 4: Prueba manual en el navegador**

Run: `npm run dev`, entra a un viaje como administrador, pestaña Presupuesto.

1. "Agregar ítem" con categoría Otros: no aparece la sección Extras.
2. Cambia a Entradas: aparece. Agrega "Audioguía" 3000 y "Foto" 1500 con costo estimado 20000: la ayuda dice "Total con extras: … 24.500".
3. Agrega una fila con nombre y sin monto y guarda: el error aparece en esa fila y no se guarda. Quita la fila y guarda.
4. En la lista: bajo el nombre aparecen "+ Audioguía · …" y "+ Foto · …", y el monto de la derecha es 24.500. El total estimado del resumen y el de la categoría Entradas subieron en 24.500.
5. Edita el ítem: los dos extras vuelven cargados. Márcalo como pagado por 25000: la lista muestra 25.000 y debajo "Estimado … 24.500".
6. Edita y cambia la categoría a Otros: aparece el aviso "Al guardar se quitarán los 2 extras…". Guarda: el ítem queda sin extras y su estimado vuelve a 20.000.
7. Con el presupuesto publicado, abre el enlace de un viajero (`/v/<token>`), pestaña Presupuesto: una entrada con extras los muestra igual que en el panel.

- [ ] **Step 5: Reportar**

Informa al usuario qué pasó en cada punto de la prueba manual, incluido cualquiera que no se haya podido probar.
