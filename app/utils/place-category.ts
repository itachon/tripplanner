import type { PlaceCategoriesPayload, PlaceCategory } from '~~/shared/types/place-category'

export interface CategoryIndex {
  byKey: Map<string, PlaceCategory>
  /** etiqueta normalizada → key de la categoría */
  byTag: Map<string, string>
}

/** Categoría de respaldo para etiquetas desconocidas */
export const OTHER_CATEGORY = 'other'

export function buildCategoryIndex(p: PlaceCategoriesPayload): CategoryIndex {
  return {
    byKey: new Map(p.categories.map(c => [c.key, c])),
    byTag: new Map(p.tags.map(t => [t.tag, t.category_key])),
  }
}

/**
 * Categoría de una etiqueta guardada. Desconocida o vacía → Otros.
 * null solo si no hay categorías cargadas (entonces se muestra todo como antes).
 */
export function categoryOf(tag: string | null | undefined, index: CategoryIndex): PlaceCategory | null {
  if (!index.byKey.size) return null
  const t = (tag ?? '').trim().toLowerCase()
  // Los maki de Mapbox van con guion ('place-of-worship', 'religious-christian'):
  // se prueba tal cual, con guion bajo y por su primera parte.
  const key = index.byTag.get(t) ?? index.byTag.get(t.replaceAll('-', '_')) ?? index.byTag.get(t.split('-')[0]!) ?? OTHER_CATEGORY
  return index.byKey.get(key) ?? index.byKey.get(OTHER_CATEGORY) ?? null
}

/** Etiqueta de un punto de interés del mapa: la específica (maki) antes que la general (class) */
export function pickPoiCategory(props: Record<string, unknown> | null | undefined): string | null {
  for (const k of ['maki', 'class', 'type']) {
    const v = props?.[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

/**
 * Qué guardar como etiqueta al salir del formulario: si el selector no cambió,
 * la etiqueta original tal cual; si cambió, la key de la categoría elegida.
 */
export function categoryToSave(rawTag: string | null | undefined, initialKey: string, chosenKey: string): string | null {
  if (chosenKey === initialKey) return rawTag?.trim() || null
  return chosenKey
}
