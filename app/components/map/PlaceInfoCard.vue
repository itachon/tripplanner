<script setup lang="ts">
import OpeningHours from 'opening_hours'
import type { PlaceInfo } from '~~/shared/types/trip'

// Ficha de un lugar: foto, dirección e info automática (sin IA).
// compact = versión corta para la tarjeta flotante del mapa.
const props = withDefaults(defineProps<{
  name: string
  address?: string | null
  category?: string | null
  description?: string | null
  /** foto subida a mano por el admin: tiene prioridad sobre la automática */
  photoUrl?: string | null
  info?: PlaceInfo | null
  /** buscando la info automática (Overpass/Wikidata/Wikipedia/Commons) */
  loading?: boolean
  latitude?: number
  longitude?: number
  compact?: boolean
}>(), { compact: false, loading: false })

const mapsUrl = computed(() =>
  props.latitude != null && props.longitude != null ? directionsUrl(props.latitude, props.longitude) : null,
)

// La foto subida a mano manda; si no hay, se usa la automática (con crédito).
// Se compara por valor (no por qué prop llegó) para que funcione tanto si el
// llamador ya resolvió "mejor foto disponible" en photoUrl, como si no.
const displayPhoto = computed(() => props.photoUrl || props.info?.photo_url || null)
const showPhotoCredit = computed(() => !!props.info?.photo_url && displayPhoto.value === props.info.photo_url)

const hours = computed(() => {
  const raw = props.info?.opening_hours
  if (!raw) return null
  try {
    const oh = new OpeningHours(raw)
    return { open: oh.getState(), text: oh.prettifyValue({ locale: 'es' }) }
  }
  catch {
    return { open: null, text: raw } // no se pudo interpretar: mostrar el dato crudo
  }
})
</script>

<template>
  <div class="text-sm">
    <img
      v-if="displayPhoto"
      :src="displayPhoto"
      :alt="name"
      class="mb-1 w-full rounded-md object-cover"
      :class="compact ? 'h-28' : 'h-48'"
    >
    <p v-if="showPhotoCredit" class="mb-3 text-[11px] text-dimmed">
      Foto: {{ info!.photo_credit }}
    </p>

    <div class="flex items-start justify-between gap-2" :class="{ 'mt-3': !displayPhoto }">
      <div class="min-w-0">
        <p class="font-semibold leading-snug" :class="compact ? 'text-base' : 'text-lg'">
          {{ name }}
        </p>
        <p v-if="address" class="mt-0.5 text-xs text-muted" :class="{ 'line-clamp-1': compact }">
          {{ address }}
        </p>
      </div>
      <UBadge v-if="category" color="neutral" variant="subtle" size="sm" class="shrink-0 capitalize">
        {{ category }}
      </UBadge>
    </div>

    <p v-if="description" class="mt-2 whitespace-pre-line text-default" :class="{ 'line-clamp-2': compact }">
      {{ description }}
    </p>

    <p v-if="info?.history" class="mt-2 text-default" :class="{ 'line-clamp-4': compact }">
      {{ info.history }}
    </p>

    <div v-if="hours" class="mt-2.5 flex items-start gap-1.5">
      <UIcon name="i-lucide-clock" class="mt-0.5 size-3.5 shrink-0 text-muted" />
      <span>
        <UBadge v-if="hours.open != null" :color="hours.open ? 'success' : 'neutral'" variant="subtle" size="sm" class="mr-1.5">
          {{ hours.open ? 'Abierto ahora' : 'Cerrado ahora' }}
        </UBadge>
        <span class="text-xs text-muted">{{ hours.text }}</span>
      </span>
    </div>

    <div v-if="!compact && (info?.website || info?.phone)" class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
      <ULink v-if="info?.website" :to="info.website" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 text-xs text-primary">
        <UIcon name="i-lucide-globe" class="size-3.5" /> Sitio web
      </ULink>
      <a v-if="info?.phone" :href="`tel:${info.phone}`" class="flex items-center gap-1.5 text-xs text-primary">
        <UIcon name="i-lucide-phone" class="size-3.5" /> {{ info.phone }}
      </a>
    </div>

    <ULink v-if="!compact && info?.wikipedia_url" :to="info.wikipedia_url" target="_blank" rel="noopener noreferrer" class="mt-2 flex items-center gap-1 text-xs text-muted">
      <UIcon name="i-lucide-book-open" class="size-3.5" /> Ver en Wikipedia
    </ULink>

    <p v-if="loading" class="mt-3 flex items-center gap-1.5 text-xs text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
      Buscando info del lugar…
    </p>

    <UButton
      v-if="mapsUrl && !compact"
      :to="mapsUrl"
      target="_blank"
      rel="noopener noreferrer"
      icon="i-lucide-navigation"
      color="neutral"
      variant="outline"
      size="sm"
      class="mt-4"
    >
      Cómo llegar
    </UButton>

    <slot />
  </div>
</template>
