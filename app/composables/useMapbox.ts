// Búsqueda de lugares con Mapbox Search Box API (/forward y /reverse).
// Se llama desde el navegador con el token público (restríngelo a tu dominio).

export interface PlaceSearchResult {
  id: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  category: string | null
}

interface SearchBoxFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    mapbox_id?: string
    name?: string
    full_address?: string
    place_formatted?: string
    feature_type?: string
    poi_category?: string[]
    coordinates?: { latitude?: number, longitude?: number }
  }
}

const API = 'https://api.mapbox.com/search/searchbox/v1'

function toResult(f: SearchBoxFeature): PlaceSearchResult | null {
  const p = f.properties ?? {}
  const lat = p.coordinates?.latitude ?? f.geometry?.coordinates?.[1]
  const lng = p.coordinates?.longitude ?? f.geometry?.coordinates?.[0]
  if (typeof lat !== 'number' || typeof lng !== 'number' || !p.name) return null
  const address = p.full_address || p.place_formatted || null
  return {
    id: p.mapbox_id ?? `${lat},${lng}`,
    name: p.name,
    address: address && address !== p.name ? address : (p.place_formatted ?? null),
    latitude: lat,
    longitude: lng,
    category: p.poi_category?.[0] ?? (p.feature_type && p.feature_type !== 'poi' ? p.feature_type : null),
  }
}

export function useMapbox() {
  const token = useRuntimeConfig().public.mapboxToken as string
  const enabled = computed(() => !!token)

  async function search(q: string, proximity?: { latitude: number, longitude: number } | null): Promise<PlaceSearchResult[]> {
    if (!token || q.trim().length < 2) return []
    const params = new URLSearchParams({
      q: q.trim().slice(0, 256),
      access_token: token,
      language: 'es',
      limit: '7',
      types: 'poi,address,street,place,locality,neighborhood',
    })
    if (proximity) params.set('proximity', `${proximity.longitude},${proximity.latitude}`)
    const res = await fetch(`${API}/forward?${params}`)
    if (!res.ok) throw new Error(res.status === 401 ? 'El token de Mapbox no es válido.' : 'No se pudo buscar el lugar.')
    const data = await res.json() as { features?: SearchBoxFeature[] }
    return (data.features ?? []).map(toResult).filter((r): r is PlaceSearchResult => !!r)
  }

  async function reverse(latitude: number, longitude: number): Promise<PlaceSearchResult | null> {
    if (!token) return null
    const params = new URLSearchParams({
      longitude: String(longitude),
      latitude: String(latitude),
      access_token: token,
      language: 'es',
      limit: '1',
    })
    try {
      const res = await fetch(`${API}/reverse?${params}`)
      if (!res.ok) return null
      const data = await res.json() as { features?: SearchBoxFeature[] }
      const r = data.features?.[0] ? toResult(data.features[0]) : null
      return r ? { ...r, latitude, longitude } : null
    }
    catch {
      return null
    }
  }

  return { token, enabled, search, reverse }
}

/** Link de Google Maps para llegar a un punto */
export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** Centro aproximado de una lista de puntos */
export function centroid(points: { latitude: number, longitude: number }[]) {
  if (!points.length) return null
  return {
    latitude: points.reduce((s, p) => s + p.latitude, 0) / points.length,
    longitude: points.reduce((s, p) => s + p.longitude, 0) / points.length,
  }
}
