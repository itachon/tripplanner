<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PlaceSearchResult } from '~/composables/useMapbox'
import type { Place } from '~/composables/useTripAdmin'
import type { MapMarker } from '~~/shared/types/map'
import type { PlaceDraft } from './PlaceFormModal.vue'

const { places, votersByPlace, stopsByPlace, stats, refresh, openStopForm, placeInfoByPlace } = useTripCtx()
const { client } = useDb()
const photoUrl = usePlacePhotoUrl()
const photos = usePlacePhotos()
const { reverse } = useMapbox()
const toast = useToast()

const selectedId = ref<string | null>(null)
const hoverId = ref<string | null>(null)
const picking = ref(false)
const pendingPin = ref<{ latitude: number, longitude: number } | null>(null)
const sortBy = ref<'order' | 'votes'>('order')
const enriching = ref(new Set<string>())

const formOpen = ref(false)
const formDraft = ref<PlaceDraft | null>(null)
// Se guarda solo el id: así la ficha muestra los datos frescos tras cada refresh().
const detailId = ref<string | null>(null)
const deleteTarget = ref<Place | null>(null)
const busy = ref(false)

const detailOpen = computed({ get: () => !!detailId.value, set: (v) => { if (!v) detailId.value = null } })
const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })

// ---- Foto desde la ficha (se guarda al tiro, sin pasar por "Editar") ----
const photoBusy = ref(false)
const detailUrlMode = ref(false)
const detailUrl = ref('')
const detailFileInput = ref<HTMLInputElement | null>(null)

watch(detailId, () => {
  detailUrlMode.value = false
  detailUrl.value = ''
})

async function setDetailPhoto(getBlob: () => Promise<Blob>) {
  const p = detailPlace.value
  if (!p) return
  photoBusy.value = true
  try {
    await photos.replace(p, await getBlob())
    toast.add({ color: 'success', title: 'Foto actualizada' })
    detailUrlMode.value = false
    detailUrl.value = ''
    await refresh()
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo cambiar la foto', description: errorMessage(err) })
  }
  finally {
    photoBusy.value = false
  }
}

function onDetailFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) setDetailPhoto(() => compressImage(file))
}

function onDetailUrl() {
  const url = detailUrl.value.trim()
  if (url) setDetailPhoto(() => photos.fromUrl(url))
}

const near = computed(() => centroid(places.value))
const votesOf = (id: string) => votersByPlace.value.get(id)?.length ?? 0
const numberOf = computed(() => new Map(places.value.map((p, i) => [p.id, i + 1])))

const list = computed(() => {
  const arr = [...places.value]
  if (sortBy.value === 'votes') arr.sort((a, b) => votesOf(b.id) - votesOf(a.id) || a.sort_order - b.sort_order)
  return arr
})

const markers = computed<MapMarker[]>(() => places.value.map(p => ({
  id: p.id,
  latitude: p.latitude,
  longitude: p.longitude,
  label: String(numberOf.value.get(p.id)),
  tone: p.votable ? 'primary' : 'neutral',
  title: p.name,
})))

const placeById = computed(() => new Map(places.value.map(p => [p.id, p])))
const detailPlace = computed(() => (detailId.value ? placeById.value.get(detailId.value) ?? null : null))

// ---- Agregar ----
function onSearchSelect(r: PlaceSearchResult) {
  picking.value = false
  pendingPin.value = { latitude: r.latitude, longitude: r.longitude }
  formDraft.value = { result: r }
  formOpen.value = true
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
  formDraft.value = {
    result: { id: '', name, address, category, latitude: coords.latitude, longitude: coords.longitude },
  }
  formOpen.value = true
}

watch(formOpen, (o) => { if (!o) pendingPin.value = null })

async function onSaved(placeId: string, created: boolean) {
  await refresh()
  if (created) {
    selectedId.value = placeId
    enrichPlace(placeId)
  }
}

// ---- Info automática (Overpass + Wikidata + Wikipedia + Commons, sin IA) ----
async function enrichPlace(id: string, force = false) {
  if (enriching.value.has(id)) return
  enriching.value = new Set(enriching.value).add(id)
  try {
    await $fetch(`/api/admin/places/${id}/enrich`, { method: 'POST', query: force ? { force: 1 } : undefined })
    if (force) toast.add({ title: 'Info del lugar actualizada' })
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo buscar la info del lugar', description: errorMessage(err) })
  }
  finally {
    const next = new Set(enriching.value)
    next.delete(id)
    enriching.value = next
    await refresh()
  }
}

// ---- Acciones ----
function edit(p: Place) {
  formDraft.value = { place: p }
  formOpen.value = true
}

async function toggleVotable(p: Place) {
  const { error } = await client.from('places').update({ votable: !p.votable }).eq('id', p.id)
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar', description: errorMessage(error) })
  toast.add({ title: p.votable ? 'Quitado de la votación' : 'Agregado a la votación' })
  await refresh()
}

async function move(p: Place, dir: -1 | 1) {
  const arr = [...places.value]
  const i = arr.findIndex(x => x.id === p.id)
  const other = arr[i + dir]
  if (!other) return
  arr[i] = other
  arr[i + dir] = p
  const updates = arr.map((x, idx) => ({ id: x.id, sort_order: idx + 1, changed: x.sort_order !== idx + 1 })).filter(x => x.changed)
  await Promise.all(updates.map(u => client.from('places').update({ sort_order: u.sort_order }).eq('id', u.id)))
  await refresh()
}

function menu(p: Place): DropdownMenuItem[][] {
  const idx = places.value.findIndex(x => x.id === p.id)
  return [
    [
      { label: 'Ver ficha', icon: 'i-lucide-file-text', onSelect: () => { detailId.value = p.id } },
      { label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => edit(p) },
      { label: 'Buscar info del lugar', icon: 'i-lucide-search', disabled: enriching.value.has(p.id), onSelect: () => enrichPlace(p.id, true) },
      { label: 'Agregar al itinerario', icon: 'i-lucide-calendar-plus', onSelect: () => openStopForm({ placeId: p.id }) },
    ],
    [
      { label: p.votable ? 'Quitar de la votación' : 'Poner en votación', icon: p.votable ? 'i-lucide-vote' : 'i-lucide-check-square', onSelect: () => toggleVotable(p) },
      { label: 'Mover arriba', icon: 'i-lucide-arrow-up', disabled: idx <= 0, onSelect: () => move(p, -1) },
      { label: 'Mover abajo', icon: 'i-lucide-arrow-down', disabled: idx === places.value.length - 1, onSelect: () => move(p, 1) },
    ],
    [{ label: 'Borrar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = p } }],
  ]
}

const deleteWarning = computed(() => {
  const p = deleteTarget.value
  if (!p) return ''
  const parts: string[] = []
  const v = votesOf(p.id)
  const s = stopsByPlace.value.get(p.id)?.length ?? 0
  if (v) parts.push(`sus ${v} ${v === 1 ? 'voto' : 'votos'}`)
  if (s) parts.push(`${s} ${s === 1 ? 'parada' : 'paradas'} del itinerario`)
  return parts.length ? `También se borrarán ${parts.join(' y ')}.` : 'Se quitará del mapa.'
})

async function confirmDelete() {
  const p = deleteTarget.value
  if (!p) return
  busy.value = true
  const { error } = await client.from('places').delete().eq('id', p.id)
  if (!error) await photos.remove(p.photo_path)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
  if (selectedId.value === p.id) selectedId.value = null
  toast.add({ title: 'Lugar borrado' })
  await refresh()
}

function selectFromList(p: Place) {
  selectedId.value = selectedId.value === p.id ? null : p.id
}

function showDetail(p: Place) {
  detailId.value = p.id
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
    <!-- Mapa -->
    <div class="h-[360px] overflow-hidden rounded-lg border border-default sm:h-[480px] lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:max-h-[720px]">
      <TripMap
        :markers="markers"
        :selected-id="selectedId"
        :highlight-id="hoverId"
        :picking="picking"
        :pending-pin="pendingPin"
        @select="selectedId = $event"
        @pick="onPick"
      >
        <template #card="{ marker, pinned, close }">
          <UCard v-if="placeById.get(marker.id)" :ui="{ body: 'p-3 sm:p-3 max-h-[260px] overflow-y-auto', footer: 'px-3 py-2 sm:px-3' }" class="shadow-xl">
            <PlaceInfoCard
              v-bind="{
                name: placeById.get(marker.id)!.name,
                address: placeById.get(marker.id)!.address,
                category: placeById.get(marker.id)!.category,
                description: placeById.get(marker.id)!.description,
                photoUrl: photoUrl(placeById.get(marker.id)!.photo_path),
                info: placeInfoByPlace.get(marker.id) ?? null,
                loading: enriching.has(marker.id),
              }"
              compact
            />
            <template #footer>
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="flex items-center gap-1 font-medium">
                  <UIcon name="i-lucide-heart" class="size-3.5 text-primary" />
                  {{ votesOf(marker.id) }} {{ votesOf(marker.id) === 1 ? 'voto' : 'votos' }}
                </span>
                <div v-if="pinned" class="flex gap-1">
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-file-text" @click="showDetail(placeById.get(marker.id)!)">
                    Ficha
                  </UButton>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Cerrar" @click="close" />
                </div>
              </div>
            </template>
          </UCard>
        </template>
      </TripMap>
    </div>

    <!-- Lista -->
    <div class="space-y-3">
      <div class="space-y-2">
        <PlaceSearch :near="near" @select="onSearchSelect" />
        <div class="flex items-center justify-between gap-2">
          <UButton
            size="sm"
            :color="picking ? 'warning' : 'neutral'"
            :variant="picking ? 'soft' : 'outline'"
            icon="i-lucide-crosshair"
            @click="picking = !picking"
          >
            {{ picking ? 'Cancelar' : 'Marcar en el mapa' }}
          </UButton>
          <USelect
            v-model="sortBy"
            size="sm"
            :items="[{ label: 'Orden propio', value: 'order' }, { label: 'Más votados', value: 'votes' }]"
            class="w-36"
          />
        </div>
      </div>

      <UEmpty
        v-if="!places.length"
        icon="i-lucide-map-pinned"
        title="Aún no hay lugares"
        description="Busca un lugar arriba o márcalo en el mapa. A cada lugar se le busca automáticamente historia, horarios y foto."
        class="rounded-lg border border-dashed border-default bg-default py-10"
      />

      <template v-else>
        <p class="text-xs text-muted">
          {{ stats.places }} lugares · {{ stats.votable }} en votación · {{ stats.votes }} votos
        </p>
        <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
          <li
            v-for="p in list"
            :key="p.id"
            class="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition"
            :class="selectedId === p.id ? 'bg-primary/5' : 'hover:bg-elevated/60'"
            @mouseenter="hoverId = p.id"
            @mouseleave="hoverId = null"
            @click="selectFromList(p)"
          >
            <span
              class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              :class="p.votable ? 'bg-primary' : 'bg-neutral-500'"
            >{{ numberOf.get(p.id) }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium leading-snug">
                {{ p.name }}
              </p>
              <p v-if="p.address" class="truncate text-xs text-muted">
                {{ p.address }}
              </p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <UBadge v-if="p.votable" :color="votesOf(p.id) ? 'primary' : 'neutral'" variant="subtle" size="sm" icon="i-lucide-heart">
                  {{ votesOf(p.id) }}
                </UBadge>
                <UBadge v-else color="neutral" variant="outline" size="sm">
                  No votable
                </UBadge>
                <UBadge v-if="stopsByPlace.get(p.id)?.length" color="success" variant="subtle" size="sm" icon="i-lucide-calendar-check">
                  En itinerario
                </UBadge>
                <UTooltip v-if="enriching.has(p.id)" text="Buscando info del lugar">
                  <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
                </UTooltip>
                <UTooltip v-else-if="placeInfoByPlace.get(p.id)" text="Tiene info automática">
                  <UIcon name="i-lucide-info" class="size-4 text-primary" />
                </UTooltip>
              </div>
              <p v-if="votersByPlace.get(p.id)?.length" class="mt-1 line-clamp-2 text-xs text-muted" data-testid="voters">
                Votaron: {{ votersByPlace.get(p.id)!.map(m => m.name).join(', ') }}
              </p>
            </div>
            <UDropdownMenu :items="menu(p)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Acciones" @click.stop />
            </UDropdownMenu>
          </li>
        </ul>
      </template>
    </div>

    <PlaceFormModal v-model:open="formOpen" :draft="formDraft" @saved="onSaved" />

    <UModal v-model:open="detailOpen" title="Ficha del lugar">
      <template #body>
        <PlaceInfoCard
          v-if="detailPlace"
          :name="detailPlace.name"
          :address="detailPlace.address"
          :category="detailPlace.category"
          :description="detailPlace.description"
          :photo-url="photoUrl(detailPlace.photo_path)"
          :info="placeInfoByPlace.get(detailPlace.id) ?? null"
          :loading="enriching.has(detailPlace.id)"
          :latitude="detailPlace.latitude"
          :longitude="detailPlace.longitude"
        />
      </template>
      <template #footer>
        <div class="w-full space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-upload" :loading="photoBusy" @click="detailFileInput?.click()">
              {{ detailPlace?.photo_path ? 'Cambiar foto' : 'Subir foto' }}
            </UButton>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-link" :disabled="photoBusy" @click="detailUrlMode = !detailUrlMode">
              Foto desde URL
            </UButton>
            <input ref="detailFileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onDetailFile">
          </div>
          <div v-if="detailUrlMode" class="flex gap-2">
            <UInput
              v-model="detailUrl"
              type="url"
              placeholder="https://…/foto.jpg"
              class="flex-1"
              autofocus
              @keydown.enter.prevent="onDetailUrl"
            />
            <UButton size="sm" :loading="photoBusy" :disabled="!detailUrl.trim()" @click="onDetailUrl">
              Usar
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <ConfirmModal
      v-model:open="deleteOpen"
      :title="`¿Borrar ${deleteTarget?.name}?`"
      :description="deleteWarning"
      confirm-label="Borrar"
      :loading="busy"
      @confirm="confirmDelete"
    />
  </div>
</template>
