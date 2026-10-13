<script setup lang="ts">
useHead({ title: 'Viajes en grupo' })
const user = useSupabaseUser()

const features = [
  { title: 'Lugares en el mapa', text: 'Busca y marca los destinos en un mapa. Cada lugar recibe una ficha con información generada con IA.' },
  { title: 'Votación del grupo', text: 'Cada viajero vota por los lugares que quiere conocer. Tú ves el ranking y armas el plan.' },
  { title: 'Itinerario por días', text: 'Paradas con horario y recorrido en el mapa, en hora local del destino. Lo publicas cuando esté listo.' },
]

// Muestra decorativa del producto, sin datos reales
const samplePlaces = [
  { n: 1, name: 'Lago Grey', meta: 'Navegación al glaciar', votes: 7, voted: true },
  { n: 2, name: 'Mirador Cuernos', meta: 'Caminata de medio día', votes: 4, voted: false },
]
</script>

<template>
  <div>
    <header>
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <span class="font-serif text-2xl font-semibold">Viajes</span>
        <div class="flex gap-2">
          <UButton v-if="user" to="/admin" color="neutral" variant="ghost">
            Mis viajes
          </UButton>
          <template v-else>
            <UButton to="/login" color="neutral" variant="ghost">
              Ingresar
            </UButton>
            <UButton to="/registro">
              Crear cuenta
            </UButton>
          </template>
        </div>
      </UContainer>
    </header>

    <UContainer class="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-24">
      <div>
        <p class="text-xs font-medium uppercase tracking-widest text-primary">
          Viajes en grupo
        </p>
        <h1 class="mt-4 font-serif text-5xl font-semibold leading-[1.05] text-balance sm:text-6xl">
          Planifiquen el viaje juntos
        </h1>
        <p class="mt-5 max-w-xl text-lg text-muted">
          Invita a tus compañeros con un link, voten por los lugares que quieren conocer y compartan el itinerario día a día.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <UButton v-if="user" to="/admin" size="xl" trailing-icon="i-lucide-arrow-right">
            Ir a mis viajes
          </UButton>
          <template v-else>
            <UButton to="/registro" size="xl">
              Crear cuenta gratis
            </UButton>
            <UButton to="/login" size="xl" color="neutral" variant="outline">
              Ingresar
            </UButton>
          </template>
        </div>
      </div>

      <div aria-hidden="true" class="relative mx-auto w-full max-w-md pb-28 pr-6">
        <TripCover name="Patagonia en otoño" destination="Torres del Paine" size="card" class="rounded-md shadow-xl">
          <template #eyebrow>
            Faltan 23 días
          </template>
        </TripCover>
        <div class="absolute bottom-0 right-0 w-64 space-y-2">
          <div
            v-for="p in samplePlaces"
            :key="p.n"
            class="flex items-center gap-3 rounded-md bg-default p-3 shadow-lg ring ring-default"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              :class="p.voted ? 'bg-success' : 'bg-primary'"
            >
              {{ p.n }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-serif font-semibold">
                {{ p.name }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ p.meta }}
              </p>
            </div>
            <span class="flex items-center gap-1 text-sm font-medium" :class="p.voted ? 'text-success' : 'text-muted'">
              <UIcon name="i-lucide-heart" class="size-4" />
              {{ p.votes }}
            </span>
          </div>
        </div>
      </div>
    </UContainer>

    <UContainer class="pb-24">
      <ol class="grid gap-x-10 border-t border-default sm:grid-cols-3">
        <li v-for="(f, i) in features" :key="f.title" class="border-b border-default py-8 sm:border-b-0">
          <span class="font-serif text-3xl text-primary">{{ String(i + 1).padStart(2, '0') }}</span>
          <h2 class="mt-3 font-serif text-xl font-semibold">
            {{ f.title }}
          </h2>
          <p class="mt-2 text-sm text-muted">
            {{ f.text }}
          </p>
        </li>
      </ol>
    </UContainer>
  </div>
</template>
