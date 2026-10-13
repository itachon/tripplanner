# Rediseño visual "editorial cálido" — diseño

Fecha: 2026-10-13

## Objetivo

Que la app deje de verse como Nuxt UI de fábrica y tenga el aspecto de un sitio de viajes actual: fotografía grande, títulos con serifa, paleta cálida y una identidad propia, en todas las pantallas.

Es un cambio visual. No cambian la lógica, los textos, los permisos, la API del viajero ni la base de datos.

## Alcance

Incluye:

- Tema global: tipografía, paleta, fondo, radios, colores del mapa.
- Portada pública (`/`), `/login`, `/registro`, `/confirm` y `error.vue`.
- Vista del viajero (`/v/[token]`).
- Panel admin: layout, lista de viajes y cabecera del detalle del viaje.
- Modo oscuro, con neutros cálidos.

No incluye (se descartó al diseñar):

- Foto de portada elegida por el organizador (columna nueva en `trips`, subida de archivo).
- Fotos de stock en la portada pública o en el login.
- Reorganizar formularios, modales o paneles del admin: solo heredan el tema.
- Cambios de textos, de flujo o de endpoints.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dirección visual | Editorial cálido: serifa en títulos, fondo crema, acento terracota, esquinas casi rectas. |
| Portada del viaje | Foto del lugar más votado que tenga foto; si no hay votos, el primero con foto. Sin fotos, portada tipográfica sobre color. |
| Lugares del viajero | Lista y mapa lado a lado en escritorio; en celular, lista primero y botón flotante "Ver mapa". |
| Cómo se aplica el tema | Tokens de Nuxt UI en `main.css` y `app.config.ts`, no clases repetidas por pantalla. |
| Modo oscuro | Se mantiene. |
| Estilo del mapa | Se conserva `streets-v12`; solo cambian los colores propios (ruta, marcador pendiente). |

Se descartó ir pantalla por pantalla con clases sueltas: repetiría los mismos estilos en unos 30 archivos y los modales y formularios quedarían con el aspecto anterior.

## Tema global

Archivos: `app/assets/css/main.css`, `app/app.config.ts`, `app/components/map/TripMap.vue`.

### Tipografía

- `--font-sans`: Inter. Texto, formularios, botones.
- `--font-serif`: Fraunces. Títulos (`h1`–`h3` de página y de tarjeta) y cifras destacadas, con la clase `font-serif`.
- Las carga `@nuxt/fonts` (incluido en `@nuxt/ui`) al declararlas en `@theme`; no se agregan dependencias ni etiquetas `<link>`.

### Color

Dos escalas propias declaradas en `@theme`:

| Paso | `terracotta` | `sage` |
|---|---|---|
| 50 | `#fbf4ef` | `#f3f6f2` |
| 100 | `#f6e5d9` | `#e3eae1` |
| 200 | `#ecc9b1` | `#c8d6c5` |
| 300 | `#e0a682` | `#a3b9a0` |
| 400 | `#d38057` | `#7d997a` |
| 500 | `#c4633a` | `#5f7a61` |
| 600 | `#b4532a` | `#4a614c` |
| 700 | `#944224` | `#3c4e3e` |
| 800 | `#783824` | `#323f33` |
| 900 | `#633121` | `#2a352b` |
| 950 | `#35170f` | `#151c16` |

En `app.config.ts`: `primary: 'terracotta'`, `success: 'sage'`, `neutral: 'stone'`.

En modo claro `--ui-primary` y `--ui-success` apuntan al paso 600 (no al 500 por defecto) para que el texto blanco sobre botones cumpla contraste AA. En modo oscuro quedan en el paso 400, que es el valor por defecto de Nuxt UI.

### Fondo y forma

- El fondo de página es una variable propia, `--app-canvas`, expuesta como la utilidad `bg-canvas`. `--ui-bg` no se toca: tarjetas, campos y modales siguen sobre la superficie de Nuxt UI y así se separan del fondo.
- Claro: `--app-canvas` `#faf6ef` (crema), superficies blancas.
- Oscuro: `--app-canvas` `stone-950`, superficies `stone-900` (el valor por defecto de Nuxt UI).
- `--ui-radius`: `0.125rem`.
- Las tarjetas se separan con borde fino; la sombra queda solo para elementos flotantes (tarjeta sobre el mapa, botón flotante, modales).

### Mapa

En `TripMap.vue` los marcadores ya usan clases del tema (`bg-primary`, `bg-success`), así que cambian solos. Quedan dos colores fijos por reemplazar:

- `ROUTE_COLOR` `#0284c7` → terracota 600.
- Marcador pendiente `#f59e0b` → terracota 400.

## Componentes nuevos

### `app/components/trip/TripCover.vue`

Portada de un viaje. La usan la vista del viajero, el detalle del viaje en el admin y `TripCard`.

- Props: `name`, `destination`, `dateRange` (texto ya formateado), `photoUrl` (opcional), `size` (`'full' | 'band' | 'card'`).
- Slots: `eyebrow` (cuenta regresiva o insignia sobre el título) y por defecto (contenido bajo el título: saludo, descripción, insignias).
- Con foto: la imagen cubre el fondo con un degradado oscuro de abajo hacia arriba y el texto va en blanco.
- Sin foto: fondo terracota 700 liso con el mismo texto en blanco.
- Título en Fraunces. Tamaños: `full` para el viajero, `band` (bajo) para el detalle del admin, `card` para `TripCard`.

### `app/components/place/PlaceCard.vue`

Tarjeta de lugar del viajero, extraída de `pages/v/[token].vue`.

- Props: `place` (`MemberPlace`), `order`, `canVote`, `busy`, `active`, `showItineraryBadge`.
- Eventos: `vote`, `select`, `detail`, `hover`.
- Foto con proporción 4:3 arriba; número de orden arriba a la izquierda; botón de voto circular con corazón sobre la foto, arriba a la derecha (salvia cuando está votado). Debajo: nombre en Fraunces, dirección, extracto de la descripción, conteo de votos y "Ver ficha".
- Sin `canVote` el corazón no se muestra y queda solo el conteo.
- La foto es `photo_url`, y si falta, `info.photo_url`, igual que resuelve hoy `PlaceInfoCard`. Sin ninguna, un bloque de color con el ícono del pin.

### Función `coverPhoto`

En `app/utils/image.ts`: recibe una lista de lugares con `photo_url`, `info` y `vote_count` opcional, y devuelve la URL de portada según la regla de la tabla de decisiones. Es pura, para poder probarla en `tests/`.

## Pantallas

### Portada pública (`pages/index.vue`)

- Barra superior con el nombre en serifa y los accesos "Ingresar" / "Crear cuenta" (o "Mis viajes" con sesión).
- Bloque principal en dos columnas en escritorio: a la izquierda título grande en Fraunces, texto y botones; a la derecha una composición fija de ejemplo (una `TripCover` de tamaño `card` sin foto y dos tarjetas de lugar de muestra superpuestas). En celular, una columna con la composición debajo.
- Las tres características pasan de tarjetas a una fila numerada (01, 02, 03) con título en serifa y texto, separadas por líneas finas.

### Login, registro, confirmación y error

- `login.vue` y `registro.vue`: dos columnas en escritorio. Panel izquierdo terracota 700 con el nombre y una frase en serifa; a la derecha el formulario actual sobre fondo crema. En celular solo el formulario, con el nombre arriba.
- `confirm.vue` y `error.vue`: solo título en serifa y el tema nuevo.
- Los formularios, validaciones y textos no cambian.

### Vista del viajero (`pages/v/[token].vue`)

- **Cabecera:** `TripCover` tamaño `full`, con la foto de `coverPhoto(places)`. La cuenta regresiva va en el slot `eyebrow`; el saludo y la descripción, en el slot por defecto.
- **Confirmación:** la tarjeta actual, montada sobre el borde inferior de la portada. Sin cambios de contenido.
- **Pestañas:** `UTabs` variante `link` (como en el admin) en lugar de los botones hechos a mano. Se conservan el contador de lugares y el candado de "no publicado".
- **Lugares:**
  - Escritorio (`lg` en adelante): dos columnas. Izquierda, grilla de `PlaceCard` de dos columnas. Derecha, mapa fijo (`sticky`) con el alto de la ventana menos la cabecera.
  - Celular y tablet: solo la grilla (una columna en celular, dos en tablet). Un botón flotante "Ver mapa" abajo al centro abre el mapa a pantalla completa; ahí el botón dice "Ver lista".
  - Pasar por una tarjeta resalta su punto y tocar un punto resalta su tarjeta, como hoy.
  - El título, el contador "Tus votos", el orden y los avisos se mantienen.
- **Itinerario:** los botones de día pasan a fichas con día de la semana y número ("lun 14"), más "Todo"; el día de hoy se marca. La línea de tiempo y el mapa conservan su estructura.
- **Presupuesto:** las tres cifras de resumen en Fraunces, más grandes y con más aire. `BudgetItemList` y `BudgetBalances` solo heredan el tema.
- **Link inválido:** mismo contenido con título en serifa.

### Admin

- **`layouts/admin.vue`:** fondo crema (se quita `bg-muted/40`), cabecera con el nombre "Viajes" en Fraunces. El menú de usuario no cambia.
- **`pages/admin/index.vue`:** la consulta de viajes agrega `cover_places:places(photo_path)` y `cover_info:place_info(photo_url)` para resolver una portada por viaje. Como la lista no carga votos, usa el primer lugar con foto. Título "Mis viajes" en serifa.
- **`TripCard.vue`:** `TripCover` tamaño `card` arriba (foto o color) con nombre y destino encima; debajo fechas, cuenta regresiva y los contadores de viajeros y lugares. La insignia "Co-admin" va sobre la portada.
- **`pages/admin/viajes/[id].vue`:** el nombre, el destino y las fechas pasan a un `TripCover` tamaño `band`. El botón Editar sube a la fila del enlace "Mis viajes" y las insignias de estado quedan bajo la portada, sin cambios (sobre la foto no se leerían). La foto sale de `coverPhoto` con los lugares, votos y `place_info` que `useTripAdmin` ya carga, así coincide con la que ve el viajero. Las pestañas no cambian.
- **Paneles y modales:** sin cambios de estructura.

## Casos borde

- **Viaje sin lugares o sin fotos:** `TripCover` usa la variante de color; nada queda vacío.
- **Foto que no carga:** el `<img>` tiene de fondo el color de la variante sin foto, así el texto blanco sigue legible.
- **Nombres largos:** el título de la portada usa `text-balance` y se corta a tres líneas en tamaño `card`.
- **Lugar sin foto en `PlaceCard`:** bloque de color con ícono, misma proporción 4:3 para que la grilla no salte.
- **Mapa a pantalla completa en celular:** al cambiar de pestaña vuelve a la lista.

## Verificación

- `npm run typecheck` y `npm test` sin errores.
- Prueba unitaria de `coverPhoto` en `tests/`: más votado con foto, empate, sin votos, sin fotos, respaldo en `info.photo_url`.
- Revisión en el navegador de cada pantalla en claro y oscuro, a 375 px y 1280 px de ancho: portada, login, registro, lista de viajes, detalle del viaje (todas las pestañas), vista del viajero (tres pestañas, estados pendiente / confirmado / rechazado, votación abierta y cerrada).
- Contraste AA del texto blanco sobre botones primarios y sobre la portada sin foto.
