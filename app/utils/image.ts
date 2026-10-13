/**
 * Reduce una foto en el navegador antes de subirla:
 * máximo 1200 px por lado, WebP (o JPEG si el navegador no soporta WebP).
 * Una foto de celular de 4 MB queda en ~150 KB.
 */
export async function compressImage(file: Blob, maxSide = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, w, h)
  if ('close' in bitmap) (bitmap as ImageBitmap).close()

  const toBlob = (type: string) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))

  const webp = await toBlob('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob('image/jpeg')
  if (!jpeg) throw new Error('No se pudo procesar la imagen')
  return jpeg
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // respeta la orientación EXIF de fotos de celular
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    }
    catch { /* se intenta con <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  }
  catch {
    throw new Error('Formato de imagen no soportado. Usa JPG, PNG o WebP.')
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

/** Lo mínimo de un lugar para elegir su foto */
export interface CoverCandidate {
  photo_url?: string | null
  info?: { photo_url?: string | null } | null
  vote_count?: number | null
}

/** Mejor foto disponible de un lugar: la subida y, si falta, la de su ficha */
export function placePhoto(p: CoverCandidate): string | null {
  return p.photo_url || p.info?.photo_url || null
}

/**
 * Foto de portada de un viaje: la del lugar más votado que tenga foto.
 * En un empate (o sin votos) gana el primero de la lista.
 */
export function coverPhoto(places: CoverCandidate[]): string | null {
  let best: string | null = null
  let bestVotes = -1
  for (const p of places) {
    const url = placePhoto(p)
    if (!url) continue
    const votes = p.vote_count ?? 0
    if (votes > bestVotes) {
      best = url
      bestVotes = votes
    }
  }
  return best
}
