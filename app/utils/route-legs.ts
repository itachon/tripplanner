import type { RouteMode } from '~~/shared/types/map'

/** Hasta esta distancia en línea recta se va caminando; más lejos, en auto */
export const WALK_MAX_M = 2000

export interface RoutePoint {
  /** id de la parada (un mismo lugar puede repetirse en el día) */
  id: string
  latitude: number
  longitude: number
}

export interface LegPlan {
  fromId: string
  toId: string
  mode: RouteMode
  from: [number, number]
  to: [number, number]
  /** modo + coordenadas redondeadas: la misma ruta se pide una sola vez */
  key: string
}

export interface LegRoute {
  /** metros */
  distance: number
  /** segundos */
  duration: number
  coordinates: [number, number][]
}

/** Distancia en metros en línea recta (haversine) */
export function distanceM(a: { latitude: number, longitude: number }, b: { latitude: number, longitude: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

const coord = (p: RoutePoint) => `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`

/** Tramos entre paradas seguidas, a pie si son cortos y en auto si son largos */
export function legsFor(points: RoutePoint[]): LegPlan[] {
  const legs: LegPlan[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const d = distanceM(a, b)
    if (d < 1) continue // misma ubicación: no hay nada que recorrer
    const mode: RouteMode = d < WALK_MAX_M ? 'walking' : 'driving'
    legs.push({
      fromId: a.id,
      toId: b.id,
      mode,
      from: [a.longitude, a.latitude],
      to: [b.longitude, b.latitude],
      key: `${mode}:${coord(a)};${coord(b)}`,
    })
  }
  return legs
}

/** Consulta a la API de rutas de Mapbox para un tramo */
export function directionsRequestUrl(leg: LegPlan, token: string) {
  const path = `${leg.from[0]},${leg.from[1]};${leg.to[0]},${leg.to[1]}`
  return `https://api.mapbox.com/directions/v5/mapbox/${leg.mode}/${path}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`
}

/** Google Maps con la ruta en transporte público (buses, metro) para un tramo */
export function transitUrl(leg: LegPlan) {
  const ll = (p: [number, number]) => `${p[1]},${p[0]}`
  return `https://www.google.com/maps/dir/?api=1&origin=${ll(leg.from)}&destination=${ll(leg.to)}&travelmode=transit`
}

/** Primera ruta de la respuesta, o null si no hay una usable */
export function parseDirections(json: unknown): LegRoute | null {
  const r = (json as { routes?: { distance?: unknown, duration?: unknown, geometry?: { coordinates?: unknown } }[] } | null)?.routes?.[0]
  const coordinates = r?.geometry?.coordinates
  if (!r || typeof r.distance !== 'number' || typeof r.duration !== 'number') return null
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  return { distance: r.distance, duration: r.duration, coordinates: coordinates as [number, number][] }
}

/** '850 m · 10 min', '1,2 km · 15 min', '12,4 km · 1 h 05 min' */
export function formatLeg(distance: number, duration: number) {
  const dist = distance < 1000
    ? `${Math.round(distance / 10) * 10} m`
    : `${(distance / 1000).toFixed(1).replace('.', ',')} km`
  const min = Math.max(1, Math.round(duration / 60))
  const time = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
  return `${dist} · ${time}`
}
