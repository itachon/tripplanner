<script setup lang="ts">
import type { MemberPlace } from '~~/shared/types/trip'

const props = defineProps<{
  place: MemberPlace
  /** número del lugar en el orden del organizador */
  order: number
  canVote: boolean
  /** id del lugar cuyo voto se está guardando, o null */
  busy: string | null
  /** resaltado: seleccionado o bajo el mouse, en la lista o en el mapa */
  active: boolean
  showItineraryBadge: boolean
}>()

const emit = defineEmits<{
  vote: []
  select: []
  detail: []
  hover: [on: boolean]
}>()

const img = ref<HTMLImageElement | null>(null)
const failed = ref(false)
const source = computed(() => placePhoto(props.place))
watch(source, () => { failed.value = false })
// Si la foto falló antes de hidratar, el evento error ya pasó
onMounted(() => {
  if (img.value?.complete && !img.value.naturalWidth) failed.value = true
})
const photo = computed(() => failed.value ? null : source.value)
</script>

<template>
  <article
    class="flex flex-col overflow-hidden rounded-md bg-default transition"
    :class="[place.voted ? 'ring-2 ring-success' : 'ring ring-default', active ? 'shadow-lg' : '']"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
  >
    <div class="relative">
      <button
        type="button"
        class="block aspect-[4/3] w-full bg-elevated text-left"
        :aria-label="`Ver ${place.name} en el mapa`"
        @click="emit('select')"
      >
        <img
          v-if="photo"
          ref="img"
          :src="photo"
          :alt="place.name"
          class="size-full object-cover"
          loading="lazy"
          @error="failed = true"
        >
        <span v-else class="flex size-full items-center justify-center bg-terracotta-100 dark:bg-terracotta-950">
          <UIcon name="i-lucide-map-pin" class="size-10 text-primary/60" />
        </span>
      </button>

      <span
        class="pointer-events-none absolute left-2 top-2 flex size-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-inverted shadow"
        :class="place.voted ? 'bg-success' : 'bg-primary'"
      >
        {{ order }}
      </span>
      <UBadge
        v-if="showItineraryBadge"
        color="neutral"
        class="pointer-events-none absolute bottom-2 left-2"
        icon="i-lucide-calendar-check"
        size="sm"
      >
        En el itinerario
      </UBadge>

      <!-- Hermano del botón de la foto, no hijo: un botón no puede ir dentro de otro -->
      <UButton
        v-if="canVote"
        icon="i-lucide-heart"
        size="lg"
        :color="place.voted ? 'success' : 'neutral'"
        variant="solid"
        class="absolute right-2 top-2 rounded-full shadow-md"
        :class="place.voted ? '' : 'bg-white text-stone-900 hover:bg-stone-100 active:bg-stone-100 disabled:bg-white aria-disabled:bg-white'"
        :loading="busy === place.id"
        :disabled="!!busy && busy !== place.id"
        :aria-pressed="place.voted"
        :aria-label="place.voted ? `Quitar mi voto a ${place.name}` : `Votar por ${place.name}`"
        @click="emit('vote')"
      />
    </div>

    <div class="flex flex-1 flex-col p-4">
      <h3 class="font-serif text-lg font-semibold leading-snug">
        {{ place.name }}
      </h3>
      <p v-if="place.address" class="mt-0.5 line-clamp-1 text-xs text-muted">
        {{ place.address }}
      </p>
      <p v-if="place.info?.history" class="mt-2 line-clamp-3 text-sm text-muted">
        {{ place.info.history }}
      </p>
      <p v-else-if="place.description" class="mt-2 line-clamp-3 text-sm text-muted">
        {{ place.description }}
      </p>
      <div class="mt-auto flex items-center justify-between gap-2 pt-4">
        <span class="flex items-center gap-1.5 text-sm font-medium">
          <UIcon name="i-lucide-heart" class="size-4" :class="place.voted ? 'text-success' : 'text-primary'" />
          {{ place.vote_count }} {{ place.vote_count === 1 ? 'voto' : 'votos' }}
        </span>
        <UButton size="sm" color="neutral" variant="link" class="-mr-2.5" @click="emit('detail')">
          Ver ficha
        </UButton>
      </div>
    </div>
  </article>
</template>
