/** Tipo de dato que lleva el arrastre de una parada (permite reconocerlo antes de soltar) */
export const STOP_DRAG_TYPE = 'application/x-itinerary-stop'

/** Lo mínimo de una parada para moverla de día */
export interface StopLike {
  id: string
  day: string
  sort_order: number
}

/**
 * Cambio para llevar una parada a otro día: queda al final de ese día
 * (entre las que tienen hora, el orden lo sigue mandando la hora).
 * null si no hay nada que cambiar: mismo día, o un día fuera del viaje.
 */
export function moveStopToDay(stop: StopLike, targetDay: string, stops: StopLike[], days: string[]): { day: string, sort_order: number } | null {
  if (stop.day === targetDay || !days.includes(targetDay)) return null
  const last = Math.max(0, ...stops.filter(s => s.day === targetDay && s.id !== stop.id).map(s => s.sort_order))
  return { day: targetDay, sort_order: last + 1 }
}
