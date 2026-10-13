/**
 * Identificador de Mapbox apto para reconocer "el mismo lugar".
 * useMapbox arma un id de respaldo "lat,lng" cuando Mapbox no entrega uno,
 * y un punto marcado a mano llega con id vacío: ninguno de los dos sirve.
 */
export function realMapboxId(id: string | null | undefined): string | null {
  const v = (id ?? '').trim()
  if (!v || /^-?[0-9.]+,-?[0-9.]+$/.test(v)) return null
  return v
}
