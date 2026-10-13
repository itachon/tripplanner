/** Punto que se dibuja en el mapa */
export interface MapMarker {
  id: string
  latitude: number
  longitude: number
  /** texto dentro del pin (ej. número de orden) */
  label?: string
  /** off: lugar guardado pero fuera de la votación (celeste y más chico) */
  tone?: 'primary' | 'success' | 'neutral' | 'warning' | 'off'
  dimmed?: boolean
  title: string
}
