<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh items-center justify-center px-6">
      <div class="max-w-sm text-center">
        <UIcon :name="notFound ? 'i-lucide-search-x' : 'i-lucide-triangle-alert'" class="size-12 text-muted" />
        <h1 class="mt-4 text-xl font-semibold">
          {{ notFound ? 'Página no encontrada' : 'Algo salió mal' }}
        </h1>
        <p class="mt-2 text-muted">
          {{ notFound ? 'Lo que buscas no existe o no tienes acceso.' : error.message }}
        </p>
        <UButton class="mt-6" @click="clearError({ redirect: '/' })">
          Volver al inicio
        </UButton>
      </div>
    </div>
  </UApp>
</template>
