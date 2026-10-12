<script setup lang="ts" generic="T extends BudgetItemView">
import {
  BUDGET_CATEGORIES, BUDGET_CATEGORY_META, actualBase, estimatedBase, formatMoney, roundMoney,
  type BudgetItemView, type Rates,
} from '~~/shared/utils/budget'

// Lista de ítems agrupada por categoría, de solo lectura.
// El panel de administración agrega el menú de acciones con el slot #actions.
const props = defineProps<{
  items: T[]
  /** moneda principal del viaje */
  base: string
  rates: Rates
  memberNames: Record<string, string>
  /** viajero que mira (vista del invitado): destaca en qué participa */
  meId?: string | null
}>()

const groups = computed(() => BUDGET_CATEGORIES.map((category) => {
  const items = props.items.filter(i => i.category === category)
  const total = (value: (i: T) => number | null) =>
    roundMoney(items.reduce((t, i) => t + (value(i) ?? 0), 0), props.base)
  return {
    category,
    meta: BUDGET_CATEGORY_META[category],
    items,
    estimated: total(i => estimatedBase(i, props.base, props.rates)),
    actual: total(i => actualBase(i, props.base)),
  }
}).filter(g => g.items.length))

/** Equivalente en la moneda principal, solo si el ítem está en otra moneda */
function estimatedHint(i: T) {
  if (i.currency === props.base || i.estimated_amount == null) return null
  const v = estimatedBase(i, props.base, props.rates)
  return v == null ? 'Sin tipo de cambio' : `≈ ${formatMoney(v, props.base)}`
}

function actualHint(i: T) {
  if (i.currency === props.base || i.actual_amount == null) return null
  const v = actualBase(i, props.base)
  return v == null ? 'Sin tipo de cambio' : `= ${formatMoney(v, props.base)}`
}

function people(i: T) {
  const n = i.member_ids.length
  if (!n) return 'Sin participantes'
  return n === 1 ? (props.memberNames[i.member_ids[0]!] ?? '1 persona') : `Entre ${n}`
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="g in groups" :key="g.category" class="overflow-hidden rounded-lg border border-default bg-default">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default bg-elevated/50 px-3 py-2">
        <p class="flex items-center gap-2 text-sm font-semibold">
          <UIcon :name="g.meta.icon" class="size-4 text-primary" />
          {{ g.meta.label }}
        </p>
        <p class="text-xs text-muted">
          Estimado {{ formatMoney(g.estimated, base) }} · Gastado {{ formatMoney(g.actual, base) }}
        </p>
      </div>

      <ul class="divide-y divide-default">
        <li v-for="i in g.items" :key="i.id" class="flex items-start gap-3 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="font-medium leading-snug">
              {{ i.name }}
            </p>
            <p v-if="i.notes" class="mt-0.5 whitespace-pre-line text-xs text-muted">
              {{ i.notes }}
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <UBadge v-if="i.actual_amount != null && i.paid_by" color="success" variant="subtle" size="sm" icon="i-lucide-check">
                Pagó {{ memberNames[i.paid_by] ?? 'alguien' }}
              </UBadge>
              <UBadge v-else-if="i.actual_amount != null" color="warning" variant="subtle" size="sm" icon="i-lucide-circle-alert">
                Falta quién pagó
              </UBadge>
              <UBadge v-else color="neutral" variant="outline" size="sm">
                Por pagar
              </UBadge>
              <UBadge :color="i.member_ids.length ? 'neutral' : 'warning'" variant="subtle" size="sm" icon="i-lucide-users">
                {{ people(i) }}
              </UBadge>
              <UBadge v-if="meId && i.member_ids.includes(meId)" color="primary" variant="subtle" size="sm">
                Participas
              </UBadge>
            </div>
          </div>

          <div class="shrink-0 text-right text-sm">
            <template v-if="i.actual_amount != null">
              <p class="font-semibold">
                {{ formatMoney(i.actual_amount, i.currency) }}
              </p>
              <p v-if="actualHint(i)" class="text-xs text-muted">
                {{ actualHint(i) }}
              </p>
              <p v-if="i.estimated_amount != null" class="text-xs text-dimmed">
                Estimado {{ formatMoney(i.estimated_amount, i.currency) }}
              </p>
            </template>
            <template v-else-if="i.estimated_amount != null">
              <p class="font-semibold">
                {{ formatMoney(i.estimated_amount, i.currency) }}
              </p>
              <p v-if="estimatedHint(i)" class="text-xs text-muted">
                {{ estimatedHint(i) }}
              </p>
            </template>
          </div>

          <slot name="actions" :item="i" />
        </li>
      </ul>
    </div>
  </div>
</template>
