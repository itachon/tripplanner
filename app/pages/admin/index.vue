<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'
import type { TripCover } from '~~/shared/types/catalog'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Mis viajes' })

type TripRow = Tables<'trips'> & { members: { count: number }[], places: { count: number }[] }

const { client, userId } = useDb()
const photoUrl = usePlacePhotoUrl()
const catalog = useCatalog()
const createOpen = ref(false)

const { data, status } = await useAsyncData('admin-trips', async () => {
  const [tripsRes, covers] = await Promise.all([
    client.from('trips').select('*, members(count), places(count)').order('start_date', { ascending: true }),
    catalog.covers().catch((): TripCover[] => []),
  ])
  if (tripsRes.error) throw tripsRes.error
  return { trips: tripsRes.data as unknown as TripRow[], covers }
})
const trips = computed(() => data.value?.trips ?? null)

/** Portada de un viaje: la primera foto subida, en el orden del organizador; si no hay, una de las fichas */
const coverByTrip = computed(() => new Map((data.value?.covers ?? []).map(c => [c.trip_id, c])))
function coverOf(t: TripRow) {
  const c = coverByTrip.value.get(t.id)
  return coverPhoto([{ photo_url: photoUrl(c?.photo_path) }, { photo_url: c?.info_photo_url }])
}

const upcoming = computed(() => (trips.value ?? []).filter(t => todayIn(t.time_zone) <= t.end_date))
const past = computed(() => (trips.value ?? []).filter(t => todayIn(t.time_zone) > t.end_date).reverse())

function onCreated(t: Tables<'trips'>) {
  navigateTo(`/admin/viajes/${t.id}`)
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-serif text-3xl font-semibold">
          Mis viajes
        </h1>
        <p class="text-sm text-muted">
          Viajes que creaste o que organizas con otras personas
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="createOpen = true">
        Nuevo viaje
      </UButton>
    </div>

    <div v-if="status === 'pending' && !trips" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <USkeleton v-for="i in 3" :key="i" class="h-72 rounded-md" />
    </div>

    <UEmpty
      v-else-if="!trips?.length"
      icon="i-lucide-plane"
      title="Aún no tienes viajes"
      description="Crea tu primer viaje, invita a tus compañeros y armen juntos el itinerario."
      :actions="[{ label: 'Crear viaje', icon: 'i-lucide-plus', onClick: () => { createOpen = true } }]"
      class="rounded-lg border border-dashed border-default bg-default py-16"
    />

    <template v-else>
      <div v-if="upcoming.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TripCard v-for="t in upcoming" :key="t.id" :trip="t" :is-owner="t.owner_id === userId" :photo-url="coverOf(t)" />
      </div>
      <section v-if="past.length" class="mt-10 space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          Viajes pasados
        </h2>
        <div class="grid gap-4 opacity-75 sm:grid-cols-2 lg:grid-cols-3">
          <TripCard v-for="t in past" :key="t.id" :trip="t" :is-owner="t.owner_id === userId" :photo-url="coverOf(t)" />
        </div>
      </section>
    </template>

    <TripFormModal v-model:open="createOpen" @saved="onCreated" />
  </div>
</template>
