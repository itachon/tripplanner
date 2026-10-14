# Categorías de lugares con icono y color

## Objetivo

Cada lugar muestra en el mapa y en su tarjeta un icono y un color según su
categoría (museos, hoteles, restaurantes…), con el nombre en español. La
etiqueta técnica que entrega Mapbox (`arts_and_entertainment`, `lodging`…) se
sigue guardando igual, pero nunca se muestra. La estructura deja listo un
futuro filtro del mapa por categoría (fuera de alcance aquí).

## Decisiones tomadas

- **Dos tablas:** `place_categories` (lo que se ve y se filtra) y
  `place_category_tags` (qué etiquetas guardadas pertenecen a cada categoría).
- **Puntos del mapa, opción A:** el relleno lleva el color de la categoría con
  su icono en blanco; el estado se expresa con el borde y la opacidad; el número
  (orden de votación o día) va en una burbuja en la esquina.
- La etiqueta sigue guardándose en `catalog_places.category`, sin cambios en esa
  columna ni en los datos existentes.
- En el formulario del lugar el campo de texto "Categoría" se reemplaza por un
  selector de categorías en español con su icono.
- Al marcar un ícono del mapa se guarda primero la etiqueta específica (`maki`,
  ej. `museum`) y solo si falta la general (`class`, ej. `arts_and_entertainment`).
- Las tablas se pueden leer sin sesión (los viajeros también ven los iconos).
  Solo se modifican con migraciones; no hay pantalla de edición.

## Modelo de datos

```sql
create table public.place_categories (
  key        text primary key,          -- 'museum'
  icon       text not null,             -- 'i-lucide-landmark' (Lucide, vía Nuxt Icon)
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  sort_order int  not null,
  label_es   text not null              -- 'Museos'
);

create table public.place_category_tags (
  tag          text primary key check (tag = lower(trim(tag)) and tag <> ''),
  category_key text not null references public.place_categories(key) on update cascade on delete cascade
);
```

- RLS activado en ambas. Política `select` para `anon` y `authenticated`; sin
  políticas de escritura (nadie escribe desde la app).
- La categoría `other` ("Otros") debe existir siempre: es el respaldo.
- Cada categoría tiene su propia `key` también como etiqueta (así, elegir
  "Hoteles" en el formulario guarda `lodging`, que se resuelve a sí misma).

### Categorías iniciales

| key | label_es | icon | color |
|---|---|---|---|
| museum | Museos | i-lucide-landmark | #7c3aed |
| monument | Monumentos | i-lucide-castle | #b45309 |
| worship | Templos | i-lucide-church | #be185d |
| culture | Arte y entretenimiento | i-lucide-theater | #c026d3 |
| park | Parques | i-lucide-trees | #16a34a |
| viewpoint | Miradores | i-lucide-mountain | #0891b2 |
| lodging | Hoteles | i-lucide-bed-double | #2563eb |
| restaurant | Restaurantes | i-lucide-utensils | #ea580c |
| cafe | Cafés | i-lucide-coffee | #92400e |
| bar | Bares | i-lucide-wine | #9f1239 |
| shop | Tiendas | i-lucide-shopping-bag | #0d9488 |
| transport | Transporte | i-lucide-train-front | #475569 |
| other | Otros | i-lucide-map-pin | #78716c |

### Etiquetas iniciales (además de cada `key`)

- museum: museo, museum, art_gallery, gallery, galería de arte
- monument: landmark, historic, historic_site, monument, memorial, castle,
  palace, palacio, monumento, castillo, sitio histórico
- worship: place_of_worship, religion, religious, temple, church, shrine,
  mosque, templo, iglesia, santuario
- culture: arts_and_entertainment, attraction, entertainment, theatre, theater,
  cinema, music, stadium, zoo, aquarium, theme_park, teatro, cine,
  atracción turística
- park: park, park_like, garden, national_park, nature_reserve, parque, jardín
- viewpoint: viewpoint, mirador, natural_feature, mountain, beach, playa
- lodging: hotel, hostel, motel, lodging, accommodation, alojamiento, hostal
- restaurant: restaurant, food_and_drink, food, fast_food, restaurante, comida
- cafe: cafe, coffee, coffee_shop, bakery, café, cafetería, panadería
- bar: bar, pub, nightclub, alcohol, beer, biergarten
- shop: shop, shopping, store, mall, grocery, commercial_services, market,
  tienda, mercado, centro comercial
- transport: airport, rail, rail_station, train_station, bus, bus_station,
  transit, ferry, aeropuerto, estación

Esto cubre todas las etiquetas guardadas hoy en la base (`arts_and_entertainment`,
`lodging`, `landmark`, `historic`, `Palacio`).

## Resolución etiqueta → categoría

Función pura `categoryOf(tag, tags, categories)` en `app/utils/place-category.ts`:

1. Normaliza: `lower(trim(tag))`.
2. Busca la etiqueta exacta en `place_category_tags`.
3. Si no está, o el lugar no tiene etiqueta: categoría `other`.
4. Si ni siquiera hay categorías cargadas (falló la carga): `null`, y quien la
   usa mantiene el aspecto actual (tono de estado y número).

Función pura `pickPoiCategory(props)` en el mismo archivo: devuelve `maki`, si
no `class`, si no `type`, si no `null` (usada al marcar un ícono del mapa).

## Carga de las categorías

- Ruta pública `GET /api/place-categories` → `{ categories, tags }`, leída con el
  cliente del servidor (anon basta) y con `Cache-Control` de unos minutos.
- Composable `usePlaceCategories()` con `useFetch` y una `key` fija, así se
  pide una vez y lo comparten todas las pantallas (organizador y viajeros).
  Expone `categories`, `byKey` y `resolve(tag)`.

## Puntos del mapa (opción A)

`MapMarker` suma `icon?: string` y `color?: string`. Si vienen, el punto se dibuja así:

| estado (tone) | relleno | icono | borde | tamaño |
|---|---|---|---|---|
| primary (en votación / con parada) | color de la categoría | blanco | blanco sólido | normal |
| success (el viajero votó) | color de la categoría | blanco | blanco sólido + burbuja verde con ✓ | normal |
| off (fuera de la votación) | color de la categoría al 45 % | blanco | blanco sólido | chico |
| catalog (aún no agregado) | blanco | color de la categoría | punteado del color de la categoría | chico |

- El `label` (número) pasa a una burbuja chica en la esquina superior derecha
  (fondo oscuro, texto blanco). En `catalog` no hay número.
- Sin `icon`/`color` (categorías no cargadas) se dibuja como hoy.
- El icono dentro del elemento DOM del marcador se monta con `render()` de Vue
  y el contexto de la app (`<UIcon :name>`), porque los marcadores de Mapbox no
  son componentes. Los iconos de las categorías iniciales se agregan a
  `icon.clientBundle.icons` en `nuxt.config.ts` para que no dependan de la red.
- Aplica en: Lugares y Itinerario del organizador, y en el mapa de lugares y
  del itinerario del viajero.

## Formulario y tarjeta

- `PlaceFormModal`: el `UInput` de "Categoría" se reemplaza por un `USelectMenu`
  con las categorías (icono + `label_es`, en `sort_order`). Valor inicial: la
  categoría resuelta de la etiqueta del lugar o de la propuesta. Si el usuario
  no lo toca, se guarda la etiqueta original tal cual; si elige otra, se guarda
  la `key` de la elegida. Mismas reglas de edición que hoy (solo quien creó el
  lugar y mientras su viaje no termine).
- `PlaceInfoCard`: el badge de categoría muestra icono, `label_es` y color de la
  categoría; nunca la etiqueta técnica.

## Pruebas

- Base (`supabase/tests/rules.test.mjs`): `anon` y `authenticated` leen ambas
  tablas; ninguno inserta, actualiza ni borra; existe `other`; toda etiqueta
  apunta a una categoría existente; cada `key` existe como etiqueta; una
  etiqueta con mayúsculas o espacios se rechaza.
- Unitarias (`tests/place-category.test.ts`): `categoryOf` con etiqueta exacta,
  con mayúsculas/espacios, alias en español, desconocida → `other`, nula →
  `other`, sin categorías → `null`; `pickPoiCategory` con maki, sin maki, sin nada.
- typecheck, `npm test`, `npm run test:db` y build.

## Fuera de alcance

- Los filtros del mapa por categoría (la estructura los deja listos).
- Una pantalla para editar categorías o etiquetas.
- Recategorizar los lugares existentes: los 8 con `arts_and_entertainment`
  quedan en "Arte y entretenimiento" hasta que alguien elija otra categoría en
  el formulario.

## Aplicación

La migración se aplica en Supabase con el MCP solo con confirmación explícita
del usuario en ese momento.
