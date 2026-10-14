import type { RouteMode, RouteSegment } from '~~/shared/types/map'
import type { LegRoute, RoutePoint } from '~/utils/route-legs'

export interface LegInfo {
  mode: RouteMode
  /** '1,2 km · 15 min' (null mientras no hay ruta) */
  text: string | null
  /** tramos largos: Google Maps en transporte público */
  transitUrl: string | null
}

// Tramos ya consultados (null = Mapbox no encontró ruta o falló): se piden una vez por sesión
const inflight = new Set<string>()

/**
 * Rutas por calles entre paradas seguidas (API de rutas de Mapbox), sin navegación:
 * solo el dibujo del recorrido y la distancia y el tiempo de cada tramo.
 * Mientras un tramo no tiene ruta (cargando, sin token o error) se dibuja en línea recta.
 */
export function useRouteLegs(points: () => RoutePoint[]) {
  const token = useRuntimeConfig().public.mapboxToken as string
  const results = useState<Record<string, LegRoute | null>>('route-legs', () => ({}))

  const legs = computed(() => legsFor(points()))

  async function load(key: string, url: string) {
    inflight.add(key)
    try {
      const json = await $fetch(url)
      results.value = { ...results.value, [key]: parseDirections(json) }
    }
    catch {
      results.value = { ...results.value, [key]: null }
    }
    finally {
      inflight.delete(key)
    }
  }

  watch(legs, (list) => {
    if (!import.meta.client || !token) return
    for (const leg of list) {
      if (leg.key in results.value || inflight.has(leg.key)) continue
      load(leg.key, directionsRequestUrl(leg, token))
    }
  }, { immediate: true })

  const segments = computed<RouteSegment[]>(() => legs.value.map((leg) => {
    const r = results.value[leg.key]
    return r ? { coordinates: r.coordinates, mode: leg.mode } : { coordinates: [leg.from, leg.to], mode: 'straight' }
  }))

  /** id de la parada → cómo se llega a la siguiente */
  const legAfter = computed(() => {
    const map = new Map<string, LegInfo>()
    for (const leg of legs.value) {
      const r = results.value[leg.key]
      // El enlace a transporte público se ofrece aunque Mapbox no haya dado ruta
      const transit = leg.mode === 'driving' ? transitUrl(leg) : null
      if (r || transit) map.set(leg.fromId, { mode: leg.mode, text: r ? formatLeg(r.distance, r.duration) : null, transitUrl: transit })
    }
    return map
  })

  return { segments, legAfter }
}
