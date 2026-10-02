import type { MemberPlace } from '~~/shared/types/trip'

// GET /api/v/:token/places — lugares con conteo de votos (sin nombres)
export default defineEventHandler(async (event) => {
  const places = await memberRpc<Omit<MemberPlace, 'photo_url'>[]>(event, 'member_list_places', { p_token: getMemberToken(event) })
  return withPhotoUrls(event, places)
})
