import type { MemberPlace } from '~~/shared/types/trip'

// POST /api/v/:token/places/:placeId/vote — votar por un lugar
export default defineEventHandler(async (event) => {
  const places = await memberRpc<Omit<MemberPlace, 'photo_url'>[]>(event, 'member_vote', {
    p_token: getMemberToken(event),
    p_place_id: getPlaceId(event),
  })
  return withPhotoUrls(event, places)
})
