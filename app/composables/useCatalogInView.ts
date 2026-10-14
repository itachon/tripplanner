import type { Ref } from 'vue'
import type { PlaceInfoRow } from '~/composables/useTripAdmin'
import type { MapBox } from '~/utils/map-bounds'
import type { CatalogPlace } from '~~/shared/types/catalog'
import type { MapMarker } from '~~/shared/types/map'

/** Prefijo de los puntos del catálogo en el mapa, para no confundirlos con los lugares del viaje */
const CAT = 'cat:'

/**
 * Lugares públicos del catálogo que caen en la zona visible del mapa y que el
 * viaje aún no tiene (celeste punteado, para sumarlos con un clic).
 * `tripKey` cambia cuando el viaje suma o quita lugares: entonces se vuelve a consultar.
 */
export function useCatalogInView(tripId: Ref<string | undefined>, tripKey: () => string) {
  const catalog = useCatalog()
  const items = ref<CatalogPlace[]>([])
  const info = ref(new Map<string, PlaceInfoRow | null>())
  let lastBox: MapBox | null = null
  let seq = 0

  async function load(box: MapBox | null = lastBox) {
    lastBox = box
    if (!box || !tripId.value) return
    const mine = ++seq
    // Si la consulta falla, el mapa sigue mostrando los lugares del viaje
    const found = await catalog.inBounds(box, tripId.value).catch(() => null)
    if (found && mine === seq) items.value = found
  }
  watch(tripKey, () => load())

  const byMarkerId = computed(() => new Map(items.value.map(c => [CAT + c.id, c])))

  const markers = computed<MapMarker[]>(() => items.value.map(c => ({
    id: CAT + c.id,
    latitude: c.latitude,
    longitude: c.longitude,
    label: '+',
    tone: 'catalog',
    title: `${c.name} (del catálogo)`,
  })))

  /** Ficha automática de un punto del catálogo: se pide una vez, al fijar su tarjeta */
  async function loadInfo(markerId: string | null) {
    const c = markerId ? byMarkerId.value.get(markerId) : null
    if (!c || info.value.has(c.id)) return
    const [row] = await catalog.infoByIds([c.id]).catch(() => [])
    info.value = new Map(info.value).set(c.id, row ?? null)
  }

  return { items, byMarkerId, markers, info, load, loadInfo }
}
