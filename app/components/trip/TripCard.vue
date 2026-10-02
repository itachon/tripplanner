<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

defineProps<{
  trip: Tables<'trips'> & { members: { count: number }[], places: { count: number }[] }
  isOwner: boolean
}>()
</script>

<template>
  <NuxtLink :to="`/admin/viajes/${trip.id}`" class="group block">
    <UCard class="h-full transition group-hover:ring-2 group-hover:ring-primary/50">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="text-lg font-semibold leading-tight group-hover:text-primary">
            {{ trip.name }}
          </h3>
          <p v-if="trip.destination" class="mt-0.5 truncate text-sm text-muted">
            {{ trip.destination }}
          </p>
        </div>
        <UBadge v-if="!isOwner" color="neutral" variant="subtle" size="sm">
          Co-admin
        </UBadge>
      </div>
      <p class="mt-3 flex items-center gap-1.5 text-sm">
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
    </UCard>
  </NuxtLink>
</template>
