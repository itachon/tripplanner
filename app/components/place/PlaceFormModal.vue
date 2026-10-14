<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { PlaceSearchResult } from '~/composables/useMapbox'
import type { Place } from '~/composables/useTripAdmin'

export interface PlaceDraft {
  place?: Place | null
  /** resultado de la búsqueda o punto marcado en el mapa */
  result?: PlaceSearchResult | null
  /** valor inicial de "Votación" para un lugar nuevo */
  votable?: boolean
}

const props = defineProps<{ draft: PlaceDraft | null }>()
const emit = defineEmits<{ saved: [placeId: string, created: boolean] }>()
const open = defineModel<boolean>('open', { default: false })

const { trip } = useTripCtx()
const { client } = useDb()
const photoUrl = usePlacePhotoUrl()
const photos = usePlacePhotos()
const catalog = useCatalog()
const toast = useToast()
const { categories, loaded: categoriesLoaded, resolve: resolveCategory } = usePlaceCategories()

const state = reactive({ name: '', address: '', category: '', description: '', votable: true, isPublic: true })
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

// La etiqueta original (de Mapbox o guardada) no se muestra: se elige una categoría.
// Si no se cambia, al guardar se conserva la etiqueta original tal cual.
const rawTag = ref<string | null>(null)
const initialKey = ref('')
const categoryItems = computed(() => categories.value.map(c => ({ label: c.label_es, value: c.key, icon: c.icon })))

function initCategory() {
  initialKey.value = categoriesLoaded.value ? resolveCategory(rawTag.value)?.key ?? OTHER_CATEGORY : ''
  state.category = categoriesLoaded.value ? initialKey.value : rawTag.value ?? ''
}
// Si las categorías llegan con el formulario ya abierto
watch(categoriesLoaded, () => { if (open.value) initCategory() })

// Nombre, dirección, categoría, foto y visibilidad son del catálogo: los cambia solo
// quien creó el lugar y solo mientras su viaje de origen no haya terminado.
const canEditShared = computed(() => !editing.value || editing.value.editable)
const lockReason = computed(() => {
  const p = editing.value
  if (!p || p.editable) return ''
  return p.is_mine ? 'El viaje donde se creó este lugar ya terminó' : 'Este lugar lo creó otro organizador'
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const p = editing.value
  const r = props.draft?.result
  state.name = p?.name ?? r?.name ?? ''
  state.address = p?.address ?? r?.address ?? ''
  rawTag.value = p?.category ?? r?.category ?? null
  initCategory()
  state.description = p?.description ?? ''
  state.votable = p?.votable ?? props.draft?.votable ?? true
  state.isPublic = p?.is_public ?? true
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
  let uploaded: string | null = null
  const description = e.data.description.trim() || null
  const shared = {
    name: e.data.name.trim(),
    address: e.data.address.trim() || null,
    category: categoriesLoaded.value
      ? categoryToSave(rawTag.value, initialKey.value, e.data.category)
      : e.data.category.trim() || null,
  }
  try {
    const p = editing.value
    if (p) {
      // Primero lo del catálogo (solo si el usuario puede: si no, catalog.update fallaría con PLACE_LOCKED)
      // y, si tiene éxito, lo propio del viaje: así un fallo no deja el guardado a medias.
      let photoPath = p.photo_path
      if (p.editable) {
        if (newPhoto.value) photoPath = uploaded = await photos.upload(p.catalog_place_id, newPhoto.value)
        else if (removePhoto.value) photoPath = null
        // Solo viaja lo que cambió: así, por ejemplo, no se reenvía la visibilidad sin necesidad
        const patch: Record<string, string | boolean | null> = {}
        if (shared.name !== p.name) patch.name = shared.name
        if (shared.address !== (p.address || null)) patch.address = shared.address
        if (shared.category !== (p.category || null)) patch.category = shared.category
        if (photoPath !== p.photo_path) patch.photo_path = photoPath
        if (e.data.isPublic !== p.is_public) patch.is_public = e.data.isPublic
        if (Object.keys(patch).length) await catalog.update(p.catalog_place_id, patch)
        // El catálogo ya apunta al archivo nuevo: ya no se debe borrar si algo falla después
        uploaded = null
      }
      const { error } = await client.from('places').update({ votable: e.data.votable, description }).eq('id', p.id)
      if (error) throw error
      if (p.editable && p.photo_path && p.photo_path !== photoPath) await photos.remove(p.photo_path)
      toast.add({ color: 'success', title: 'Lugar actualizado' })
      open.value = false
      emit('saved', p.id, false)
    }
    else {
      const res = await catalog.addNew(trip.value.id, {
        ...shared,
        latitude: coords.value.latitude,
        longitude: coords.value.longitude,
        mapbox_id: realMapboxId(props.draft?.result?.id),
        is_public: e.data.isPublic,
      }, e.data.votable, description)
      // El lugar ya está creado y en el viaje: un fallo con la foto no lo deshace.
      // La foto va después de crear el lugar porque su ruta lleva el id del catálogo.
      // Si el lugar ya existía (mismo identificador de Mapbox), se respeta la foto que tiene.
      let photoFailed = false
      if (newPhoto.value && res.created) {
        let up: string | null = null
        try {
          up = await photos.upload(res.catalog_place_id, newPhoto.value)
          await catalog.update(res.catalog_place_id, { photo_path: up })
        }
        catch {
          photoFailed = true
          if (up) await photos.remove(up).catch(() => {})
        }
      }
      toast.add(photoFailed
        ? { color: 'warning', title: 'Lugar agregado', description: 'La foto no se pudo subir. Puedes agregarla después desde la ficha del lugar.' }
        : res.created
          ? { color: 'success', title: 'Lugar agregado', description: 'Buscando información del lugar…' }
          : { color: 'success', title: 'Lugar agregado', description: 'Ya estaba en el catálogo: se sumó a tu viaje con sus datos.' })
      open.value = false
      emit('saved', res.place_id, true)
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

        <UAlert
          v-if="lockReason"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :title="lockReason"
          description="Puedes cambiar la votación y tu nota. El nombre, la dirección, la categoría y la foto son comunes a todos los viajes que usan este lugar."
        />

        <UFormField label="Nombre" name="name" required>
          <UInput v-model="state.name" placeholder="Palacio Gyeongbokgung" class="w-full" autofocus :disabled="!canEditShared" />
        </UFormField>

        <UFormField label="Dirección" name="address">
          <UInput v-model="state.address" class="w-full" :disabled="!canEditShared" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Categoría" name="category">
            <USelectMenu
              v-if="categoriesLoaded"
              v-model="state.category"
              :items="categoryItems"
              value-key="value"
              :search-input="{ placeholder: 'Buscar…' }"
              class="w-full"
              :disabled="!canEditShared"
            />
            <UInput v-else v-model="state.category" placeholder="museo, mirador, hotel…" class="w-full" :disabled="!canEditShared" />
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

        <UFormField v-if="canEditShared" name="isPublic" label="Visibilidad">
          <USwitch
            :model-value="!state.isPublic"
            :disabled="!!editing?.is_public && !!editing?.used_elsewhere"
            label="Solo para este viaje"
            :description="editing?.is_public && editing?.used_elsewhere ? 'Otro viaje ya usa este lugar: no se puede dejar solo para este viaje.' : 'Otros organizadores no podrán verlo ni usarlo.'"
            class="pt-1.5"
            @update:model-value="state.isPublic = !$event"
          />
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
            <div v-if="canEditShared" class="flex flex-col gap-1.5">
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
          <div v-if="urlMode && canEditShared" class="mt-2 flex gap-2">
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
