<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  destination?: string | null
  /** texto ya formateado, ej. "10 al 20 de abril de 2027" */
  dateRange?: string | null
  photoUrl?: string | null
  /** full: vista del viajero · band: detalle del admin · card: tarjeta de la lista */
  size?: 'full' | 'band' | 'card'
}>(), {
  destination: null,
  dateRange: null,
  photoUrl: null,
  size: 'full',
})

const SIZES = {
  full: {
    root: '',
    inner: 'mx-auto flex min-h-88 max-w-7xl flex-col justify-end px-4 pb-16 pt-14 sm:min-h-112 sm:pb-20',
    title: 'text-4xl sm:text-6xl',
    meta: 'mt-3 text-base',
  },
  band: {
    root: 'rounded-md',
    inner: 'flex min-h-44 flex-col justify-end p-5 sm:min-h-52 sm:p-8',
    title: 'text-3xl sm:text-4xl',
    meta: 'mt-2 text-sm',
  },
  card: {
    root: 'aspect-[16/10]',
    inner: 'absolute inset-0 flex flex-col justify-end p-4',
    title: 'line-clamp-3 text-xl',
    meta: 'mt-1 text-sm',
  },
} as const

const img = ref<HTMLImageElement | null>(null)
const failed = ref(false)
watch(() => props.photoUrl, () => { failed.value = false })
// Si la foto falló antes de hidratar, el evento error ya pasó
onMounted(() => {
  if (img.value?.complete && !img.value.naturalWidth) failed.value = true
})
const showPhoto = computed(() => !!props.photoUrl && !failed.value)
</script>

<template>
  <!-- El color de fondo es la variante sin foto, y lo que queda si la foto no carga -->
  <div
    class="relative isolate overflow-hidden bg-terracotta-700 text-white dark:bg-terracotta-900"
    :class="SIZES[size].root"
  >
    <img
      v-if="showPhoto"
      ref="img"
      :src="photoUrl!"
      alt=""
      class="absolute inset-0 -z-20 size-full object-cover"
      :loading="size === 'full' ? 'eager' : 'lazy'"
      @error="failed = true"
    >
    <div v-if="showPhoto" class="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/35" />

    <div :class="SIZES[size].inner">
      <div v-if="$slots.eyebrow" class="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/90">
        <slot name="eyebrow" />
      </div>
      <component
        :is="size === 'card' ? 'h3' : 'h1'"
        class="font-serif font-semibold leading-tight text-balance"
        :class="SIZES[size].title"
      >
        {{ name }}
      </component>
      <p v-if="destination || dateRange" class="flex flex-wrap gap-x-4 gap-y-1 text-white/85" :class="SIZES[size].meta">
        <span v-if="destination" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-globe" class="size-4 shrink-0" />
          {{ destination }}
        </span>
        <span v-if="dateRange" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-calendar-range" class="size-4 shrink-0" />
          {{ dateRange }}
        </span>
      </p>
      <slot />
    </div>
  </div>
</template>
