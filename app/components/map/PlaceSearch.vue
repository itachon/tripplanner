<script setup lang="ts">
import type { PlaceSearchResult } from '~/composables/useMapbox'

// Buscador de lugares con Mapbox (para agregar destinos)
const props = defineProps<{ near?: { latitude: number, longitude: number } | null }>()
const emit = defineEmits<{ select: [result: PlaceSearchResult] }>()

const { enabled, search } = useMapbox()
const q = ref('')
const results = ref<PlaceSearchResult[]>([])
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
    open.value = false
    return
  }
  timer = setTimeout(async () => {
    const mine = ++seq
    loading.value = true
    try {
      const r = await search(value, props.near)
      if (mine !== seq) return
      results.value = r
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
      @focus="results.length && (open = true)"
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
      <p v-if="!results.length" class="px-3 py-3 text-sm text-muted">
        Sin resultados. Prueba con otro nombre o marca el punto en el mapa.
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
    </div>
  </div>
</template>
