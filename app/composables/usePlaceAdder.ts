import type { Ref } from 'vue'
import type { PlaceSearchResult } from '~/composables/useMapbox'
import type { CatalogPlace } from '~~/shared/types/catalog'
import type { PlaceDraft } from '~/components/place/PlaceFormModal.vue'

export interface PlaceAdderOptions {
  tripId: Ref<string | undefined>
  /** si los lugares nuevos entran a la votación (se puede cambiar en el formulario) */
  votable: boolean
  /** después de sumar un lugar al viaje (created: lo creó el formulario) */
  onAdded: (placeId: string, created: boolean) => void | Promise<void>
  /** después de guardar un lugar ya existente desde el formulario */
  onEdited?: (placeId: string) => void | Promise<void>
}

/**
 * Sumar lugares al viaje: desde el buscador, marcando un punto en el mapa (con
 * sugerencia de lugares del catálogo a 100 m o menos) o eligiendo uno del catálogo.
 * Sus diálogos los dibuja <PlaceAddDialogs :adder="…">.
 */
export function usePlaceAdder(opts: PlaceAdderOptions) {
  const catalog = useCatalog()
  const { reverse } = useMapbox()
  const toast = useToast()

  const picking = ref(false)
  const pendingPin = ref<{ latitude: number, longitude: number } | null>(null)
  const formOpen = ref(false)
  const formDraft = ref<PlaceDraft | null>(null)
  const nearby = ref<CatalogPlace[]>([])
  const nearbyDraft = ref<PlaceDraft | null>(null)
  const adding = ref<string | null>(null)

  function closeNearby() {
    nearby.value = []
    nearbyDraft.value = null
    if (!formOpen.value) pendingPin.value = null
  }
  const nearbyOpen = computed({ get: () => nearby.value.length > 0, set: (v) => { if (!v) closeNearby() } })

  function openForm(draft: PlaceDraft) {
    formDraft.value = { votable: opts.votable, ...draft }
    formOpen.value = true
  }

  function createFromNearby() {
    const draft = nearbyDraft.value
    nearby.value = []
    nearbyDraft.value = null
    if (draft) openForm(draft)
  }

  /** Suma al viaje un lugar que ya está en el catálogo, con su foto y su ficha */
  async function addFromCatalog(c: CatalogPlace) {
    if (!opts.tripId.value || adding.value) return
    adding.value = c.id
    try {
      const res = await catalog.addExisting(opts.tripId.value, c.id, opts.votable)
      toast.add({ color: 'success', title: 'Lugar agregado', description: `${c.name} ya estaba en el catálogo.` })
      await opts.onAdded(res.place_id, false)
    }
    catch (err) {
      toast.add({ color: 'error', title: 'No se pudo agregar', description: errorMessage(err) })
    }
    finally {
      adding.value = null
    }
  }

  async function useNearby(c: CatalogPlace) {
    nearby.value = []
    nearbyDraft.value = null
    pendingPin.value = null
    await addFromCatalog(c)
  }

  function onSearchSelect(r: PlaceSearchResult) {
    picking.value = false
    pendingPin.value = { latitude: r.latitude, longitude: r.longitude }
    openForm({ result: r })
  }

  async function onPick(coords: { latitude: number, longitude: number, name?: string | null, category?: string | null }) {
    picking.value = false
    pendingPin.value = coords
    // Si el clic cayó sobre un punto de interés del mapa, usamos su nombre directo.
    // Si no, lo tratamos como un punto libre y buscamos la dirección más cercana.
    let name = coords.name ?? ''
    let address: string | null = null
    let category = coords.category ?? null
    if (!name) {
      const found = await reverse(coords.latitude, coords.longitude)
      name = found?.name ?? ''
      address = found?.address ?? null
      category = found?.category ?? null
    }
    const draft: PlaceDraft = {
      result: { id: '', name, address, category, latitude: coords.latitude, longitude: coords.longitude },
    }
    // Si la consulta falla, se sigue al formulario como siempre
    const found = opts.tripId.value ? await catalog.near(coords.latitude, coords.longitude, opts.tripId.value).catch(() => []) : []
    if (found.length) {
      nearbyDraft.value = draft
      nearby.value = found
      return
    }
    openForm(draft)
  }

  async function onSaved(placeId: string, created: boolean) {
    if (created) await opts.onAdded(placeId, true)
    else await opts.onEdited?.(placeId)
  }

  watch(formOpen, (o) => { if (!o) pendingPin.value = null })

  return reactive({
    picking, pendingPin, formOpen, formDraft, nearby, nearbyOpen, adding,
    openForm, closeNearby, createFromNearby, addFromCatalog, useNearby, onSearchSelect, onPick, onSaved,
  })
}

export type PlaceAdder = ReturnType<typeof usePlaceAdder>
