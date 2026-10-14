import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'
import type { PlaceCategoriesPayload } from '~~/shared/types/place-category'

// GET /api/place-categories — categorías y sus etiquetas (públicas: también las usa el viajero)
export default defineEventHandler(async (event): Promise<PlaceCategoriesPayload> => {
  const db = await serverSupabaseClient<Database>(event)
  const [cats, tags] = await Promise.all([
    db.from('place_categories').select('key, icon, color, sort_order, label_es').order('sort_order'),
    db.from('place_category_tags').select('tag, category_key'),
  ])
  if (cats.error || tags.error) {
    console.error('[place-categories]', cats.error ?? tags.error)
    throw createError({ statusCode: 500, message: 'No se pudieron cargar las categorías.' })
  }
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return { categories: cats.data, tags: tags.data }
})
