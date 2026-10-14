import type { PlaceCategoriesPayload, PlaceCategory } from '~~/shared/types/place-category'

/**
 * Categorías de lugares, pedidas una vez y compartidas por todas las pantallas.
 * Si no cargan, `loaded` queda en false y resolve() devuelve null: quien las usa
 * se ve como antes (nunca muestra la etiqueta técnica).
 */
export function usePlaceCategories() {
  const { data } = useFetch<PlaceCategoriesPayload>('/api/place-categories', {
    key: 'place-categories',
    default: () => ({ categories: [], tags: [] }),
  })
  const index = computed(() => buildCategoryIndex(data.value ?? { categories: [], tags: [] }))
  const categories = computed<PlaceCategory[]>(() => [...(data.value?.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order))
  const loaded = computed(() => categories.value.length > 0)
  const resolve = (tag: string | null | undefined) => categoryOf(tag, index.value)
  return { categories, loaded, resolve }
}
