/** Cómo se va de una parada a la siguiente */
export type RouteMode = 'walking' | 'driving'

/** Tramo del recorrido: por calles (walking/driving) o en línea recta si aún no hay ruta */
export interface RouteSegment {
  /** [lng, lat][] */
  coordinates: [number, number][]
  mode: RouteMode | 'straight'
}

/** Punto que se dibuja en el mapa */
export interface MapMarker {
  id: string
  latitude: number
  longitude: number
  /** texto dentro del pin (ej. número de orden) */
  label?: string
  /**
   * off: lugar guardado pero fuera de la votación (celeste y más chico).
   * catalog: lugar del catálogo que aún no está en el viaje (celeste punteado);
   * no cuenta para encuadrar el mapa.
   */
  tone?: 'primary' | 'success' | 'neutral' | 'warning' | 'off' | 'catalog'
  dimmed?: boolean
  /** cuenta para encuadrar el mapa (por defecto, todos menos los de tono catalog) */
  fit?: boolean
  title: string
  /** etiqueta guardada del lugar (ej. 'museum'): define icono y color del punto */
  category?: string | null
}
