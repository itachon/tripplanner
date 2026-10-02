import type { MemberTripView } from '~~/shared/types/trip'

// GET /api/v/:token — viaje, estado del viajero e itinerario (si está publicado)
export default defineEventHandler((event) => {
  return memberRpc<MemberTripView>(event, 'member_get_trip', { p_token: getMemberToken(event) })
})
