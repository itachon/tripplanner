<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Stop } from '~/composables/useTripAdmin'
import type { MapMarker } from '~~/shared/types/map'
import type { TimelineItem } from './ItineraryTimeline.vue'

const { trip, days, stops, stopsByDay, placeById, stats, refresh, openStopForm, stopTitle, placeInfoByPlace } = useTripCtx()
const { client } = useDb()
const photoUrl = usePlacePhotoUrl()
const toast = useToast()

const day = ref<string>('all')
const hoverPlace = ref<string | null>(null)
const selectedPlace = ref<string | null>(null)
const publishing = ref(false)
const deleteTarget = ref<Stop | null>(null)
const busy = ref(false)
const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })

const dayChips = computed(() => [
  { label: 'Todo el viaje', value: 'all' },
  ...days.value.map((d, i) => ({ label: `Día ${i + 1}`, value: d, count: stopsByDay.value.get(d)?.length ?? 0 })),
])

/** número de cada parada con lugar dentro de su día */
const numbers = computed(() => {
  const map = new Map<string, number>()
  for (const list of stopsByDay.value.values()) {
    let n = 0
    for (const s of list) if (s.place_id && placeById.value.has(s.place_id)) map.set(s.id, ++n)
  }
  return map
})

const items = computed<TimelineItem[]>(() => stops.value.map(s => ({
  id: s.id,
  day: s.day,
  start_time: s.start_time,
  end_time: s.end_time,
  title: stopTitle(s),
  subtitle: s.place_id ? (s.title ? placeById.value.get(s.place_id)?.name : placeById.value.get(s.place_id)?.address) : null,
  notes: s.notes,
  place_id: s.place_id,
  number: day.value === 'all' ? undefined : numbers.value.get(s.id),
})))

const visibleStops = computed(() =>
  (day.value === 'all' ? stops.value : stopsByDay.value.get(day.value) ?? []).filter(s => s.place_id && placeById.value.has(s.place_id)),
)

// Un pin por lugar (si un lugar se repite, se muestra una vez)
const markers = computed<MapMarker[]>(() => {
  const seen = new Set<string>()
  const out: MapMarker[] = []
  for (const s of visibleStops.value) {
    const p = placeById.value.get(s.place_id!)!
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      label: day.value === 'all' ? String(days.value.indexOf(s.day) + 1) : String(numbers.value.get(s.id) ?? ''),
      tone: 'primary',
      title: p.name,
    })
  }
  return out
})

const route = computed<[number, number][] | null>(() => {
  if (day.value === 'all') return null
  return visibleStops.value.map(s => {
    const p = placeById.value.get(s.place_id!)!
    return [p.longitude, p.latitude] as [number, number]
  })
})

const stopsAtPlace = (placeId: string) => visibleStops.value.filter(s => s.place_id === placeId)

async function togglePublish(value: boolean) {
  if (!trip.value) return
  publishing.value = true
  const { error } = await client.from('trips').update({ itinerary_published: value }).eq('id', trip.value.id)
  publishing.value = false
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar', description: errorMessage(error) })
  toast.add({
    color: value ? 'success' : 'neutral',
    title: value ? 'Itinerario publicado' : 'Itinerario oculto',
    description: value ? 'Los viajeros ya pueden verlo desde su link.' : 'Los viajeros ya no lo ven.',
  })
  await refresh()
}

async function move(s: Stop, dir: -1 | 1) {
  const list = [...(stopsByDay.value.get(s.day) ?? [])]
  const i = list.findIndex(x => x.id === s.id)
  const other = list[i + dir]
  if (!other) return
  list[i] = other
  list[i + dir] = s
  const updates = list.map((x, idx) => ({ id: x.id, sort_order: idx + 1, changed: x.sort_order !== idx + 1 })).filter(x => x.changed)
  await Promise.all(updates.map(u => client.from('itinerary_stops').update({ sort_order: u.sort_order }).eq('id', u.id)))
  await refresh()
}

/** Cambia una parada de día (al soltarla sobre otro día o desde el menú). Conserva su hora. */
async function moveToDay(stopId: string, target: string) {
  const s = stops.value.find(x => x.id === stopId)
  if (!s) return
  const change = moveStopToDay(s, target, stops.value, days.value)
  if (!change) return
  const { error } = await client.from('itinerary_stops').update(change).eq('id', s.id)
  if (error) return toast.add({ color: 'error', title: 'No se pudo mover la parada', description: errorMessage(error) })
  toast.add({ color: 'success', title: `Parada movida al Día ${days.value.indexOf(target) + 1}`, description: stopTitle(s) })
  await refresh()
}

// Las fichas de día también reciben paradas: sirven cuando se está viendo un solo día
const chipOver = ref<string | null>(null)
const isStopDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes(STOP_DRAG_TYPE)
function onChipDragOver(e: DragEvent, d: string) {
  if (d === 'all' || !isStopDrag(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  chipOver.value = d
}
function onChipDrop(e: DragEvent, d: string) {
  chipOver.value = null
  const id = e.dataTransfer?.getData(STOP_DRAG_TYPE)
  if (d === 'all' || !id) return
  e.preventDefault()
  moveToDay(id, d)
}

function menu(it: TimelineItem): DropdownMenuItem[][] {
  const s = stops.value.find(x => x.id === it.id)!
  const list = stopsByDay.value.get(s.day) ?? []
  const i = list.findIndex(x => x.id === s.id)
  const otherDays = days.value
    .map((d, n) => ({ label: `Día ${n + 1} · ${formatDayShort(d)}`, day: d }))
    .filter(x => x.day !== s.day)
    .map(x => ({ label: x.label, onSelect: () => { moveToDay(s.id, x.day) } }))
  return [
    [
      { label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => openStopForm({ stop: s }) },
      { label: 'Mover antes', icon: 'i-lucide-arrow-up', disabled: i <= 0, onSelect: () => move(s, -1) },
      { label: 'Mover después', icon: 'i-lucide-arrow-down', disabled: i === list.length - 1, onSelect: () => move(s, 1) },
      { label: 'Mover a otro día', icon: 'i-lucide-calendar-days', disabled: !otherDays.length, children: otherDays },
    ],
    [{ label: 'Quitar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = s } }],
  ]
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  busy.value = true
  const { error } = await client.from('itinerary_stops').delete().eq('id', deleteTarget.value.id)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo quitar', description: errorMessage(error) })
  toast.add({ title: 'Parada quitada' })
  await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <UCard :ui="{ body: 'p-4 sm:p-4' }">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <USwitch
          :model-value="trip?.itinerary_published ?? false"
          :loading="publishing"
          label="Itinerario visible para los viajeros"
          :description="trip?.itinerary_published ? 'Los viajeros lo ven desde su link.' : 'Mientras esté oculto, puedes armarlo con calma.'"
          @update:model-value="togglePublish"
        />
        <UButton icon="i-lucide-plus" @click="openStopForm({ day: day === 'all' ? null : day })">
          Agregar parada
        </UButton>
      </div>
    </UCard>

    <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <UButton
        v-for="c in dayChips"
        :key="c.value"
        size="sm"
        :color="day === c.value ? 'primary' : 'neutral'"
        :variant="day === c.value ? 'solid' : 'outline'"
        class="shrink-0"
        :class="chipOver === c.value ? 'outline-2 outline-offset-2 outline-dashed outline-primary' : ''"
        @click="day = c.value"
        @dragover="onChipDragOver($event, c.value)"
        @dragleave="chipOver = null"
        @drop="onChipDrop($event, c.value)"
      >
        {{ c.label }}
        <UBadge v-if="'count' in c && c.count" size="sm" :color="day === c.value ? 'neutral' : 'primary'" variant="subtle">
          {{ c.count }}
        </UBadge>
      </UButton>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div class="order-2 lg:order-1">
        <UEmpty
          v-if="!stats.stops && day === 'all'"
          icon="i-lucide-calendar-plus"
          title="El itinerario está vacío"
          description="Agrega paradas con día y horario. Pueden ser lugares del mapa o actividades libres como vuelos o tiempo libre."
          :actions="[{ label: 'Agregar parada', icon: 'i-lucide-plus', onClick: () => openStopForm({}) }]"
          class="rounded-lg border border-dashed border-default bg-default py-12"
        />
        <ItineraryTimeline
          v-else
          :days="days"
          :items="items"
          :day="day"
          :highlight-id="hoverPlace"
          draggable
          @hover="hoverPlace = $event"
          @focus="selectedPlace = $event"
          @move="moveToDay"
        >
          <template #dayActions="{ day: d }">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" @click="openStopForm({ day: d })">
              Agregar
            </UButton>
          </template>
          <template #actions="{ item }">
            <UDropdownMenu :items="menu(item)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Acciones" />
            </UDropdownMenu>
          </template>
        </ItineraryTimeline>
      </div>

      <div class="order-1 lg:order-2">
        <div class="h-[320px] overflow-hidden rounded-lg border border-default sm:h-[420px] lg:sticky lg:top-20">
          <TripMap
            :markers="markers"
            :route="route"
            :highlight-id="hoverPlace"
            :selected-id="selectedPlace"
            :fit-key="day"
            @select="selectedPlace = $event"
          >
            <template #card="{ marker, pinned, close }">
              <UCard v-if="placeById.get(marker.id)" :ui="{ body: 'p-3 sm:p-3 max-h-[320px] overflow-y-auto' }" class="shadow-xl">
                <p v-for="s in stopsAtPlace(marker.id)" :key="s.id" class="mb-1 text-xs font-semibold text-primary">
                  Día {{ days.indexOf(s.day) + 1 }}{{ s.start_time ? ` · ${shortTime(s.start_time)}` : '' }}{{ s.end_time ? ` – ${shortTime(s.end_time)}` : '' }}
                </p>
                <PlaceInfoCard
                  :name="placeById.get(marker.id)!.name"
                  :address="placeById.get(marker.id)!.address"
                  :description="placeById.get(marker.id)!.description"
                  :photo-url="photoUrl(placeById.get(marker.id)!.photo_path)"
                  :info="placeInfoByPlace.get(marker.id) ?? null"
                  compact
                />
                <div v-if="pinned" class="mt-2 flex justify-end">
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="close">
                    Cerrar
                  </UButton>
                </div>
              </UCard>
            </template>
          </TripMap>
        </div>
        <p v-if="day === 'all' && markers.length" class="mt-1.5 text-xs text-dimmed">
          El número de cada punto indica el día. Elige un día para ver el recorrido en orden.
        </p>
      </div>
    </div>

    <ConfirmModal
      v-model:open="deleteOpen"
      title="¿Quitar esta parada?"
      :description="deleteTarget ? `${stopTitle(deleteTarget)} se quitará del itinerario. El lugar sigue en el mapa.` : ''"
      confirm-label="Quitar"
      :loading="busy"
      @confirm="confirmDelete"
    />
  </div>
</template>
