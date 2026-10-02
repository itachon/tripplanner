<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ member: Pick<Tables<'members'>, 'status'> }>()

const info = computed(() => {
  if (props.member.status === 'accepted') return { label: 'Va', color: 'success' as const, icon: 'i-lucide-check' }
  if (props.member.status === 'declined') return { label: 'No va', color: 'neutral' as const, icon: 'i-lucide-x' }
  return { label: 'Pendiente', color: 'warning' as const, icon: 'i-lucide-clock' }
})
</script>

<template>
  <UBadge :color="info.color" variant="subtle" :icon="info.icon">
    {{ info.label }}
  </UBadge>
</template>
