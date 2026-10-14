<script setup lang="ts">
import type { PlaceAdder } from '~/composables/usePlaceAdder'

// Diálogos de usePlaceAdder: sugerencias cercanas del catálogo y formulario del lugar
const props = defineProps<{ adder: PlaceAdder }>()
const photoUrl = usePlacePhotoUrl()
const a = props.adder
</script>

<template>
  <UModal v-model:open="a.nearbyOpen" title="¿Es alguno de estos?" description="Ya hay lugares guardados muy cerca del punto que marcaste.">
    <template #body>
      <ul class="divide-y divide-default overflow-hidden rounded-md border border-default">
        <li v-for="c in a.nearby" :key="c.id" class="flex items-center gap-3 px-3 py-2.5">
          <img v-if="photoUrl(c.photo_path)" :src="photoUrl(c.photo_path)!" alt="" class="size-10 shrink-0 rounded-sm object-cover">
          <span v-else class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-elevated">
            <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">
              {{ c.name }}
            </p>
            <p v-if="c.address" class="truncate text-xs text-muted">
              {{ c.address }}
            </p>
          </div>
          <UButton size="sm" variant="soft" :loading="a.adding === c.id" @click="a.useNearby(c)">
            Usar este
          </UButton>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="a.nearbyOpen = false">
          Cancelar
        </UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-plus" @click="a.createFromNearby">
          No, crear uno nuevo
        </UButton>
      </div>
    </template>
  </UModal>

  <PlaceFormModal v-model:open="a.formOpen" :draft="a.formDraft" @saved="a.onSaved" />
</template>
