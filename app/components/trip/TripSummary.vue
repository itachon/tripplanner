<script setup lang="ts">
const emit = defineEmits<{ go: [tab: string] }>()

const { trip, stats, ranking, stops, days, stopsByDay } = useTripCtx()

const top = computed(() => ranking.value.slice(0, 8))
const maxVotes = computed(() => Math.max(1, ...top.value.map(r => r.votes)))
const responseRate = computed(() =>
  stats.value.members ? Math.round(((stats.value.accepted + stats.value.declined) / stats.value.members) * 100) : 0,
)
const emptyDays = computed(() => days.value.filter(d => !stopsByDay.value.get(d)?.length).length)
</script>

<template>
  <div v-if="trip" class="space-y-6">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <UCard>
        <p class="text-sm text-muted">
          Van al viaje
        </p>
        <p class="mt-1 text-3xl font-bold text-success">
          {{ stats.accepted }}
        </p>
        <p class="text-xs text-dimmed">
          de {{ stats.members }} invitados
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Sin responder
        </p>
        <p class="mt-1 text-3xl font-bold text-warning">
          {{ stats.pending }}
        </p>
        <p class="text-xs text-dimmed">
          {{ responseRate }}% respondió
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Votos
        </p>
        <p class="mt-1 text-3xl font-bold text-primary">
          {{ stats.votes }}
        </p>
        <p class="text-xs text-dimmed">
          en {{ stats.votable }} lugares en votación
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Itinerario
        </p>
        <p class="mt-1 text-3xl font-bold">
          {{ stops.length }}
        </p>
        <p class="text-xs text-dimmed">
          paradas · {{ emptyDays }} {{ emptyDays === 1 ? 'día' : 'días' }} sin plan
        </p>
      </UCard>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold">
              Lugares más votados
            </h3>
            <UButton size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" @click="emit('go', 'lugares')">
              Ver mapa
            </UButton>
          </div>
        </template>
        <p v-if="!top.length" class="text-sm text-muted">
          Aún no hay lugares en votación. Agrégalos en la pestaña Lugares.
        </p>
        <ol v-else class="space-y-3">
          <li v-for="(r, i) in top" :key="r.place.id">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="min-w-0 truncate">
                <span class="mr-1.5 font-semibold text-muted tabular-nums">{{ i + 1 }}.</span>{{ r.place.name }}
              </span>
              <span class="shrink-0 font-medium tabular-nums">
                {{ r.votes }} <span class="font-normal text-muted">/ {{ stats.accepted }}</span>
              </span>
            </div>
            <UProgress :model-value="(r.votes / maxVotes) * 100" size="sm" class="mt-1.5" />
          </li>
        </ol>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Próximos pasos
          </h3>
        </template>
        <ul class="space-y-3 text-sm">
          <li class="flex gap-2.5">
            <UIcon :name="stats.places ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 size-4 shrink-0" :class="stats.places ? 'text-success' : 'text-dimmed'" />
            <span>Agregar lugares al mapa <span class="text-muted">({{ stats.places }})</span></span>
          </li>
          <li class="flex gap-2.5">
            <UIcon :name="stats.members ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 size-4 shrink-0" :class="stats.members ? 'text-success' : 'text-dimmed'" />
            <span>Invitar a los viajeros y enviarles su link <span class="text-muted">({{ stats.members }})</span></span>
          </li>
          <li class="flex gap-2.5">
            <UIcon :name="stats.votes ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 size-4 shrink-0" :class="stats.votes ? 'text-success' : 'text-dimmed'" />
            <span>Recibir votos <span class="text-muted">(hasta el {{ formatShortDateTime(trip.rsvp_deadline, trip.time_zone) }})</span></span>
          </li>
          <li class="flex gap-2.5">
            <UIcon :name="stops.length ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 size-4 shrink-0" :class="stops.length ? 'text-success' : 'text-dimmed'" />
            <span>Armar el itinerario con los más votados</span>
          </li>
          <li class="flex gap-2.5">
            <UIcon :name="trip.itinerary_published ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 size-4 shrink-0" :class="trip.itinerary_published ? 'text-success' : 'text-dimmed'" />
            <span>Publicar el itinerario</span>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
