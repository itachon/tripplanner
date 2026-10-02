import type { MemberPlace } from '~~/shared/types/trip'

// DELETE /api/v/:token/places/:placeId/vote — quitar el voto
export default defineEventHandler(async (event) => {
  const places = await memberRpc<Omit<MemberPlace, 'photo_url'>[]>(event, 'member_unvote', {
    p_token: getMemberToken(event),
    p_place_id: getPlaceId(event),
  })
  return withPhotoUrls(event, places)
})
