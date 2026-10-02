<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { PlaceSearchResult } from '~/composables/useMapbox'
import type { Place } from '~/composables/useTripAdmin'

export interface PlaceDraft {
  place?: Place | null
  /** resultado de la búsqueda o punto marcado en el mapa */
  result?: PlaceSearchResult | null
}

const props = defineProps<{ draft: PlaceDraft | null }>()
const emit = defineEmits<{ saved: [placeId: string, created: boolean] }>()
const open = defineModel<boolean>('open', { default: false })

const { trip, places } = useTripCtx()
const { client } = useDb()
const photoUrl = usePlacePhotoUrl()
const photos = usePlacePhotos()
const toast = useToast()

const state = reactive({ name: '', address: '', category: '', description: '', votable: true })
const coords = ref<{ latitude: number, longitude: number } | null>(null)
const newPhoto = ref<Blob | null>(null)
const preview = ref<string | null>(null)
const removePhoto = ref(false)
const processing = ref(false)
const loading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const urlMode = ref(false)
const photoUrlInput = ref('')

const editing = computed(() => props.draft?.place ?? null)

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = editing.value
  const r = props.draft?.result
  state.name = p?.name ?? r?.name ?? ''
  state.address = p?.address ?? r?.address ?? ''
  state.category = p?.category ?? r?.category ?? ''
  state.description = p?.description ?? ''
  state.votable = p?.votable ?? true
  coords.value = p ? { latitude: p.latitude, longitude: p.longitude } : r ? { latitude: r.latitude, longitude: r.longitude } : null
  newPhoto.value = null
  removePhoto.value = false
  urlMode.value = false
  photoUrlInput.value = ''
  setPreview(photoUrl(p?.photo_path))
}, { immediate: true })

function setPreview(url: string | null) {
  if (preview.value?.startsWith('blob:')) URL.revokeObjectURL(preview.value)
  preview.value = url
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  processing.value = true
  try {
    const blob = await compressImage(file)
    newPhoto.value = blob
    removePhoto.value = false
    setPreview(URL.createObjectURL(blob))
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo usar la foto', description: errorMessage(err) })
  }
  finally {
    processing.value = false
  }
}

async function onUrl() {
  const url = photoUrlInput.value.trim()
  if (!url) return
  processing.value = true
  try {
    const blob = await photos.fromUrl(url)
    newPhoto.value = blob
    removePhoto.value = false
    setPreview(URL.createObjectURL(blob))
    urlMode.value = false
    photoUrlInput.value = ''
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo usar la imagen', description: errorMessage(err) })
  }
  finally {
    processing.value = false
  }
}

function clearPhoto() {
  newPhoto.value = null
  removePhoto.value = true
  setPreview(null)
}

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Ponle un nombre al lugar' })
  if (!coords.value) errors.push({ name: 'name', message: 'Falta la ubicación del lugar' })
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!trip.value || !coords.value) return
  loading.value = true
  const oldPath = editing.value?.photo_path ?? null
  let uploaded: string | null = null
  try {
    let photoPath = oldPath
    if (newPhoto.value) photoPath = uploaded = await photos.upload(trip.value.id, newPhoto.value)
    else if (removePhoto.value) photoPath = null

    const fields = {
      name: e.data.name.trim(),
      address: e.data.address.trim() || null,
      category: e.data.category.trim() || null,
      description: e.data.description.trim() || null,
      votable: e.data.votable,
      photo_path: photoPath,
    }

    if (editing.value) {
      const { error } = await client.from('places').update(fields).eq('id', editing.value.id)
      if (error) throw error
      if (oldPath && oldPath !== photoPath) await photos.remove(oldPath)
      toast.add({ color: 'success', title: 'Lugar actualizado' })
      open.value = false
      emit('saved', editing.value.id, false)
    }
    else {
      const { data, error } = await client.from('places').insert({
        ...fields,
        trip_id: trip.value.id,
        latitude: coords.value.latitude,
        longitude: coords.value.longitude,
        mapbox_id: props.draft?.result?.id ?? null,
        sort_order: Math.max(0, ...places.value.map(p => p.sort_order)) + 1,
      }).select('id').single()
      if (error || !data) throw error
      toast.add({ color: 'success', title: 'Lugar agregado', description: 'Generando la ficha con IA…' })
      open.value = false
      emit('saved', data.id, true)
    }
  }
  catch (err) {
    if (uploaded) await photos.remove(uploaded)
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(err) })
  }
  finally {
    loading.value = false
  }
}

onBeforeUnmount(() => setPreview(null))
</script>

<template>
  <UModal v-model:open="open" :title="editing ? 'Editar lugar' : 'Agregar lugar'">
    <template #body>
      <UForm id="place-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <p v-if="coords" class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-map-pin" class="size-3.5 text-primary" />
          {{ coords.latitude.toFixed(5) }}, {{ coords.longitude.toFixed(5) }}
        </p>

        <UFormField label="Nombre" name="name" required>
          <UInput v-model="state.name" placeholder="Palacio Gyeongbokgung" class="w-full" autofocus />
        </UFormField>

        <UFormField label="Dirección" name="address">
          <UInput v-model="state.address" class="w-full" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Categoría" name="category">
            <UInput v-model="state.category" placeholder="museo, mirador, hotel…" class="w-full" />
          </UFormField>
          <UFormField name="votable" label="Votación">
            <USwitch
              v-model="state.votable"
              label="En la lista para votar"
              description="Desactívalo para hoteles, aeropuertos, etc."
              class="pt-1.5"
            />
          </UFormField>
        </div>

        <UFormField label="Nota para los viajeros" name="description">
          <UTextarea v-model="state.description" :rows="2" autoresize placeholder="Reservar con anticipación, llevar ropa cómoda…" class="w-full" />
        </UFormField>

        <div>
          <p class="mb-1.5 text-sm font-medium">
            Foto (opcional)
          </p>
          <div class="flex items-center gap-4">
            <div class="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-elevated ring-1 ring-default">
              <img v-if="preview" :src="preview" alt="" class="size-full object-cover">
              <UIcon v-else name="i-lucide-image" class="size-6 text-dimmed" />
              <div v-if="processing" class="absolute inset-0 flex items-center justify-center bg-default/70">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-upload" :loading="processing" @click="fileInput?.click()">
                {{ preview ? 'Cambiar foto' : 'Subir foto' }}
              </UButton>
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-link" :disabled="processing" @click="urlMode = !urlMode">
                Desde URL
              </UButton>
              <UButton v-if="preview" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="clearPhoto">
                Quitar
              </UButton>
            </div>
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onFile">
          </div>
          <div v-if="urlMode" class="mt-2 flex gap-2">
            <UInput
              v-model="photoUrlInput"
              type="url"
              placeholder="https://…/foto.jpg"
              class="flex-1"
              autofocus
              @keydown.enter.prevent="onUrl"
            />
            <UButton size="sm" :loading="processing" :disabled="!photoUrlInput.trim()" @click="onUrl">
              Usar
            </UButton>
          </div>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="place-form" :loading="loading" :disabled="processing">
          {{ editing ? 'Guardar' : 'Agregar lugar' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
