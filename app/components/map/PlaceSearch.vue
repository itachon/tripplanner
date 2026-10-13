<script setup lang="ts">
import type { PlaceSearchResult } from '~/composables/useMapbox'
import type { CatalogPlace } from '~~/shared/types/catalog'

// Buscador de lugares: primero lo ya guardado en el catálogo compartido, después Mapbox
const props = defineProps<{ tripId: string, near?: { latitude: number, longitude: number } | null }>()
const emit = defineEmits<{ select: [result: PlaceSearchResult], selectCatalog: [place: CatalogPlace] }>()

const { enabled, search } = useMapbox()
const catalog = useCatalog()
const photoUrl = usePlacePhotoUrl()
const q = ref('')
const results = ref<PlaceSearchResult[]>([])
const saved = ref<CatalogPlace[]>([])
const loading = ref(false)
const errorText = ref('')
const open = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

watch(q, (value) => {
  clearTimeout(timer)
  errorText.value = ''
  if (value.trim().length < 2) {
    results.value = []
    saved.value = []
    open.value = false
    return
  }
  timer = setTimeout(async () => {
    const mine = ++seq
    loading.value = true
    try {
      // Si el catálogo falla, la búsqueda en Mapbox sigue funcionando
      const [fromCatalog, fromMapbox] = await Promise.all([
        catalog.search(value, props.near, props.tripId).catch(() => [] as CatalogPlace[]),
        search(value, props.near),
      ])
      if (mine !== seq) return
      saved.value = fromCatalog
      results.value = fromMapbox
      open.value = true
    }
    catch (e) {
      if (mine === seq) errorText.value = errorMessage(e)
    }
    finally {
      if (mine === seq) loading.value = false
    }
  }, 300)
})

function pick(r: PlaceSearchResult) {
  emit('select', r)
  q.value = ''
  results.value = []
  saved.value = []
  open.value = false
}

function pickSaved(c: CatalogPlace) {
  emit('selectCatalog', c)
  q.value = ''
  results.value = []
  saved.value = []
  open.value = false
}

function onBlur() {
  setTimeout(() => { open.value = false }, 150)
}
</script>

<template>
  <div class="relative">
    <UInput
      v-model="q"
      :disabled="!enabled"
      :loading="loading"
      icon="i-lucide-search"
      :placeholder="enabled ? 'Buscar un lugar (ej. Torre Eiffel)…' : 'Configura Mapbox para buscar lugares'"
      class="w-full"
      autocomplete="off"
      @focus="(results.length || saved.length) && (open = true)"
      @blur="onBlur"
      @keydown.esc="open = false"
    />
    <p v-if="errorText" class="mt-1 text-xs text-error">
      {{ errorText }}
    </p>
    <div
      v-if="open"
      class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-default bg-default shadow-lg"
      role="listbox"
    >
      <p v-if="!results.length && !saved.length" class="px-3 py-3 text-sm text-muted">
        Sin resultados. Prueba con otro nombre o marca el punto en el mapa.
      </p>

      <template v-if="saved.length">
        <p class="bg-elevated/50 px-3 py-1.5 text-xs font-medium text-muted">
          Ya guardados por otros organizadores
        </p>
        <button
          v-for="c in saved"
          :key="c.id"
          type="button"
          role="option"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-elevated focus:bg-elevated focus:outline-none"
          @mousedown.prevent="pickSaved(c)"
        >
          <img v-if="photoUrl(c.photo_path)" :src="photoUrl(c.photo_path)!" alt="" class="size-9 shrink-0 rounded-sm object-cover">
          <span v-else class="flex size-9 shrink-0 items-center justify-center rounded-sm bg-elevated">
            <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ c.name }}</span>
            <span v-if="c.address" class="block truncate text-xs text-muted">{{ c.address }}</span>
          </span>
          <span class="shrink-0 text-xs font-medium text-primary">Agregar</span>
        </button>
      </template>

      <template v-if="results.length">
        <p v-if="saved.length" class="bg-elevated/50 px-3 py-1.5 text-xs font-medium text-muted">
          Mapbox
        </p>
        <button
          v-for="r in results"
          :key="r.id"
          type="button"
          role="option"
          class="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-elevated focus:bg-elevated focus:outline-none"
          @mousedown.prevent="pick(r)"
        >
          <UIcon name="i-lucide-map-pin" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ r.name }}</span>
            <span v-if="r.address" class="block truncate text-xs text-muted">{{ r.address }}</span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
