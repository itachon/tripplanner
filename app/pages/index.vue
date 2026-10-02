<script setup lang="ts">
useHead({ title: 'Viajes en grupo' })
const user = useSupabaseUser()

const features = [
  { icon: 'i-lucide-map-pinned', title: 'Lugares en el mapa', text: 'Busca y marca los destinos en un mapa. Cada lugar recibe una ficha con información generada con IA.' },
  { icon: 'i-lucide-heart', title: 'Votación del grupo', text: 'Cada viajero vota por los lugares que quiere conocer. Tú ves el ranking y armas el plan.' },
  { icon: 'i-lucide-calendar-days', title: 'Itinerario por días', text: 'Paradas con horario y recorrido en el mapa, en hora local del destino. Lo publicas cuando esté listo.' },
]
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-primary-50 to-default dark:from-primary-950/40">
    <UContainer class="py-20 text-center sm:py-28">
      <div class="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
        <UIcon name="i-lucide-plane" class="size-8 text-primary" />
      </div>
      <h1 class="mt-6 text-balance text-4xl font-bold sm:text-5xl">
        Planifiquen el viaje juntos
      </h1>
      <p class="mx-auto mt-4 max-w-xl text-lg text-muted">
        Invita a tus compañeros con un link, voten por los lugares que quieren conocer y compartan el itinerario día a día.
      </p>
      <div class="mt-8 flex justify-center gap-3">
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

      <div class="mx-auto mt-20 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
        <UCard v-for="f in features" :key="f.title">
          <UIcon :name="f.icon" class="size-6 text-primary" />
          <h2 class="mt-3 font-semibold">
            {{ f.title }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ f.text }}
          </p>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>
