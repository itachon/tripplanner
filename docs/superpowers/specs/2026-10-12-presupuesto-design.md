# Presupuesto del viaje — diseño

Fecha: 2026-10-12

## Objetivo

Agregar una pestaña **Presupuesto** en la gestión del viaje (al lado de Itinerario) que permita:

1. **Estimar** cuánto cuesta el viaje, en total y por persona.
2. **Comparar** lo estimado con lo realmente gastado.
3. **Repartir** los gastos entre los viajeros: quién pagó qué y quién le debe a quién.

Los administradores del viaje cargan y editan todo. Los invitados solo lo ven, y solo si el administrador lo publica.

## Alcance

Incluye:

- Ítems de presupuesto con categoría, costo estimado y gasto real.
- Varias monedas por viaje, con tipo de cambio automático.
- Reparto en partes iguales entre los viajeros elegidos en cada ítem.
- Cálculo de saldos y de las transferencias para saldar cuentas.
- Interruptor "Presupuesto publicado" y vista de solo lectura para invitados.

No incluye (se puede agregar después):

- Que los invitados carguen gastos.
- Repartos con montos o porcentajes personalizados.
- Registrar los pagos entre viajeros (marcar una deuda como saldada).
- Fotos de boletas o comprobantes.
- Categorías personalizadas.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Propósito | Estimado, gasto real y reparto entre viajeros, los tres. |
| Monedas | Cada ítem en su moneda; tipo de cambio automático. |
| Reparto | Partes iguales entre los viajeros marcados en el ítem. |
| Acceso | Solo administradores editan; invitados ven si está publicado. |
| Categorías | Lista fija: Alojamiento, Transporte, Entradas, Comida, Compras, Otros. |
| Quién paga | Siempre un viajero (`members`) del viaje. |
| Vista del invitado | Ve las cuentas de todo el grupo, con lo suyo destacado. |

## Datos

Una migración nueva: `supabase/migrations/20261012000001_budget.sql`.

### `trips` (columnas nuevas)

- `budget_currency text not null default 'CLP'` — moneda principal del viaje, código ISO 4217 de 3 letras. Todos los totales se muestran en esta moneda.
- `budget_published boolean not null default false` — si los invitados pueden ver el presupuesto.

Ambas se agregan al `grant update (...)` de `trips`.

### `budget_items`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips, cascade | |
| `category` | enum `budget_category` | `lodging`, `transport`, `tickets`, `food`, `shopping`, `other` |
| `name` | text | 1 a 120 caracteres |
| `notes` | text null | |
| `currency` | text | ISO 4217, 3 letras mayúsculas |
| `estimated_amount` | numeric(14,2) null | ≥ 0 |
| `actual_amount` | numeric(14,2) null | ≥ 0; null = todavía no se paga |
| `actual_rate` | numeric(18,8) null | tipo de cambio congelado al pagar (1 unidad de `currency` = N de la moneda principal) |
| `paid_by` | uuid null FK → members, set null | quién pagó |
| `paid_on` | date null | |
| `place_id` | uuid null FK → places, set null | lugar asociado, opcional |
| `sort_order` | int | |
| `created_at`, `updated_at` | timestamptz | con el trigger `set_updated_at` existente |

Reglas (constraints):

- Al menos uno de `estimated_amount` o `actual_amount` no es null.
- Si `actual_amount` no es null, `actual_rate` tampoco.
- `paid_by` y `place_id` deben pertenecer al mismo viaje (FK compuesta con `trip_id`, como ya hacen las otras tablas con `members_id_trip_uq`).

### `budget_item_shares`

Qué viajeros participan de cada ítem.

- `item_id` uuid FK → budget_items, cascade
- `member_id` uuid FK → members, cascade
- `trip_id` uuid (para RLS y para la FK compuesta)
- PK (`item_id`, `member_id`)

Un ítem sin participantes es válido como estimado, pero no entra en el reparto.

### `trip_exchange_rates`

- `trip_id` uuid FK → trips, cascade
- `currency` text
- `rate` numeric(18,8) — 1 unidad de `currency` = `rate` de la moneda principal
- `source` text — `auto` o `manual`
- `updated_at` timestamptz
- PK (`trip_id`, `currency`)

### Permisos (RLS)

Mismo patrón que `places` e `itinerary_stops`: las tres tablas con RLS activado y políticas de select, insert, update y delete para `authenticated` con `public.is_trip_admin(trip_id)`. Sin acceso para `anon`.

Los invitados leen a través de una función con token (ver "Vista del invitado").

## Tipo de cambio

Fuente: `open.er-api.com` — gratuita, sin clave, 166 monedas (incluye CLP, KRW, USD, EUR, JPY), se actualiza una vez al día y pide mostrar un enlace de atribución. Se descartó frankfurter.dev: se probó y no publica CLP, y entrega pocos decimales en monedas de valor bajo.

La API entrega 6 decimales, así que el cambio se calcula en la dirección que conserva más precisión: se pide la tabla de la moneda principal y se invierte; si el valor es menor que 1, se pide directamente la tabla de la otra moneda.

Endpoint nuevo: `POST /api/admin/trips/:id/rates`

- Requiere sesión y que el usuario sea administrador del viaje (se lee el viaje con el cliente del usuario; RLS decide).
- Busca las monedas distintas usadas en los ítems del viaje, pide el cambio de cada una hacia `budget_currency` y hace upsert en `trip_exchange_rates` con `source = 'auto'`.
- No pisa las filas con `source = 'manual'`.
- Si la API falla, responde error y deja los valores anteriores.

Cuándo se llama:

- Al guardar un ítem en una moneda que el viaje todavía no tiene.
- Con el botón "Actualizar tipos de cambio".
- Automáticamente al abrir la pestaña si algún valor `auto` tiene más de 24 horas.

Conversión de cada ítem a la moneda principal:

- **Estimado**: `estimated_amount × rate` actual del viaje. Cambia cuando el cambio se actualiza.
- **Real**: `actual_amount × actual_rate`. Queda congelado: al ingresar el gasto real, el formulario propone el cambio vigente y el administrador puede corregirlo (por ejemplo, el que le cobró la tarjeta).
- Si la moneda del ítem es la principal, el cambio es 1.

El administrador puede editar a mano el cambio de una moneda del viaje; queda como `manual`.

## Cálculos

Funciones puras en `shared/utils/budget.ts`, sin dependencias de Vue ni de Supabase, para poder usarlas en el panel, en la vista del invitado y en las pruebas.

- `toBase(amount, rate)` — convierte y redondea a los decimales de la moneda principal (0 para CLP, KRW y JPY; 2 para las demás; se obtiene con `Intl.NumberFormat`).
- `summarize(items, rates, memberCount)` — total estimado, total real, diferencia, subtotales por categoría y costo por persona.
- `balances(items, shares, members)` — por viajero: cuánto pagó, cuánto le toca y su saldo (pagó − le toca). Solo cuentan los ítems con gasto real, quién pagó y al menos un participante.
- `settle(balances)` — lista mínima de transferencias: se empareja repetidamente al que más debe con el que más tiene a favor.

Redondeo del reparto: el monto se divide en partes iguales en la unidad mínima de la moneda principal; lo que sobra se reparte de a una unidad entre los primeros participantes (ordenados por id, para que el resultado sea siempre el mismo). Así la suma de las partes es exactamente el total.

El "costo por persona" del resumen es el total estimado dividido entre los viajeros con estado `accepted` (o entre todos si nadie ha aceptado aún).

## Pantalla de administración

Pestaña nueva en `app/pages/admin/viajes/[id].vue`, después de Itinerario: `{ label: 'Presupuesto', icon: 'i-lucide-wallet', value: 'presupuesto' }`. Junto a la insignia "Itinerario publicado" se agrega la de "Presupuesto publicado / oculto".

`useTripAdmin` carga además `budget_items`, `budget_item_shares` y `trip_exchange_rates`, y expone los cálculos como `computed`.

Componentes nuevos en `app/components/budget/`:

- **`BudgetPanel.vue`** — contenedor de la pestaña.
  - Resumen arriba: total estimado, total gastado, diferencia (verde si se gastó menos, rojo si más) y costo por persona.
  - Barra de acciones: "Agregar ítem", selector de moneda principal, interruptor "Publicar para los invitados", "Actualizar tipos de cambio".
  - Lista agrupada por categoría, con subtotal por grupo. Cada fila: nombre, estimado, real, quién pagó, entre cuántos se reparte; menú con Editar y Borrar. Los montos en otra moneda muestran el original y, debajo, el equivalente en la moneda principal.
  - Estado vacío con explicación y botón para agregar el primero.
- **`BudgetItemFormModal.vue`** — alta y edición. Campos: categoría, nombre, moneda, monto estimado, nota, lugar (opcional), y un bloque "Ya se pagó" con monto real, tipo de cambio, quién pagó y fecha. Abajo, casillas con los viajeros que participan; por defecto marcados los que aceptaron, con "Todos / Ninguno".
- **`BudgetBalances.vue`** — sección "Cuentas": tabla de saldos por viajero y la lista de transferencias ("Ana le paga $25.000 a Pedro"). Se reutiliza en la vista del invitado.
- **`BudgetRates.vue`** — lista de monedas del viaje con su cambio, fecha y origen (auto/manual), editable.

Cambiar la moneda principal: se pide confirmación, se borran los tipos de cambio del viaje (incluidos los manuales, que dejan de tener sentido) y se vuelven a traer. **Si ya hay gastos pagados no se permite el cambio**, porque sus tipos de cambio congelados están expresados en la moneda anterior; lo impide un trigger en la base (`budget_currency_locked`) y el panel explica por qué.

Al borrar un viajero que pagó ítems, `paid_by` queda en null y esos ítems salen del reparto; la fila lo muestra como "Falta quién pagó".

## Vista del invitado

`member_get_trip(p_token)` devuelve además:

- `budget_published`
- `budget`: solo si está publicado — moneda principal, ítems (incluida la nota del ítem, que es información del gasto), participantes por ítem, tipos de cambio y la lista de viajeros con id y nombre (sin tokens ni notas internas).

En `app/pages/v/[token].vue` se agrega la pestaña **Presupuesto**, con candado si no está publicado (igual que Itinerario). Muestra:

- "Tu parte": cuánto le toca al viajero en total, cuánto ya pagó y su saldo.
- La lista de ítems por categoría, de solo lectura, marcando en cuáles participa.
- Las cuentas de todo el grupo (`BudgetBalances`), con sus propias filas destacadas.

El tipo `MemberTripView` en `shared/types/trip.ts` se amplía con estos campos.

## Errores

- Fallo de la API de cambio: aviso "No se pudo actualizar el tipo de cambio" y se siguen usando los valores guardados. Si una moneda no tiene ningún valor, sus ítems se muestran en su moneda original con un aviso "Sin tipo de cambio" y quedan fuera de los totales hasta que se ingrese uno a mano.
- Errores al guardar o borrar: aviso con `errorMessage`, como en el resto del panel.
- Código de moneda inválido: se valida en el formulario contra la lista de monedas y con un `check` en la base.

## Pruebas

- **Cálculos** (`tests/budget.test.ts`, con `node --test`, sin dependencias nuevas): conversión y redondeo por moneda; reparto con resto (por ejemplo 100 entre 3); saldos con varios pagadores; liquidación que deja a todos en cero; ítems sin pagador o sin participantes excluidos; moneda sin tipo de cambio.
- **Reglas de base** (`supabase/tests/rules.test.mjs`, ya existente con PGlite; hoy no corre en Windows y tiene una sección obsoleta de la ficha con IA, se repara primero): un administrador de otro viaje no lee ni escribe; `paid_by` de otro viaje se rechaza; `member_get_trip` no entrega presupuesto si no está publicado.
- `npm run typecheck` sin errores.
- Prueba manual en el navegador: crear ítems en dos monedas, marcar pagos, revisar cuentas y la vista del invitado con y sin publicar.

## Archivos

Nuevos:

- `supabase/migrations/20261012000001_budget.sql`
- `shared/utils/budget.ts`, `tests/budget.test.ts`
- `server/utils/exchangeRates.ts`
- `server/api/admin/trips/[id]/rates.post.ts`
- `app/components/budget/BudgetPanel.vue`, `BudgetItemList.vue`, `BudgetItemFormModal.vue`, `BudgetBalances.vue`, `BudgetRates.vue`

Modificados:

- `shared/types/database.types.ts` (regenerado), `shared/types/trip.ts`
- `app/composables/useTripAdmin.ts`
- `app/pages/admin/viajes/[id].vue`
- `app/pages/v/[token].vue`
- `supabase/tests/rules.test.mjs`
- `package.json` (script `test`)
