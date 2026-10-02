<script setup lang="ts">
// Destino del link de confirmación de correo de Supabase
useHead({ title: 'Confirmando…' })

const user = useSupabaseUser()
const redirect = useSupabaseCookieRedirect()
const timedOut = ref(false)

watch(user, (u) => {
  if (u) navigateTo(redirect.pluck() || '/admin', { replace: true })
}, { immediate: true })

onMounted(() => {
  setTimeout(() => { timedOut.value = true }, 8000)
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div v-if="!timedOut" class="text-center">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
      <p class="mt-3 text-muted">
        Confirmando tu cuenta…
      </p>
    </div>
    <UCard v-else class="max-w-sm text-center">
      <p>No pudimos confirmar la sesión automáticamente.</p>
      <UButton to="/login" class="mt-4">
        Ir a ingresar
      </UButton>
    </UCard>
  </div>
</template>
