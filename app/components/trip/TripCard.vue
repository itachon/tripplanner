<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

defineProps<{
  trip: Tables<'trips'> & { members: { count: number }[], places: { count: number }[] }
  isOwner: boolean
  photoUrl?: string | null
}>()
</script>

<template>
  <NuxtLink
    :to="`/admin/viajes/${trip.id}`"
    class="group block h-full overflow-hidden rounded-md bg-default ring ring-default transition hover:ring-2 hover:ring-primary/50"
  >
    <TripCover :name="trip.name" :destination="trip.destination" :photo-url="photoUrl" size="card">
      <template v-if="!isOwner" #eyebrow>
        <span class="rounded-full bg-white/20 px-2 py-0.5 normal-case tracking-normal backdrop-blur">
          Co-admin
        </span>
      </template>
    </TripCover>
    <div class="p-4">
      <p class="flex items-center gap-1.5 text-sm">
        <UIcon name="i-lucide-calendar-range" class="size-4 shrink-0 text-primary" />
        {{ formatDateRange(trip.start_date, trip.end_date) }}
      </p>
      <p class="mt-1 text-xs text-dimmed">
        {{ tripCountdown(trip.start_date, trip.end_date, trip.time_zone) }}
        · {{ tripLength(trip.start_date, trip.end_date) }} días
      </p>
      <div class="mt-4 flex gap-4 text-sm">
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-users" class="size-4 text-primary" />
          {{ trip.members[0]?.count ?? 0 }} viajeros
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-map-pin" class="size-4 text-primary" />
          {{ trip.places[0]?.count ?? 0 }} lugares
        </span>
      </div>
    </div>
  </NuxtLink>
</template>
