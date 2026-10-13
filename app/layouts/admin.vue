<script setup lang="ts">
const { client, user } = useDb()
const router = useRouter()

const userMenu = computed(() => [
  [{ label: user.value?.email as string ?? '', type: 'label' as const }],
  [{
    label: 'Cerrar sesión',
    icon: 'i-lucide-log-out',
    onSelect: async () => {
      await client.auth.signOut()
      await router.push('/login')
    },
  }],
])
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <header class="sticky top-0 z-40 border-b border-default bg-default/90 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between gap-4">
        <NuxtLink to="/admin" class="flex items-center gap-2 font-semibold">
          <UIcon name="i-lucide-plane" class="size-5 text-primary" />
          <span>Viajes</span>
        </NuxtLink>

        <UDropdownMenu :items="userMenu" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-circle-user"
            :label="(user?.email as string) ?? ''"
            :ui="{ label: 'hidden sm:inline max-w-48 truncate' }"
          />
        </UDropdownMenu>
      </UContainer>
    </header>

    <main>
      <UContainer class="py-6 sm:py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
