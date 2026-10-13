# Rediseño visual "editorial cálido" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda la app tenga el aspecto "editorial cálido": serifa en títulos, fondo crema, acento terracota y fotografía grande, sin cambiar lógica ni datos.

**Architecture:** El tema se define una sola vez con tokens de Nuxt UI (`main.css` + `app.config.ts`), así modales, formularios y paneles cambian sin tocarlos. Dos componentes nuevos concentran lo visual que se repite: `TripCover` (portada de un viaje) y `PlaceCard` (tarjeta de lugar del viajero). La elección de la foto de portada es una función pura, `coverPhoto`, probada con `node --test`.

**Tech Stack:** Nuxt 4, Nuxt UI 4 (Tailwind 4, `@nuxt/fonts` incluido), Supabase, Mapbox GL, TypeScript. Pruebas con `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-13-rediseno-editorial-design.md`

## Global Constraints

- Rama de trabajo: `feat/presupuesto` (la actual). Mensajes de commit en español, estilo `feat: …` / `style: …` / `test: …`.
- Sin dependencias nuevas, sin migraciones, sin cambios en `server/` ni en `shared/`.
- No cambian textos existentes, validaciones, flujos ni endpoints. Los únicos textos nuevos son los que este plan escribe literalmente.
- Tipografía: Inter (`font-sans`, por defecto) y Fraunces (`font-serif`). Los títulos usan `font-serif font-semibold`; nunca `font-bold` junto a `font-serif`.
- Colores: `primary: 'terracotta'`, `success: 'sage'`, `neutral: 'stone'`. Los valores hexadecimales son los de la tabla del spec, copiados tal cual en la Task 1.
- Fondo de página: utilidad `bg-canvas` (variable `--app-canvas`). No se redefine `--ui-bg`.
- `--ui-radius: 0.125rem`. No usar radios fijos (`rounded-[…]`); `rounded-full` solo en círculos y píldoras.
- Sombras solo en elementos flotantes: tarjeta sobre el mapa, botón flotante, modales, composición de la portada pública.
- El modo oscuro debe seguir funcionando: cada `bg-white` o `text-stone-*` fijo solo va sobre foto o sobre un color fijo, nunca sobre una superficie del tema.
- Nada de lógica de diseño por JavaScript según el ancho de pantalla: los cambios celular/escritorio van por clases (`lg:`, `max-lg:`) para no romper la hidratación.
- Comandos de verificación: `npm test`, `npm run typecheck`, `npm run dev`. Antes de empezar, corre `npm test` y `npm run typecheck` y anota el resultado: ese es el estado inicial que no debe empeorar.
- La revisión en navegador necesita el `.env` del proyecto, una cuenta de administrador con al menos un viaje con lugares y el link de un viajero (pestaña Viajeros → compartir).

## Review Focus

- Foto que no carga (URL de Wikimedia o Pexels caída), antes o después de hidratar: la portada y la tarjeta caen a su variante de color y el texto sigue legible; no queda el ícono de imagen rota. → Task 3 y Task 4.
- Lugar con `photo_url` vacío (`''`) o viaje sin lugares: se trata como "sin foto"; `coverPhoto` devuelve `null` y no una cadena vacía. → Task 2.
- Viaje con nombre muy largo y sin destino: el título no se sale de la portada ni deja un separador suelto. → Task 3.
- Mapa a pantalla completa en celular: se abre, se cierra, vuelve a la lista al cambiar de pestaña y no deja la página sin scroll; al ensanchar la ventana a escritorio queda el mapa lateral normal. → Task 4.
- Modo oscuro: ninguna pantalla queda con texto oscuro sobre fondo oscuro ni con bloques blancos sueltos. → Task 6.

---

### Task 1: Tema global

**Files:**
- Modify: `app/assets/css/main.css`
- Modify: `app/app.config.ts`
- Modify: `app/layouts/default.vue`
- Modify: `app/layouts/admin.vue:22`
- Modify: `app/components/map/TripMap.vue:36,198`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Utilidades Tailwind `font-serif`, `bg-canvas`, y las escalas `terracotta-{50…950}` y `sage-{50…950}` (por ejemplo `bg-terracotta-700`).
  - Colores semánticos de Nuxt UI: `primary` = terracota, `success` = salvia.

- [ ] **Step 1: Reemplazar `app/assets/css/main.css`**

Contenido completo del archivo:

```css
@import "tailwindcss";
@import "@nuxt/ui";

/* Tema "editorial cálido". Diseño: docs/superpowers/specs/2026-10-13-rediseno-editorial-design.md */

/* @nuxt/fonts descarga estas familias al verlas aquí */
@theme {
  --font-sans: 'Inter', sans-serif;
  --font-serif: 'Fraunces', serif;
}

/* static: Nuxt UI necesita las 11 tonalidades aunque ninguna clase las use */
@theme static {
  --color-terracotta-50: #fbf4ef;
  --color-terracotta-100: #f6e5d9;
  --color-terracotta-200: #ecc9b1;
  --color-terracotta-300: #e0a682;
  --color-terracotta-400: #d38057;
  --color-terracotta-500: #c4633a;
  --color-terracotta-600: #b4532a;
  --color-terracotta-700: #944224;
  --color-terracotta-800: #783824;
  --color-terracotta-900: #633121;
  --color-terracotta-950: #35170f;

  --color-sage-50: #f3f6f2;
  --color-sage-100: #e3eae1;
  --color-sage-200: #c8d6c5;
  --color-sage-300: #a3b9a0;
  --color-sage-400: #7d997a;
  --color-sage-500: #5f7a61;
  --color-sage-600: #4a614c;
  --color-sage-700: #3c4e3e;
  --color-sage-800: #323f33;
  --color-sage-900: #2a352b;
  --color-sage-950: #151c16;
}

/* bg-canvas: fondo de página. Las superficies (tarjetas, campos, modales) siguen en --ui-bg */
@theme inline {
  --color-canvas: var(--app-canvas);
}

/* Las variables de Nuxt UI viven en @layer theme: estas reglas sin capa las pisan,
   por eso .dark repite los valores del modo oscuro. */
:root {
  --ui-radius: 0.125rem;
  /* paso 600: el texto blanco de los botones cumple contraste AA */
  --ui-primary: var(--ui-color-primary-600);
  --ui-success: var(--ui-color-success-600);
  --app-canvas: #faf6ef;
}

.dark {
  --ui-primary: var(--ui-color-primary-400);
  --ui-success: var(--ui-color-success-400);
  --app-canvas: var(--ui-color-neutral-950);
}

body {
  background-color: var(--app-canvas);
}
```

- [ ] **Step 2: Reemplazar `app/app.config.ts`**

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'terracotta',
      success: 'sage',
      neutral: 'stone',
    },
  },
})
```

- [ ] **Step 3: Fondo de los layouts**

En `app/layouts/default.vue`, cambia `bg-default` por `bg-canvas`:

```vue
<template>
  <div class="min-h-dvh bg-canvas">
    <slot />
  </div>
</template>
```

En `app/layouts/admin.vue`, cambia la línea del contenedor raíz:

```vue
  <div class="min-h-dvh bg-canvas">
```

(antes: `<div class="min-h-dvh bg-muted/40">`).

- [ ] **Step 4: Colores fijos del mapa**

En `app/components/map/TripMap.vue`:

```ts
// terracotta-600 (no se puede usar una clase: Mapbox pinta la línea en el canvas)
const ROUTE_COLOR = '#b4532a'
```

y en `syncPendingPin`:

```ts
  // terracotta-400
  if (!pendingMarker) pendingMarker = new mapboxgl.Marker({ color: '#d38057' })
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck` y `npm test`
Expected: mismo resultado que el estado inicial.

Run: `npm run dev` y abre `/login`.
Expected: fondo crema, tarjeta blanca, botón "Ingresar" terracota con texto blanco, texto en Inter. En las herramientas del navegador, pestaña Red, aparecen archivos de fuente de Inter; `getComputedStyle(document.body).fontFamily` empieza con `Inter`.

Abre `/admin/viajes/<id>?tab=itinerario` y elige un día con dos o más paradas.
Expected: la línea de la ruta y los marcadores son terracota.

Cambia el sistema a modo oscuro y recarga `/login`.
Expected: fondo casi negro cálido, tarjeta un tono más clara, botón terracota claro con texto oscuro.

- [ ] **Step 6: Commit**

```bash
git add app/assets/css/main.css app/app.config.ts app/layouts/default.vue app/layouts/admin.vue app/components/map/TripMap.vue
git commit -m "style: tema editorial cálido (tipografía, paleta, fondo y colores del mapa)"
```

---

### Task 2: Funciones puras (`coverPhoto`, `placePhoto`, `dayChipParts`)

**Files:**
- Modify: `app/utils/image.ts` (agregar al final)
- Modify: `app/utils/dates.ts` (agregar después de `formatDayShort`)
- Test: `tests/cover.test.ts` (nuevo)
- Test: `tests/dates.test.ts` (nuevo)

**Interfaces:**
- Consumes: nada.
- Produces (auto-importadas por Nuxt desde `app/utils`):
  - `interface CoverCandidate { photo_url?: string | null, info?: { photo_url?: string | null } | null, vote_count?: number | null }`
  - `placePhoto(p: CoverCandidate): string | null`
  - `coverPhoto(places: CoverCandidate[]): string | null`
  - `dayChipParts(day: string): { weekday: string, num: string }`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `tests/cover.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverPhoto, placePhoto } from '../app/utils/image.ts'

test('placePhoto: usa la foto subida y, si falta, la de la ficha', () => {
  assert.equal(placePhoto({ photo_url: 'a.jpg', info: { photo_url: 'wiki.jpg' } }), 'a.jpg')
  assert.equal(placePhoto({ photo_url: null, info: { photo_url: 'wiki.jpg' } }), 'wiki.jpg')
  assert.equal(placePhoto({ photo_url: null, info: null }), null)
  assert.equal(placePhoto({}), null)
})

test('placePhoto: una URL vacía cuenta como sin foto', () => {
  assert.equal(placePhoto({ photo_url: '', info: { photo_url: '' } }), null)
  assert.equal(placePhoto({ photo_url: '', info: { photo_url: 'wiki.jpg' } }), 'wiki.jpg')
})

test('coverPhoto: gana el lugar más votado que tenga foto', () => {
  assert.equal(coverPhoto([
    { photo_url: 'a.jpg', vote_count: 1 },
    { photo_url: 'b.jpg', vote_count: 5 },
    { photo_url: 'c.jpg', vote_count: 3 },
  ]), 'b.jpg')
})

test('coverPhoto: salta al más votado si no tiene foto', () => {
  assert.equal(coverPhoto([
    { photo_url: null, vote_count: 9 },
    { photo_url: 'b.jpg', vote_count: 2 },
  ]), 'b.jpg')
})

test('coverPhoto: en un empate gana el primero de la lista', () => {
  assert.equal(coverPhoto([
    { photo_url: 'a.jpg', vote_count: 2 },
    { photo_url: 'b.jpg', vote_count: 2 },
  ]), 'a.jpg')
})

test('coverPhoto: sin votos, el primero con foto', () => {
  assert.equal(coverPhoto([
    { photo_url: null },
    { photo_url: null, info: { photo_url: 'wiki.jpg' } },
    { photo_url: 'c.jpg' },
  ]), 'wiki.jpg')
})

test('coverPhoto: sin fotos o sin lugares devuelve null', () => {
  assert.equal(coverPhoto([{ photo_url: null, vote_count: 4 }, { photo_url: '' }]), null)
  assert.equal(coverPhoto([]), null)
})
```

Crea `tests/dates.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayChipParts } from '../app/utils/dates.ts'

test('dayChipParts: día de la semana corto sin punto y número sin cero', () => {
  // 2027-04-12 es lunes
  assert.deepEqual(dayChipParts('2027-04-12'), { weekday: 'lun', num: '12' })
  assert.deepEqual(dayChipParts('2027-04-03'), { weekday: 'sáb', num: '3' })
})
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `npm test`
Expected: FAIL en `tests/cover.test.ts` y `tests/dates.test.ts` porque `coverPhoto`, `placePhoto` y `dayChipParts` no están exportadas. Las pruebas de `tests/budget.test.ts` siguen pasando.

- [ ] **Step 3: Implementar**

Agrega al final de `app/utils/image.ts`:

```ts
/** Lo mínimo de un lugar para elegir su foto */
export interface CoverCandidate {
  photo_url?: string | null
  info?: { photo_url?: string | null } | null
  vote_count?: number | null
}

/** Mejor foto disponible de un lugar: la subida y, si falta, la de su ficha */
export function placePhoto(p: CoverCandidate): string | null {
  return p.photo_url || p.info?.photo_url || null
}

/**
 * Foto de portada de un viaje: la del lugar más votado que tenga foto.
 * En un empate (o sin votos) gana el primero de la lista.
 */
export function coverPhoto(places: CoverCandidate[]): string | null {
  let best: string | null = null
  let bestVotes = -1
  for (const p of places) {
    const url = placePhoto(p)
    if (!url) continue
    const votes = p.vote_count ?? 0
    if (votes > bestVotes) {
      best = url
      bestVotes = votes
    }
  }
  return best
}
```

Agrega en `app/utils/dates.ts`, justo después de `formatDayShort`:

```ts
/** Partes de la ficha de un día del itinerario: { weekday: 'lun', num: '12' } */
export function dayChipParts(day: string): { weekday: string, num: string } {
  const d = dayToDate(day)
  return {
    weekday: fmt('UTC', 'chipWeekday', { weekday: 'short' }).format(d).replace(/\./g, ''),
    num: String(d.getUTCDate()),
  }
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Run: `npm test`
Expected: PASS en todas, incluidas las 8 nuevas.

Run: `npm run typecheck`
Expected: mismo resultado que el estado inicial.

- [ ] **Step 5: Commit**

```bash
git add app/utils/image.ts app/utils/dates.ts tests/cover.test.ts tests/dates.test.ts
git commit -m "feat: elegir la foto de portada del viaje y partes de la ficha de día"
```

---

### Task 3: `TripCover` y panel admin

**Files:**
- Create: `app/components/trip/TripCover.vue`
- Modify: `app/components/trip/TripCard.vue` (archivo completo)
- Modify: `app/pages/admin/index.vue`
- Modify: `app/pages/admin/viajes/[id].vue`
- Modify: `app/layouts/admin.vue`

**Interfaces:**
- Consumes: `coverPhoto(places: CoverCandidate[]): string | null` (Task 2); utilidades `font-serif`, `bg-canvas`, `bg-terracotta-*` (Task 1); `usePlacePhotoUrl()` de `app/composables/useDb.ts`, que devuelve `(path: string | null | undefined) => string | null`.
- Produces:
  - `<TripCover>` con props `name: string`, `destination?: string | null`, `dateRange?: string | null`, `photoUrl?: string | null`, `size?: 'full' | 'band' | 'card'` (por defecto `'full'`); slots `eyebrow` y por defecto. Las clases que se le pasen caen en su elemento raíz.
  - `<TripCard>` gana la prop `photoUrl?: string | null`.

- [ ] **Step 1: Crear `app/components/trip/TripCover.vue`**

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  destination?: string | null
  /** texto ya formateado, ej. "10 al 20 de abril de 2027" */
  dateRange?: string | null
  photoUrl?: string | null
  /** full: vista del viajero · band: detalle del admin · card: tarjeta de la lista */
  size?: 'full' | 'band' | 'card'
}>(), {
  destination: null,
  dateRange: null,
  photoUrl: null,
  size: 'full',
})

const SIZES = {
  full: {
    root: '',
    inner: 'mx-auto flex min-h-88 max-w-7xl flex-col justify-end px-4 pb-16 pt-14 sm:min-h-112 sm:pb-20',
    title: 'text-4xl sm:text-6xl',
    meta: 'mt-3 text-base',
  },
  band: {
    root: 'rounded-md',
    inner: 'flex min-h-44 flex-col justify-end p-5 sm:min-h-52 sm:p-8',
    title: 'text-3xl sm:text-4xl',
    meta: 'mt-2 text-sm',
  },
  card: {
    root: 'aspect-[16/10]',
    inner: 'absolute inset-0 flex flex-col justify-end p-4',
    title: 'line-clamp-3 text-xl',
    meta: 'mt-1 text-sm',
  },
} as const

const img = ref<HTMLImageElement | null>(null)
const failed = ref(false)
watch(() => props.photoUrl, () => { failed.value = false })
// Si la foto falló antes de hidratar, el evento error ya pasó
onMounted(() => {
  if (img.value?.complete && !img.value.naturalWidth) failed.value = true
})
const showPhoto = computed(() => !!props.photoUrl && !failed.value)
</script>

<template>
  <!-- El color de fondo es la variante sin foto, y lo que queda si la foto no carga -->
  <div
    class="relative isolate overflow-hidden bg-terracotta-700 text-white dark:bg-terracotta-900"
    :class="SIZES[size].root"
  >
    <img
      v-if="showPhoto"
      ref="img"
      :src="photoUrl!"
      alt=""
      class="absolute inset-0 -z-20 size-full object-cover"
      :loading="size === 'full' ? 'eager' : 'lazy'"
      @error="failed = true"
    >
    <div v-if="showPhoto" class="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />

    <div :class="SIZES[size].inner">
      <div v-if="$slots.eyebrow" class="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/90">
        <slot name="eyebrow" />
      </div>
      <component
        :is="size === 'card' ? 'h3' : 'h1'"
        class="font-serif font-semibold leading-tight text-balance"
        :class="SIZES[size].title"
      >
        {{ name }}
      </component>
      <p v-if="destination || dateRange" class="flex flex-wrap gap-x-4 gap-y-1 text-white/85" :class="SIZES[size].meta">
        <span v-if="destination" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-globe" class="size-4 shrink-0" />
          {{ destination }}
        </span>
        <span v-if="dateRange" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-calendar-range" class="size-4 shrink-0" />
          {{ dateRange }}
        </span>
      </p>
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Reemplazar `app/components/trip/TripCard.vue`**

```vue
<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

defineProps<{
  trip: Tables<'trips'> & { members: { count: number }[], places: { count: number }[] }
  isOwner: boolean
  photoUrl?: string | null
}>()
</script>

<template>
  <NuxtLink
    :to="`/admin/viajes/${trip.id}`"
    class="group block h-full overflow-hidden rounded-md bg-default ring ring-default transition hover:ring-2 hover:ring-primary/50"
  >
    <TripCover :name="trip.name" :destination="trip.destination" :photo-url="photoUrl" size="card">
      <template v-if="!isOwner" #eyebrow>
        <span class="rounded-full bg-white/20 px-2 py-0.5 normal-case tracking-normal backdrop-blur">
          Co-admin
        </span>
      </template>
    </TripCover>
    <div class="p-4">
      <p class="flex items-center gap-1.5 text-sm">
        <UIcon name="i-lucide-calendar-range" class="size-4 shrink-0 text-primary" />
        {{ formatDateRange(trip.start_date, trip.end_date) }}
      </p>
      <p class="mt-1 text-xs text-dimmed">
        {{ tripCountdown(trip.start_date, trip.end_date, trip.time_zone) }}
        · {{ tripLength(trip.start_date, trip.end_date) }} días
      </p>
      <div class="mt-4 flex gap-4 text-sm">
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-users" class="size-4 text-primary" />
          {{ trip.members[0]?.count ?? 0 }} viajeros
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-map-pin" class="size-4 text-primary" />
          {{ trip.places[0]?.count ?? 0 }} lugares
        </span>
      </div>
    </div>
  </NuxtLink>
</template>
```

- [ ] **Step 3: Lista de viajes (`app/pages/admin/index.vue`)**

En el `<script setup>`, reemplaza el tipo `TripRow` y la consulta, y agrega `coverOf`:

```ts
type CoverPlace = { id: string, photo_path: string | null, sort_order: number, created_at: string }
type TripRow = Tables<'trips'> & {
  members: { count: number }[]
  places: { count: number }[]
  cover_places: CoverPlace[]
  cover_info: { place_id: string, photo_url: string | null }[]
}

const { client, userId } = useDb()
const photoUrl = usePlacePhotoUrl()
const createOpen = ref(false)

const { data: trips, status } = await useAsyncData('admin-trips', async () => {
  const { data, error } = await client
    .from('trips')
    .select('*, members(count), places(count), cover_places:places(id, photo_path, sort_order, created_at), cover_info:place_info(place_id, photo_url)')
    .order('start_date', { ascending: true })
  if (error) throw error
  return data as unknown as TripRow[]
})

/** Portada de un viaje: el primer lugar, en el orden del organizador, que tenga foto */
function coverOf(t: TripRow) {
  const info = new Map(t.cover_info.map(i => [i.place_id, i]))
  const ordered = [...t.cover_places].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  return coverPhoto(ordered.map(p => ({ photo_url: photoUrl(p.photo_path), info: info.get(p.id) })))
}
```

(`upcoming`, `past` y `onCreated` quedan como están.)

En el `<template>`:

- El título: `<h1 class="font-serif text-3xl font-semibold">` (antes `text-2xl font-bold`).
- El esqueleto de carga: `<USkeleton v-for="i in 3" :key="i" class="h-72 rounded-md" />` (antes `h-40 rounded-lg`).
- Las dos apariciones de `<TripCard …>` ganan la prop de la foto:

```vue
<TripCard v-for="t in upcoming" :key="t.id" :trip="t" :is-owner="t.owner_id === userId" :photo-url="coverOf(t)" />
```

```vue
<TripCard v-for="t in past" :key="t.id" :trip="t" :is-owner="t.owner_id === userId" :photo-url="coverOf(t)" />
```

- [ ] **Step 4: Detalle del viaje (`app/pages/admin/viajes/[id].vue`)**

En el `<script setup>`, después de `const editOpen = ref(false)`:

```ts
// Misma portada que ve el viajero: el lugar más votado que tenga foto
const photoUrl = usePlacePhotoUrl()
const coverUrl = computed(() => coverPhoto(ctx.places.value.map(p => ({
  photo_url: photoUrl(p.photo_path),
  info: ctx.placeInfoByPlace.value.get(p.id),
  vote_count: ctx.votersByPlace.value.get(p.id)?.length ?? 0,
}))))
```

En el `<template>`, reemplaza desde `<UButton to="/admin" …>` hasta el cierre del bloque `<div class="mb-6 flex flex-wrap items-start justify-between gap-4">…</div>` (todo lo que está antes de `<UTabs`) por:

```vue
    <div class="mb-3 flex items-center justify-between gap-3">
      <UButton to="/admin" color="neutral" variant="link" icon="i-lucide-arrow-left" class="-ml-2.5">
        Mis viajes
      </UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-pencil" @click="editOpen = true">
        Editar
      </UButton>
    </div>

    <TripCover
      :name="trip.name"
      :destination="trip.destination"
      :date-range="formatDateRange(trip.start_date, trip.end_date)"
      :photo-url="coverUrl"
      size="band"
    />

    <div class="mb-6 mt-4 flex flex-wrap gap-2">
      <UBadge v-if="isClosed" color="neutral" variant="subtle" icon="i-lucide-lock">
        Confirmación y votación cerradas
      </UBadge>
      <UBadge v-else color="primary" variant="subtle" icon="i-lucide-clock">
        Confirman y votan hasta {{ formatShortDateTime(trip.rsvp_deadline, tz) }}
      </UBadge>
      <UBadge v-if="trip.itinerary_published" color="success" variant="subtle" icon="i-lucide-eye">
        Itinerario publicado
      </UBadge>
      <UBadge v-else color="warning" variant="subtle" icon="i-lucide-eye-off">
        Itinerario oculto
      </UBadge>
      <UBadge v-if="trip.budget_published" color="success" variant="subtle" icon="i-lucide-eye">
        Presupuesto publicado
      </UBadge>
      <UBadge v-else color="warning" variant="subtle" icon="i-lucide-eye-off">
        Presupuesto oculto
      </UBadge>
    </div>
```

`<UTabs>` y todo lo que sigue no cambia.

- [ ] **Step 5: Cabecera del layout admin (`app/layouts/admin.vue`)**

Reemplaza el `<header>` completo por:

```vue
    <header class="sticky top-0 z-40 border-b border-default bg-canvas/90 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between gap-4">
        <NuxtLink to="/admin" class="flex items-center gap-2">
          <UIcon name="i-lucide-plane" class="size-5 text-primary" />
          <span class="font-serif text-xl font-semibold">Viajes</span>
        </NuxtLink>

        <UDropdownMenu :items="userMenu" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-circle-user"
            :label="(user?.email as string) ?? ''"
            :ui="{ label: 'hidden sm:inline max-w-48 truncate' }"
          />
        </UDropdownMenu>
      </UContainer>
    </header>
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck` y `npm test`
Expected: sin errores nuevos; todas las pruebas pasan.

Run: `npm run dev`, entra con la cuenta de administrador y abre `/admin`.
Expected:
- La lista carga sin aviso de error (la consulta con `cover_places` y `cover_info` responde).
- Cada viaje con lugares con foto muestra esa foto arriba, con el nombre en serifa blanca encima; un viaje sin fotos muestra el bloque terracota.
- Un viaje donde eres co-administrador muestra la píldora "Co-admin" sobre la portada.

Abre un viaje.
Expected: fila con "Mis viajes" a la izquierda y "Editar" a la derecha; portada baja con nombre, destino y fechas; insignias debajo; las pestañas funcionan igual que antes y "Editar" abre el formulario.

Prueba de foto caída: en `app/pages/admin/viajes/[id].vue` cambia temporalmente `:photo-url="coverUrl"` por `photo-url="https://example.invalid/x.jpg"` y recarga.
Expected: portada terracota lisa con el texto legible, sin ícono de imagen rota. **Deshaz el cambio.**

Prueba de nombre largo: edita un viaje, ponle un nombre de más de 80 caracteres y deja el destino vacío.
Expected: en la lista el título se corta a tres líneas dentro de la portada; en el detalle se reparte en varias líneas sin salirse; no aparece el ícono del globo ni un separador suelto. Restaura el nombre.

- [ ] **Step 7: Commit**

```bash
git add app/components/trip/TripCover.vue app/components/trip/TripCard.vue app/pages/admin/index.vue "app/pages/admin/viajes/[id].vue" app/layouts/admin.vue
git commit -m "feat: portada con foto en la lista y el detalle de viajes del admin"
```

---

### Task 4: `PlaceCard` y vista del viajero

**Files:**
- Create: `app/components/place/PlaceCard.vue`
- Modify: `app/pages/v/[token].vue`

**Interfaces:**
- Consumes: `coverPhoto`, `placePhoto`, `dayChipParts` (Task 2); `<TripCover>` (Task 3); `MemberPlace` de `shared/types/trip.ts`.
- Produces:
  - `<PlaceCard>` con props `place: MemberPlace`, `order: number`, `canVote: boolean`, `busy: string | null` (id del lugar cuyo voto se está guardando), `active: boolean`, `showItineraryBadge: boolean`; eventos `vote`, `select`, `detail` (sin argumentos) y `hover` (`on: boolean`).

- [ ] **Step 1: Crear `app/components/place/PlaceCard.vue`**

```vue
<script setup lang="ts">
import type { MemberPlace } from '~~/shared/types/trip'

const props = defineProps<{
  place: MemberPlace
  /** número del lugar en el orden del organizador */
  order: number
  canVote: boolean
  /** id del lugar cuyo voto se está guardando, o null */
  busy: string | null
  /** resaltado: seleccionado o bajo el mouse, en la lista o en el mapa */
  active: boolean
  showItineraryBadge: boolean
}>()

const emit = defineEmits<{
  vote: []
  select: []
  detail: []
  hover: [on: boolean]
}>()

const img = ref<HTMLImageElement | null>(null)
const failed = ref(false)
const source = computed(() => placePhoto(props.place))
watch(source, () => { failed.value = false })
// Si la foto falló antes de hidratar, el evento error ya pasó
onMounted(() => {
  if (img.value?.complete && !img.value.naturalWidth) failed.value = true
})
const photo = computed(() => failed.value ? null : source.value)
</script>

<template>
  <article
    class="flex flex-col overflow-hidden rounded-md bg-default transition"
    :class="[place.voted ? 'ring-2 ring-success' : 'ring ring-default', active ? 'shadow-lg' : '']"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
  >
    <div class="relative">
      <button
        type="button"
        class="block aspect-[4/3] w-full bg-elevated text-left"
        :aria-label="`Ver ${place.name} en el mapa`"
        @click="emit('select')"
      >
        <img
          v-if="photo"
          ref="img"
          :src="photo"
          :alt="place.name"
          class="size-full object-cover"
          loading="lazy"
          @error="failed = true"
        >
        <span v-else class="flex size-full items-center justify-center bg-terracotta-100 dark:bg-terracotta-950">
          <UIcon name="i-lucide-map-pin" class="size-10 text-primary/60" />
        </span>
      </button>

      <span
        class="pointer-events-none absolute left-2 top-2 flex size-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow"
        :class="place.voted ? 'bg-success' : 'bg-primary'"
      >
        {{ order }}
      </span>
      <UBadge
        v-if="showItineraryBadge"
        color="neutral"
        class="pointer-events-none absolute bottom-2 left-2"
        icon="i-lucide-calendar-check"
        size="sm"
      >
        En el itinerario
      </UBadge>

      <!-- Hermano del botón de la foto, no hijo: un botón no puede ir dentro de otro -->
      <UButton
        v-if="canVote"
        icon="i-lucide-heart"
        size="lg"
        :color="place.voted ? 'success' : 'neutral'"
        variant="solid"
        class="absolute right-2 top-2 rounded-full shadow-md"
        :class="place.voted ? '' : 'bg-white text-stone-900 hover:bg-stone-100 active:bg-stone-100'"
        :loading="busy === place.id"
        :disabled="!!busy && busy !== place.id"
        :aria-pressed="place.voted"
        :aria-label="place.voted ? `Quitar mi voto a ${place.name}` : `Votar por ${place.name}`"
        @click="emit('vote')"
      />
    </div>

    <div class="flex flex-1 flex-col p-4">
      <h3 class="font-serif text-lg font-semibold leading-snug">
        {{ place.name }}
      </h3>
      <p v-if="place.address" class="mt-0.5 line-clamp-1 text-xs text-muted">
        {{ place.address }}
      </p>
      <p v-if="place.info?.history" class="mt-2 line-clamp-3 text-sm text-muted">
        {{ place.info.history }}
      </p>
      <p v-else-if="place.description" class="mt-2 line-clamp-3 text-sm text-muted">
        {{ place.description }}
      </p>
      <div class="mt-auto flex items-center justify-between gap-2 pt-4">
        <span class="flex items-center gap-1.5 text-sm font-medium">
          <UIcon name="i-lucide-heart" class="size-4" :class="place.voted ? 'text-success' : 'text-primary'" />
          {{ place.vote_count }} {{ place.vote_count === 1 ? 'voto' : 'votos' }}
        </span>
        <UButton size="sm" color="neutral" variant="link" class="-mr-2.5" @click="emit('detail')">
          Ver ficha
        </UButton>
      </div>
    </div>
  </article>
</template>
```

- [ ] **Step 2: Script de `app/pages/v/[token].vue`**

a) Reemplaza la declaración de `tab`:

```ts
type Tab = 'lugares' | 'itinerario' | 'presupuesto'
const tab = ref<Tab>('lugares')
function setTab(v: string | number) {
  tab.value = v as Tab
}
```

b) Después de `const detailOpen = computed(…)` agrega:

```ts
// Mapa a pantalla completa en celular (en escritorio el mapa siempre está a la vista)
const mapOpen = ref(false)
watch(tab, () => { mapOpen.value = false })
useHead({ bodyAttrs: { class: () => mapOpen.value ? 'max-lg:overflow-hidden' : '' } })

function showOnMap(id: string) {
  selectedId.value = id
  mapOpen.value = true
}
```

c) Después de `const myVotes = computed(…)` agrega:

```ts
const coverUrl = computed(() => coverPhoto(places.value ?? []))

const tabItems = computed(() => [
  { label: 'Lugares', icon: 'i-lucide-map-pin', value: 'lugares', count: votable.value.length, locked: false },
  { label: 'Itinerario', icon: 'i-lucide-calendar-days', value: 'itinerario', count: 0, locked: !view.value?.itinerary_published },
  { label: 'Presupuesto', icon: 'i-lucide-wallet', value: 'presupuesto', count: 0, locked: !view.value?.budget_published },
])
```

d) Reemplaza `dayChips`:

```ts
const dayChips = computed(() => days.value.map((d, i) => ({
  value: d,
  ...dayChipParts(d),
  today: d === today.value,
  label: `Día ${i + 1}: ${formatDay(d, true)}${d === today.value ? ' (hoy)' : ''}`,
})))
```

- [ ] **Step 3: Portada, confirmación y pestañas**

a) En el bloque "Link inválido", el título pasa a `<h1 class="mt-4 font-serif text-2xl font-semibold">`.

b) Reemplaza el `<header class="bg-gradient-to-br …">…</header>` completo por:

```vue
      <!-- Portada -->
      <TripCover
        :name="trip.name"
        :destination="trip.destination"
        :date-range="formatDateRange(trip.start_date, trip.end_date)"
        :photo-url="coverUrl"
        size="full"
      >
        <template #eyebrow>
          <UIcon name="i-lucide-plane" class="size-3.5" />
          {{ tripCountdown(trip.start_date, trip.end_date, trip.time_zone) }}
        </template>
        <p class="mt-6 text-lg">
          Hola, <span class="font-semibold">{{ me.name }}</span> 👋
        </p>
        <p v-if="trip.description" class="mt-2 max-w-2xl whitespace-pre-line text-white/85">
          {{ trip.description }}
        </p>
      </TripCover>
```

c) La raíz de la página pasa de `<div class="min-h-dvh bg-default">` a `<div class="min-h-dvh bg-canvas">`.

d) `<main class="mx-auto max-w-5xl px-4 pb-16">` pasa a `<main class="mx-auto max-w-7xl px-4 pb-24">`.

e) La tarjeta de confirmación pasa de `<UCard class="-mt-6 shadow-lg">` a `<UCard class="relative -mt-8 shadow-lg">`. Su contenido no cambia, salvo que los dos textos principales (`¿Te sumas al viaje?…` y `¡Estás dentro del viaje!`) y `Gracias por avisar` ganan `font-serif`:

```vue
<p class="font-serif text-xl font-semibold">
```

f) Reemplaza el bloque `<!-- Pestañas -->` completo (el `<div class="mt-8 flex gap-1 border-b border-default">` con su `v-for`) por:

```vue
        <!-- Pestañas -->
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          variant="link"
          class="mt-8"
          :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
          @update:model-value="setTab"
        >
          <template #trailing="{ item }">
            <UBadge v-if="item.count" size="sm" color="neutral" variant="subtle">
              {{ item.count }}
            </UBadge>
            <UIcon v-if="item.locked" name="i-lucide-lock" class="size-3.5" />
          </template>
        </UTabs>
```

Las tres `<section v-show="tab === …">` siguen siendo las que muestran el contenido.

- [ ] **Step 4: Sección de lugares**

Dentro de `<section v-show="tab === 'lugares'">`:

a) El título pasa a `<h2 class="font-serif text-2xl font-semibold">`.

b) El `UEmpty` cambia `rounded-lg` por `rounded-md`.

c) Reemplaza el `<template v-else>…</template>` completo (el que contiene el mapa y la grilla de `<article>`) por:

```vue
          <template v-else>
            <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-6">
              <div class="grid gap-4 sm:grid-cols-2">
                <PlaceCard
                  v-for="p in sortedVotable"
                  :key="p.id"
                  :place="p"
                  :order="orderOf.get(p.id)!"
                  :can-vote="canVote"
                  :busy="busy"
                  :active="hoverId === p.id || selectedId === p.id"
                  :show-itinerary-badge="p.in_itinerary && view.itinerary_published"
                  @vote="toggleVote(p)"
                  @select="showOnMap(p.id)"
                  @detail="detail = p"
                  @hover="hoverId = $event ? p.id : null"
                />
              </div>

              <!-- Un solo mapa: lateral y fijo en escritorio; a pantalla completa en celular cuando mapOpen -->
              <div
                class="lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]"
                :class="mapOpen ? 'max-lg:fixed max-lg:inset-0 max-lg:z-40' : 'max-lg:hidden'"
              >
                <div class="size-full overflow-hidden bg-default lg:rounded-md lg:border lg:border-default">
                  <TripMap
                    :markers="placeMarkers"
                    :selected-id="selectedId"
                    :highlight-id="hoverId"
                    @select="selectedId = $event"
                  >
                    <template #card="{ marker, pinned, close }">
                      <UCard v-if="placeById.get(marker.id)" :ui="{ body: 'p-3 sm:p-3 max-h-[240px] overflow-y-auto', footer: 'px-3 py-2 sm:px-3' }" class="shadow-xl">
                        <PlaceInfoCard
                          :name="placeById.get(marker.id)!.name"
                          :address="placeById.get(marker.id)!.address"
                          :category="placeById.get(marker.id)!.category"
                          :photo-url="placeById.get(marker.id)!.photo_url"
                          :info="placeById.get(marker.id)!.info"
                          compact
                        />
                        <template #footer>
                          <div class="flex items-center justify-between gap-2">
                            <span class="flex items-center gap-1 text-xs font-medium">
                              <UIcon name="i-lucide-heart" class="size-3.5 text-primary" />
                              {{ placeById.get(marker.id)!.vote_count }} {{ placeById.get(marker.id)!.vote_count === 1 ? 'voto' : 'votos' }}
                            </span>
                            <div v-if="pinned" class="flex gap-1">
                              <UButton
                                v-if="canVote"
                                size="xs"
                                :color="placeById.get(marker.id)!.voted ? 'success' : 'primary'"
                                :variant="placeById.get(marker.id)!.voted ? 'soft' : 'solid'"
                                :icon="placeById.get(marker.id)!.voted ? 'i-lucide-check' : 'i-lucide-heart'"
                                :loading="busy === marker.id"
                                @click="toggleVote(placeById.get(marker.id)!)"
                              >
                                {{ placeById.get(marker.id)!.voted ? 'Votado' : 'Votar' }}
                              </UButton>
                              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Cerrar" @click="close" />
                            </div>
                          </div>
                        </template>
                      </UCard>
                    </template>
                  </TripMap>
                </div>
              </div>
            </div>

            <!-- Arriba cuando el mapa está abierto: abajo va la ficha del lugar seleccionado -->
            <UButton
              class="fixed left-1/2 z-50 -translate-x-1/2 rounded-full shadow-lg lg:hidden"
              :class="mapOpen ? 'top-4' : 'bottom-5'"
              color="neutral"
              size="lg"
              :icon="mapOpen ? 'i-lucide-list' : 'i-lucide-map'"
              @click="mapOpen = !mapOpen"
            >
              {{ mapOpen ? 'Ver lista' : 'Ver mapa' }}
            </UButton>
          </template>
```

- [ ] **Step 5: Itinerario y presupuesto**

a) En la sección de itinerario, reemplaza el bloque de los botones de día (`<div class="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">…</div>`) por:

```vue
            <div class="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                class="flex min-w-14 shrink-0 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition"
                :class="itDay === 'all' ? 'border-primary bg-primary text-inverted' : 'border-default bg-default hover:border-primary/50'"
                :aria-pressed="itDay === 'all'"
                @click="itDay = 'all'"
              >
                Todo
              </button>
              <button
                v-for="c in dayChips"
                :key="c.value"
                type="button"
                class="flex min-w-14 shrink-0 flex-col items-center rounded-md border px-3 py-1.5 transition"
                :class="itDay === c.value ? 'border-primary bg-primary text-inverted' : 'border-default bg-default hover:border-primary/50'"
                :aria-pressed="itDay === c.value"
                :aria-label="c.label"
                @click="itDay = c.value"
              >
                <span class="text-[11px] uppercase tracking-wide opacity-80">{{ c.weekday }}</span>
                <span class="font-serif text-lg font-semibold leading-none">{{ c.num }}</span>
                <span class="mt-1 size-1 rounded-full" :class="c.today ? (itDay === c.value ? 'bg-current' : 'bg-primary') : 'bg-transparent'" />
              </button>
            </div>
```

b) En la misma sección, el contenedor del mapa cambia `rounded-xl` por `rounded-md`:

```vue
                <div class="h-72 overflow-hidden rounded-md border border-default sm:h-[420px] lg:sticky lg:top-4">
```

c) Los dos `UEmpty` de itinerario y los dos de presupuesto cambian `rounded-lg` por `rounded-md`.

d) En la sección de presupuesto, las tres tarjetas de resumen cambian así (mismo contenido, clases nuevas):

- `<UCard :ui="{ body: 'p-4 sm:p-4' }">` → `<UCard :ui="{ body: 'p-5 sm:p-6' }">` en las tres.
- La etiqueta de arriba: `<p class="text-xs text-muted">` → `<p class="text-xs font-medium uppercase tracking-wide text-muted">`.
- La cifra: `class="mt-1 text-xl font-bold"` → `class="mt-2 font-serif text-3xl font-semibold"`. En la tercera tarjeta se conserva el `:class` de color (`text-success` / `text-error`).
- La línea de abajo: `<p class="text-xs text-muted">` → `<p class="mt-1 text-xs text-muted">`.

e) El título "Cuentas del grupo" pasa a `<h3 class="font-serif text-lg font-semibold">`.

- [ ] **Step 6: Verificar**

Run: `npm run typecheck` y `npm test`
Expected: sin errores nuevos; todas las pruebas pasan.

Run: `npm run dev` y abre el link de un viajero (`/v/<token>`), ventana a 1280 px de ancho.
Expected:
- Portada con la foto del lugar más votado, título en serifa, cuenta regresiva arriba; tarjeta de confirmación montada sobre el borde inferior.
- Pestañas con contador en Lugares y candado en las no publicadas; cambiar de pestaña funciona.
- Lugares: tarjetas en dos columnas a la izquierda y mapa fijo a la derecha que no se va al bajar. Pasar el mouse por una tarjeta resalta su punto; hacer clic en un punto abre su ficha y resalta la tarjeta.
- El corazón sobre la foto vota y desvota; votado queda verde salvia con borde en la tarjeta; el conteo se actualiza. Con la votación cerrada o sin confirmar, el corazón no aparece.
- Un lugar sin foto subida pero con foto en su ficha muestra la de la ficha.
- Itinerario (si está publicado): fichas "Todo", "lun 12", …; la activa en terracota; el día de hoy con un punto.
- Presupuesto (si está publicado): tres cifras grandes en serifa.

Ventana a 375 px de ancho (modo dispositivo del navegador), pestaña Lugares:
- Solo se ve la lista, en una columna, con el botón "Ver mapa" flotando abajo.
- "Ver mapa" abre el mapa a pantalla completa, con los puntos encuadrados; el botón pasa arriba y dice "Ver lista"; la página de fondo no se desplaza.
- Tocar un punto abre su ficha abajo, sin taparse con el botón.
- Tocar la foto de una tarjeta abre el mapa con ese lugar seleccionado.
- Con el mapa abierto, cambiar el ancho a 1280 px: queda el diseño de dos columnas, sin mapa a pantalla completa, y la página se desplaza.
- Volver a 375 px, abrir el mapa, tocar "Ver lista", ir a Itinerario y volver a Lugares: se ve la lista y la página se desplaza.

Prueba de foto caída: en `app/components/place/PlaceCard.vue` cambia temporalmente `:src="photo"` por `src="https://example.invalid/x.jpg"` y recarga.
Expected: todas las tarjetas muestran el bloque de color con el pin, con la misma altura que antes. **Deshaz el cambio.**

Abre `/v/token-que-no-existe`.
Expected: "Link no encontrado" con título en serifa sobre fondo crema.

- [ ] **Step 7: Commit**

```bash
git add app/components/place/PlaceCard.vue "app/pages/v/[token].vue"
git commit -m "feat: vista del viajero con portada, tarjetas de lugar y mapa lateral"
```

---

### Task 5: Portada pública, ingreso, registro y error

**Files:**
- Create: `app/layouts/auth.vue`
- Modify: `app/pages/index.vue` (archivo completo)
- Modify: `app/pages/login.vue` (solo `definePageMeta` y `<template>`)
- Modify: `app/pages/registro.vue` (solo `definePageMeta` y `<template>`)
- Modify: `app/error.vue`

`app/pages/confirm.vue` no se toca: no tiene título y hereda el tema y el fondo del layout por defecto.

**Interfaces:**
- Consumes: `<TripCover>` (Task 3); utilidades `font-serif`, `bg-canvas`, `bg-terracotta-*` (Task 1).
- Produces: layout `auth` (se usa con `definePageMeta({ layout: 'auth' })`).

- [ ] **Step 1: Crear `app/layouts/auth.vue`**

```vue
<template>
  <div class="grid min-h-dvh lg:grid-cols-2">
    <aside class="hidden flex-col justify-between bg-terracotta-700 p-12 text-white lg:flex dark:bg-terracotta-900">
      <NuxtLink to="/" class="font-serif text-2xl font-semibold">
        Viajes
      </NuxtLink>
      <p class="max-w-md font-serif text-4xl font-medium leading-tight text-balance">
        Los mejores viajes se planean entre todos.
      </p>
      <p class="text-sm text-white/75">
        Lugares, votos, itinerario y presupuesto en un solo link.
      </p>
    </aside>

    <main class="flex items-center justify-center bg-canvas px-4 py-12">
      <div class="w-full max-w-sm">
        <NuxtLink to="/" class="mb-8 block text-center font-serif text-2xl font-semibold lg:hidden">
          Viajes
        </NuxtLink>
        <slot />
      </div>
    </main>
  </div>
</template>
```

- [ ] **Step 2: `app/pages/login.vue`**

En el `<script setup>`, antes de `useHead`, agrega:

```ts
definePageMeta({ layout: 'auth' })
```

Reemplaza el `<template>` completo por:

```vue
<template>
  <UCard>
    <div class="mb-6">
      <h1 class="font-serif text-3xl font-semibold">
        Ingresar
      </h1>
      <p class="mt-1 text-sm text-muted">
        Organiza tus viajes en grupo
      </p>
    </div>

    <UAlert
      v-if="route.query.registrado"
      class="mb-4"
      color="success"
      variant="subtle"
      icon="i-lucide-mail-check"
      title="Cuenta creada"
      description="Revisa tu correo para confirmar la cuenta y luego ingresa."
    />

    <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
      <UFormField label="Correo" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField label="Contraseña" name="password">
        <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>

      <UAlert v-if="errorText" color="error" variant="subtle" :description="errorText" />

      <UButton type="submit" block :loading="loading" :disabled="!hydrated">
        Ingresar
      </UButton>
    </UForm>

    <p class="mt-6 text-center text-sm text-muted">
      ¿No tienes cuenta?
      <ULink to="/registro" class="font-medium text-primary">
        Crear cuenta
      </ULink>
    </p>
  </UCard>
</template>
```

- [ ] **Step 3: `app/pages/registro.vue`**

En el `<script setup>`, antes de `useHead`, agrega:

```ts
definePageMeta({ layout: 'auth' })
```

Reemplaza el `<template>` completo por:

```vue
<template>
  <UCard>
    <div class="mb-6">
      <h1 class="font-serif text-3xl font-semibold">
        Crear cuenta
      </h1>
      <p class="mt-1 text-sm text-muted">
        Planifica viajes con tus amigos
      </p>
    </div>

    <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
      <UFormField label="Nombre" name="fullName">
        <UInput v-model="state.fullName" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField label="Correo" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField label="Contraseña" name="password">
        <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField label="Repite la contraseña" name="password2">
        <UInput v-model="state.password2" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>

      <UAlert v-if="errorText" color="error" variant="subtle" :description="errorText" />

      <UButton type="submit" block :loading="loading" :disabled="!hydrated">
        Crear cuenta
      </UButton>
    </UForm>

    <p class="mt-6 text-center text-sm text-muted">
      ¿Ya tienes cuenta?
      <ULink to="/login" class="font-medium text-primary">
        Ingresar
      </ULink>
    </p>
  </UCard>
</template>
```

- [ ] **Step 4: Reemplazar `app/pages/index.vue`**

```vue
<script setup lang="ts">
useHead({ title: 'Viajes en grupo' })
const user = useSupabaseUser()

const features = [
  { title: 'Lugares en el mapa', text: 'Busca y marca los destinos en un mapa. Cada lugar recibe una ficha con información generada con IA.' },
  { title: 'Votación del grupo', text: 'Cada viajero vota por los lugares que quiere conocer. Tú ves el ranking y armas el plan.' },
  { title: 'Itinerario por días', text: 'Paradas con horario y recorrido en el mapa, en hora local del destino. Lo publicas cuando esté listo.' },
]

// Muestra decorativa del producto, sin datos reales
const samplePlaces = [
  { n: 1, name: 'Lago Grey', meta: 'Navegación al glaciar', votes: 7, voted: true },
  { n: 2, name: 'Mirador Cuernos', meta: 'Caminata de medio día', votes: 4, voted: false },
]
</script>

<template>
  <div>
    <header>
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <span class="font-serif text-2xl font-semibold">Viajes</span>
        <div class="flex gap-2">
          <UButton v-if="user" to="/admin" color="neutral" variant="ghost">
            Mis viajes
          </UButton>
          <template v-else>
            <UButton to="/login" color="neutral" variant="ghost">
              Ingresar
            </UButton>
            <UButton to="/registro">
              Crear cuenta
            </UButton>
          </template>
        </div>
      </UContainer>
    </header>

    <UContainer class="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-24">
      <div>
        <p class="text-xs font-medium uppercase tracking-widest text-primary">
          Viajes en grupo
        </p>
        <h1 class="mt-4 font-serif text-5xl font-semibold leading-[1.05] text-balance sm:text-6xl">
          Planifiquen el viaje juntos
        </h1>
        <p class="mt-5 max-w-xl text-lg text-muted">
          Invita a tus compañeros con un link, voten por los lugares que quieren conocer y compartan el itinerario día a día.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <UButton v-if="user" to="/admin" size="xl" trailing-icon="i-lucide-arrow-right">
            Ir a mis viajes
          </UButton>
          <template v-else>
            <UButton to="/registro" size="xl">
              Crear cuenta gratis
            </UButton>
            <UButton to="/login" size="xl" color="neutral" variant="outline">
              Ingresar
            </UButton>
          </template>
        </div>
      </div>

      <div aria-hidden="true" class="relative mx-auto w-full max-w-md pb-20 pr-6">
        <TripCover name="Patagonia en otoño" destination="Torres del Paine" size="card" class="rounded-md shadow-xl">
          <template #eyebrow>
            Faltan 23 días
          </template>
        </TripCover>
        <div class="absolute bottom-0 right-0 w-64 space-y-2">
          <div
            v-for="p in samplePlaces"
            :key="p.n"
            class="flex items-center gap-3 rounded-md bg-default p-3 shadow-lg ring ring-default"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              :class="p.voted ? 'bg-success' : 'bg-primary'"
            >
              {{ p.n }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-serif font-semibold">
                {{ p.name }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ p.meta }}
              </p>
            </div>
            <span class="flex items-center gap-1 text-sm font-medium" :class="p.voted ? 'text-success' : 'text-muted'">
              <UIcon name="i-lucide-heart" class="size-4" />
              {{ p.votes }}
            </span>
          </div>
        </div>
      </div>
    </UContainer>

    <UContainer class="pb-24">
      <ol class="grid gap-x-10 border-t border-default sm:grid-cols-3">
        <li v-for="(f, i) in features" :key="f.title" class="border-b border-default py-8 sm:border-b-0">
          <span class="font-serif text-3xl text-primary">{{ String(i + 1).padStart(2, '0') }}</span>
          <h2 class="mt-3 font-serif text-xl font-semibold">
            {{ f.title }}
          </h2>
          <p class="mt-2 text-sm text-muted">
            {{ f.text }}
          </p>
        </li>
      </ol>
    </UContainer>
  </div>
</template>
```

- [ ] **Step 5: `app/error.vue`**

Reemplaza el `<template>` por:

```vue
<template>
  <UApp>
    <div class="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div class="max-w-sm text-center">
        <UIcon :name="notFound ? 'i-lucide-search-x' : 'i-lucide-triangle-alert'" class="size-12 text-muted" />
        <h1 class="mt-4 font-serif text-2xl font-semibold">
          {{ notFound ? 'Página no encontrada' : 'Algo salió mal' }}
        </h1>
        <p class="mt-2 text-muted">
          {{ notFound ? 'Lo que buscas no existe o no tienes acceso.' : error.message }}
        </p>
        <UButton class="mt-6" @click="clearError({ redirect: '/' })">
          Volver al inicio
        </UButton>
      </div>
    </div>
  </UApp>
</template>
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck` y `npm test`
Expected: sin errores nuevos; todas las pruebas pasan.

Run: `npm run dev`, sin sesión iniciada.
- `/` a 1280 px: barra con "Viajes" y los dos accesos; título grande en serifa a la izquierda; a la derecha la portada de ejemplo con las dos tarjetas de lugar superpuestas; abajo las tres características numeradas 01, 02, 03.
- `/` a 375 px: una columna, la composición bajo los botones, sin desplazamiento horizontal.
- `/login` y `/registro` a 1280 px: panel terracota a la izquierda con la frase; formulario a la derecha. A 375 px: solo el formulario con "Viajes" arriba.
- Ingresar con datos vacíos muestra los mismos mensajes de validación que antes; ingresar con una cuenta válida lleva a `/admin`.
- `/pagina-que-no-existe`: "Página no encontrada" en serifa sobre fondo crema.

Con sesión iniciada, `/`: la barra muestra "Mis viajes" y el botón principal dice "Ir a mis viajes".

- [ ] **Step 7: Commit**

```bash
git add app/layouts/auth.vue app/pages/index.vue app/pages/login.vue app/pages/registro.vue app/error.vue
git commit -m "feat: portada pública, ingreso y registro con el estilo editorial"
```

---

### Task 6: Revisión final en claro y oscuro

**Files:**
- Modify: solo los archivos de las tasks anteriores donde aparezca un defecto.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada nuevo.

- [ ] **Step 1: Buscar restos del estilo anterior**

Run:

```bash
git grep -n -E "sky-|from-primary-|to-primary-|bg-muted/40|rounded-xl|font-bold" -- app
```

Expected: ninguna coincidencia de `sky-`, `from-primary-`, `to-primary-` ni `bg-muted/40`. Para cada `rounded-xl`, cámbialo por `rounded-md`. Para cada `font-bold` en un título (`h1`, `h2`, `h3`) cámbialo por `font-serif font-semibold`; los `font-bold` de números dentro de círculos (marcadores, orden de los lugares) se quedan.

- [ ] **Step 2: Recorrido en modo claro**

Run: `npm run dev`. Recorre a 1280 px y a 375 px:

- `/`, `/login`, `/registro`.
- `/admin` y un viaje: las siete pestañas (Resumen, Lugares, Itinerario, Presupuesto, Viajeros, Administradores, Ajustes). Abre un modal en cada una que tenga (lugar, parada, ítem de presupuesto, viajero).
- `/v/<token>`: las tres pestañas; estados pendiente, confirmado y "no voy" (se cambian con los botones de la tarjeta de confirmación mientras el plazo esté abierto).

Expected en todas: fondo crema, superficies blancas, títulos en serifa, acento terracota, sin desplazamiento horizontal, sin texto cortado ni superpuesto.

- [ ] **Step 3: Recorrido en modo oscuro**

Pon el sistema operativo (o la emulación del navegador: `prefers-color-scheme: dark`) en oscuro y repite el recorrido del Step 2.

Expected: fondo casi negro cálido, superficies un tono más claras, texto claro. Ningún bloque blanco suelto fuera de los que van sobre una foto (corazón de voto sin votar, borde del número de orden). Ningún texto oscuro sobre fondo oscuro. Los botones primarios se leen.

- [ ] **Step 4: Contraste**

En modo claro, con las herramientas del navegador (inspeccionar el elemento → selector de color → relación de contraste):

- Texto de un botón primario (`Ingresar` en `/login`): ≥ 4.5.
- Título de una portada sin foto (un viaje sin lugares en `/admin`): ≥ 4.5.
- Texto de la ficha de día activa en el itinerario del viajero: ≥ 4.5.

Si alguno no llega, oscurece un paso el fondo de ese elemento (por ejemplo `bg-terracotta-700` → `bg-terracotta-800`) y vuelve a medir.

- [ ] **Step 5: Verificación automática**

Run: `npm test`
Expected: todas las pruebas pasan.

Run: `npm run typecheck`
Expected: mismo resultado que el estado inicial, sin errores nuevos.

Run: `npm run build`
Expected: termina sin errores.

- [ ] **Step 6: Commit (solo si hubo correcciones)**

```bash
git add app
git commit -m "style: ajustes finales del rediseño tras la revisión en claro y oscuro"
```
