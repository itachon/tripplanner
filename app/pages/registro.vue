<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Crear cuenta' })

const { client, user } = useDb()
const origin = useRequestURL().origin

const state = reactive({ fullName: '', email: '', password: '', password2: '' })
const loading = ref(false)
// Evita un envío nativo del formulario antes de que cargue el JavaScript
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })
const errorText = ref('')

watch(user, (u) => {
  if (u) navigateTo('/admin', { replace: true })
}, { immediate: true })

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.fullName.trim()) errors.push({ name: 'fullName', message: 'Ingresa tu nombre' })
  if (!/^\S+@\S+\.\S+$/.test(s.email.trim())) errors.push({ name: 'email', message: 'Correo no válido' })
  if (s.password.length < 6) errors.push({ name: 'password', message: 'Mínimo 6 caracteres' })
  if (s.password2 !== s.password) errors.push({ name: 'password2', message: 'Las contraseñas no coinciden' })
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  loading.value = true
  errorText.value = ''
  const { data, error } = await client.auth.signUp({
    email: e.data.email.trim(),
    password: e.data.password,
    options: {
      data: { full_name: e.data.fullName.trim() },
      emailRedirectTo: `${origin}/confirm`,
    },
  })
  loading.value = false

  if (error) {
    errorText.value = errorMessage(error)
    return
  }
  // Con confirmación de correo desactivada, Supabase entrega la sesión directo
  if (data.session) return navigateTo('/admin')
  return navigateTo('/login?registrado=1')
}
</script>

<template>
  <UCard>
    <div class="mb-6">
      <h1 class="font-serif text-3xl font-semibold">
        Crear cuenta
      </h1>
      <p class="mt-1 text-sm text-muted">
        Planifica viajes con tus amigos
      </p>
    </div>

    <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
      <UFormField label="Nombre" name="fullName">
        <UInput v-model="state.fullName" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField label="Correo" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField label="Contraseña" name="password">
        <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField label="Repite la contraseña" name="password2">
        <UInput v-model="state.password2" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>

      <UAlert v-if="errorText" color="error" variant="subtle" :description="errorText" />

      <UButton type="submit" block :loading="loading" :disabled="!hydrated">
        Crear cuenta
      </UButton>
    </UForm>

    <p class="mt-6 text-center text-sm text-muted">
      ¿Ya tienes cuenta?
      <ULink to="/login" class="font-medium text-primary">
        Ingresar
      </ULink>
    </p>
  </UCard>
</template>
