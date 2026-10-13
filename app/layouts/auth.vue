<template>
  <div class="grid min-h-dvh lg:grid-cols-2">
    <aside class="hidden flex-col justify-between bg-terracotta-700 p-12 text-white lg:flex dark:bg-terracotta-900">
      <NuxtLink to="/" class="font-serif text-2xl font-semibold">
        Viajes
      </NuxtLink>
      <p class="max-w-md font-serif text-4xl font-medium leading-tight text-balance">
        Los mejores viajes se planean entre todos.
      </p>
      <p class="text-sm text-white/75">
        Lugares, votos, itinerario y presupuesto en un solo link.
      </p>
    </aside>

    <main class="flex items-center justify-center bg-canvas px-4 py-12">
      <div class="w-full max-w-sm">
        <NuxtLink to="/" class="mb-8 block text-center font-serif text-2xl font-semibold lg:hidden">
          Viajes
        </NuxtLink>
        <slot />
      </div>
    </main>
  </div>
</template>
