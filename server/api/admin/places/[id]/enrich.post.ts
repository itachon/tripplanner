import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CACHE_DAYS = 30 // los horarios cambian; se refresca pasado este plazo

/**
 * POST /api/admin/places/:id/enrich
 * Precarga historia, horarios, web, teléfono y foto de un lugar usando
 * solo APIs gratuitas (sin IA): Overpass, Wikidata, Wikipedia, Commons
 * y opcionalmente Pexels. El resultado se cachea en place_info.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Debes iniciar sesión.' })

  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID_RE.test(id)) throw createError({ statusCode: 404, message: 'Lugar no encontrado.' })

  // El vínculo se lee con el cliente del usuario: RLS decide si administra ese viaje.
  // Las columnas nuevas no están en los tipos generados hasta regenerarlos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userDb = (await serverSupabaseClient<Database>(event)) as any
  const { data: link } = await userDb.from('places').select('id, catalog_place_id').eq('id', id).maybeSingle()
  if (!link) throw createError({ statusCode: 404, message: 'Lugar no encontrado.' })

  // Los datos del lugar y su ficha son del catálogo: se leen con el rol de servicio.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = serverSupabaseServiceRole<Database>(event) as any
  const { data: place } = await admin
    .from('catalog_places')
    .select('id, name, mapbox_id, latitude, longitude')
    .eq('id', link.catalog_place_id)
    .maybeSingle()
  if (!place) throw createError({ statusCode: 404, message: 'Lugar no encontrado.' })

  const { data: cached } = await admin.from('place_info').select('*').eq('catalog_place_id', place.id).maybeSingle()
  // ?force=1 (búsqueda manual) ignora la caché y vuelve a consultar las fuentes.
  const force = !!getQuery(event).force
  if (!force && cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_DAYS * 86_400_000) {
    return cached
  }

  const result = await enrichPlace({ name: place.name, latitude: place.latitude, longitude: place.longitude })

  const row = {
    catalog_place_id: place.id,
    mapbox_id: place.mapbox_id,
    history: result.history,
    history_source: result.historySource,
    opening_hours: result.openingHours,
    website: result.website,
    phone: result.phone,
    photo_url: result.photo?.url ?? null,
    photo_credit: result.photo?.credit ?? null,
    wikipedia_url: result.wikipediaUrl,
    wikidata_id: result.wikidataId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin.from('place_info').upsert(row).select('*').single()
  if (error) {
    console.error('[place-enrich]', error)
    throw createError({ statusCode: 500, message: 'No se pudo guardar la info del lugar.' })
  }
  return data
})
