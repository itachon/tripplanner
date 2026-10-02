<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

useHead({ title: 'Ingresar' })

const { client, user } = useDb()
const redirect = useSupabaseCookieRedirect()
const route = useRoute()

const state = reactive({ email: '', password: '' })
const loading = ref(false)
// Evita un envío nativo del formulario antes de que cargue el JavaScript
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })
const errorText = ref('')

// Si ya hay sesión, directo al panel
watch(user, (u) => {
  if (u) navigateTo(redirect.pluck() || '/admin', { replace: true })
}, { immediate: true })

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.email) errors.push({ name: 'email', message: 'Ingresa tu correo' })
  if (!s.password) errors.push({ name: 'password', message: 'Ingresa tu contraseña' })
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  loading.value = true
  errorText.value = ''
  const { error } = await client.auth.signInWithPassword({
    email: e.data.email.trim(),
    password: e.data.password,
  })
  loading.value = false
  if (error) errorText.value = errorMessage(error)
  // la redirección la hace el watch(user)
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
    <UCard class="w-full max-w-sm">
      <div class="mb-6 text-center">
        <UIcon name="i-lucide-plane" class="size-10 text-primary" />
        <h1 class="mt-2 text-2xl font-bold">
          Ingresar
        </h1>
        <p class="mt-1 text-sm text-muted">
          Organiza tus viajes en grupo
        </p>
      </div>

      <UAlert
        v-if="route.query.registrado"
        class="mb-4"
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        title="Cuenta creada"
        description="Revisa tu correo para confirmar la cuenta y luego ingresa."
      />

      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField label="Correo" name="email">
          <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField label="Contraseña" name="password">
          <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>

        <UAlert v-if="errorText" color="error" variant="subtle" :description="errorText" />

        <UButton type="submit" block :loading="loading" :disabled="!hydrated">
          Ingresar
        </UButton>
      </UForm>

      <p class="mt-6 text-center text-sm text-muted">
        ¿No tienes cuenta?
        <ULink to="/registro" class="font-medium text-primary">
          Crear cuenta
        </ULink>
      </p>
    </UCard>
  </div>
</template>
