<script setup lang="ts">
import type { MapMarker } from '~~/shared/types/map'
import type { PlaceCategory } from '~~/shared/types/place-category'

// Dibujo de un punto del mapa. TripMap lo monta con render() dentro del
// <button> que Mapbox posiciona (los marcadores de Mapbox no son componentes).
const props = defineProps<{ marker: MapMarker, category: PlaceCategory | null, active: boolean }>()

const TONES: Record<NonNullable<MapMarker['tone']>, string> = {
  primary: 'bg-primary text-inverted',
  success: 'bg-success text-inverted',
  neutral: 'bg-neutral-600 text-white',
  warning: 'bg-warning text-white',
  off: 'bg-sky-300 text-sky-950',
  catalog: 'bg-sky-200/80 text-sky-800',
}

const look = computed(() => (props.category ? markerLook(props.marker.tone, props.category.color) : null))
const small = computed(() => props.marker.tone === 'off' || props.marker.tone === 'catalog')
const showBadge = computed(() => !!props.marker.label && props.marker.tone !== 'catalog')
const state = computed(() => [
  props.marker.dimmed && !props.active ? 'opacity-55' : '',
  props.active ? 'scale-125 ring-4 ring-primary/35' : 'group-hover:scale-110',
])
</script>

<template>
  <!-- Con categoría: color de la categoría, icono, número en burbuja -->
  <span
    v-if="category && look"
    class="trip-marker relative flex items-center justify-center rounded-full border-2 shadow-md transition-[scale,box-shadow] duration-150"
    :class="[small ? 'size-6' : 'size-8', state]"
    :style="look.style"
  >
    <UIcon :name="category.icon" :class="small ? 'size-3.5' : 'size-4'" />
    <span
      v-if="showBadge"
      class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-1 ring-white"
      :class="marker.tone === 'success' ? 'bg-success' : 'bg-neutral-900'"
    >{{ marker.label }}</span>
  </span>
  <!-- Sin categorías cargadas: como antes -->
  <span
    v-else
    class="trip-marker flex items-center justify-center rounded-full border-2 font-bold shadow-md transition-[scale,box-shadow] duration-150"
    :class="[
      marker.tone === 'catalog' ? 'border-dashed border-sky-600' : 'border-white',
      small ? 'size-6 text-[10px]' : 'size-8 text-xs',
      TONES[marker.tone ?? 'primary'],
      state,
    ]"
  >{{ marker.label ?? '' }}</span>
</template>
