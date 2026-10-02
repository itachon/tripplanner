<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ trip?: Tables<'trips'> | null }>()
const emit = defineEmits<{ saved: [trip: Tables<'trips'>] }>()
const open = defineModel<boolean>('open', { default: false })

const { client } = useDb()
const toast = useToast()

const state = reactive({
  name: '',
  destination: '',
  description: '',
  startDate: '',
  endDate: '',
  timeZone: 'America/Santiago',
  deadline: '',
})
const loading = ref(false)
const zones = ref<{ label: string, value: string }[]>([])

watch(open, (isOpen) => {
  if (!isOpen) return
  if (!zones.value.length) zones.value = timeZoneList().map(z => ({ label: timeZoneLabel(z), value: z }))
  const t = props.trip
  state.name = t?.name ?? ''
  state.destination = t?.destination ?? ''
  state.description = t?.description ?? ''
  state.startDate = t?.start_date ?? ''
  state.endDate = t?.end_date ?? ''
  state.timeZone = t?.time_zone ?? 'America/Santiago'
  state.deadline = t ? toLocalInput(t.rsvp_deadline, t.time_zone) : ''
}, { immediate: true })

// Al elegir la fecha de inicio, proponer el fin y la fecha límite
watch(() => state.startDate, (start) => {
  if (!start || props.trip) return
  if (!state.endDate || state.endDate < start) state.endDate = start
  if (!state.deadline) {
    const d = new Date(`${start}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 7)
    state.deadline = `${d.toISOString().slice(0, 10)}T23:59`
  }
})

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Ponle un nombre al viaje' })
  if (!s.startDate) errors.push({ name: 'startDate', message: 'Indica cuándo empieza' })
  if (!s.endDate) errors.push({ name: 'endDate', message: 'Indica cuándo termina' })
  if (s.startDate && s.endDate && s.endDate < s.startDate) errors.push({ name: 'endDate', message: 'Debe ser igual o posterior al inicio' })
  if (s.startDate && s.endDate && tripLength(s.startDate, s.endDate) > 121) errors.push({ name: 'endDate', message: 'Máximo 120 días' })
  if (!s.deadline) errors.push({ name: 'deadline', message: 'Indica hasta cuándo pueden confirmar y votar' })
  if (s.deadline && s.endDate && s.deadline.slice(0, 10) > s.endDate) errors.push({ name: 'deadline', message: 'Debe ser antes de que termine el viaje' })
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  loading.value = true
  const payload = {
    name: e.data.name.trim(),
    destination: e.data.destination.trim() || null,
    description: e.data.description.trim() || null,
    start_date: e.data.startDate,
    end_date: e.data.endDate,
    time_zone: e.data.timeZone,
    rsvp_deadline: fromLocalInput(e.data.deadline, e.data.timeZone),
  }
  const query = props.trip
    ? client.from('trips').update(payload).eq('id', props.trip.id).select().single()
    : client.from('trips').insert(payload).select().single()
  const { data, error } = await query
  loading.value = false

  if (error || !data) {
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
    return
  }
  toast.add({ color: 'success', title: props.trip ? 'Viaje actualizado' : 'Viaje creado' })
  open.value = false
  emit('saved', data)
}
</script>

<template>
  <UModal v-model:open="open" :title="trip ? 'Editar viaje' : 'Nuevo viaje'" :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <UForm id="trip-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Nombre" name="name" required>
            <UInput v-model="state.name" placeholder="Corea con amigos" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Destino" name="destination">
            <UInput v-model="state.destination" placeholder="Seúl y Busan, Corea del Sur" class="w-full" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Desde" name="startDate" required>
            <UInput v-model="state.startDate" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Hasta" name="endDate" required>
            <UInput v-model="state.endDate" type="date" :min="state.startDate" class="w-full" />
          </UFormField>
        </div>

        <UFormField
          label="Zona horaria del destino"
          name="timeZone"
          help="Los horarios del itinerario se muestran en hora local del destino"
        >
          <USelectMenu
            v-model="state.timeZone"
            :items="zones"
            value-key="value"
            virtualize
            :search-input="{ placeholder: 'Buscar ciudad o región…' }"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Confirmar y votar hasta"
          name="deadline"
          required
          :help="`Hora de ${state.timeZone.split('/').pop()?.replace(/_/g, ' ')}. Después de esta fecha nadie puede confirmar ni votar.`"
        >
          <UInput v-model="state.deadline" type="datetime-local" class="w-full" />
        </UFormField>

        <UFormField label="Mensaje para los viajeros" name="description">
          <UTextarea v-model="state.description" :rows="3" autoresize placeholder="¡Vamos a recorrer Corea! Voten por los lugares que más les interesen." class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="trip-form" :loading="loading">
          {{ trip ? 'Guardar' : 'Crear viaje' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
