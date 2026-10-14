import type { PlaceCategory } from '~~/shared/types/place-category'

type Resolve = (tag: string | null | undefined) => PlaceCategory | null
interface WithCategory { category?: string | null }

/** Categorías presentes entre los puntos, con cuántos hay de cada una (para los chips del filtro) */
export function categoryCounts(markers: WithCategory[], resolve: Resolve): { category: PlaceCategory, count: number }[] {
  const counts = new Map<string, { category: PlaceCategory, count: number }>()
  for (const mk of markers) {
    const c = resolve(mk.category)
    if (!c) continue
    const entry = counts.get(c.key)
    if (entry) entry.count++
    else counts.set(c.key, { category: c, count: 1 })
  }
  return [...counts.values()].sort((a, b) => a.category.sort_order - b.category.sort_order)
}

/** Puntos de las categorías elegidas; sin selección (o sin categorías cargadas), todos */
export function filterByCategory<T extends WithCategory>(markers: T[], selected: Set<string>, resolve: Resolve): T[] {
  if (!selected.size) return markers
  const kept = markers.filter((mk) => {
    const c = resolve(mk.category)
    return !!c && selected.has(c.key)
  })
  // Si nada resolvió (categorías no cargadas), no se filtra
  return markers.some(mk => resolve(mk.category)) ? kept : markers
}
