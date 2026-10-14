import type { MapMarker } from '~~/shared/types/map'

export interface MarkerLook {
  small: boolean
  style: Record<string, string>
}

const WHITE = '#ffffff'
// 45 % de opacidad en hex de 8 dígitos (0,45 × 255 ≈ 0x73)
const ALPHA_45 = '73'

/** Aspecto de un punto con categoría: el color es la categoría; el estado, el borde y la opacidad */
export function markerLook(tone: MapMarker['tone'], color: string): MarkerLook {
  if (tone === 'catalog') return { small: true, style: { backgroundColor: WHITE, color, borderColor: color, borderStyle: 'dashed' } }
  if (tone === 'off') return { small: true, style: { backgroundColor: color + ALPHA_45, color: WHITE, borderColor: WHITE, borderStyle: 'solid' } }
  return { small: false, style: { backgroundColor: color, color: WHITE, borderColor: WHITE, borderStyle: 'solid' } }
}
