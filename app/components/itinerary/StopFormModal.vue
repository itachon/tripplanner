<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { StopDraft } from '~/composables/useTripAdmin'

const props = defineProps<{ draft: StopDraft | null }>()
const open = defineModel<boolean>('open', { default: false })

const { trip, places, days, stopsByDay, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const state = reactive({
  day: '',
  kind: 'place' as 'place' | 'free',
  placeId: '' as string,
  title: '',
  startTime: '',
  endTime: '',
  notes: '',
})
const loading = ref(false)
const editing = computed(() => props.draft?.stop ?? null)

const dayItems = computed(() => days.value.map((d, i) => ({ label: `Día ${i + 1} · ${formatDayShort(d)}`, value: d })))
const placeItems = computed(() => places.value.map(p => ({ label: p.name, value: p.id, description: p.address ?? undefined })))

watch(open, (isOpen) => {
  if (!isOpen) return
  const s = editing.value
  state.day = s?.day ?? props.draft?.day ?? days.value[0] ?? ''
  state.placeId = s?.place_id ?? props.draft?.placeId ?? ''
  state.kind = s ? (s.place_id ? 'place' : 'free') : (places.value.length || props.draft?.placeId ? 'place' : 'free')
  state.title = s?.title ?? ''
  state.startTime = shortTime(s?.start_time)
  state.endTime = shortTime(s?.end_time)
  state.notes = s?.notes ?? ''
}, { immediate: true })

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.day) errors.push({ name: 'day', message: 'Elige el día' })
  if (s.kind === 'place' && !s.placeId) errors.push({ name: 'placeId', message: 'Elige un lugar' })
  if (s.kind === 'free' && !s.title.trim()) errors.push({ name: 'title', message: 'Describe la actividad' })
  if (s.startTime && s.endTime && s.endTime <= s.startTime) errors.push({ name: 'endTime', message: 'Debe ser después del inicio' })
  if (s.endTime && !s.startTime) errors.push({ name: 'startTime', message: 'Indica la hora de inicio' })
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!trip.value) return
  loading.value = true
  const fields = {
    day: e.data.day,
    place_id: e.data.kind === 'place' ? e.data.placeId : null,
    title: e.data.title.trim() || null,
    start_time: e.data.startTime || null,
    end_time: e.data.endTime || null,
    notes: e.data.notes.trim() || null,
  }

  const result = editing.value
    ? await client.from('itinerary_stops').update(fields).eq('id', editing.value.id)
    : await client.from('itinerary_stops').insert({
        ...fields,
        trip_id: trip.value.id,
        sort_order: Math.max(0, ...(stopsByDay.value.get(e.data.day) ?? []).map(s => s.sort_order)) + 1,
      })
  loading.value = false

  if (result.error) {
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(result.error) })
    return
  }
  toast.add({ color: 'success', title: editing.value ? 'Parada actualizada' : 'Parada agregada' })
  open.value = false
  await refresh()
}
</script>

<template>
  <UModal v-model:open="open" :title="editing ? 'Editar parada' : 'Agregar parada al itinerario'">
    <template #body>
      <UForm id="stop-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField label="Día" name="day" required>
          <USelect v-model="state.day" :items="dayItems" class="w-full" />
        </UFormField>

        <UTabs
          v-model="state.kind"
          :items="[{ label: 'Lugar del mapa', value: 'place', icon: 'i-lucide-map-pin' }, { label: 'Actividad libre', value: 'free', icon: 'i-lucide-pen-line' }]"
          :content="false"
          size="sm"
        />

        <template v-if="state.kind === 'place'">
          <UFormField label="Lugar" name="placeId" required>
            <USelectMenu
              v-model="state.placeId"
              :items="placeItems"
              value-key="value"
              placeholder="Elige un lugar"
              :search-input="{ placeholder: 'Buscar…' }"
              class="w-full"
            />
            <template #help>
              <span v-if="!places.length">Primero agrega lugares en la pestaña Lugares.</span>
            </template>
          </UFormField>
          <UFormField label="Título (opcional)" name="title" help="Por defecto se usa el nombre del lugar">
            <UInput v-model="state.title" placeholder="Ej: Almuerzo en el mercado" class="w-full" />
          </UFormField>
        </template>
        <UFormField v-else label="Actividad" name="title" required>
          <UInput v-model="state.title" placeholder="Vuelo Santiago → Seúl, Tiempo libre, Tren a Busan…" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Desde" name="startTime" help="Hora local">
            <UInput v-model="state.startTime" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Hasta" name="endTime">
            <UInput v-model="state.endTime" type="time" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Notas" name="notes">
          <UTextarea v-model="state.notes" :rows="2" autoresize placeholder="Entradas compradas, punto de encuentro…" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="stop-form" :loading="loading">
          {{ editing ? 'Guardar' : 'Agregar' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
