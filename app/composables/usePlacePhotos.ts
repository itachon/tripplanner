/** Subida y limpieza de fotos de lugares en el bucket place-photos */
export function usePlacePhotos() {
  const { client } = useDb()
  const bucket = () => client.storage.from('place-photos')

  async function upload(tripId: string, blob: Blob): Promise<string> {
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${tripId}/${crypto.randomUUID()}.${ext}`
    const { error } = await bucket().upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
    if (error) throw error
    return path
  }

  async function remove(path: string | null | undefined) {
    if (path) await bucket().remove([path])
  }

  /** Descarga una imagen desde una URL (vía el servidor, por CORS) y la deja lista para subir */
  async function fromUrl(url: string): Promise<Blob> {
    const raw = await $fetch<Blob>('/api/admin/image-fetch', { method: 'POST', body: { url }, responseType: 'blob' })
    return compressImage(raw)
  }

  /** Reemplaza la foto de un lugar ya guardado y borra la anterior */
  async function replace(place: { id: string, trip_id: string, photo_path: string | null }, blob: Blob) {
    const path = await upload(place.trip_id, blob)
    const { error } = await client.from('places').update({ photo_path: path }).eq('id', place.id)
    if (error) {
      await remove(path)
      throw error
    }
    await remove(place.photo_path)
    return path
  }

  return { upload, remove, fromUrl, replace }
}
