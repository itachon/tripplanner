<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const tripId = route.params.id as string

const ctx = await useTripAdmin(tripId)
provideTripCtx(ctx)
const { trip, stats, isClosed, error, tz, stopDraft } = ctx

useHead({ title: () => trip.value?.name ?? 'Viaje' })

if (!error.value && !trip.value) {
  throw createError({ statusCode: 404, statusMessage: 'Viaje no encontrado', fatal: true })
}

const editOpen = ref(false)

// Misma portada que ve el viajero: el lugar más votado que tenga foto, entre los
// lugares que el viajero recibe (votables o en el itinerario publicado)
const photoUrl = usePlacePhotoUrl()
const memberPlaces = computed(() => ctx.places.value.filter(p =>
  p.votable || (!!trip.value?.itinerary_published && ctx.stopsByPlace.value.has(p.id)),
))
const coverUrl = computed(() => coverPhoto(memberPlaces.value.map(p => ({
  photo_url: photoUrl(p.photo_path),
  info: ctx.placeInfoByPlace.value.get(p.id),
  vote_count: ctx.votersByPlace.value.get(p.id)?.length ?? 0,
}))))

const tabs = computed<TabsItem[]>(() => [
  { label: 'Resumen', icon: 'i-lucide-layout-dashboard', value: 'resumen', slot: 'resumen' as const },
  { label: 'Lugares', icon: 'i-lucide-map-pin', value: 'lugares', slot: 'lugares' as const, badge: stats.value.places || undefined },
  { label: 'Itinerario', icon: 'i-lucide-calendar-days', value: 'itinerario', slot: 'itinerario' as const, badge: stats.value.stops || undefined },
  { label: 'Presupuesto', icon: 'i-lucide-wallet', value: 'presupuesto', slot: 'presupuesto' as const, badge: stats.value.budgetItems || undefined },
  { label: 'Viajeros', icon: 'i-lucide-users', value: 'viajeros', slot: 'viajeros' as const, badge: stats.value.members || undefined },
  { label: 'Administradores', icon: 'i-lucide-shield', value: 'admins', slot: 'admins' as const },
  { label: 'Ajustes', icon: 'i-lucide-settings', value: 'ajustes', slot: 'ajustes' as const },
])

// Pestaña activa: estado local reflejado en ?tab=
const activeTab = ref((route.query.tab as string) || 'resumen')
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) router.replace({ query: { ...route.query, tab } })
})
watch(() => route.query.tab, (tab) => {
  activeTab.value = (tab as string) || 'resumen'
})

const stopOpen = computed({
  get: () => !!stopDraft.value,
  set: (v) => { if (!v) stopDraft.value = null },
})
</script>

<template>
  <div v-if="trip">
    <div class="mb-3 flex items-center justify-between gap-3">
      <UButton to="/admin" color="neutral" variant="link" icon="i-lucide-arrow-left" class="-ml-2.5">
        Mis viajes
      </UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-pencil" @click="editOpen = true">
        Editar
      </UButton>
    </div>

    <TripCover
      :name="trip.name"
      :destination="trip.destination"
      :date-range="formatDateRange(trip.start_date, trip.end_date)"
      :photo-url="coverUrl"
      size="band"
    />

    <div class="mb-6 mt-4 flex flex-wrap gap-2">
      <UBadge v-if="isClosed" color="neutral" variant="subtle" icon="i-lucide-lock">
        Confirmación y votación cerradas
      </UBadge>
      <UBadge v-else color="primary" variant="subtle" icon="i-lucide-clock">
        Confirman y votan hasta {{ formatShortDateTime(trip.rsvp_deadline, tz) }}
      </UBadge>
      <UBadge v-if="trip.itinerary_published" color="success" variant="subtle" icon="i-lucide-eye">
        Itinerario publicado
      </UBadge>
      <UBadge v-else color="warning" variant="subtle" icon="i-lucide-eye-off">
        Itinerario oculto
      </UBadge>
      <UBadge v-if="trip.budget_published" color="success" variant="subtle" icon="i-lucide-eye">
        Presupuesto publicado
      </UBadge>
      <UBadge v-else color="warning" variant="subtle" icon="i-lucide-eye-off">
        Presupuesto oculto
      </UBadge>
    </div>

    <UTabs
      v-model="activeTab"
      :items="tabs"
      variant="link"
      :unmount-on-hide="false"
      :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
    >
      <template #resumen>
        <TripSummary class="pt-6" @go="activeTab = $event" />
      </template>
      <template #lugares>
        <PlacesPanel class="pt-6" />
      </template>
      <template #itinerario>
        <ItineraryPanel class="pt-6" />
      </template>
      <template #presupuesto>
        <BudgetPanel class="pt-6" />
      </template>
      <template #viajeros>
        <MembersPanel class="pt-6" />
      </template>
      <template #admins>
        <TripAdminsPanel class="pt-6" />
      </template>
      <template #ajustes>
        <TripSettings class="pt-6" @edit="editOpen = true" />
      </template>
    </UTabs>

    <TripFormModal v-model:open="editOpen" :trip="trip" @saved="() => ctx.refresh()" />
    <StopFormModal v-model:open="stopOpen" :draft="stopDraft" />
  </div>
</template>
