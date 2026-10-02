import type { MemberTripView } from '~~/shared/types/trip'

// POST /api/v/:token/rsvp — body: { status: 'accepted' | 'declined' }
export default defineEventHandler(async (event) => {
  const token = getMemberToken(event)
  const body = await readBody<{ status?: unknown }>(event)
  const status = body?.status
  if (status !== 'accepted' && status !== 'declined') {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_STATUS', message: 'Respuesta no válida.' })
  }
  return memberRpc<MemberTripView>(event, 'member_respond', { p_token: token, p_status: status })
})
