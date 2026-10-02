import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { serverSupabaseUser } from '#supabase/server'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_REDIRECTS = 3
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

/**
 * POST /api/admin/image-fetch  { url }
 * Descarga una imagen desde una URL pública y la devuelve tal cual, para que
 * el navegador la comprima y la suba al bucket (la mayoría de los sitios
 * bloquean la descarga directa desde el navegador por CORS).
 * Solo usuarios con sesión, solo http(s) y nunca hacia redes internas.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Debes iniciar sesión.' })

  const { url } = await readBody<{ url?: string }>(event) ?? {}
  let target = parseUrl(url)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(target.hostname)

    const res = await fetch(target, {
      redirect: 'manual', // cada salto se vuelve a validar
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'TripPlanner/1.0', 'Accept': 'image/*' },
    }).catch(() => null)
    if (!res) throw createError({ statusCode: 502, message: 'No se pudo descargar la imagen.' })

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) break
      target = parseUrl(new URL(next, target).toString())
      continue
    }
    if (!res.ok || !res.body) throw createError({ statusCode: 502, message: `El sitio respondió ${res.status}.` })

    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!TYPES.includes(type)) throw createError({ statusCode: 415, message: 'La URL no es una imagen (JPG, PNG, WebP, GIF o AVIF).' })
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw tooBig()

    const bytes = await readLimited(res.body)
    setHeader(event, 'Content-Type', type)
    setHeader(event, 'Cache-Control', 'no-store')
    return bytes
  }
  throw createError({ statusCode: 502, message: 'Demasiadas redirecciones.' })
})

function parseUrl(raw: unknown) {
  let u: URL
  try {
    u = new URL(String(raw ?? '').trim())
  }
  catch {
    throw createError({ statusCode: 400, message: 'La URL no es válida.' })
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw createError({ statusCode: 400, message: 'Solo se aceptan URLs http o https.' })
  if (u.username || u.password) throw createError({ statusCode: 400, message: 'La URL no es válida.' })
  return u
}

async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [host] : await lookup(host, { all: true }).then(r => r.map(a => a.address)).catch(() => [])
  if (!addrs.length) throw createError({ statusCode: 400, message: 'No se encontró el sitio de la URL.' })
  if (addrs.some(isPrivate)) throw createError({ statusCode: 400, message: 'Esa URL no está permitida.' })
}

function isPrivate(ip: string) {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) // CGNAT
      || (a === 169 && b === 254) // link-local / metadata de nubes
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
  }
  const x = ip.toLowerCase()
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff')
}

async function readLimited(body: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > MAX_BYTES) throw tooBig()
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const tooBig = () => createError({ statusCode: 413, message: 'La imagen pesa más de 10 MB.' })
