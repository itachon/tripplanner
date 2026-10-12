<script setup lang="ts">
import type { ExchangeRate } from '~/composables/useTripAdmin'

// Tipos de cambio del viaje: se traen solos, pero se pueden fijar a mano.
defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()

const { trip, exchangeRates, budgetItems, baseCurrency, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const draft = reactive<Record<string, string | number>>({})
const saving = ref<string | null>(null)

// Una línea por moneda que el presupuesto usa o que ya tiene fila
const lines = computed(() => {
  const byCode = new Map(exchangeRates.value.map(r => [r.currency, r]))
  const codes = new Set([
    ...budgetItems.value.map(i => i.currency).filter(c => c !== baseCurrency.value),
    ...byCode.keys(),
  ])
  return [...codes].sort().map(currency => ({ currency, row: byCode.get(currency) ?? null }))
})

// Solo se pisa el borrador si el valor guardado cambió (o no hay borrador)
const stored = new Map<string, number>()
watch(exchangeRates, (rows) => {
  for (const r of rows) {
    if (!(r.currency in draft) || stored.get(r.currency) !== r.rate) draft[r.currency] = r.rate
    stored.set(r.currency, r.rate)
  }
}, { immediate: true })

const changed = (currency: string, row: ExchangeRate | null) =>
  row ? Number(draft[currency]) !== row.rate : Number(draft[currency]) > 0

async function save(currency: string) {
  const rate = Number(draft[currency])
  if (!trip.value || !(rate > 0)) return toast.add({ color: 'error', title: 'Ingresa un tipo de cambio válido' })
  saving.value = currency
  const { error } = await client.from('trip_exchange_rates')
    .upsert({ trip_id: trip.value.id, currency, rate, source: 'manual', updated_at: new Date().toISOString() })
  saving.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
  toast.add({ title: `Tipo de cambio de ${currency} fijado a mano` })
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
    <p v-if="!lines.length" class="text-sm text-muted">
      Todos los ítems están en {{ baseCurrency }}. Cuando agregues uno en otra moneda, su tipo de cambio aparecerá aquí.
    </p>
    <ul v-else class="space-y-2">
      <li v-for="{ currency, row } in lines" :key="currency" class="flex flex-wrap items-center gap-2 text-sm">
        <span class="w-16 font-medium">1 {{ currency }} =</span>
        <UInput v-model="draft[currency]" type="number" min="0" step="any" inputmode="decimal" size="sm" class="w-36" />
        <span class="text-muted">{{ baseCurrency }}</span>
        <UBadge v-if="!row" color="warning" variant="subtle" size="sm">
          Sin tipo de cambio
        </UBadge>
        <UBadge v-else :color="row.source === 'manual' ? 'warning' : 'neutral'" variant="subtle" size="sm">
          {{ row.source === 'manual' ? 'A mano' : 'Automático' }}
        </UBadge>
        <span v-if="row" class="text-xs text-dimmed">{{ new Date(row.updated_at).toLocaleDateString('es-CL') }}</span>
        <UButton v-if="changed(currency, row)" size="xs" :loading="saving === currency" @click="save(currency)">
          Guardar
        </UButton>
        <UButton v-else-if="row?.source === 'manual'" size="xs" color="neutral" variant="ghost" :loading="saving === currency" @click="backToAuto(row)">
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
