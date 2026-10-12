/**
 * Tipos de cambio desde open.er-api.com (gratis, sin clave, ~166 monedas,
 * se actualiza una vez al día; pide atribución con enlace).
 * La API entrega 6 decimales: se calcula en la dirección que conserva
 * más precisión (invertir un 0.000750 pierde casi todos los dígitos).
 */

const API = 'https://open.er-api.com/v6/latest'

interface ErApiResponse { result?: string, rates?: Record<string, number> }

const TTL_MS = 60 * 60 * 1000
const cache = new Map<string, { at: number, rates: Record<string, number> }>()

async function table(base: string): Promise<Record<string, number> | null> {
  const hit = cache.get(base)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rates
  const res = await $fetch<ErApiResponse>(`${API}/${base}`, { timeout: 8_000 }).catch(() => null)
  if (res?.result !== 'success' || !res.rates) return null
  cache.set(base, { at: Date.now(), rates: res.rates })
  return res.rates
}

const round8 = (n: number) => Math.round(n * 1e8) / 1e8

/**
 * Para cada moneda: 1 unidad = N de `base`.
 * Omite las que la API no conoce. Lanza si la API no responde.
 */
export async function fetchRates(base: string, currencies: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const wanted = [...new Set(currencies)].filter(c => c !== base)
  if (!wanted.length) return out

  const fromBase = await table(base) // 1 base = N moneda
  if (!fromBase) throw new Error('RATES_UNAVAILABLE')

  // Las monedas que valen más que la principal necesitan su tabla directa
  const needsDirect = wanted.filter((cur) => {
    const inverse = fromBase[cur]
    return inverse != null && inverse > 0 && inverse < 1
  })
  const directs = new Map(await Promise.all(needsDirect.map(async cur => [cur, await table(cur)] as const)))

  for (const cur of wanted) {
    const inverse = fromBase[cur]
    if (!inverse || inverse <= 0) continue
    if (inverse >= 1) {
      out[cur] = round8(1 / inverse)
      continue
    }
    // Sin la tabla directa solo queda invertir (impreciso): se omite la moneda
    const direct = directs.get(cur)?.[base]
    if (direct && direct > 0) out[cur] = round8(direct)
  }
  return out
}
