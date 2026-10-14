<script setup lang="ts">
import type { MapMarker } from '~~/shared/types/map'
import type { MemberPlace, MemberTripView } from '~~/shared/types/trip'
import type { TimelineItem } from '~/components/itinerary/ItineraryTimeline.vue'
import { balances, expectedShares, formatMoney, settle, summarize, type Rates } from '~~/shared/utils/budget'

definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string
const toast = useToast()

const { data: view, error } = await useFetch<MemberTripView>(`/api/v/${token}`, { key: `member-${token}` })
const { data: places, refresh: refreshPlaces } = await useFetch<MemberPlace[]>(`/api/v/${token}/places`, {
  key: `member-places-${token}`,
  default: () => [],
})

const me = computed(() => view.value?.member)
const trip = computed(() => view.value?.trip)
const isOpen = computed(() => !!view.value?.is_open)
const accepted = computed(() => me.value?.status === 'accepted')
const tz = computed(() => trip.value?.time_zone ?? 'UTC')

const busy = ref<string | null>(null)
const declineOpen = ref(false)
type Tab = 'lugares' | 'itinerario' | 'presupuesto'
const tab = ref<Tab>('itinerario')
function setTab(v: string | number) {
  tab.value = v as Tab
}
const sortBy = ref<'votes' | 'order'>('votes')
const selectedId = ref<string | null>(null)
const hoverId = ref<string | null>(null)
const detail = ref<MemberPlace | null>(null)
const detailOpen = computed({ get: () => !!detail.value, set: (v) => { if (!v) detail.value = null } })

// Mapa a pantalla completa en celular (en escritorio el mapa siempre está a la vista)
const mapOpen = ref(false)
watch(tab, () => { mapOpen.value = false })
useHead({ bodyAttrs: { class: () => mapOpen.value ? 'max-lg:overflow-hidden' : '' } })

// Solo se usa en manejadores de clic y al montar: nunca durante el render del servidor
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches
function showOnMap(id: string) {
  selectedId.value = id
  if (!isDesktop()) mapOpen.value = true
}
// Si la ventana pasa a escritorio con el mapa abierto, vuelve al mapa lateral
function closeMapOnDesktop() {
  if (isDesktop()) mapOpen.value = false
}
function closeMapOnEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && mapOpen.value) mapOpen.value = false
}
onMounted(() => {
  window.addEventListener('resize', closeMapOnDesktop)
  window.addEventListener('keydown', closeMapOnEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', closeMapOnDesktop)
  window.removeEventListener('keydown', closeMapOnEscape)
})

// ---------- SEO / vista previa en WhatsApp ----------
useSeoMeta({
  title: () => trip.value ? `Viaje: ${trip.value.name}` : 'Viaje',
  ogTitle: () => trip.value ? `✈️ ${trip.value.name}` : 'Viaje',
  description: () => me.value ? `${me.value.name}, te sumaron a este viaje. Confirma si vas y vota por los lugares.` : '',
  ogDescription: () => me.value ? `${me.value.name}, te sumaron a este viaje. Confirma si vas y vota por los lugares.` : '',
  robots: 'noindex, nofollow',
})
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })

// ---------- Lugares para votar ----------
const placeById = computed(() => new Map((places.value ?? []).map(p => [p.id, p])))
const votable = computed(() => (places.value ?? []).filter(p => p.votable))
const orderOf = computed(() => new Map(votable.value.map((p, i) => [p.id, i + 1])))
const sortedVotable = computed(() => {
  const arr = [...votable.value]
  if (sortBy.value === 'votes') arr.sort((a, b) => b.vote_count - a.vote_count || (orderOf.value.get(a.id)! - orderOf.value.get(b.id)!))
  return arr
})
const myVotes = computed(() => votable.value.filter(p => p.voted).length)

// Se elige una vez al cargar: si cambiara con cada voto, la foto grande saltaría
const coverUrl = coverPhoto(places.value ?? [])

const tabItems = computed(() => [
  { label: 'Itinerario', icon: 'i-lucide-calendar-days', value: 'itinerario', slot: 'itinerario' as const, count: 0, locked: !view.value?.itinerary_published },
  { label: 'Presupuesto', icon: 'i-lucide-wallet', value: 'presupuesto', slot: 'presupuesto' as const, count: 0, locked: !view.value?.budget_published },
  { label: 'Lugares', icon: 'i-lucide-map-pin', value: 'lugares', slot: 'lugares' as const, count: votable.value.length, locked: false },
])

const placeMarkers = computed<MapMarker[]>(() => votable.value.map(p => ({
  id: p.id,
  latitude: p.latitude,
  longitude: p.longitude,
  label: String(orderOf.value.get(p.id)),
  tone: p.voted ? 'success' : 'primary',
  title: p.name,
  category: p.category,
})))

const canVote = computed(() => accepted.value && isOpen.value)

async function toggleVote(p: MemberPlace) {
  if (!canVote.value) return
  busy.value = p.id
  try {
    places.value = await $fetch<MemberPlace[]>(`/api/v/${token}/places/${p.id}/vote`, { method: p.voted ? 'DELETE' : 'POST' })
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo guardar tu voto', description: errorMessage(err) })
    await refreshPlaces()
  }
  finally {
    busy.value = null
  }
}

// ---------- Confirmación ----------
async function respond(status: 'accepted' | 'declined') {
  busy.value = status
  try {
    const was = me.value?.status
    view.value = await $fetch<MemberTripView>(`/api/v/${token}/rsvp`, { method: 'POST', body: { status } })
    declineOpen.value = false
    await refreshPlaces()
    if (status === 'accepted') {
      toast.add({ color: 'success', title: was === 'declined' ? '¡Qué bueno que vuelves!' : '¡Estás dentro!', description: 'Ahora puedes votar por los lugares.', icon: 'i-lucide-plane' })
    }
    else {
      toast.add({ title: 'Respuesta guardada', description: 'Gracias por avisar.' })
    }
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo guardar tu respuesta', description: errorMessage(err) })
    await refreshNuxtData(`member-${token}`)
  }
  finally {
    busy.value = null
  }
}

// ---------- Itinerario ----------
const days = computed(() => trip.value ? tripDays(trip.value.start_date, trip.value.end_date) : [])
const today = computed(() => todayIn(tz.value))
const itDay = ref<string>('all')
watch(days, (d) => {
  // Si el viaje está en curso, partir mostrando el día de hoy
  if (itDay.value === 'all' && d.includes(today.value)) itDay.value = today.value
}, { immediate: true })

const itinerary = computed(() => view.value?.itinerary ?? [])
const numbers = computed(() => {
  const map = new Map<string, number>()
  const count = new Map<string, number>()
  for (const s of itinerary.value) {
    if (!s.place_id || !placeById.value.has(s.place_id)) continue
    const n = (count.get(s.day) ?? 0) + 1
    count.set(s.day, n)
    map.set(s.id, n)
  }
  return map
})
const timelineItems = computed<TimelineItem[]>(() => itinerary.value.map(s => ({
  id: s.id,
  day: s.day,
  start_time: s.start_time,
  end_time: s.end_time,
  title: s.title,
  subtitle: s.place_id ? placeById.value.get(s.place_id)?.address : null,
  notes: s.notes,
  place_id: s.place_id,
  number: itDay.value === 'all' ? undefined : numbers.value.get(s.id),
})))
const itStops = computed(() =>
  itinerary.value.filter(s => s.place_id && placeById.value.has(s.place_id) && (itDay.value === 'all' || s.day === itDay.value)),
)
const itMarkers = computed<MapMarker[]>(() => {
  const seen = new Set<string>()
  const out: MapMarker[] = []
  for (const s of itStops.value) {
    if (seen.has(s.place_id!)) continue
    seen.add(s.place_id!)
    const p = placeById.value.get(s.place_id!)!
    out.push({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      label: itDay.value === 'all' ? String(days.value.indexOf(s.day) + 1) : String(numbers.value.get(s.id) ?? ''),
      tone: 'primary',
      title: p.name,
      category: p.category,
    })
  }
  return out
})
const itRoute = computed<[number, number][] | null>(() => itDay.value === 'all'
  ? null
  : itStops.value.map(s => {
      const p = placeById.value.get(s.place_id!)!
      return [p.longitude, p.latitude] as [number, number]
    }))
const itSelected = ref<string | null>(null)
const itHover = ref<string | null>(null)
const stopsAt = (placeId: string) => itStops.value.filter(s => s.place_id === placeId)

const dayChips = computed(() => days.value.map((d, i) => ({
  value: d,
  ...dayChipParts(d),
  today: d === today.value,
  label: `Día ${i + 1}: ${formatDay(d, true)}${d === today.value ? ' (hoy)' : ''}`,
})))

// ---------- Presupuesto ----------
const budget = computed(() => view.value?.budget ?? null)
const bRates = computed<Rates>(() => Object.fromEntries((budget.value?.rates ?? []).map(r => [r.currency, r.rate])))
const bNames = computed(() => Object.fromEntries((budget.value?.members ?? []).map(m => [m.id, m.name])))
const bPeople = computed(() => {
  const all = budget.value?.members ?? []
  return all.filter(m => m.status === 'accepted').length || all.length
})
const bSummary = computed(() => budget.value ? summarize(budget.value.items, budget.value.currency, bRates.value, bPeople.value) : null)
const bBalances = computed(() => budget.value ? balances(budget.value.items, budget.value.currency, budget.value.members.map(m => m.id)) : [])
const bTransfers = computed(() => budget.value ? settle(bBalances.value, budget.value.currency) : [])
const myBalance = computed(() => bBalances.value.find(b => b.member_id === budget.value?.me) ?? null)
const bShares = computed(() => budget.value ? expectedShares(budget.value.items, budget.value.currency, bRates.value, budget.value.members.map(m => m.id)) : [])
const myShare = computed(() => bShares.value.find(s => s.member_id === budget.value?.me)?.share ?? 0)
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <!-- Link inválido -->
    <div v-if="error || !view" class="flex min-h-dvh items-center justify-center px-6">
      <div class="max-w-sm text-center">
        <UIcon name="i-lucide-map-pin-off" class="size-12 text-muted" />
        <h1 class="mt-4 font-serif text-2xl font-semibold">
          Link no encontrado
        </h1>
        <p class="mt-2 text-muted">
          El link no es válido o fue reemplazado. Pide a quien organiza el viaje que te lo envíe de nuevo.
        </p>
      </div>
    </div>

    <template v-else-if="me && trip">
      <!-- Portada -->
      <TripCover
        :name="trip.name"
        :destination="trip.destination"
        :date-range="formatDateRange(trip.start_date, trip.end_date)"
        :photo-url="coverUrl"
        size="full"
      >
        <template #eyebrow>
          <UIcon name="i-lucide-plane" class="size-3.5" />
          {{ tripCountdown(trip.start_date, trip.end_date, trip.time_zone) }}
        </template>
        <p class="mt-6 text-lg">
          Hola, <span class="font-semibold">{{ me.name }}</span> 👋
        </p>
        <p v-if="trip.description" class="mt-2 max-w-2xl whitespace-pre-line text-white/85">
          {{ trip.description }}
        </p>
      </TripCover>

      <main class="mx-auto max-w-7xl px-4 pb-24">
        <!-- Confirmación -->
        <UCard class="relative -mt-8 shadow-lg">
          <div v-if="me.status === 'pending'" class="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p class="font-serif text-xl font-semibold">
                {{ isOpen ? '¿Te sumas al viaje?' : 'El plazo para confirmar terminó' }}
              </p>
              <p class="text-sm text-muted">
                <template v-if="isOpen">
                  Confirma para poder votar. Tienes hasta el {{ formatDateTime(trip.rsvp_deadline, tz, true) }} (hora del destino).
                </template>
                <template v-else>
                  Si aún quieres sumarte, habla con quien organiza.
                </template>
              </p>
            </div>
            <div v-if="isOpen" class="flex w-full shrink-0 gap-2 sm:w-auto">
              <UButton size="lg" icon="i-lucide-check" class="flex-1 justify-center sm:flex-none" :loading="busy === 'accepted'" :disabled="!!busy" @click="respond('accepted')">
                ¡Sí, voy!
              </UButton>
              <UButton size="lg" color="neutral" variant="outline" class="flex-1 justify-center sm:flex-none" :loading="busy === 'declined'" :disabled="!!busy" @click="respond('declined')">
                No podré ir
              </UButton>
            </div>
          </div>

          <div v-else-if="me.status === 'accepted'" class="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-success/10">
                <UIcon name="i-lucide-check" class="size-5 text-success" />
              </div>
              <div class="text-left">
                <p class="font-serif text-xl font-semibold">
                  ¡Estás dentro del viaje!
                </p>
                <p class="text-sm text-muted">
                  {{ isOpen ? `Puedes votar hasta el ${formatDateTime(trip.rsvp_deadline, tz, true)}.` : 'La votación ya cerró.' }}
                </p>
              </div>
            </div>
            <UButton v-if="isOpen" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="declineOpen = true">
              Ya no podré ir
            </UButton>
          </div>

          <div v-else class="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p class="font-serif text-xl font-semibold">
                Gracias por avisar
              </p>
              <p class="text-sm text-muted">
                Registramos que no vas a este viaje.
              </p>
            </div>
            <UButton v-if="isOpen" variant="soft" icon="i-lucide-rotate-ccw" :loading="busy === 'accepted'" @click="respond('accepted')">
              Cambié de opinión, ¡sí voy!
            </UButton>
          </div>
        </UCard>

        <!-- Pestañas -->
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :unmount-on-hide="false"
          variant="link"
          class="mt-8"
          :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
          @update:model-value="setTab"
        >
          <template #trailing="{ item }">
            <UBadge v-if="item.count" size="sm" color="neutral" variant="subtle">
              {{ item.count }}
            </UBadge>
            <UIcon v-if="item.locked" name="i-lucide-lock" class="size-3.5" />
          </template>

          <!-- Lugares -->
          <template #lugares>
            <section class="pt-5">
              <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 class="font-serif text-2xl font-semibold">
                    ¿Qué quieres conocer?
                  </h2>
                  <p class="text-sm text-muted">
                    Vota por todos los lugares que te interesen (un voto por lugar). Pasa el mouse o toca un punto del mapa para ver su ficha.
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <span v-if="accepted" class="text-sm text-muted">Tus votos: <b class="text-default">{{ myVotes }}</b></span>
                  <USelect
                    v-model="sortBy"
                    size="sm"
                    :items="[{ label: 'Más votados', value: 'votes' }, { label: 'Orden del organizador', value: 'order' }]"
                    class="w-48"
                  />
                </div>
              </div>

              <UAlert
                v-if="!accepted && isOpen && votable.length"
                class="mb-4"
                color="primary"
                variant="subtle"
                icon="i-lucide-info"
                description="Confirma que vas al viaje para poder votar."
              />
              <UAlert
                v-else-if="!isOpen && votable.length"
                class="mb-4"
                color="neutral"
                variant="subtle"
                icon="i-lucide-lock"
                description="La votación terminó. Estos fueron los resultados."
              />

              <UEmpty
                v-if="!votable.length"
                icon="i-lucide-map"
                title="Todavía no hay lugares para votar"
                description="Cuando el organizador agregue destinos, aparecerán aquí."
                class="rounded-md border border-dashed border-default py-12"
              />

              <template v-else>
                <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-6">
                  <!-- inert: con el mapa a pantalla completa, la lista de atrás no recibe foco -->
                  <div class="grid gap-4 sm:grid-cols-2" :inert="mapOpen || undefined">
                    <PlaceCard
                      v-for="p in sortedVotable"
                      :key="p.id"
                      :place="p"
                      :order="orderOf.get(p.id)!"
                      :can-vote="canVote"
                      :busy="busy"
                      :active="hoverId === p.id || selectedId === p.id"
                      :show-itinerary-badge="p.in_itinerary && view.itinerary_published"
                      @vote="toggleVote(p)"
                      @select="showOnMap(p.id)"
                      @detail="detail = p"
                      @hover="hoverId = $event ? p.id : null"
                    />
                  </div>

                  <!-- Un solo mapa: lateral y fijo en escritorio; a pantalla completa en celular cuando mapOpen -->
                  <div
                    class="lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]"
                    :class="mapOpen ? 'max-lg:fixed max-lg:inset-0 max-lg:z-40' : 'max-lg:hidden'"
                  >
                    <div class="size-full overflow-hidden bg-default lg:rounded-md lg:border lg:border-default">
                      <TripMap
                        :markers="placeMarkers"
                        :selected-id="selectedId"
                        :highlight-id="hoverId"
                        :cooperative="!mapOpen"
                        @select="selectedId = $event"
                      >
                        <template #card="{ marker, pinned, close }">
                          <UCard v-if="placeById.get(marker.id)" :ui="{ body: 'p-3 sm:p-3 max-h-[240px] overflow-y-auto', footer: 'px-3 py-2 sm:px-3' }" class="shadow-xl">
                            <PlaceInfoCard
                              :name="placeById.get(marker.id)!.name"
                              :address="placeById.get(marker.id)!.address"
                              :category="placeById.get(marker.id)!.category"
                              :photo-url="placeById.get(marker.id)!.photo_url"
                              :info="placeById.get(marker.id)!.info"
                              compact
                            />
                            <template #footer>
                              <div class="flex items-center justify-between gap-2">
                                <span class="flex items-center gap-1 text-xs font-medium">
                                  <UIcon name="i-lucide-heart" class="size-3.5 text-primary" />
                                  {{ placeById.get(marker.id)!.vote_count }} {{ placeById.get(marker.id)!.vote_count === 1 ? 'voto' : 'votos' }}
                                </span>
                                <div v-if="pinned" class="flex gap-1">
                                  <UButton
                                    v-if="canVote"
                                    size="xs"
                                    :color="placeById.get(marker.id)!.voted ? 'success' : 'primary'"
                                    :variant="placeById.get(marker.id)!.voted ? 'soft' : 'solid'"
                                    :icon="placeById.get(marker.id)!.voted ? 'i-lucide-check' : 'i-lucide-heart'"
                                    :loading="busy === marker.id"
                                    @click="toggleVote(placeById.get(marker.id)!)"
                                  >
                                    {{ placeById.get(marker.id)!.voted ? 'Votado' : 'Votar' }}
                                  </UButton>
                                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Cerrar" @click="close" />
                                </div>
                              </div>
                            </template>
                          </UCard>
                        </template>
                      </TripMap>
                    </div>
                  </div>
                </div>

                <!-- Arriba cuando el mapa está abierto: abajo va la ficha del lugar seleccionado -->
                <UButton
                  class="fixed left-1/2 z-50 -translate-x-1/2 rounded-full shadow-lg lg:hidden"
                  :class="mapOpen ? 'top-4' : 'bottom-5'"
                  color="neutral"
                  size="lg"
                  :icon="mapOpen ? 'i-lucide-list' : 'i-lucide-map'"
                  @click="mapOpen = !mapOpen"
                >
                  {{ mapOpen ? 'Ver lista' : 'Ver mapa' }}
                </UButton>
              </template>
            </section>
          </template>

          <!-- Itinerario -->
          <template #itinerario>
            <section class="pt-5">
              <UEmpty
                v-if="!view.itinerary_published"
                icon="i-lucide-calendar-clock"
                title="El itinerario está en preparación"
                description="Quien organiza el viaje lo publicará cuando esté listo. Mientras tanto, vota por los lugares que quieres conocer."
                class="rounded-md border border-dashed border-default py-12"
              />
              <template v-else>
                <div class="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  <button
                    type="button"
                    class="flex min-w-14 shrink-0 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition"
                    :class="itDay === 'all' ? 'border-primary bg-primary text-inverted' : 'border-default bg-default hover:border-primary/50'"
                    :aria-pressed="itDay === 'all'"
                    @click="itDay = 'all'"
                  >
                    Todo
                  </button>
                  <button
                    v-for="c in dayChips"
                    :key="c.value"
                    type="button"
                    class="flex min-w-14 shrink-0 flex-col items-center rounded-md border px-3 py-1.5 transition"
                    :class="itDay === c.value ? 'border-primary bg-primary text-inverted' : 'border-default bg-default hover:border-primary/50'"
                    :aria-pressed="itDay === c.value"
                    :aria-label="c.label"
                    @click="itDay = c.value"
                  >
                    <span class="text-[11px] uppercase tracking-wide opacity-80">{{ c.weekday }}</span>
                    <span class="font-serif text-lg font-semibold leading-none">{{ c.num }}</span>
                    <span class="mt-1 size-1 rounded-full" :class="c.today ? (itDay === c.value ? 'bg-current' : 'bg-primary') : 'bg-transparent'" />
                  </button>
                </div>
                <p class="mb-3 text-xs text-muted">
                  Horarios en hora local del destino.
                </p>
                <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <ItineraryTimeline
                    class="order-2 lg:order-1"
                    :days="days"
                    :items="timelineItems"
                    :day="itDay"
                    :highlight-id="itHover"
                    empty-text="Día libre."
                    @hover="itHover = $event"
                    @focus="itSelected = $event"
                  />
                  <div class="order-1 lg:order-2">
                    <div class="h-72 overflow-hidden rounded-md border border-default sm:h-[420px] lg:sticky lg:top-4">
                      <TripMap
                        :markers="itMarkers"
                        :route="itRoute"
                        :selected-id="itSelected"
                        :highlight-id="itHover"
                        :fit-key="itDay"
                        @select="itSelected = $event"
                      >
                        <template #card="{ marker, pinned, close }">
                          <UCard v-if="placeById.get(marker.id)" :ui="{ body: 'p-3 sm:p-3 max-h-[300px] overflow-y-auto' }" class="shadow-xl">
                            <p v-for="s in stopsAt(marker.id)" :key="s.id" class="mb-1 text-xs font-semibold text-primary">
                              Día {{ days.indexOf(s.day) + 1 }}{{ s.start_time ? ` · ${s.start_time}` : '' }}{{ s.end_time ? ` – ${s.end_time}` : '' }}
                            </p>
                            <PlaceInfoCard
                              :name="placeById.get(marker.id)!.name"
                              :address="placeById.get(marker.id)!.address"
                              :photo-url="placeById.get(marker.id)!.photo_url"
                              :info="placeById.get(marker.id)!.info"
                              compact
                            />
                            <div v-if="pinned" class="mt-2 flex justify-end gap-1">
                              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-file-text" @click="detail = placeById.get(marker.id)!">
                                Ficha
                              </UButton>
                              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="close">
                                Cerrar
                              </UButton>
                            </div>
                          </UCard>
                        </template>
                      </TripMap>
                    </div>
                  </div>
                </div>
              </template>
            </section>
          </template>
          <!-- Presupuesto -->
          <template #presupuesto>
            <section class="pt-5">
              <UEmpty
                v-if="!budget || !bSummary"
                icon="i-lucide-wallet"
                title="El presupuesto está en preparación"
                description="Quien organiza el viaje lo publicará cuando esté listo."
                class="rounded-md border border-dashed border-default py-12"
              />
              <template v-else>
                <div class="mb-4 grid gap-3 sm:grid-cols-3">
                  <UCard :ui="{ body: 'p-5 sm:p-6' }">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Tu parte estimada
                    </p>
                    <p class="mt-2 font-serif text-3xl font-semibold">
                      {{ formatMoney(myShare, budget.currency) }}
                    </p>
                    <p class="mt-1 text-xs text-muted">
                      Total del viaje {{ formatMoney(bSummary.estimated, budget.currency) }}
                    </p>
                  </UCard>
                  <UCard :ui="{ body: 'p-5 sm:p-6' }">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Tu parte de lo ya pagado
                    </p>
                    <p class="mt-2 font-serif text-3xl font-semibold">
                      {{ formatMoney(myBalance?.owed ?? 0, budget.currency) }}
                    </p>
                    <p class="mt-1 text-xs text-muted">
                      Has pagado {{ formatMoney(myBalance?.paid ?? 0, budget.currency) }}
                    </p>
                  </UCard>
                  <UCard :ui="{ body: 'p-5 sm:p-6' }">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Tu saldo
                    </p>
                    <p class="mt-2 font-serif text-3xl font-semibold" :class="(myBalance?.balance ?? 0) > 0 ? 'text-success' : (myBalance?.balance ?? 0) < 0 ? 'text-error' : ''">
                      {{ formatMoney(Math.abs(myBalance?.balance ?? 0), budget.currency) }}
                    </p>
                    <p class="mt-1 text-xs text-muted">
                      {{ (myBalance?.balance ?? 0) > 0 ? 'Te deben' : (myBalance?.balance ?? 0) < 0 ? 'Debes' : 'Estás a mano' }}
                    </p>
                  </UCard>
                </div>

                <UEmpty
                  v-if="!budget.items.length"
                  icon="i-lucide-wallet"
                  title="Aún no hay ítems en el presupuesto"
                  class="rounded-md border border-dashed border-default py-10"
                />
                <template v-else>
                  <UAlert
                    v-if="bSummary.missingRates.length"
                    class="mb-3"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-circle-alert"
                    title="Total parcial"
                    :description="`Los ítems en ${bSummary.missingRates.join(', ')} todavía no tienen tipo de cambio y no están sumados en los totales.`"
                  />
                  <BudgetItemList
                    :items="budget.items"
                    :base="budget.currency"
                    :rates="bRates"
                    :member-names="bNames"
                    :me-id="budget.me"
                  />
                </template>

                <UCard class="mt-4">
                  <template #header>
                    <h3 class="font-serif text-lg font-semibold">
                      Cuentas del grupo
                    </h3>
                  </template>
                  <BudgetBalances
                    :balances="bBalances"
                    :transfers="bTransfers"
                    :shares="bShares"
                    :base="budget.currency"
                    :member-names="bNames"
                    :me-id="budget.me"
                  />
                </UCard>
              </template>
            </section>
          </template>
        </UTabs>
      </main>

      <UModal v-model:open="detailOpen" title="Ficha del lugar">
        <template #body>
          <PlaceInfoCard
            v-if="detail"
            :name="detail.name"
            :address="detail.address"
            :category="detail.category"
            :description="detail.description"
            :photo-url="detail.photo_url"
            :info="detail.info"
            :latitude="detail.latitude"
            :longitude="detail.longitude"
          />
        </template>
        <template v-if="detail?.votable && canVote" #footer>
          <div class="flex w-full items-center justify-between">
            <span class="text-sm text-muted">{{ detail.vote_count }} {{ detail.vote_count === 1 ? 'voto' : 'votos' }}</span>
            <UButton
              :color="detail.voted ? 'success' : 'primary'"
              :variant="detail.voted ? 'soft' : 'solid'"
              :icon="detail.voted ? 'i-lucide-check' : 'i-lucide-heart'"
              :loading="busy === detail.id"
              @click="toggleVote(detail).then(() => { detail = placeById.get(detail!.id) ?? null })"
            >
              {{ detail.voted ? 'Votado' : 'Votar por este lugar' }}
            </UButton>
          </div>
        </template>
      </UModal>

      <ConfirmModal
        v-model:open="declineOpen"
        title="¿Ya no vas al viaje?"
        :description="myVotes ? `Se borrarán tus ${myVotes} votos. Puedes volver a confirmar mientras el plazo esté abierto.` : 'Puedes volver a confirmar mientras el plazo esté abierto.'"
        confirm-label="Sí, no voy"
        :loading="busy === 'declined'"
        @confirm="respond('declined')"
      />
    </template>
  </div>
</template>
