/** Punto que se dibuja en el mapa */
export interface MapMarker {
  id: string
  latitude: number
  longitude: number
  /** texto dentro del pin (ej. número de orden) */
  label?: string
  tone?: 'primary' | 'success' | 'neutral' | 'warning'
  dimmed?: boolean
  title: string
}
