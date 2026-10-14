/**
 * Ficha automática de un lugar del viaje (Overpass + Wikidata + Wikipedia + Commons, sin IA).
 * Lo que se está buscando se comparte entre pestañas, para mostrar el aviso de carga en ambas.
 */
export function usePlaceEnrich() {
  const { refresh, placeInfoByPlace } = useTripCtx()
  const toast = useToast()
  const enriching = useState('place-enriching', () => new Set<string>())

  /** force: búsqueda manual, ignora la caché del servidor */
  async function enrich(placeId: string, force = false) {
    if (enriching.value.has(placeId)) return
    enriching.value = new Set(enriching.value).add(placeId)
    try {
      await $fetch(`/api/admin/places/${placeId}/enrich`, { method: 'POST', query: force ? { force: 1 } : undefined })
      if (force) toast.add({ title: 'Info del lugar actualizada' })
    }
    catch (err) {
      toast.add({ color: 'error', title: 'No se pudo buscar la info del lugar', description: errorMessage(err) })
    }
    finally {
      const next = new Set(enriching.value)
      next.delete(placeId)
      enriching.value = next
      await refresh()
    }
  }

  /** Busca la ficha solo si el lugar aún no tiene (ej. uno del catálogo que nunca se buscó) */
  function enrichIfMissing(placeId: string) {
    if (!placeInfoByPlace.value.has(placeId)) enrich(placeId)
  }

  return { enriching, enrich, enrichIfMissing }
}
