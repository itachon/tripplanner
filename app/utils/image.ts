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
