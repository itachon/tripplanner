<script setup lang="ts">
import type { ExchangeRate } from '~/composables/useTripAdmin'

// Tipos de cambio del viaje: se traen solos, pero se pueden fijar a mano.
defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()

const { trip, exchangeRates, baseCurrency, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const draft = reactive<Record<string, string | number>>({})
const saving = ref<string | null>(null)

watch(exchangeRates, (rows) => {
  for (const r of rows) draft[r.currency] = r.rate
}, { immediate: true })

const changed = (r: ExchangeRate) => Number(draft[r.currency]) !== r.rate

async function save(r: ExchangeRate) {
  const rate = Number(draft[r.currency])
  if (!trip.value || !(rate > 0)) return toast.add({ color: 'error', title: 'Ingresa un tipo de cambio válido' })
  saving.value = r.currency
  const { error } = await client.from('trip_exchange_rates')
    .update({ rate, source: 'manual', updated_at: new Date().toISOString() })
    .eq('trip_id', trip.value.id).eq('currency', r.currency)
  saving.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
  toast.add({ title: `Tipo de cambio de ${r.currency} fijado a mano` })
  await refresh()
}

async function backToAuto(r: ExchangeRate) {
  if (!trip.value) return
  saving.value = r.currency
  const { error } = await client.from('trip_exchange_rates')
    .update({ source: 'auto' }).eq('trip_id', trip.value.id).eq('currency', r.currency)
  saving.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar', description: errorMessage(error) })
  emit('refresh')
}
</script>

<template>
  <div>
    <p v-if="!exchangeRates.length" class="text-sm text-muted">
      Todos los ítems están en {{ baseCurrency }}. Cuando agregues uno en otra moneda, su tipo de cambio aparecerá aquí.
    </p>
    <ul v-else class="space-y-2">
      <li v-for="r in exchangeRates" :key="r.currency" class="flex flex-wrap items-center gap-2 text-sm">
        <span class="w-16 font-medium">1 {{ r.currency }} =</span>
        <UInput v-model="draft[r.currency]" type="number" min="0" step="any" inputmode="decimal" size="sm" class="w-36" />
        <span class="text-muted">{{ baseCurrency }}</span>
        <UBadge :color="r.source === 'manual' ? 'warning' : 'neutral'" variant="subtle" size="sm">
          {{ r.source === 'manual' ? 'A mano' : 'Automático' }}
        </UBadge>
        <span class="text-xs text-dimmed">{{ new Date(r.updated_at).toLocaleDateString('es-CL') }}</span>
        <UButton v-if="changed(r)" size="xs" :loading="saving === r.currency" @click="save(r)">
          Guardar
        </UButton>
        <UButton v-else-if="r.source === 'manual'" size="xs" color="neutral" variant="ghost" :loading="saving === r.currency" @click="backToAuto(r)">
          Volver a automático
        </UButton>
      </li>
    </ul>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="loading" @click="emit('refresh')">
        Actualizar tipos de cambio
      </UButton>
      <ULink to="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" class="text-xs text-dimmed">
        Rates By Exchange Rate API
      </ULink>
    </div>
    <p class="mt-2 text-xs text-muted">
      Los costos estimados usan estos valores. Los gastos ya pagados conservan el cambio con que se registraron.
    </p>
  </div>
</template>
