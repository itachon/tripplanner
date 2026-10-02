import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database.types'
import type { MemberPlace } from '~~/shared/types/trip'

type Fns = Database['public']['Functions']
type MemberFn = Extract<keyof Fns, `member_${string}`>

const TOKEN_RE = /^[0-9a-f]{32}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Errores de las funciones member_* → respuesta HTTP con texto amigable */
const MEMBER_ERRORS: Record<string, { statusCode: number, message: string }> = {
  MEMBER_NOT_FOUND: { statusCode: 404, message: 'Este link no existe o ya no es válido.' },
  DEADLINE_PASSED: { statusCode: 409, message: 'La fecha límite para confirmar y votar ya pasó.' },
  INVALID_STATUS: { statusCode: 400, message: 'Respuesta no válida.' },
  NOT_ACCEPTED: { statusCode: 409, message: 'Primero confirma que vas al viaje para poder votar.' },
  PLACE_NOT_FOUND: { statusCode: 404, message: 'Ese lugar no existe.' },
  PLACE_NOT_VOTABLE: { statusCode: 409, message: 'Ese lugar ya no está en votación.' },
}

export function getMemberToken(event: H3Event): string {
  const token = getRouterParam(event, 'token') ?? ''
  if (!TOKEN_RE.test(token)) {
    throw createError({ statusCode: 404, statusMessage: 'MEMBER_NOT_FOUND', message: MEMBER_ERRORS.MEMBER_NOT_FOUND!.message })
  }
  return token
}

export function getPlaceId(event: H3Event): string {
  const id = getRouterParam(event, 'placeId') ?? ''
  if (!UUID_RE.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'PLACE_NOT_FOUND', message: MEMBER_ERRORS.PLACE_NOT_FOUND!.message })
  }
  return id
}

/** Única vía por la que un viajero llega a la base de datos */
export async function memberRpc<T, F extends MemberFn = MemberFn>(event: H3Event, fn: F, args: Fns[F]['Args']): Promise<T> {
  const client = serverSupabaseServiceRole<Database>(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)(fn, args)
  if (error) {
    const known = MEMBER_ERRORS[error.message]
    if (known) throw createError({ statusCode: known.statusCode, statusMessage: error.message, message: known.message })
    console.error(`[${fn}]`, error)
    throw createError({ statusCode: 500, message: 'Ocurrió un error. Intenta nuevamente.' })
  }
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return data as T
}

/**
 * Agrega la URL pública de cada foto. La subida a mano manda; si no hay,
 * se usa la foto automática (Wikipedia/Commons/Pexels) del place_info.
 */
export function withPhotoUrls(event: H3Event, places: Omit<MemberPlace, 'photo_url'>[]): MemberPlace[] {
  const storage = serverSupabaseServiceRole<Database>(event).storage.from('place-photos')
  return places.map((p) => {
    const manual = p.photo_path ? storage.getPublicUrl(p.photo_path).data.publicUrl : null
    return { ...p, photo_url: manual ?? p.info?.photo_url ?? null }
  })
}
