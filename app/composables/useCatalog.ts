import type { AddPlaceResult, CatalogPatch, CatalogPlace, NewCatalogPlace, TripCover } from '~~/shared/types/catalog'
import type { PlaceInfoRow } from '~/composables/useTripAdmin'
import type { MapBox } from '~/utils/map-bounds'

const MESSAGES: Record<string, string> = {
  PLACE_NOT_FOUND: 'Ese lugar ya no está disponible.',
  PLACE_LOCKED: 'Este lugar ya no se puede editar.',
  PLACE_SHARED: 'Otro viaje ya usa este lugar: no se puede dejar solo para este viaje.',
  PLACE_DUPLICATE: 'Ya existe un lugar público igual en el catálogo.',
}

/** Único punto de acceso al catálogo compartido de lugares */
export function useCatalog() {
  const { client } = useDb()
  // Las funciones y columnas del catálogo no están en database.types.ts hasta
  // regenerarlo con la migración aplicada; por eso este cliente va sin tipos
  // y cada función declara lo que devuelve.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any

  function unwrap<T>(res: { data: unknown, error: { message: string } | null }): T {
    if (res.error) throw new Error(MESSAGES[res.error.message] ?? res.error.message)
    return res.data as T
  }

  async function byIds(ids: string[]): Promise<CatalogPlace[]> {
    if (!ids.length) return []
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_places_visible').in('id', ids)) ?? []
  }

  async function infoByIds(ids: string[]): Promise<PlaceInfoRow[]> {
    if (!ids.length) return []
    return unwrap<PlaceInfoRow[]>(await db.from('place_info').select('*').in('catalog_place_id', ids)) ?? []
  }

  async function search(q: string, near: { latitude: number, longitude: number } | null | undefined, tripId: string): Promise<CatalogPlace[]> {
    if (q.trim().length < 2) return []
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_search', {
      p_query: q.trim().slice(0, 100),
      p_lat: near?.latitude ?? null,
      p_lng: near?.longitude ?? null,
      p_exclude_trip: tripId,
      p_limit: 5,
    })) ?? []
  }

  async function near(latitude: number, longitude: number, tripId: string): Promise<CatalogPlace[]> {
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_near', {
      p_lat: latitude, p_lng: longitude, p_meters: 100, p_exclude_trip: tripId,
    })) ?? []
  }

  async function inBounds(box: MapBox, tripId: string): Promise<CatalogPlace[]> {
    return unwrap<CatalogPlace[]>(await db.rpc('catalog_in_bounds', {
      p_south: box.south, p_west: box.west, p_north: box.north, p_east: box.east, p_exclude_trip: tripId, p_limit: 200,
    })) ?? []
  }

  async function addExisting(tripId: string, catalogPlaceId: string, votable = true): Promise<AddPlaceResult> {
    return unwrap<AddPlaceResult>(await db.rpc('trip_add_place', { p_trip_id: tripId, p_catalog_place_id: catalogPlaceId, p_votable: votable }))
  }

  async function addNew(tripId: string, place: NewCatalogPlace, votable: boolean, description: string | null): Promise<AddPlaceResult> {
    return unwrap<AddPlaceResult>(await db.rpc('trip_add_place', {
      p_trip_id: tripId, p_new: place, p_votable: votable, p_description: description,
    }))
  }

  async function update(id: string, patch: CatalogPatch): Promise<void> {
    unwrap<null>(await db.rpc('catalog_place_update', { p_id: id, p_patch: patch }))
  }

  async function covers(): Promise<TripCover[]> {
    return unwrap<TripCover[]>(await db.rpc('trip_covers')) ?? []
  }

  return { byIds, infoByIds, search, near, inBounds, addExisting, addNew, update, covers }
}
