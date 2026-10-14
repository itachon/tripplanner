# Categorías de lugares con icono y color — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada lugar muestra en el mapa y en su tarjeta el icono, el color y el nombre en español de su categoría, resueltos desde dos tablas nuevas, sin dejar de guardar la etiqueta técnica de Mapbox.

**Architecture:** Dos tablas de solo lectura (`place_categories`, `place_category_tags`) sembradas por migración. Una ruta pública `GET /api/place-categories` las entrega; el composable `usePlaceCategories()` las comparte y resuelve etiqueta → categoría con funciones puras de `app/utils/place-category.ts`. `TripMap` dibuja cada punto con un componente `MapMarkerDot` montado con `render()` de Vue (opción A: relleno del color de la categoría, estado en borde/opacidad, número en burbuja).

**Tech Stack:** Nuxt 4, Nuxt UI 4 (`UIcon`, `USelectMenu`, `UBadge`), Tailwind 4, Supabase Postgres + RLS, mapbox-gl 3, node:test, PGlite (`npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-10-14-categorias-lugares-design.md`

## Global Constraints

- La etiqueta sigue guardándose en `catalog_places.category`; no se modifica esa columna ni los datos existentes.
- La etiqueta técnica (ej. `arts_and_entertainment`) nunca se muestra al usuario.
- Tablas: `place_categories (key text pk, icon text, color text '^#[0-9a-f]{6}$', sort_order int, label_es text)` — `label_es` es la última columna; `place_category_tags (tag text pk, lower(trim(tag)) y no vacía, category_key → place_categories.key)`.
- Lectura para `anon` y `authenticated`; nadie escribe desde la app.
- La categoría `other` ("Otros") existe siempre y es el respaldo de una etiqueta desconocida.
- Cada `key` existe también como etiqueta.
- Al marcar un ícono del mapa: `maki`, si no `class`, si no `type`.
- Puntos (opción A): primary/success = relleno color, icono blanco, borde blanco sólido; off = relleno color al 45 %, chico; catalog = relleno blanco, icono y borde punteado del color, chico, sin número. Número en burbuja de la esquina.
- Sin categorías cargadas, todo se ve como hoy (puntos por tono con número; el formulario usa el campo de texto).
- Textos de interfaz en español, tuteo.
- Commits en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git add` de archivos concretos (nunca `.env.example` ni `claudeweb/`).
- La migración se aplica en Supabase (MCP) solo con confirmación explícita del usuario en ese momento.

## Review Focus

1. Las categorías no cargan (ruta caída, sin red): mapa, tarjeta y formulario siguen funcionando como hoy y nunca muestran la etiqueta técnica — Task 2 (`categoryOf` sin categorías → `null`), Task 5 (badge oculto, campo de texto).
2. Guardar el formulario sin tocar la categoría conserva la etiqueta original exacta (ej. "Palacio" con mayúscula) — Task 2 (`categoryToSave`).
3. Etiquetas con mayúsculas, espacios o en español ("Palacio", " Lodging ", "museo") se resuelven a su categoría — Task 2.
4. Estados del punto (off, catalog, primary, success) con color de categoría siguen distinguiéndose, y `dimmed`/activo siguen funcionando — Task 2 (`markerLook`), Task 4.
5. El viajero (sin sesión) puede leer las categorías y nadie puede escribirlas; todas las etiquetas guardadas hoy resuelven a una categoría distinta de `other` — Task 1.

## Archivos

- Create `supabase/migrations/20261014000002_place_categories.sql` — tablas, RLS, semillas.
- Modify `supabase/tests/rules.test.mjs` — pruebas de las tablas.
- Create `shared/types/place-category.ts` — tipos `PlaceCategory`, `PlaceCategoryTag`, `PlaceCategoriesPayload`.
- Create `app/utils/place-category.ts` — `buildCategoryIndex`, `categoryOf`, `pickPoiCategory`, `categoryToSave`.
- Create `app/utils/marker-look.ts` — `markerLook`.
- Create `tests/place-category.test.ts`, `tests/marker-look.test.ts`.
- Modify `shared/types/database.types.ts` — las dos tablas.
- Create `server/api/place-categories.get.ts`.
- Create `app/composables/usePlaceCategories.ts`.
- Modify `nuxt.config.ts` — iconos de categorías en el bundle del cliente.
- Modify `shared/types/map.ts` — `MapMarker.category`.
- Create `app/components/map/MapMarkerDot.vue`.
- Modify `app/components/map/TripMap.vue` — dibujo con `MapMarkerDot`, `pickPoiCategory`.
- Modify `app/composables/useCatalogInView.ts`, `app/components/place/PlacesPanel.vue`, `app/components/itinerary/ItineraryPanel.vue`, `app/pages/v/[token].vue` — pasar `category` a los puntos.
- Modify `app/components/map/PlaceInfoCard.vue` — badge de categoría.
- Modify `app/components/place/PlaceFormModal.vue` — selector de categoría.

---

### Task 1: Tablas de categorías con semillas y pruebas de base

**Files:**
- Create: `supabase/migrations/20261014000002_place_categories.sql`
- Modify: `supabase/tests/rules.test.mjs` (antes de `console.log('\nStorage')`)

**Interfaces:**
- Produces: tablas `public.place_categories(key, icon, color, sort_order, label_es)` y `public.place_category_tags(tag, category_key)`, legibles por `anon` y `authenticated`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `supabase/tests/rules.test.mjs`, justo antes de la línea `console.log('\nStorage')`, agregar:

```js
console.log('\nCategorías de lugares')
const catOf = async (role, tag) => (await as(role, null, 'select category_key from public.place_category_tags where tag = $1', [tag])).rows[0]?.category_key
check('anon lee las categorías', (await as('anon', null, 'select count(*)::int n from public.place_categories')).rows[0].n >= 13)
check('un organizador lee las etiquetas', (await as('authenticated', A, 'select count(*)::int n from public.place_category_tags')).rows[0].n > 13)
check('existe la categoría Otros', (await catOf('anon', 'other')) === 'other')
check('cada categoría existe también como etiqueta', (await db.query('select count(*)::int n from public.place_categories c where not exists (select 1 from public.place_category_tags t where t.tag = c.key and t.category_key = c.key)')).rows[0].n === 0)
check('las etiquetas guardadas hoy resuelven a su categoría',
  (await catOf('anon', 'arts_and_entertainment')) === 'culture'
  && (await catOf('anon', 'lodging')) === 'lodging'
  && (await catOf('anon', 'palacio')) === 'monument'
  && (await catOf('anon', 'landmark')) === 'monument'
  && (await catOf('anon', 'historic')) === 'monument')
check('los alias en español resuelven', (await catOf('anon', 'museo')) === 'museum' && (await catOf('anon', 'hotel')) === 'lodging')
check('label_es es la última columna', (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'place_categories' order by ordinal_position desc limit 1`)).rows[0].column_name === 'label_es')
const writeDenied = msg => /permission denied|row-level security/.test(msg ?? '')
check('nadie inserta categorías', writeDenied(await err('authenticated', A, `insert into public.place_categories (key, icon, color, sort_order, label_es) values ('x', 'i-lucide-x', '#000000', 99, 'X')`)) && writeDenied(await err('anon', null, `insert into public.place_categories (key, icon, color, sort_order, label_es) values ('y', 'i-lucide-x', '#000000', 99, 'Y')`)))
check('nadie cambia etiquetas', writeDenied(await err('authenticated', A, `insert into public.place_category_tags (tag, category_key) values ('nueva', 'other')`)) && (await as('authenticated', A, `update public.place_categories set label_es = 'X' where key = 'museum' returning key`).catch(() => ({ rows: [] }))).rows.length === 0)
check('nadie borra categorías', (await as('authenticated', A, `delete from public.place_category_tags where tag = 'museo' returning tag`).catch(() => ({ rows: [] }))).rows.length === 0 && (await catOf('anon', 'museo')) === 'museum')
check('una etiqueta con mayúsculas o espacios se rechaza', /check/i.test(await err('service_role', null, `insert into public.place_category_tags (tag, category_key) values (' Museo', 'museum')`) ?? ''))
check('un color mal escrito se rechaza', /check/i.test(await err('service_role', null, `insert into public.place_categories (key, icon, color, sort_order, label_es) values ('z', 'i-lucide-x', 'rojo', 99, 'Z')`) ?? ''))
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm run test:db`
Expected: el script se cae (exit 1) con un error de relación inexistente `place_category_tags` / `place_categories`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20261014000002_place_categories.sql`:

```sql
-- ---------------------------------------------------------------------
-- Categorías de lugares: icono, color y nombre en español.
-- place_categories: lo que se ve y (a futuro) se filtra.
-- place_category_tags: qué etiqueta guardada en catalog_places.category
-- pertenece a cada categoría. Solo se modifican con migraciones.
-- ---------------------------------------------------------------------
create table public.place_categories (
  key        text primary key,
  icon       text not null,
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  sort_order int  not null,
  label_es   text not null
);

create table public.place_category_tags (
  tag          text primary key check (tag = lower(trim(tag)) and tag <> ''),
  category_key text not null references public.place_categories(key) on update cascade on delete cascade
);

alter table public.place_categories enable row level security;
alter table public.place_category_tags enable row level security;

revoke all on public.place_categories, public.place_category_tags from anon, authenticated;
grant select on public.place_categories, public.place_category_tags to anon, authenticated;

create policy place_categories_select on public.place_categories for select to anon, authenticated using (true);
create policy place_category_tags_select on public.place_category_tags for select to anon, authenticated using (true);

insert into public.place_categories (key, icon, color, sort_order, label_es) values
  ('museum',     'i-lucide-landmark',      '#7c3aed', 1,  'Museos'),
  ('monument',   'i-lucide-castle',        '#b45309', 2,  'Monumentos'),
  ('worship',    'i-lucide-church',        '#be185d', 3,  'Templos'),
  ('culture',    'i-lucide-theater',       '#c026d3', 4,  'Arte y entretenimiento'),
  ('park',       'i-lucide-trees',         '#16a34a', 5,  'Parques'),
  ('viewpoint',  'i-lucide-mountain',      '#0891b2', 6,  'Miradores'),
  ('lodging',    'i-lucide-bed-double',    '#2563eb', 7,  'Hoteles'),
  ('restaurant', 'i-lucide-utensils',      '#ea580c', 8,  'Restaurantes'),
  ('cafe',       'i-lucide-coffee',        '#92400e', 9,  'Cafés'),
  ('bar',        'i-lucide-wine',          '#9f1239', 10, 'Bares'),
  ('shop',       'i-lucide-shopping-bag',  '#0d9488', 11, 'Tiendas'),
  ('transport',  'i-lucide-train-front',   '#475569', 12, 'Transporte'),
  ('other',      'i-lucide-map-pin',       '#78716c', 99, 'Otros');

-- Cada categoría es también una etiqueta de sí misma
insert into public.place_category_tags (tag, category_key)
select key, key from public.place_categories;

insert into public.place_category_tags (tag, category_key) values
  ('museo', 'museum'), ('art_gallery', 'museum'), ('gallery', 'museum'), ('galería de arte', 'museum'),
  ('landmark', 'monument'), ('historic', 'monument'), ('historic_site', 'monument'), ('memorial', 'monument'),
  ('castle', 'monument'), ('palace', 'monument'), ('palacio', 'monument'), ('monumento', 'monument'),
  ('castillo', 'monument'), ('sitio histórico', 'monument'),
  ('place_of_worship', 'worship'), ('religion', 'worship'), ('religious', 'worship'), ('temple', 'worship'),
  ('church', 'worship'), ('shrine', 'worship'), ('mosque', 'worship'), ('templo', 'worship'),
  ('iglesia', 'worship'), ('santuario', 'worship'),
  ('arts_and_entertainment', 'culture'), ('attraction', 'culture'), ('entertainment', 'culture'),
  ('theatre', 'culture'), ('theater', 'culture'), ('cinema', 'culture'), ('music', 'culture'),
  ('stadium', 'culture'), ('zoo', 'culture'), ('aquarium', 'culture'), ('theme_park', 'culture'),
  ('teatro', 'culture'), ('cine', 'culture'), ('atracción turística', 'culture'),
  ('park_like', 'park'), ('garden', 'park'), ('national_park', 'park'), ('nature_reserve', 'park'),
  ('parque', 'park'), ('jardín', 'park'),
  ('mirador', 'viewpoint'), ('natural_feature', 'viewpoint'), ('mountain', 'viewpoint'),
  ('beach', 'viewpoint'), ('playa', 'viewpoint'),
  ('hotel', 'lodging'), ('hostel', 'lodging'), ('motel', 'lodging'), ('accommodation', 'lodging'),
  ('alojamiento', 'lodging'), ('hostal', 'lodging'),
  ('food_and_drink', 'restaurant'), ('food', 'restaurant'), ('fast_food', 'restaurant'),
  ('restaurante', 'restaurant'), ('comida', 'restaurant'),
  ('coffee', 'cafe'), ('coffee_shop', 'cafe'), ('bakery', 'cafe'), ('café', 'cafe'),
  ('cafetería', 'cafe'), ('panadería', 'cafe'),
  ('pub', 'bar'), ('nightclub', 'bar'), ('alcohol', 'bar'), ('beer', 'bar'), ('biergarten', 'bar'),
  ('shopping', 'shop'), ('store', 'shop'), ('mall', 'shop'), ('grocery', 'shop'),
  ('commercial_services', 'shop'), ('market', 'shop'), ('tienda', 'shop'), ('mercado', 'shop'),
  ('centro comercial', 'shop'),
  ('airport', 'transport'), ('rail', 'transport'), ('rail_station', 'transport'),
  ('train_station', 'transport'), ('bus', 'transport'), ('bus_station', 'transport'),
  ('transit', 'transport'), ('ferry', 'transport'), ('aeropuerto', 'transport'), ('estación', 'transport');
```

Nota: si alguna etiqueta queda repetida entre la lista y una `key`, el `insert` falla por clave primaria; eso es intencional (una etiqueta pertenece a una sola categoría).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm run test:db`
Expected: `✔ migración 20261014000002_place_categories.sql`, las 12 pruebas nuevas en ✔ y la línea final `N ok, 0 fallidas`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014000002_place_categories.sql supabase/tests/rules.test.mjs
git commit -m "feat: tablas de categorías de lugares con icono, color y nombre en español

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Funciones puras de categoría y aspecto del punto

**Files:**
- Create: `shared/types/place-category.ts`
- Create: `app/utils/place-category.ts`
- Create: `app/utils/marker-look.ts`
- Test: `tests/place-category.test.ts`, `tests/marker-look.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface PlaceCategory { key: string, icon: string, color: string, sort_order: number, label_es: string }`
  - `interface PlaceCategoryTag { tag: string, category_key: string }`
  - `interface PlaceCategoriesPayload { categories: PlaceCategory[], tags: PlaceCategoryTag[] }`
  - `interface CategoryIndex { byKey: Map<string, PlaceCategory>, byTag: Map<string, string> }`
  - `buildCategoryIndex(p: PlaceCategoriesPayload): CategoryIndex`
  - `categoryOf(tag: string | null | undefined, index: CategoryIndex): PlaceCategory | null`
  - `pickPoiCategory(props: Record<string, unknown> | null | undefined): string | null`
  - `categoryToSave(rawTag: string | null | undefined, initialKey: string, chosenKey: string): string | null`
  - `markerLook(tone: MapMarker['tone'], color: string): { small: boolean, style: Record<string, string> }`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/place-category.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryIndex, categoryOf, categoryToSave, pickPoiCategory } from '../app/utils/place-category.ts'

const payload = {
  categories: [
    { key: 'museum', icon: 'i-lucide-landmark', color: '#7c3aed', sort_order: 1, label_es: 'Museos' },
    { key: 'monument', icon: 'i-lucide-castle', color: '#b45309', sort_order: 2, label_es: 'Monumentos' },
    { key: 'lodging', icon: 'i-lucide-bed-double', color: '#2563eb', sort_order: 7, label_es: 'Hoteles' },
    { key: 'other', icon: 'i-lucide-map-pin', color: '#78716c', sort_order: 99, label_es: 'Otros' },
  ],
  tags: [
    { tag: 'museum', category_key: 'museum' },
    { tag: 'museo', category_key: 'museum' },
    { tag: 'palacio', category_key: 'monument' },
    { tag: 'lodging', category_key: 'lodging' },
    { tag: 'other', category_key: 'other' },
  ],
}
const index = buildCategoryIndex(payload)

test('categoryOf: etiqueta exacta', () => {
  assert.equal(categoryOf('museum', index)?.label_es, 'Museos')
})

test('categoryOf: sin distinguir mayúsculas ni espacios', () => {
  assert.equal(categoryOf('Palacio', index)?.key, 'monument')
  assert.equal(categoryOf('  Lodging ', index)?.key, 'lodging')
})

test('categoryOf: alias en español', () => {
  assert.equal(categoryOf('museo', index)?.key, 'museum')
})

test('categoryOf: desconocida o vacía es Otros', () => {
  assert.equal(categoryOf('arts_and_entertainment', index)?.key, 'other')
  assert.equal(categoryOf(null, index)?.key, 'other')
  assert.equal(categoryOf('', index)?.key, 'other')
})

test('categoryOf: sin categorías cargadas es null', () => {
  assert.equal(categoryOf('museum', buildCategoryIndex({ categories: [], tags: [] })), null)
})

test('pickPoiCategory: prefiere maki, luego class, luego type', () => {
  assert.equal(pickPoiCategory({ maki: 'museum', class: 'arts_and_entertainment', type: 'Museum' }), 'museum')
  assert.equal(pickPoiCategory({ class: 'lodging', type: 'Hotel' }), 'lodging')
  assert.equal(pickPoiCategory({ type: 'Hotel' }), 'Hotel')
  assert.equal(pickPoiCategory({ maki: '', class: null }), null)
  assert.equal(pickPoiCategory(null), null)
})

test('categoryToSave: sin tocar el selector conserva la etiqueta original exacta', () => {
  assert.equal(categoryToSave('Palacio', 'monument', 'monument'), 'Palacio')
  assert.equal(categoryToSave('arts_and_entertainment', 'other', 'other'), 'arts_and_entertainment')
  assert.equal(categoryToSave('  ', 'other', 'other'), null)
  assert.equal(categoryToSave(null, 'other', 'other'), null)
})

test('categoryToSave: al elegir otra categoría guarda su key', () => {
  assert.equal(categoryToSave('arts_and_entertainment', 'other', 'museum'), 'museum')
  assert.equal(categoryToSave(null, 'other', 'lodging'), 'lodging')
})
```

Crear `tests/marker-look.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerLook } from '../app/utils/marker-look.ts'

const C = '#7c3aed'

test('markerLook: en votación, relleno del color con icono blanco y borde blanco', () => {
  assert.deepEqual(markerLook('primary', C), { small: false, style: { backgroundColor: C, color: '#ffffff', borderColor: '#ffffff', borderStyle: 'solid' } })
  assert.deepEqual(markerLook(undefined, C), markerLook('primary', C))
})

test('markerLook: votado se ve igual que en votación (la burbuja lo distingue)', () => {
  assert.deepEqual(markerLook('success', C), markerLook('primary', C))
})

test('markerLook: fuera de la votación, color al 45 % y chico', () => {
  assert.deepEqual(markerLook('off', C), { small: true, style: { backgroundColor: '#7c3aed73', color: '#ffffff', borderColor: '#ffffff', borderStyle: 'solid' } })
})

test('markerLook: del catálogo, blanco con icono y borde punteado del color', () => {
  assert.deepEqual(markerLook('catalog', C), { small: true, style: { backgroundColor: '#ffffff', color: C, borderColor: C, borderStyle: 'dashed' } })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/place-category.test.ts tests/marker-look.test.ts`
Expected: FAIL (no se encuentran los módulos `../app/utils/place-category.ts` y `../app/utils/marker-look.ts`).

- [ ] **Step 3: Implementar**

Crear `shared/types/place-category.ts`:

```ts
/** Categoría de lugar: lo que se ve en el mapa y la tarjeta (y a futuro se filtra) */
export interface PlaceCategory {
  key: string
  /** icono Lucide para Nuxt Icon, ej. 'i-lucide-landmark' */
  icon: string
  /** '#rrggbb' */
  color: string
  sort_order: number
  label_es: string
}

/** Etiqueta guardada en catalog_places.category → su categoría */
export interface PlaceCategoryTag {
  tag: string
  category_key: string
}

export interface PlaceCategoriesPayload {
  categories: PlaceCategory[]
  tags: PlaceCategoryTag[]
}
```

Crear `app/utils/place-category.ts`:

```ts
import type { PlaceCategoriesPayload, PlaceCategory } from '~~/shared/types/place-category'

export interface CategoryIndex {
  byKey: Map<string, PlaceCategory>
  /** etiqueta normalizada → key de la categoría */
  byTag: Map<string, string>
}

/** Categoría de respaldo para etiquetas desconocidas */
export const OTHER_CATEGORY = 'other'

export function buildCategoryIndex(p: PlaceCategoriesPayload): CategoryIndex {
  return {
    byKey: new Map(p.categories.map(c => [c.key, c])),
    byTag: new Map(p.tags.map(t => [t.tag, t.category_key])),
  }
}

/**
 * Categoría de una etiqueta guardada. Desconocida o vacía → Otros.
 * null solo si no hay categorías cargadas (entonces se muestra todo como antes).
 */
export function categoryOf(tag: string | null | undefined, index: CategoryIndex): PlaceCategory | null {
  if (!index.byKey.size) return null
  const key = index.byTag.get((tag ?? '').trim().toLowerCase()) ?? OTHER_CATEGORY
  return index.byKey.get(key) ?? index.byKey.get(OTHER_CATEGORY) ?? null
}

/** Etiqueta de un punto de interés del mapa: la específica (maki) antes que la general (class) */
export function pickPoiCategory(props: Record<string, unknown> | null | undefined): string | null {
  for (const k of ['maki', 'class', 'type']) {
    const v = props?.[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

/**
 * Qué guardar como etiqueta al salir del formulario: si el selector no cambió,
 * la etiqueta original tal cual; si cambió, la key de la categoría elegida.
 */
export function categoryToSave(rawTag: string | null | undefined, initialKey: string, chosenKey: string): string | null {
  if (chosenKey === initialKey) return rawTag?.trim() || null
  return chosenKey
}
```

Crear `app/utils/marker-look.ts`:

```ts
import type { MapMarker } from '~~/shared/types/map'

export interface MarkerLook {
  small: boolean
  style: Record<string, string>
}

const WHITE = '#ffffff'
// 45 % de opacidad en hex de 8 dígitos (0,45 × 255 ≈ 0x73)
const ALPHA_45 = '73'

/** Aspecto de un punto con categoría: el color es la categoría; el estado, el borde y la opacidad */
export function markerLook(tone: MapMarker['tone'], color: string): MarkerLook {
  if (tone === 'catalog') return { small: true, style: { backgroundColor: WHITE, color, borderColor: color, borderStyle: 'dashed' } }
  if (tone === 'off') return { small: true, style: { backgroundColor: color + ALPHA_45, color: WHITE, borderColor: WHITE, borderStyle: 'solid' } }
  return { small: false, style: { backgroundColor: color, color: WHITE, borderColor: WHITE, borderStyle: 'solid' } }
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: todas pasan (las 53 anteriores + 12 nuevas), `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add shared/types/place-category.ts app/utils/place-category.ts app/utils/marker-look.ts tests/place-category.test.ts tests/marker-look.test.ts
git commit -m "feat: resolver la categoría de un lugar y el aspecto de su punto en el mapa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Entregar las categorías a la app

**Files:**
- Modify: `shared/types/database.types.ts` (antes de `      place_info: {`, línea ~296)
- Create: `server/api/place-categories.get.ts`
- Create: `app/composables/usePlaceCategories.ts`
- Modify: `nuxt.config.ts`

**Interfaces:**
- Consumes: Task 1 (tablas), Task 2 (`PlaceCategoriesPayload`, `buildCategoryIndex`, `categoryOf`).
- Produces: `GET /api/place-categories → PlaceCategoriesPayload`; `usePlaceCategories(): { categories: ComputedRef<PlaceCategory[]>, loaded: ComputedRef<boolean>, resolve: (tag: string | null | undefined) => PlaceCategory | null }`.

- [ ] **Step 1: Agregar las tablas a los tipos**

En `shared/types/database.types.ts`, insertar antes de `      place_info: {`:

```ts
      place_categories: {
        Row: {
          color: string
          icon: string
          key: string
          label_es: string
          sort_order: number
        }
        Insert: {
          color: string
          icon: string
          key: string
          label_es: string
          sort_order: number
        }
        Update: {
          color?: string
          icon?: string
          key?: string
          label_es?: string
          sort_order?: number
        }
        Relationships: []
      }
      place_category_tags: {
        Row: {
          category_key: string
          tag: string
        }
        Insert: {
          category_key: string
          tag: string
        }
        Update: {
          category_key?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_category_tags_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "place_categories"
            referencedColumns: ["key"]
          },
        ]
      }
```

- [ ] **Step 2: Crear la ruta pública**

Crear `server/api/place-categories.get.ts`:

```ts
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'
import type { PlaceCategoriesPayload } from '~~/shared/types/place-category'

// GET /api/place-categories — categorías y sus etiquetas (públicas: también las usa el viajero)
export default defineEventHandler(async (event): Promise<PlaceCategoriesPayload> => {
  const db = await serverSupabaseClient<Database>(event)
  const [cats, tags] = await Promise.all([
    db.from('place_categories').select('key, icon, color, sort_order, label_es').order('sort_order'),
    db.from('place_category_tags').select('tag, category_key'),
  ])
  if (cats.error || tags.error) {
    console.error('[place-categories]', cats.error ?? tags.error)
    throw createError({ statusCode: 500, message: 'No se pudieron cargar las categorías.' })
  }
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return { categories: cats.data, tags: tags.data }
})
```

- [ ] **Step 3: Crear el composable**

Crear `app/composables/usePlaceCategories.ts`:

```ts
import type { PlaceCategoriesPayload, PlaceCategory } from '~~/shared/types/place-category'

/**
 * Categorías de lugares, pedidas una vez y compartidas por todas las pantallas.
 * Si no cargan, `loaded` queda en false y resolve() devuelve null: quien las usa
 * se ve como antes (nunca muestra la etiqueta técnica).
 */
export function usePlaceCategories() {
  const { data } = useFetch<PlaceCategoriesPayload>('/api/place-categories', {
    key: 'place-categories',
    default: () => ({ categories: [], tags: [] }),
  })
  const index = computed(() => buildCategoryIndex(data.value ?? { categories: [], tags: [] }))
  const categories = computed<PlaceCategory[]>(() => [...(data.value?.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order))
  const loaded = computed(() => categories.value.length > 0)
  const resolve = (tag: string | null | undefined) => categoryOf(tag, index.value)
  return { categories, loaded, resolve }
}
```

- [ ] **Step 4: Iconos de las categorías en el bundle del cliente**

En `nuxt.config.ts`, después del bloque `components: [...]`, agregar:

```ts
  // Iconos de las categorías de lugares (vienen de la base): que no dependan de la red
  icon: {
    clientBundle: {
      icons: [
        'lucide:landmark', 'lucide:castle', 'lucide:church', 'lucide:theater', 'lucide:trees',
        'lucide:mountain', 'lucide:bed-double', 'lucide:utensils', 'lucide:coffee', 'lucide:wine',
        'lucide:shopping-bag', 'lucide:train-front', 'lucide:map-pin',
      ],
    },
  },
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: `✨ Build complete!` y en el log `Nuxt Icon client bundle consist of N icons` con N mayor que antes (43).

- [ ] **Step 6: Commit**

```bash
git add shared/types/database.types.ts server/api/place-categories.get.ts app/composables/usePlaceCategories.ts nuxt.config.ts
git commit -m "feat: ruta pública y composable para las categorías de lugares

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Puntos del mapa con icono y color de su categoría

**Files:**
- Modify: `shared/types/map.ts`
- Create: `app/components/map/MapMarkerDot.vue`
- Modify: `app/components/map/TripMap.vue` (imports, `TONES`/`markerClass` → componente, `createMarkerEl`, `paintMarker`, `syncMarkers`, `findNearestPoi`, `onBeforeUnmount`)
- Modify: `app/composables/useCatalogInView.ts`, `app/components/place/PlacesPanel.vue`, `app/components/itinerary/ItineraryPanel.vue`, `app/pages/v/[token].vue`

**Interfaces:**
- Consumes: Task 2 (`markerLook`, `pickPoiCategory`, `PlaceCategory`), Task 3 (`usePlaceCategories`).
- Produces: `MapMarker.category?: string | null` (la etiqueta guardada; TripMap la resuelve).

Ruling respecto a la spec: en vez de `icon`/`color` en `MapMarker`, cada punto lleva su etiqueta (`category`) y TripMap la resuelve en un solo lugar. Así las cuatro pantallas que arman puntos no repiten la resolución, y si las categorías llegan tarde TripMap vuelve a dibujar.

- [ ] **Step 1: `MapMarker.category`**

En `shared/types/map.ts`, agregar dentro de `MapMarker`, después de `title: string`:

```ts
  /** etiqueta guardada del lugar (ej. 'museum'): define icono y color del punto */
  category?: string | null
```

- [ ] **Step 2: Componente del punto**

Crear `app/components/map/MapMarkerDot.vue`:

```vue
<script setup lang="ts">
import type { MapMarker } from '~~/shared/types/map'
import type { PlaceCategory } from '~~/shared/types/place-category'

// Dibujo de un punto del mapa. TripMap lo monta con render() dentro del
// <button> que Mapbox posiciona (los marcadores de Mapbox no son componentes).
const props = defineProps<{ marker: MapMarker, category: PlaceCategory | null, active: boolean }>()

const TONES: Record<NonNullable<MapMarker['tone']>, string> = {
  primary: 'bg-primary text-inverted',
  success: 'bg-success text-inverted',
  neutral: 'bg-neutral-600 text-white',
  warning: 'bg-warning text-white',
  off: 'bg-sky-300 text-sky-950',
  catalog: 'bg-sky-200/80 text-sky-800',
}

const look = computed(() => (props.category ? markerLook(props.marker.tone, props.category.color) : null))
const small = computed(() => props.marker.tone === 'off' || props.marker.tone === 'catalog')
const showBadge = computed(() => !!props.marker.label && props.marker.tone !== 'catalog')
const state = computed(() => [
  props.marker.dimmed && !props.active ? 'opacity-55' : '',
  props.active ? 'scale-125 ring-4 ring-primary/35' : 'group-hover:scale-110',
])
</script>

<template>
  <!-- Con categoría: color de la categoría, icono, número en burbuja -->
  <span
    v-if="category && look"
    class="trip-marker relative flex items-center justify-center rounded-full border-2 shadow-md transition-[scale,box-shadow] duration-150"
    :class="[small ? 'size-6' : 'size-8', state]"
    :style="look.style"
  >
    <UIcon :name="category.icon" :class="small ? 'size-3.5' : 'size-4'" />
    <span
      v-if="showBadge"
      class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-1 ring-white"
      :class="marker.tone === 'success' ? 'bg-success' : 'bg-neutral-900'"
    >{{ marker.label }}</span>
  </span>
  <!-- Sin categorías cargadas: como antes -->
  <span
    v-else
    class="trip-marker flex items-center justify-center rounded-full border-2 font-bold shadow-md transition-[scale,box-shadow] duration-150"
    :class="[
      marker.tone === 'catalog' ? 'border-dashed border-sky-600' : 'border-white',
      small ? 'size-6 text-[10px]' : 'size-8 text-xs',
      TONES[marker.tone ?? 'primary'],
      state,
    ]"
  >{{ marker.label ?? '' }}</span>
</template>
```

Ruling respecto a la spec: para `success` la burbuja es verde **con el número** (no un ✓ suelto), para que el viajero siga cruzando el punto con la lista; el verde ya dice "votado".

- [ ] **Step 3: TripMap dibuja con el componente**

En `app/components/map/TripMap.vue`:

1. Imports, después de `import type { MapBox } from '~/utils/map-bounds'`:

```ts
import { h, render, getCurrentInstance } from 'vue'
import MapMarkerDot from './MapMarkerDot.vue'
```

2. Después de `const emit = defineEmits<...>()` (antes de `defineSlots`), nada; después de la línea `const isPinned = computed(...)` agregar:

```ts
// Los puntos se montan con render(): necesitan el contexto de la app para <UIcon>
const appContext = getCurrentInstance()!.appContext
const { resolve: resolveCategory, loaded: categoriesLoaded } = usePlaceCategories()
```

3. Borrar el objeto `TONES`, la función `markerClass` y su comentario (`// El estilo va en un círculo interior…`), conservando `small` y `tripMarkers`. Reemplazar el comentario por:

```ts
// El dibujo va en MapMarkerDot, dentro del <button> que es de Mapbox: Mapbox le pone
// sus clases (mapboxgl-marker, position absolute) y lo ubica con `transform`.
// Si se le pisa className o se anima su transform, el punto salta.
```

4. En `createMarkerEl`, borrar la línea `el.appendChild(document.createElement('span'))`.

5. Reemplazar las dos primeras líneas de `paintMarker`:

```ts
  const dot = el.firstElementChild as HTMLSpanElement
  dot.className = markerClass(m)
  dot.textContent = m.label ?? ''
```

por:

```ts
  const active = m.id === activeId.value || m.id === props.highlightId
  const vnode = h(MapMarkerDot, { marker: m, category: resolveCategory(m.category), active })
  vnode.appContext = appContext
  render(vnode, el)
```

y borrar la declaración posterior duplicada `const active = m.id === activeId.value || m.id === props.highlightId` dentro de `paintMarker`.

6. En `syncMarkers`, dentro del `if (!keep.has(id))`, antes de `marker.remove()`:

```ts
      render(null, markerEls.get(id)!.el)
```

7. En `onBeforeUnmount`, reemplazar `for (const { marker } of markerEls.values()) marker.remove()` por:

```ts
  for (const { marker, el } of markerEls.values()) {
    render(null, el)
    marker.remove()
  }
```

8. Después de `watch([activeId, () => props.highlightId], syncMarkers)` agregar:

```ts
watch(categoriesLoaded, syncMarkers)
```

9. En `findNearestPoi`, reemplazar:

```ts
  const category = props?.class || props?.maki || props?.type || null
  return { name: String(name), category: category ? String(category) : null }
```

por:

```ts
  return { name: String(name), category: pickPoiCategory(props) }
```

- [ ] **Step 4: Pasar la categoría a cada punto**

- `app/composables/useCatalogInView.ts`, en `markers`, después de `title: \`${c.name} (del catálogo)\`,` agregar `category: c.category,`.
- `app/components/place/PlacesPanel.vue`, en `markers`, después de `title: p.name,` agregar `category: p.category,`.
- `app/components/itinerary/ItineraryPanel.vue`, en `markers`: en el `out.push({ ... tone: 'primary', title: p.name, })` agregar `category: p.category,`; y en el push de lugares sin parada cambiar `title: p.name, fit })` por `title: p.name, category: p.category, fit })`.
- `app/pages/v/[token].vue`: en `placeMarkers` y en `itMarkers`, después de `title: p.name,` agregar `category: p.category,`.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: `ℹ fail 0`.

Run: `npm run build`
Expected: `✨ Build complete!`.

- [ ] **Step 6: Commit**

```bash
git add shared/types/map.ts app/components/map/MapMarkerDot.vue app/components/map/TripMap.vue app/composables/useCatalogInView.ts app/components/place/PlacesPanel.vue app/components/itinerary/ItineraryPanel.vue "app/pages/v/[token].vue"
git commit -m "feat: puntos del mapa con icono y color de la categoría del lugar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Categoría en la tarjeta y selector en el formulario

**Files:**
- Modify: `app/components/map/PlaceInfoCard.vue:67-69` y script
- Modify: `app/components/place/PlaceFormModal.vue` (estado, `watch(open)`, `onSubmit`, template líneas ~231-233)

**Interfaces:**
- Consumes: Task 2 (`categoryToSave`, `OTHER_CATEGORY`), Task 3 (`usePlaceCategories`).
- Produces: nada nuevo.

- [ ] **Step 1: Badge de la tarjeta**

En `app/components/map/PlaceInfoCard.vue`, al final del `<script setup>` agregar:

```ts
// Nunca se muestra la etiqueta técnica: solo la categoría (icono, color y nombre)
const { resolve } = usePlaceCategories()
const cat = computed(() => (props.category?.trim() ? resolve(props.category) : null))
```

y reemplazar:

```vue
      <UBadge v-if="category" color="neutral" variant="subtle" size="sm" class="shrink-0 capitalize">
        {{ category }}
      </UBadge>
```

por:

```vue
      <UBadge
        v-if="cat"
        variant="subtle"
        size="sm"
        class="shrink-0"
        :icon="cat.icon"
        :style="{ color: cat.color, backgroundColor: `${cat.color}1a` }"
      >
        {{ cat.label_es }}
      </UBadge>
```

- [ ] **Step 2: Selector del formulario**

En `app/components/place/PlaceFormModal.vue`:

1. Después de `const toast = useToast()` agregar:

```ts
const { categories, loaded: categoriesLoaded, resolve: resolveCategory } = usePlaceCategories()
// La etiqueta original (de Mapbox o guardada) no se muestra: se elige una categoría.
// Si no se cambia, al guardar se conserva la etiqueta original tal cual.
const rawTag = ref<string | null>(null)
const initialKey = ref('')
const categoryItems = computed(() => categories.value.map(c => ({ label: c.label_es, value: c.key, icon: c.icon })))

function initCategory() {
  initialKey.value = categoriesLoaded.value ? resolveCategory(rawTag.value)?.key ?? OTHER_CATEGORY : ''
  state.category = categoriesLoaded.value ? initialKey.value : rawTag.value ?? ''
}
// Si las categorías llegan con el formulario ya abierto
watch(categoriesLoaded, () => { if (open.value) initCategory() })
```

2. En `watch(open, …)`, reemplazar `state.category = p?.category ?? r?.category ?? ''` por:

```ts
  rawTag.value = p?.category ?? r?.category ?? null
  initCategory()
```

3. En `onSubmit`, reemplazar `category: e.data.category.trim() || null,` por:

```ts
    category: categoriesLoaded.value
      ? categoryToSave(rawTag.value, initialKey.value, e.data.category)
      : e.data.category.trim() || null,
```

4. En el template, reemplazar:

```vue
          <UFormField label="Categoría" name="category">
            <UInput v-model="state.category" placeholder="museo, mirador, hotel…" class="w-full" :disabled="!canEditShared" />
          </UFormField>
```

por:

```vue
          <UFormField label="Categoría" name="category">
            <USelectMenu
              v-if="categoriesLoaded"
              v-model="state.category"
              :items="categoryItems"
              value-key="value"
              :search-input="{ placeholder: 'Buscar…' }"
              class="w-full"
              :disabled="!canEditShared"
            />
            <UInput v-else v-model="state.category" placeholder="museo, mirador, hotel…" class="w-full" :disabled="!canEditShared" />
          </UFormField>
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: `ℹ fail 0`.

Run: `npm run build`
Expected: `✨ Build complete!`.

- [ ] **Step 4: Commit**

```bash
git add app/components/map/PlaceInfoCard.vue app/components/place/PlaceFormModal.vue
git commit -m "feat: categoría en español en la tarjeta y selector de categoría en el formulario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Aplicar la migración y comprobar en vivo

**Files:** ninguno nuevo (posible ajuste de `shared/types/database.types.ts`).

- [ ] **Step 1: Pedir confirmación al usuario** para aplicar `20261014000002_place_categories.sql` en Supabase. No seguir sin un "sí" explícito en ese momento.

- [ ] **Step 2: Aplicar con el MCP**

`mcp__supabase__apply_migration` con `name: place_categories` y el contenido exacto del archivo.

- [ ] **Step 3: Verificar en la base**

`mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from public.place_categories) as categorias,
  (select count(*) from public.place_category_tags) as etiquetas,
  (select count(*) from public.catalog_places c
     where c.category is not null
       and not exists (select 1 from public.place_category_tags t where t.tag = lower(trim(c.category)))) as sin_categoria,
  has_table_privilege('anon', 'public.place_categories', 'select') as anon_lee,
  has_table_privilege('anon', 'public.place_categories', 'insert') as anon_escribe
```

Expected: `categorias = 13`, `etiquetas > 100`, `sin_categoria = 0`, `anon_lee = true`, `anon_escribe = false`.

- [ ] **Step 4: Comparar tipos**

`mcp__supabase__generate_typescript_types` y comparar las entradas `place_categories` y `place_category_tags` con lo agregado en Task 3; si difieren, ajustar `shared/types/database.types.ts`, correr `npm run typecheck` y hacer commit `chore: tipos de la base con las categorías de lugares`.

- [ ] **Step 5: Pedir al usuario la prueba en el navegador** con `npm run dev`:
  - Lugares e Itinerario: puntos con icono y color; fuera de votación más tenues; catálogo blanco con borde punteado; número en la burbuja.
  - Enlace de viajero: mismos iconos; burbuja verde en los votados.
  - Tarjeta: "Arte y entretenimiento", "Hoteles", etc., nunca `arts_and_entertainment`.
  - Formulario: selector con iconos; guardar sin tocarlo conserva la etiqueta; elegir "Museos" la cambia.
  - Marcar el ícono de un museo en el mapa: el formulario propone "Museos".
