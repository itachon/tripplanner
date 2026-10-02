<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { Member } from '~/composables/useTripAdmin'

const props = defineProps<{ member?: Member | null }>()
const emit = defineEmits<{ saved: [created: Member[]] }>()
const open = defineModel<boolean>('open', { default: false })

const { trip, members } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const state = reactive({ mode: 'single' as 'single' | 'bulk', name: '', bulk: '', notes: '' })
const loading = ref(false)
const isEdit = computed(() => !!props.member)

watch(open, (o) => {
  if (!o) return
  state.mode = 'single'
  state.name = props.member?.name ?? ''
  state.bulk = ''
  state.notes = props.member?.notes ?? ''
}, { immediate: true })

const bulkList = computed(() => state.bulk.split('\n').map(s => s.trim()).filter(Boolean))

const duplicateWarning = computed(() => {
  if (isEdit.value || state.mode !== 'single') return ''
  const n = state.name.trim().toLowerCase()
  return n && members.value.some(m => m.name.trim().toLowerCase() === n) ? 'Ya hay un viajero con ese nombre.' : ''
})

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (s.mode === 'single' && !s.name.trim()) errors.push({ name: 'name', message: 'Ingresa el nombre' })
  if (s.mode === 'bulk' && !bulkList.value.length) errors.push({ name: 'bulk', message: 'Escribe al menos un nombre' })
  if (s.mode === 'bulk' && bulkList.value.some(n => n.length > 120)) errors.push({ name: 'bulk', message: 'Máximo 120 caracteres por nombre' })
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!trip.value) return
  loading.value = true
  const notes = e.data.notes.trim() || null

  if (props.member) {
    const { error } = await client.from('members').update({ name: e.data.name.trim(), notes }).eq('id', props.member.id)
    loading.value = false
    if (error) return toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
    toast.add({ color: 'success', title: 'Viajero actualizado' })
    open.value = false
    emit('saved', [])
    return
  }

  const names = e.data.mode === 'bulk' ? bulkList.value : [e.data.name.trim()]
  const { data, error } = await client.from('members')
    .insert(names.map(name => ({ trip_id: trip.value!.id, name, notes })))
    .select()
  loading.value = false
  if (error || !data) return toast.add({ color: 'error', title: 'No se pudo invitar', description: errorMessage(error) })
  toast.add({ color: 'success', title: data.length > 1 ? `${data.length} viajeros invitados` : 'Viajero invitado' })
  open.value = false
  emit('saved', data)
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Editar viajero' : 'Invitar viajero'">
    <template #body>
      <UForm id="member-form" :state="state" :validate="validate" class="space-y-5" @submit="onSubmit">
        <UTabs
          v-if="!isEdit"
          v-model="state.mode"
          :items="[{ label: 'Una persona', value: 'single' }, { label: 'Varias a la vez', value: 'bulk' }]"
          :content="false"
          size="sm"
        />
        <UFormField v-if="state.mode === 'single'" label="Nombre" name="name" required :hint="duplicateWarning">
          <UInput v-model="state.name" placeholder="Juan Soto" class="w-full" autofocus />
        </UFormField>
        <UFormField
          v-else
          label="Nombres (uno por línea)"
          name="bulk"
          required
          :help="bulkList.length ? `Se crearán ${bulkList.length} links` : 'Pega una lista desde WhatsApp o Excel'"
        >
          <UTextarea v-model="state.bulk" :rows="7" placeholder="Juan Soto&#10;María Rojas&#10;Pedro Vera" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Nota interna" name="notes" help="Solo la ven los administradores">
          <UInput v-model="state.notes" placeholder="Ej: comparte pieza con María" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="member-form" :loading="loading">
          {{ isEdit ? 'Guardar' : state.mode === 'bulk' && bulkList.length > 1 ? `Invitar ${bulkList.length}` : 'Invitar' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
