<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BudgetItem } from '~/composables/useTripAdmin'
import { BUDGET_CURRENCIES, currencyLabel, formatMoney } from '~~/shared/utils/budget'

const {
  trip, members, refresh, budgetItems, baseCurrency, rates, exchangeRates,
  budgetSummary, budgetBalances, budgetTransfers, budgetPeople,
} = useTripCtx()
const { client } = useDb()
const toast = useToast()

const formOpen = ref(false)
const formItem = ref<BudgetItem | null>(null)
const deleteTarget = ref<BudgetItem | null>(null)
const pendingCurrency = ref<string | null>(null)
const busy = ref(false)
const publishing = ref(false)
const refreshingRates = ref(false)

const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })
const currencyOpen = computed({ get: () => !!pendingCurrency.value, set: (v) => { if (!v) pendingCurrency.value = null } })

const memberNames = computed(() => Object.fromEntries(members.value.map(m => [m.id, m.name])))
const currencyItems = BUDGET_CURRENCIES.map(c => ({ label: currencyLabel(c), value: c as string }))
const hasPaid = computed(() => budgetItems.value.some(i => i.actual_amount != null))

function add() {
  formItem.value = null
  formOpen.value = true
}

function edit(i: BudgetItem) {
  formItem.value = i
  formOpen.value = true
}

function menu(i: BudgetItem): DropdownMenuItem[][] {
  return [
    [{ label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => edit(i) }],
    [{ label: 'Borrar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = i } }],
  ]
}

async function togglePublish(value: boolean) {
  if (!trip.value) return
  publishing.value = true
  const { error } = await client.from('trips').update({ budget_published: value }).eq('id', trip.value.id)
  publishing.value = false
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar', description: errorMessage(error) })
  toast.add({
    color: value ? 'success' : 'neutral',
    title: value ? 'Presupuesto publicado' : 'Presupuesto oculto',
    description: value ? 'Los viajeros ya pueden verlo desde su link.' : 'Los viajeros ya no lo ven.',
  })
  await refresh()
}

async function refreshRates(silent = false) {
  if (!trip.value) return
  refreshingRates.value = true
  try {
    await $fetch(`/api/admin/trips/${trip.value.id}/rates`, { method: 'POST' })
    if (!silent) toast.add({ title: 'Tipos de cambio actualizados' })
  }
  catch (err) {
    if (!silent) toast.add({ color: 'error', title: 'No se pudo actualizar el tipo de cambio', description: errorMessage(err) })
  }
  finally {
    refreshingRates.value = false
    await refresh()
  }
}

function askCurrency(code: string) {
  if (code !== baseCurrency.value) pendingCurrency.value = code
}

async function confirmCurrency() {
  const code = pendingCurrency.value
  if (!trip.value || !code) return
  busy.value = true
  const { error } = await client.from('trips').update({ budget_currency: code }).eq('id', trip.value.id)
  busy.value = false
  pendingCurrency.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo cambiar la moneda', description: errorMessage(error) })
  toast.add({ title: `Moneda principal: ${code}` })
  await refreshRates(true)
}

async function confirmDelete() {
  const i = deleteTarget.value
  if (!i) return
  busy.value = true
  const { error } = await client.from('budget_items').delete().eq('id', i.id)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
  toast.add({ title: 'Ítem borrado' })
  await refresh()
}

// Al abrir: traer los cambios que falten o tengan más de un día
onMounted(() => {
  const used = new Set(budgetItems.value.map(i => i.currency).filter(c => c !== baseCurrency.value))
  const missing = [...used].some(c => !rates.value[c])
  const stale = exchangeRates.value.some(r => r.source === 'auto' && Date.now() - new Date(r.updated_at).getTime() > 86_400_000)
  if (missing || stale) refreshRates(true)
})
</script>

<template>
  <div class="space-y-4">
    <UCard :ui="{ body: 'p-4 sm:p-4' }">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <USwitch
          :model-value="trip?.budget_published ?? false"
          :loading="publishing"
          label="Presupuesto visible para los viajeros"
          :description="trip?.budget_published ? 'Los viajeros lo ven desde su link.' : 'Mientras esté oculto, solo lo ven los administradores.'"
          @update:model-value="togglePublish"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UTooltip :text="hasPaid ? 'Con gastos ya pagados no se puede cambiar la moneda principal' : 'Moneda en que se muestran los totales'">
            <USelectMenu
              :model-value="baseCurrency"
              :items="currencyItems"
              value-key="value"
              :disabled="hasPaid"
              :search-input="{ placeholder: 'Buscar moneda…' }"
              class="w-56"
              @update:model-value="askCurrency"
            />
          </UTooltip>
          <UButton icon="i-lucide-plus" @click="add">
            Agregar ítem
          </UButton>
        </div>
      </div>
      <p v-if="hasPaid" class="mt-3 text-xs text-muted">
        La moneda principal no se puede cambiar porque ya hay gastos pagados.
      </p>
    </UCard>

    <UEmpty
      v-if="!budgetItems.length"
      icon="i-lucide-wallet"
      title="Aún no hay presupuesto"
      description="Agrega los costos del viaje: alojamiento, transporte, entradas, comida. Después registra lo que se vaya pagando y quién lo pagó."
      :actions="[{ label: 'Agregar el primer ítem', icon: 'i-lucide-plus', onClick: add }]"
      class="rounded-lg border border-dashed border-default bg-default py-10"
    />

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Total estimado
          </p>
          <p class="mt-1 font-serif text-2xl font-semibold">
            {{ formatMoney(budgetSummary.estimated, baseCurrency) }}
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Gastado hasta ahora
          </p>
          <p class="mt-1 font-serif text-2xl font-semibold">
            {{ formatMoney(budgetSummary.actual, baseCurrency) }}
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Diferencia en lo ya pagado
          </p>
          <p class="mt-1 font-serif text-2xl font-semibold" :class="budgetSummary.variance > 0 ? 'text-error' : budgetSummary.variance < 0 ? 'text-success' : ''">
            {{ budgetSummary.variance > 0 ? '+' : '' }}{{ formatMoney(budgetSummary.variance, baseCurrency) }}
          </p>
          <p class="text-xs text-muted">
            {{ budgetSummary.variance > 0 ? 'Más de lo estimado' : budgetSummary.variance < 0 ? 'Menos de lo estimado' : 'Igual a lo estimado' }}
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4 sm:p-4' }">
          <p class="text-xs text-muted">
            Estimado por persona
          </p>
          <p class="mt-1 font-serif text-2xl font-semibold">
            {{ formatMoney(budgetSummary.perPerson, baseCurrency) }}
          </p>
          <p class="text-xs text-muted">
            Entre {{ budgetPeople }} {{ budgetPeople === 1 ? 'viajero' : 'viajeros' }}
          </p>
        </UCard>
      </div>

      <UAlert
        v-if="budgetSummary.missingRates.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Falta tipo de cambio"
        :description="`Los ítems en ${budgetSummary.missingRates.join(', ')} no están sumados en los totales. Actualiza los tipos de cambio o ingrésalos a mano más abajo.`"
      />

      <BudgetItemList :items="budgetItems" :base="baseCurrency" :rates="rates" :member-names="memberNames">
        <template #actions="{ item }">
          <UDropdownMenu :items="menu(item)" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Acciones" />
          </UDropdownMenu>
        </template>
      </BudgetItemList>

      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Cuentas
          </h3>
        </template>
        <BudgetBalances :balances="budgetBalances" :transfers="budgetTransfers" :base="baseCurrency" :member-names="memberNames" />
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Tipos de cambio
          </h3>
        </template>
        <BudgetRates :loading="refreshingRates" @refresh="refreshRates()" />
      </UCard>
    </template>

    <BudgetItemFormModal v-model:open="formOpen" :item="formItem" />

    <ConfirmModal
      v-model:open="deleteOpen"
      :title="`¿Borrar ${deleteTarget?.name}?`"
      description="Se quitará del presupuesto y de las cuentas."
      confirm-label="Borrar"
      :loading="busy"
      @confirm="confirmDelete"
    />

    <ConfirmModal
      v-model:open="currencyOpen"
      :title="`¿Cambiar la moneda principal a ${pendingCurrency}?`"
      description="Los totales se mostrarán en la nueva moneda y los tipos de cambio se volverán a traer. Los que hayas fijado a mano se pierden."
      confirm-label="Cambiar"
      :loading="busy"
      @confirm="confirmCurrency"
    />
  </div>
</template>
