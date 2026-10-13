# Catálogo compartido de lugares — diseño

Fecha: 2026-10-13

## Objetivo

Que los lugares que un organizador agrega a su viaje queden disponibles para que otros organizadores los sumen a los suyos, en vez de crearlos de nuevo. Un lugar existe una sola vez, con un solo nombre, una ubicación, una foto y una ficha, y cada viaje guarda aparte lo que es propio de ese viaje.

## Alcance

Incluye:

- Un catálogo de lugares común a toda la plataforma.
- Buscar en el catálogo al agregar un lugar, y sugerir los cercanos al marcar un punto a mano.
- Lugares privados ("Solo para este viaje").
- Regla de edición: solo el creador, y solo hasta que termina el viaje donde se creó.
- Migración de los lugares que ya existen.

No incluye (se descartó al diseñar):

- Que cada viaje tenga su propia versión del nombre o la foto de un lugar compartido.
- Edición por cualquier organizador (tipo wiki).
- Moderación, reporte de lugares o fusión manual de dos lugares del catálogo.
- Borrar un lugar público del catálogo.
- Cambios visibles para el viajero.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién edita un lugar | Solo el organizador que lo creó. |
| Hasta cuándo | Hasta la fecha de término del viaje en que se creó (el "viaje de origen"), en la zona horaria de ese viaje. Después queda bloqueado para todos. |
| Si el viaje de origen se borra | El lugar queda bloqueado. |
| Co-administradores | No editan lugares que creó otro; sí la votación, el orden y la nota de su viaje. |
| Duplicados seguros | Si el lugar viene de Mapbox y ya hay uno público con el mismo identificador, se reutiliza sin preguntar. |
| Duplicados parecidos | Al marcar un punto a mano se muestran los lugares visibles del catálogo a 100 m o menos y el organizador elige uno o crea uno nuevo. |
| Visibilidad | Público por defecto; interruptor "Solo para este viaje" al crearlo. |
| Qué se comparte | Nombre, dirección, coordenadas, categoría, foto y ficha automática. |
| Qué no se comparte | La nota del organizador, la votación, el orden, los votos, las paradas y en qué viajes se usa un lugar. |
| Lugares existentes | Pasan al catálogo como públicos, con el dueño de su viaje como creador. No se une nada. |

Se descartó renombrar la tabla `places` a "lugares del viaje" y crear `places` como catálogo: obligaría a reescribir votos, paradas y todas las funciones del viajero, que hoy apuntan a `places.id`, sin ganar nada.

## Datos

Migración nueva en `supabase/migrations/`, con fecha posterior a `20261012000002`.

### Tabla nueva `catalog_places`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, clave primaria | |
| `name` | text | 1 a 160 caracteres después de `trim`, como hoy. |
| `address` | text, opcional | |
| `latitude`, `longitude` | double precision | Mismos rangos que hoy. |
| `mapbox_id` | text, opcional | Solo identificadores reales de Mapbox (ver "Identificador de Mapbox"). |
| `category` | text, opcional | |
| `photo_path` | text, opcional | Ruta en el bucket `place-photos`. |
| `is_public` | boolean, por defecto `true` | |
| `created_by` | uuid | Usuario que lo creó. No cambia. |
| `origin_trip_id` | uuid, opcional | Viaje de origen. `on delete set null`. No cambia. |
| `created_at`, `updated_at` | timestamptz | |

Índice único parcial sobre `mapbox_id` para las filas con `is_public` y `mapbox_id` no nulo: no puede haber dos lugares públicos con el mismo identificador de Mapbox.

### Tabla `places` (pasa a ser "lugar de un viaje")

- Gana `catalog_place_id uuid not null`, con clave foránea a `catalog_places` (`on delete restrict`).
- Restricción única `(trip_id, catalog_place_id)`: un viaje no tiene dos veces el mismo lugar.
- Conserva `id`, `trip_id`, `votable`, `sort_order`, `description` (la nota del organizador), `created_at`, `updated_at` y la restricción `(id, trip_id)`.
- Pierde `name`, `address`, `latitude`, `longitude`, `mapbox_id`, `category`, `photo_path` y las columnas `ai_*`, que ya no se usan.

`votes` e `itinerary_stops` no cambian: siguen apuntando a `places.id`.

### Tabla `place_info`

Pasa a tener como clave `catalog_place_id` en lugar de `place_id`, y pierde `trip_id`. La ficha se busca una vez por lugar del catálogo y la ven todos los viajes que lo usan.

### Identificador de Mapbox

Hoy ningún lugar tiene `mapbox_id` guardado. Además, cuando Mapbox no entrega identificador, `useMapbox` arma uno de respaldo con la forma `"lat,lng"`. El plan debe:

- Confirmar por qué no se está guardando al elegir desde el buscador y corregirlo.
- Guardar `mapbox_id` solo si es un identificador real: nunca cadena vacía ni la forma `"lat,lng"`.

## Permisos

Función `catalog_place_editable(id)`: verdadera si el usuario es `created_by`, el viaje de origen existe y su `end_date` es hoy o posterior en la zona horaria de ese viaje.

`catalog_places`:

- **Leer:** el lugar es público, o el usuario lo creó, o el usuario administra un viaje que lo usa.
- **Crear:** solo a través de `trip_add_place` (ver abajo).
- **Editar** (`name`, `address`, `latitude`, `longitude`, `category`, `photo_path`, `is_public`): solo si `catalog_place_editable`. `mapbox_id`, `created_by` y `origin_trip_id` no se pueden cambiar.
- **Volver privado** un lugar público: solo si ningún viaje distinto del de origen lo usa.
- **Borrar:** nadie directamente. Un lugar privado se borra solo cuando se quita de su último viaje.

`places`: como hoy, por administración del viaje (`is_trip_admin`), limitado a `votable`, `sort_order` y `description` al editar.

`place_info`: lectura para quien puede leer el lugar del catálogo; escritura solo del servidor, como hoy.

Lo que llega al navegador: el cliente no lee `created_by` ni `origin_trip_id` de lugares ajenos (revelarían quién organiza qué). En su lugar la base entrega dos datos calculados por lugar: `is_mine` (lo creó el usuario) y `editable` (resultado de `catalog_place_editable`). El navegador tampoco puede calcular `editable` por su cuenta, porque no ve las fechas de viajes ajenos.

Fotos (`place-photos`): las fotos nuevas van en `catalog/<catalog_place_id>/<archivo>`. Subir, reemplazar y borrar ahí exige `catalog_place_editable` de ese lugar. Las fotos ya subidas conservan su ruta actual y su regla actual.

## Agregar un lugar

Función `trip_add_place` (se ejecuta con los permisos de la base, valida que el usuario administre el viaje). Recibe el viaje, la votación, la nota y una de dos cosas:

- **Un lugar del catálogo ya existente:** crea el vínculo. Si el viaje ya lo tiene, devuelve el vínculo que existe.
- **Los datos de un lugar nuevo:** si es público, trae `mapbox_id` y ya existe un lugar público con ese identificador, lo reutiliza; si no, crea la fila del catálogo con el usuario como creador y el viaje como origen. Luego crea el vínculo.

En ambos casos el lugar queda al final del orden del viaje. La foto de un lugar nuevo se sube después de crear la fila, porque su ruta lleva el id del lugar.

### Buscador (`PlaceSearch.vue`)

Los resultados se muestran en dos grupos:

1. **Ya guardados por otros organizadores** (y los propios): lugares visibles del catálogo cuyo nombre o dirección contiene el texto, primero los más cercanos al centro del viaje, máximo 5. Cada uno muestra nombre, dirección y miniatura si tiene foto. No se listan los que el viaje ya tiene.
2. **Mapbox:** como hoy.

Elegir uno del primer grupo lo agrega de inmediato con `trip_add_place`, en votación y sin nota. Elegir uno de Mapbox abre el formulario, como hoy.

### Marcar en el mapa

Después de marcar el punto y antes del formulario, si hay lugares visibles del catálogo a 100 m o menos (y que el viaje no tenga), se muestra el paso "¿Es alguno de estos?" con esa lista y el botón "No, crear uno nuevo". La distancia se calcula con una función pura en `app/utils/`, sobre una consulta acotada por latitud y longitud; no se instala PostGIS.

### Formulario (`PlaceFormModal.vue`)

- **Al crear:** los campos de hoy más el interruptor "Solo para este viaje", con el texto de ayuda "Otros organizadores no podrán verlo ni usarlo."
- **Al editar un lugar que puedes editar:** igual que hoy, más el interruptor. El interruptor se desactiva, con explicación, si el lugar ya lo usa otro viaje.
- **Al editar un lugar que no puedes editar:** nombre, dirección, categoría y foto en solo lectura, con un aviso que dice por qué ("Lo creó otro organizador" o "El viaje donde se creó ya terminó"). Votación y nota siguen editables.

## Panel de lugares (`PlacesPanel.vue`)

- El panel lee `places` junto con su fila del catálogo. `useTripAdmin` entrega un tipo `Place` aplanado que conserva los nombres de campo actuales (`name`, `address`, `latitude`, `longitude`, `category`, `photo_path`) y agrega `catalog_place_id`, `is_public`, `is_mine` y `editable`, para que los componentes que solo leen no cambien.
- Cada fila muestra una insignia "Privado" si no es público, y "De otro organizador" si no lo creó el usuario.
- Los botones para cambiar la foto desde la ficha solo aparecen si el lugar es editable.
- "Borrar definitivamente" quita el lugar del viaje, con sus votos y paradas, como hoy. El texto de confirmación aclara que un lugar público sigue disponible en el catálogo.
- "Buscar info del lugar" actualiza la ficha compartida.

## Servidor

- `server/api/admin/places/[id]/enrich.post.ts`: sigue recibiendo el id del lugar del viaje (así los permisos del viaje deciden el acceso), lee los datos desde el catálogo y guarda la ficha por `catalog_place_id`. Si la ficha del catálogo ya está vigente, la devuelve sin volver a consultar las fuentes.
- `server/api/admin/image-fetch.post.ts`: sin cambios.

## Viajero

Las funciones `member_get_trip`, `member_list_places` y las de voto pasan a leer nombre, dirección, coordenadas, categoría, foto y ficha desde el catálogo. La forma de lo que devuelven no cambia, así que `server/api/v/` y `pages/v/[token].vue` no se tocan.

## Migración de los datos existentes

En la misma migración, en este orden:

1. Crear `catalog_places`.
2. Por cada fila de `places`, crear una fila del catálogo con sus datos, `is_public = true`, `created_by` = dueño del viaje y `origin_trip_id` = su viaje. `mapbox_id` solo se copia si es un identificador real.
3. Completar `places.catalog_place_id` y volverlo obligatorio.
4. Pasar `place_info` a `catalog_place_id`.
5. Quitar de `places` las columnas que se movieron.
6. Reemplazar permisos y funciones.

Hoy son 10 lugares en 2 viajes de un mismo organizador; no hay identificadores repetidos que unir.

## Casos borde

- **Dos organizadores crean a la vez el mismo lugar de Mapbox:** el índice único hace fallar al segundo y `trip_add_place` reintenta reutilizando el que ya quedó.
- **Lugar privado con el mismo `mapbox_id` que uno público:** se permite; son filas distintas.
- **El creador edita un lugar que usan otros viajes:** el cambio se ve en todos. Es el comportamiento buscado.
- **Lugar creado en el viaje A y usado en el viaje B del mismo organizador:** al terminar A queda bloqueado aunque B no haya empezado.
- **Se borra un viaje:** se borran sus vínculos. Sus lugares públicos quedan en el catálogo, bloqueados; los privados que solo usaba ese viaje se borran.
- **Se borra un lugar privado:** su foto en el bucket se borra desde la app al quitarlo; si el viaje entero se borra, la foto puede quedar huérfana, igual que hoy.
- **Búsqueda con menos de 2 caracteres:** no consulta el catálogo.

## Verificación

- `npm run test:db` (PGlite), con casos nuevos:
  - Un organizador lee lugares públicos ajenos y no lee privados ajenos.
  - Solo el creador edita, y deja de poder al día siguiente del término del viaje de origen.
  - No se puede cambiar `created_by`, `origin_trip_id` ni `mapbox_id`.
  - Un organizador no puede leer `created_by` ni `origin_trip_id` de un lugar ajeno.
  - No se puede volver privado un lugar que usa otro viaje.
  - `trip_add_place` reutiliza por `mapbox_id`, no duplica el vínculo y rechaza a quien no administra el viaje.
  - Un lugar privado se borra al quitarlo de su último viaje; uno público no.
  - Las funciones del viajero devuelven la misma forma que antes de la migración.
- `npm test`: función de distancia y filtro de 100 m; validación de identificador real de Mapbox.
- `npm run typecheck` y `npm run build`.
- Revisión manual con dos cuentas de organizador: crear un lugar con una, encontrarlo y agregarlo con la otra, comprobar que la segunda no puede editarlo, y que un lugar privado no aparece en su búsqueda.
