import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODE_RE = /^[A-Z]{3}$/

/**
 * POST /api/admin/trips/:id/rates  { currencies?: string[] }
 * Actualiza los tipos de cambio automáticos del viaje: los de las monedas
 * usadas en el presupuesto, los ya guardados y los que se pidan en el cuerpo
 * (para conocer el cambio de una moneda antes de guardar su primer ítem).
 * Los marcados como "manual" no se tocan. Devuelve todos los del viaje.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Debes iniciar sesión.' })

  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID_RE.test(id)) throw createError({ statusCode: 404, message: 'Viaje no encontrado.' })

  // Todo con el cliente del usuario: RLS decide si es administrador del viaje.
  const client = await serverSupabaseClient<Database>(event)
  const { data: trip } = await client.from('trips').select('id, budget_currency').eq('id', id).maybeSingle()
  if (!trip) throw createError({ statusCode: 404, message: 'Viaje no encontrado.' })

  const body = await readBody<{ currencies?: unknown } | null>(event).catch(() => null)
  const asked = body?.currencies
  const extra = Array.isArray(asked)
    ? asked.filter((c): c is string => typeof c === 'string' && CODE_RE.test(c))
    : []

  const [{ data: items }, { data: existing }] = await Promise.all([
    client.from('budget_items').select('currency').eq('trip_id', id),
    client.from('trip_exchange_rates').select('currency, source').eq('trip_id', id),
  ])
  const manual = new Set((existing ?? []).filter(r => r.source === 'manual').map(r => r.currency))
  const wanted = [...new Set([
    ...(items ?? []).map(i => i.currency),
    ...(existing ?? []).map(r => r.currency),
    ...extra,
  ])].filter(c => c !== trip.budget_currency && !manual.has(c))

  if (wanted.length) {
    const rates = await fetchRates(trip.budget_currency, wanted).catch(() => null)
    if (!rates) throw createError({ statusCode: 502, message: 'No se pudo consultar el tipo de cambio. Intenta más tarde.' })

    const now = new Date().toISOString()
    const rows = Object.entries(rates).map(([currency, rate]) => ({ trip_id: id, currency, rate, source: 'auto', updated_at: now }))
    if (rows.length) {
      const { error } = await client.from('trip_exchange_rates').upsert(rows)
      if (error) {
        console.error('[trip-rates]', error)
        throw createError({ statusCode: 500, message: 'No se pudo guardar el tipo de cambio.' })
      }
    }
  }

  const { data } = await client.from('trip_exchange_rates').select('*').eq('trip_id', id).order('currency')
  return data ?? []
})
