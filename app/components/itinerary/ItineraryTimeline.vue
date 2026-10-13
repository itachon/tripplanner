<script setup lang="ts">
// Lista del itinerario por días (la usan el admin y la página del viajero)

export interface TimelineItem {
  id: string
  day: string
  start_time: string | null
  end_time: string | null
  title: string
  subtitle?: string | null
  notes?: string | null
  place_id: string | null
  /** número del pin en el mapa (solo paradas con lugar) */
  number?: number
}

const props = defineProps<{
  days: string[]
  items: TimelineItem[]
  /** 'all' o un día 'YYYY-MM-DD' */
  day: string
  highlightId?: string | null
  emptyText?: string
}>()

const emit = defineEmits<{ hover: [placeId: string | null], focus: [placeId: string], add: [day: string] }>()

defineSlots<{
  actions?: (p: { item: TimelineItem }) => unknown
  dayActions?: (p: { day: string }) => unknown
}>()

const visibleDays = computed(() => (props.day === 'all' ? props.days : props.days.filter(d => d === props.day)))
const byDay = computed(() => {
  const map = new Map<string, TimelineItem[]>()
  for (const d of props.days) map.set(d, [])
  for (const it of props.items) map.get(it.day)?.push(it)
  return map
})
const dayNumber = (d: string) => props.days.indexOf(d) + 1

function timeRange(it: TimelineItem) {
  const a = shortTime(it.start_time)
  const b = shortTime(it.end_time)
  if (a && b) return `${a} – ${b}`
  return a || ''
}
</script>

<template>
  <div class="space-y-6">
    <section v-for="d in visibleDays" :key="d">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="font-semibold">
          <span class="text-primary">Día {{ dayNumber(d) }}</span>
          <span class="text-muted"> · {{ formatDay(d) }}</span>
        </h3>
        <slot name="dayActions" :day="d" />
      </div>

      <p v-if="!byDay.get(d)?.length" class="rounded-lg border border-dashed border-default px-4 py-3 text-sm text-dimmed">
        {{ emptyText ?? 'Sin actividades planificadas.' }}
      </p>

      <ol v-else class="relative space-y-1 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-(--ui-border)">
        <li
          v-for="it in byDay.get(d)"
          :key="it.id"
          class="relative flex gap-3 rounded-lg p-2 transition"
          :class="[
            it.place_id ? 'cursor-pointer hover:bg-elevated/70' : '',
            highlightId && it.place_id === highlightId ? 'bg-primary/5' : '',
          ]"
          @mouseenter="emit('hover', it.place_id)"
          @mouseleave="emit('hover', null)"
          @click="it.place_id && emit('focus', it.place_id)"
        >
          <span
            v-if="it.number"
            class="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-default bg-primary text-xs font-bold text-inverted"
          >{{ it.number }}</span>
          <span
            v-else
            class="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-default bg-elevated"
          ><UIcon name="i-lucide-circle-dot" class="size-3.5 text-muted" /></span>

          <div class="min-w-0 flex-1 pt-0.5">
            <p v-if="timeRange(it)" class="text-xs font-semibold tabular-nums text-primary">
              {{ timeRange(it) }}
            </p>
            <p class="font-medium leading-snug">
              {{ it.title }}
            </p>
            <p v-if="it.subtitle" class="truncate text-xs text-muted">
              {{ it.subtitle }}
            </p>
            <p v-if="it.notes" class="mt-1 whitespace-pre-line text-sm text-muted">
              {{ it.notes }}
            </p>
          </div>
          <div v-if="$slots.actions" class="shrink-0" @click.stop>
            <slot name="actions" :item="it" />
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>
