<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { BudgetItem, ExchangeRate } from '~/composables/useTripAdmin'
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_META, BUDGET_CURRENCIES, currencyLabel, formatMoney, roundMoney,
  type BudgetCategory,
} from '~~/shared/utils/budget'

const props = defineProps<{ item: BudgetItem | null }>()
const open = defineModel<boolean>('open', { default: false })

const { trip, members, places, budgetItems, baseCurrency, rates, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()

const state = reactive({
  category: 'other' as BudgetCategory,
  name: '',
  currency: 'CLP',
  estimated: '',
  notes: '',
  placeId: '',
  paid: false,
  actual: '',
  rate: '',
  paidBy: '',
  paidOn: '',
  memberIds: [] as string[],
})
const loading = ref(false)
const fetchingRate = ref(false)

const categoryItems = BUDGET_CATEGORIES.map(c => ({ label: BUDGET_CATEGORY_META[c].label, value: c, icon: BUDGET_CATEGORY_META[c].icon }))
const currencyItems = BUDGET_CURRENCIES.map(c => ({ label: currencyLabel(c), value: c as string }))
const memberItems = computed(() => members.value.map(m => ({ label: m.name, value: m.id })))
const placeItems = computed(() => places.value.map(p => ({ label: p.name, value: p.id })))
const foreign = computed(() => state.currency !== baseCurrency.value)

/** '' → null; texto no numérico → NaN (lo rechaza validate) */
function num(v: string | number): number | null {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const i = props.item
  const accepted = members.value.filter(m => m.status === 'accepted').map(m => m.id)
  state.category = i?.category ?? 'other'
  state.name = i?.name ?? ''
  state.currency = i?.currency ?? baseCurrency.value
  state.estimated = i?.estimated_amount != null ? String(i.estimated_amount) : ''
  state.notes = i?.notes ?? ''
  state.placeId = i?.place_id ?? ''
  state.paid = i?.actual_amount != null
  state.actual = i?.actual_amount != null ? String(i.actual_amount) : ''
  state.rate = i?.actual_rate != null ? String(i.actual_rate) : ''
  state.paidBy = i?.paid_by ?? ''
  state.paidOn = i?.paid_on ?? ''
  state.memberIds = i ? [...i.member_ids] : (accepted.length ? accepted : members.value.map(m => m.id))
}, { immediate: true })

// Al marcar "ya se pagó" (o cambiar de moneda) se propone el cambio vigente;
// si el viaje todavía no conoce esa moneda, se le pide al servidor.
watch(() => [state.paid, state.currency, open.value] as const, async ([paid, currency, isOpen]) => {
  if (!isOpen || !paid || !foreign.value) return
  const frozen = props.item?.currency === currency ? props.item.actual_rate : null
  if (frozen) return void (state.rate = String(frozen))
  if (rates.value[currency]) return void (state.rate = String(rates.value[currency]))
  if (!trip.value) return
  state.rate = ''
  fetchingRate.value = true
  try {
    const rows = await $fetch<ExchangeRate[]>(`/api/admin/trips/${trip.value.id}/rates`, { method: 'POST', body: { currencies: [currency] } })
    const found = rows.find(r => r.currency === currency)
    if (found && state.currency === currency) state.rate = String(found.rate)
  }
  catch { /* se ingresa a mano */ }
  finally {
    fetchingRate.value = false
  }
})

const actualInBase = computed(() => {
  const a = num(state.actual)
  const r = num(state.rate)
  return foreign.value && a && r && a > 0 && r > 0 ? formatMoney(roundMoney(a * r, baseCurrency.value), baseCurrency.value) : null
})

function toggleMember(id: string, on: boolean | 'indeterminate') {
  state.memberIds = on === true ? [...new Set([...state.memberIds, id])] : state.memberIds.filter(x => x !== id)
}

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  const est = num(s.estimated)
  const act = num(s.actual)
  const rate = num(s.rate)
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Ponle un nombre al ítem' })
  if (est != null && !(est >= 0)) errors.push({ name: 'estimated', message: 'Ingresa un monto válido' })
  if (!s.paid && est == null) errors.push({ name: 'estimated', message: 'Ingresa el costo estimado' })
  if (s.paid) {
    if (act == null || !(act >= 0)) errors.push({ name: 'actual', message: 'Ingresa cuánto se pagó' })
    if (foreign.value && !(rate != null && rate > 0)) errors.push({ name: 'rate', message: 'Ingresa el tipo de cambio' })
    if (!s.paidBy) errors.push({ name: 'paidBy', message: 'Elige quién pagó' })
  }
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!trip.value) return
  loading.value = true
  const d = e.data
  const fields = {
    category: d.category,
    name: d.name.trim(),
    notes: d.notes.trim() || null,
    currency: d.currency,
    estimated_amount: num(d.estimated),
    actual_amount: d.paid ? num(d.actual) : null,
    actual_rate: d.paid ? (foreign.value ? num(d.rate) : 1) : null,
    paid_by: d.paid ? d.paidBy || null : null,
    paid_on: d.paid ? d.paidOn || null : null,
    place_id: d.placeId || null,
  }

  try {
    let id = props.item?.id
    if (id) {
      const { error } = await client.from('budget_items').update(fields).eq('id', id)
      if (error) throw error
    }
    else {
      const { data, error } = await client.from('budget_items').insert({
        ...fields,
        trip_id: trip.value.id,
        sort_order: Math.max(0, ...budgetItems.value.map(i => i.sort_order)) + 1,
      }).select('id').single()
      if (error || !data) throw error
      id = data.id
    }

    const { error: sharesError } = await client.rpc('set_budget_item_shares', { p_item_id: id, p_member_ids: d.memberIds })
    if (sharesError) throw sharesError

    // Primera vez que el viaje usa esta moneda: traer su tipo de cambio
    if (foreign.value && !rates.value[d.currency]) {
      await $fetch(`/api/admin/trips/${trip.value.id}/rates`, { method: 'POST' }).catch(() => {
        toast.add({ color: 'warning', title: 'Sin tipo de cambio', description: `No se pudo traer el cambio de ${d.currency}. Ingrésalo a mano en "Tipos de cambio".` })
      })
    }

    toast.add({ color: 'success', title: props.item ? 'Ítem actualizado' : 'Ítem agregado' })
    open.value = false
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(err) })
  }
  finally {
    loading.value = false
    await refresh()
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="item ? 'Editar ítem' : 'Agregar ítem al presupuesto'">
    <template #body>
      <UForm id="budget-item-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Categoría" name="category" required>
            <USelect v-model="state.category" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="name" required>
            <UInput v-model="state.name" placeholder="Hotel en Myeongdong, tren a Busan…" class="w-full" autofocus />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Moneda" name="currency" required>
            <USelectMenu v-model="state.currency" :items="currencyItems" value-key="value" :search-input="{ placeholder: 'Buscar moneda…' }" class="w-full" />
          </UFormField>
          <UFormField label="Costo estimado" name="estimated" :help="`Total del ítem en ${state.currency}`">
            <UInput v-model="state.estimated" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Lugar (opcional)" name="placeId">
          <div class="flex gap-2">
            <USelectMenu
              v-model="state.placeId"
              :items="placeItems"
              value-key="value"
              placeholder="Sin lugar asociado"
              :search-input="{ placeholder: 'Buscar…' }"
              class="flex-1"
            />
            <UButton v-if="state.placeId" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Quitar lugar" @click="state.placeId = ''" />
          </div>
        </UFormField>

        <UFormField label="Nota" name="notes">
          <UTextarea v-model="state.notes" :rows="2" autoresize placeholder="Reserva con cancelación gratis, incluye desayuno…" class="w-full" />
        </UFormField>

        <div class="rounded-lg border border-default p-3">
          <USwitch v-model="state.paid" label="Ya se pagó" description="Registra el gasto real y quién lo pagó." />
          <div v-if="state.paid" class="mt-4 space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Monto pagado" name="actual" required :help="actualInBase ? `Equivale a ${actualInBase}` : undefined">
                <UInput v-model="state.actual" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
              </UFormField>
              <UFormField
                v-if="foreign"
                label="Tipo de cambio"
                name="rate"
                required
                :help="`1 ${state.currency} en ${baseCurrency}. Corrígelo si pagaste con otro cambio.`"
              >
                <UInput v-model="state.rate" type="number" min="0" step="any" inputmode="decimal" :loading="fetchingRate" class="w-full" />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Quién pagó" name="paidBy" required>
                <USelectMenu v-model="state.paidBy" :items="memberItems" value-key="value" placeholder="Elige un viajero" class="w-full" />
                <template v-if="!members.length" #help>
                  Primero agrega viajeros en la pestaña Viajeros.
                </template>
              </UFormField>
              <UFormField label="Fecha" name="paidOn">
                <UInput v-model="state.paidOn" type="date" class="w-full" />
              </UFormField>
            </div>
          </div>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <p class="text-sm font-medium">
              Se reparte entre
            </p>
            <div class="flex gap-1">
              <UButton size="xs" color="neutral" variant="ghost" @click="state.memberIds = members.map(m => m.id)">
                Todos
              </UButton>
              <UButton size="xs" color="neutral" variant="ghost" @click="state.memberIds = []">
                Ninguno
              </UButton>
            </div>
          </div>
          <p v-if="!members.length" class="text-sm text-muted">
            Aún no hay viajeros en este viaje.
          </p>
          <div v-else class="grid gap-2 sm:grid-cols-2">
            <UCheckbox
              v-for="m in members"
              :key="m.id"
              :model-value="state.memberIds.includes(m.id)"
              :label="m.name"
              @update:model-value="toggleMember(m.id, $event)"
            />
          </div>
          <p class="mt-1.5 text-xs text-muted">
            En partes iguales. Desmarca a quien no participa de este gasto.
          </p>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="budget-item-form" :loading="loading">
          {{ item ? 'Guardar' : 'Agregar' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
