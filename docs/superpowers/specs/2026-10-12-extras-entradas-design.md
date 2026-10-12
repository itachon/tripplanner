# Extras en las entradas del presupuesto — diseño

Fecha: 2026-10-12

## Objetivo

Que un ítem de presupuesto de categoría **Entradas** pueda llevar una lista de **extras**: cargos adicionales con un nombre libre y un monto estimado (por ejemplo "Audioguía — KRW 3.000" en la entrada a un palacio). El estimado de la entrada pasa a ser el precio base más sus extras.

## Alcance

Incluye:

- Agregar, editar y quitar extras en el formulario de un ítem de categoría Entradas.
- Sumar los extras al estimado del ítem en todos los totales.
- Mostrar los extras en la lista de ítems, tanto al administrador como al viajero.

No incluye (se descartó al diseñar):

- Extras en otras categorías.
- Monto pagado, pagador, fecha o reparto propios de cada extra: comparten los de la entrada.
- Extras en otra moneda que la de la entrada.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Qué lleva un extra | Nombre y monto estimado. |
| Moneda, pagador, reparto | Los de la entrada. |
| Estimado del ítem | Precio base (`estimated_amount`) + suma de los extras. |
| Pago | Un solo "monto pagado" por el total, como hoy. |
| Categorías | Solo Entradas (`tickets`). Al cambiar la categoría, los extras se eliminan al guardar. |
| Vista del viajero | Ve los extras. |
| Guardado | Columna `extras` jsonb en `budget_items`. |

Se descartó una tabla `budget_item_extras`: los extras siempre se leen y se guardan junto con su ítem, y una tabla aparte agregaría políticas RLS, una función para reemplazarlos y un segundo punto de fallo parcial al guardar. Solo convendría si cada extra tuviera pagador o reparto propio.

## Datos

Migración nueva: `supabase/migrations/20261012000002_budget_extras.sql`.

### `budget_items.extras`

`extras jsonb not null default '[]'` — arreglo de objetos `{ "name": text, "amount": number }`, en el orden en que se ingresaron. `amount` está en la moneda del ítem.

Reglas (constraints):

- `budget_items_extras_valid`: `check (public.budget_extras_valid(extras))`. La función es `immutable`, con `search_path = ''`, y devuelve verdadero solo si:
  - el valor es un arreglo de a lo más 20 elementos;
  - cada elemento es un objeto con exactamente las claves `name` y `amount`;
  - `name` es un string de 1 a 120 caracteres después de `trim`;
  - `amount` es un número ≥ 0 y menor que 1e12.
- `budget_items_extras_only_tickets`: `check (category = 'tickets' or extras = '[]'::jsonb)`.

`budget_item_has_amount` no cambia: los extras no reemplazan al monto del ítem.

### Permisos

`extras` se agrega a los `grant insert (...)` y `grant update (...)` por columna de `budget_items` para `authenticated`. Las políticas RLS no cambian.

`budget_extras_valid`: `revoke all ... from public, anon` y `grant execute ... to authenticated, service_role`. El `check` se evalúa con los permisos de quien escribe, así que `authenticated` necesita poder ejecutarla; es una función pura, sin acceso a datos.

### `member_get_trip`

Cada ítem de `budget.items` incluye además `'extras', i.extras`. El resto de la función no cambia.

## Cálculos

En `shared/utils/budget.ts`:

- `export type BudgetExtra = { name: string, amount: number }` — alias de tipo, no `interface`, para que sea asignable a `Json` al guardar.
- `BudgetItemLike` gana `extras?: BudgetExtra[]`. Es opcional: ausente equivale a sin extras.
- `extrasTotal(item)` — suma de los montos de los extras; 0 si no hay.
- `estimatedTotal(item)` — estimado del ítem en su moneda: `(estimated_amount ?? 0) + extrasTotal(item)`. Devuelve `null` solo si `estimated_amount` es null y no hay extras.
- `estimatedBase` usa `estimatedTotal` en vez de `estimated_amount`.
- `summarize` marca la moneda como sin tipo de cambio cuando `estimatedTotal` no es null (hoy mira `estimated_amount`).

Con eso el total estimado, los subtotales por categoría, el costo por persona y la diferencia contra lo gastado incluyen los extras sin más cambios. `actualBase`, `balances` y `settle` no cambian: dependen solo del monto pagado.

## Pantalla de administración

### `useTripAdmin.ts`

`BudgetItem` pasa a ser `Omit<BudgetItemRow, 'extras'> & { extras: BudgetExtra[], member_ids: string[] }`, porque el tipo generado de la columna es `Json`. La conversión se hace donde ya se arma `member_ids`.

### `BudgetItemFormModal.vue`

- `state.extras`: arreglo de `{ name: string, amount: string }`. Se carga desde el ítem al abrir; vacío en un ítem nuevo.
- Sección **Extras**, visible solo si la categoría es Entradas, debajo de "Costo estimado": una fila por extra con nombre (máx. 120) y monto, botón para quitar la fila y botón "Agregar extra" (deshabilitado al llegar a 20).
- Si hay extras, la ayuda de "Costo estimado" muestra "Total con extras: …" en la moneda del ítem.
- Si la categoría no es Entradas y el ítem tiene extras cargados, un aviso: "Al guardar se quitarán los N extras: solo las entradas pueden tenerlos."
- Validación: una fila con nombre y monto vacíos se ignora; en las demás, el nombre es obligatorio y el monto debe ser un número ≥ 0. Los errores se muestran en la fila.
- Al guardar: `extras` va en el mismo `insert`/`update` del ítem, con los nombres recortados y los montos como número; `[]` si la categoría no es Entradas.

### `BudgetItemList.vue`

- Bajo el nombre del ítem, una línea por extra: "+ Audioguía · KRW 3.000".
- El estimado que se muestra a la derecha (y el "Estimado …" bajo el monto pagado) es `estimatedTotal`, no `estimated_amount`.

Como la vista del viajero (`app/pages/v/[token].vue`) usa el mismo componente y `BudgetItemView` extiende `BudgetItemLike`, muestra los extras sin cambios propios.

## Errores

- Extras inválidos que lleguen a la base (no deberían pasar del formulario): el `check` los rechaza y se muestra el aviso "No se pudo guardar" de siempre.
- Ítems existentes: quedan con `extras = []` por el default; nada que migrar.

## Pruebas

- **Cálculos** (`tests/budget.test.ts`): estimado con extras; extras sin precio base; ítem sin extras ni estimado sigue dando null; extras en otra moneda convertidos con el cambio del viaje; moneda sin tipo de cambio detectada cuando el ítem solo tiene extras; diferencia contra lo pagado usando el total con extras; saldos sin cambio.
- **Reglas de base** (`supabase/tests/rules.test.mjs`): se rechazan extras con forma inválida, con monto negativo, con más de 20 elementos y en un ítem que no es de Entradas; `member_get_trip` entrega los extras cuando el presupuesto está publicado.
- `npm run typecheck` sin errores.
- Prueba manual en el navegador: crear una entrada con dos extras, revisar totales, editarla, cambiarle la categoría y ver la vista del viajero.

## Archivos

Nuevos:

- `supabase/migrations/20261012000002_budget_extras.sql`

Modificados:

- `shared/utils/budget.ts`, `tests/budget.test.ts`
- `shared/types/database.types.ts` (regenerado)
- `app/composables/useTripAdmin.ts`
- `app/components/budget/BudgetItemFormModal.vue`, `BudgetItemList.vue`
- `supabase/tests/rules.test.mjs`
