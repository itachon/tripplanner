// Cálculos del presupuesto. Funciones puras: las usan el panel de
// administración, la vista del viajero y las pruebas. Sin imports.
// "rate" siempre es: 1 unidad de la moneda del ítem = N de la principal.

export const BUDGET_CATEGORIES = ['lodging', 'transport', 'tickets', 'food', 'shopping', 'other'] as const
export type BudgetCategory = typeof BUDGET_CATEGORIES[number]

export const BUDGET_CATEGORY_META: Record<BudgetCategory, { label: string, icon: string }> = {
  lodging: { label: 'Alojamiento', icon: 'i-lucide-bed-double' },
  transport: { label: 'Transporte', icon: 'i-lucide-plane' },
  tickets: { label: 'Entradas', icon: 'i-lucide-ticket' },
  food: { label: 'Comida', icon: 'i-lucide-utensils' },
  shopping: { label: 'Compras', icon: 'i-lucide-shopping-bag' },
  other: { label: 'Otros', icon: 'i-lucide-ellipsis' },
}

export const BUDGET_CURRENCIES = [
  'CLP', 'USD', 'EUR', 'KRW', 'JPY', 'CNY', 'GBP', 'ARS', 'PEN', 'BRL', 'MXN', 'COP', 'UYU',
  'BOB', 'CAD', 'AUD', 'NZD', 'CHF', 'THB', 'VND', 'SGD', 'HKD', 'TWD', 'IDR', 'MYR', 'PHP',
  'INR', 'TRY', 'AED', 'ZAR', 'SEK', 'NOK', 'DKK', 'CZK', 'PLN', 'HUF', 'ILS', 'EGP', 'MAD',
] as const

/** Lo mínimo de un ítem que necesitan los cálculos */
export interface BudgetItemLike {
  id: string
  category: BudgetCategory
  currency: string
  estimated_amount: number | null
  /** null = todavía no se paga */
  actual_amount: number | null
  /** tipo de cambio congelado al pagar */
  actual_rate: number | null
  paid_by: string | null
  /** viajeros entre los que se reparte */
  member_ids: string[]
}

/** Ítem tal como se muestra en la lista (admin y viajero) */
export interface BudgetItemView extends BudgetItemLike {
  name: string
  notes: string | null
  paid_on: string | null
}

/** moneda → tipo de cambio hacia la moneda principal */
export type Rates = Record<string, number>

export interface CategoryTotal { category: BudgetCategory, estimated: number, actual: number, count: number }

export interface BudgetSummary {
  estimated: number
  actual: number
  /** gastado − estimado, solo en ítems que tienen ambos montos */
  variance: number
  perPerson: number
  byCategory: CategoryTotal[]
  /** monedas con ítems estimados pero sin tipo de cambio */
  missingRates: string[]
}

export interface MemberBalance { member_id: string, paid: number, owed: number, balance: number }
export interface Transfer { from: string, to: string, amount: number }

/** Decimales que usa la moneda: 0 para CLP, KRW, JPY; 2 para la mayoría */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  }
  catch {
    return 2
  }
}

const factor = (currency: string) => 10 ** currencyDecimals(currency)

export function roundMoney(amount: number, currency: string): number {
  const f = factor(currency)
  return Math.round(amount * f) / f
}

export function rateFor(currency: string, base: string, rates: Rates): number | null {
  if (currency === base) return 1
  const r = rates[currency]
  return r && r > 0 ? r : null
}

/** Costo estimado en la moneda principal, con el cambio actual del viaje */
export function estimatedBase(item: BudgetItemLike, base: string, rates: Rates): number | null {
  if (item.estimated_amount == null) return null
  const r = rateFor(item.currency, base, rates)
  return r == null ? null : roundMoney(item.estimated_amount * r, base)
}

/** Gasto real en la moneda principal, con el cambio congelado del ítem */
export function actualBase(item: BudgetItemLike, base: string): number | null {
  if (item.actual_amount == null) return null
  const r = item.currency === base ? 1 : item.actual_rate
  return r == null ? null : roundMoney(item.actual_amount * r, base)
}

export function summarize(items: BudgetItemLike[], base: string, rates: Rates, people: number): BudgetSummary {
  const cats = new Map<BudgetCategory, CategoryTotal>(
    BUDGET_CATEGORIES.map(category => [category, { category, estimated: 0, actual: 0, count: 0 }]),
  )
  const missing = new Set<string>()
  let variance = 0

  for (const it of items) {
    const row = cats.get(it.category)!
    row.count++
    const est = estimatedBase(it, base, rates)
    const act = actualBase(it, base)
    if (it.estimated_amount != null && est == null) missing.add(it.currency)
    if (est != null) row.estimated += est
    if (act != null) row.actual += act
    if (est != null && act != null) variance += act - est
  }

  const byCategory = [...cats.values()]
    .filter(c => c.count > 0)
    .map(c => ({ ...c, estimated: roundMoney(c.estimated, base), actual: roundMoney(c.actual, base) }))
  const estimated = roundMoney(byCategory.reduce((t, c) => t + c.estimated, 0), base)
  const actual = roundMoney(byCategory.reduce((t, c) => t + c.actual, 0), base)

  return {
    estimated,
    actual,
    variance: roundMoney(variance, base),
    perPerson: people > 0 ? roundMoney(estimated / people, base) : 0,
    byCategory,
    missingRates: [...missing].sort(),
  }
}

/**
 * Divide en partes iguales en la unidad mínima de la moneda. Lo que sobra
 * se reparte de a una unidad entre los primeros (ordenados por id), así
 * la suma de las partes es exactamente el total y el resultado es estable.
 */
export function splitEqually(total: number, ids: string[], currency: string): Map<string, number> {
  const out = new Map<string, number>()
  const sorted = [...new Set(ids)].sort()
  if (!sorted.length) return out
  const f = factor(currency)
  const units = Math.round(total * f)
  const share = Math.floor(units / sorted.length)
  let rest = units - share * sorted.length
  for (const id of sorted) {
    out.set(id, (share + (rest > 0 ? 1 : 0)) / f)
    if (rest > 0) rest--
  }
  return out
}

/**
 * Por viajero: cuánto pagó, cuánto le toca y su saldo (pagó − le toca).
 * Solo cuentan los ítems con gasto real, pagador y al menos un participante.
 */
export function balances(items: BudgetItemLike[], base: string, memberIds: string[]): MemberBalance[] {
  const f = factor(base)
  const paid = new Map<string, number>()
  const owed = new Map<string, number>()
  const add = (map: Map<string, number>, id: string, units: number) => map.set(id, (map.get(id) ?? 0) + units)

  for (const it of items) {
    const total = actualBase(it, base)
    if (total == null || !it.paid_by || !it.member_ids.length) continue
    add(paid, it.paid_by, Math.round(total * f))
    for (const [id, part] of splitEqually(total, it.member_ids, base)) add(owed, id, Math.round(part * f))
  }

  const ids = [...new Set([...memberIds, ...paid.keys(), ...owed.keys()])]
  return ids.map((id) => {
    const p = paid.get(id) ?? 0
    const o = owed.get(id) ?? 0
    return { member_id: id, paid: p / f, owed: o / f, balance: (p - o) / f }
  })
}

/** Transferencias para saldar: el que más debe le paga al que más tiene a favor */
export function settle(list: MemberBalance[], currency: string): Transfer[] {
  const f = factor(currency)
  const units = list.map(b => ({ id: b.member_id, u: Math.round(b.balance * f) }))
  const debtors = units.filter(x => x.u < 0).map(x => ({ id: x.id, u: -x.u }))
  const creditors = units.filter(x => x.u > 0)
  const bySize = (a: { id: string, u: number }, b: { id: string, u: number }) => b.u - a.u || (a.id < b.id ? -1 : 1)

  const out: Transfer[] = []
  while (debtors.length && creditors.length) {
    debtors.sort(bySize)
    creditors.sort(bySize)
    const d = debtors[0]!
    const c = creditors[0]!
    const pay = Math.min(d.u, c.u)
    out.push({ from: d.id, to: c.id, amount: pay / f })
    d.u -= pay
    c.u -= pay
    if (!d.u) debtors.shift()
    if (!c.u) creditors.shift()
  }
  return out
}

/** "CLP 12.500", "USD 12,50": con el código, porque $ sirve para varias monedas */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)
  }
  catch {
    return `${currency} ${amount}`
  }
}

/** "KRW — won surcoreano" */
export function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames('es', { type: 'currency' }).of(code)
    return name && name !== code ? `${code} — ${name}` : code
  }
  catch {
    return code
  }
}
