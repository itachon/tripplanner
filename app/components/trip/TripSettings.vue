<script setup lang="ts">
const emit = defineEmits<{ edit: [] }>()

const { trip, isOwner, stats, tz } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const deleteOpen = ref(false)
const deleting = ref(false)
const confirmText = ref('')

async function deleteTrip() {
  if (!trip.value) return
  deleting.value = true

  // Borrar fotos antes del viaje (la BD borra el resto en cascada)
  const folder = trip.value.id
  const { data: files } = await client.storage.from('place-photos').list(folder, { limit: 1000 })
  if (files?.length) await client.storage.from('place-photos').remove(files.map(f => `${folder}/${f.name}`))

  const { error } = await client.from('trips').delete().eq('id', trip.value.id)
  deleting.value = false
  if (error) {
    toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
    return
  }
  toast.add({ title: 'Viaje borrado' })
  await navigateTo('/admin')
}
</script>

<template>
  <div v-if="trip" class="max-w-2xl space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold">
            Datos del viaje
          </h3>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-pencil" @click="emit('edit')">
            Editar
          </UButton>
        </div>
      </template>
      <dl class="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-muted">
            Destino
          </dt>
          <dd class="font-medium">
            {{ trip.destination || '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Fechas
          </dt>
          <dd class="font-medium">
            {{ formatDateRange(trip.start_date, trip.end_date) }} ({{ tripLength(trip.start_date, trip.end_date) }} días)
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Zona horaria
          </dt>
          <dd class="font-medium">
            {{ timeZoneLabel(trip.time_zone) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Confirmar y votar hasta
          </dt>
          <dd class="font-medium">
            {{ formatDateTime(trip.rsvp_deadline, tz) }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-muted">
            Mensaje
          </dt>
          <dd class="whitespace-pre-line">
            {{ trip.description || '—' }}
          </dd>
        </div>
      </dl>
    </UCard>

    <UCard v-if="isOwner" :ui="{ root: 'ring-error/40' }">
      <template #header>
        <h3 class="font-semibold text-error">
          Zona peligrosa
        </h3>
      </template>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Borra el viaje con sus {{ stats.members }} viajeros, {{ stats.places }} lugares, {{ stats.stops }} paradas y todos los votos. No se puede deshacer.
        </p>
        <UButton color="error" variant="soft" icon="i-lucide-trash-2" @click="confirmText = ''; deleteOpen = true">
          Borrar viaje
        </UButton>
      </div>
    </UCard>

    <ConfirmModal
      v-model:open="deleteOpen"
      title="¿Borrar este viaje?"
      description="Los links de los viajeros dejarán de funcionar."
      confirm-label="Borrar definitivamente"
      :loading="deleting"
      :disabled="confirmText.trim() !== trip.name.trim()"
      @confirm="deleteTrip"
    >
      <UFormField :label="`Escribe «${trip.name}» para confirmar`">
        <UInput v-model="confirmText" class="w-full" />
      </UFormField>
    </ConfirmModal>
  </div>
</template>
