// Catálogo compartido de lugares: lo que el navegador recibe y envía.

/** Lugar del catálogo tal como lo entrega la base (sin creador ni viaje de origen) */
export interface CatalogPlace {
  id: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  mapbox_id: string | null
  category: string | null
  photo_path: string | null
  is_public: boolean
  /** lo creó el usuario que mira */
  is_mine: boolean
  /** el usuario puede cambiar nombre, dirección, categoría, foto y visibilidad */
  editable: boolean
  /** solo para el creador: lo usa un viaje distinto del de origen */
  used_elsewhere: boolean
}

export interface NewCatalogPlace {
  name: string
  address: string | null
  latitude: number
  longitude: number
  mapbox_id: string | null
  category: string | null
  is_public: boolean
}

/** Solo lo que cambia */
export interface CatalogPatch {
  name?: string
  address?: string | null
  category?: string | null
  photo_path?: string | null
  is_public?: boolean
}

export interface AddPlaceResult {
  /** id del lugar dentro del viaje (el que usan votos y paradas) */
  place_id: string
  catalog_place_id: string
  /** false si ya existía en el catálogo y solo se sumó al viaje */
  created: boolean
}

export interface TripCover {
  trip_id: string
  photo_path: string | null
  info_photo_url: string | null
}
