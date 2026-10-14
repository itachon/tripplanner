export interface MapBox { south: number, west: number, north: number, east: number }

function wrapLng(lng: number) {
  if (lng >= -180 && lng <= 180) return lng
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

/**
 * Zona visible del mapa con longitudes en ±180. Si cruza el antimeridiano,
 * west queda mayor que east (así la espera catalog_in_bounds).
 */
export function mapBox(west: number, south: number, east: number, north: number): MapBox {
  if (east - west >= 360) return { south, west: -180, north, east: 180 }
  return { south, west: wrapLng(west), north, east: wrapLng(east) }
}
