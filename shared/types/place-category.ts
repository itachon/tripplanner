/** Categoría de lugar: lo que se ve en el mapa y la tarjeta (y a futuro se filtra) */
export interface PlaceCategory {
  key: string
  /** icono Lucide para Nuxt Icon, ej. 'i-lucide-landmark' */
  icon: string
  /** '#rrggbb' */
  color: string
  sort_order: number
  label_es: string
}

/** Etiqueta guardada en catalog_places.category → su categoría */
export interface PlaceCategoryTag {
  tag: string
  category_key: string
}

export interface PlaceCategoriesPayload {
  categories: PlaceCategory[]
  tags: PlaceCategoryTag[]
}
