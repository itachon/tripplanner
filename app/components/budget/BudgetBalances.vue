<script setup lang="ts">
import { formatMoney, type MemberBalance, type Transfer } from '~~/shared/utils/budget'

// Cuentas del grupo: quién le paga a quién y el saldo de cada viajero.
const props = defineProps<{
  balances: MemberBalance[]
  transfers: Transfer[]
  /** moneda principal del viaje */
  base: string
  memberNames: Record<string, string>
  /** viajero que mira (vista del invitado): destaca sus filas */
  meId?: string | null
}>()

const name = (id: string) => props.memberNames[id] ?? 'Viajero borrado'
const active = computed(() => props.balances.filter(b => b.paid || b.owed))
</script>

<template>
  <div>
    <p v-if="!active.length" class="text-sm text-muted">
      Todavía no hay gastos pagados para repartir.
    </p>

    <template v-else>
      <p v-if="!transfers.length" class="flex items-center gap-2 text-sm text-success">
        <UIcon name="i-lucide-circle-check" class="size-4" />
        Están a mano: nadie le debe a nadie.
      </p>
      <ul v-else class="space-y-1.5">
        <li
          v-for="t in transfers"
          :key="`${t.from}-${t.to}`"
          class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-2 text-sm"
          :class="meId && (t.from === meId || t.to === meId) ? 'bg-primary/10' : 'bg-elevated/60'"
        >
          <span class="font-medium">{{ name(t.from) }}</span>
          <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
          <span class="font-medium">{{ name(t.to) }}</span>
          <span class="ml-auto font-semibold">{{ formatMoney(t.amount, base) }}</span>
        </li>
      </ul>

      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted">
              <th class="py-1.5 pr-3 font-medium">
                Viajero
              </th>
              <th class="px-3 py-1.5 text-right font-medium">
                Pagó
              </th>
              <th class="px-3 py-1.5 text-right font-medium">
                Le toca
              </th>
              <th class="py-1.5 pl-3 text-right font-medium">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="b in active" :key="b.member_id" :class="{ 'font-semibold': meId === b.member_id }">
              <td class="py-1.5 pr-3">
                {{ name(b.member_id) }}
              </td>
              <td class="px-3 py-1.5 text-right">
                {{ formatMoney(b.paid, base) }}
              </td>
              <td class="px-3 py-1.5 text-right">
                {{ formatMoney(b.owed, base) }}
              </td>
              <td class="py-1.5 pl-3 text-right" :class="b.balance > 0 ? 'text-success' : b.balance < 0 ? 'text-error' : 'text-muted'">
                {{ b.balance > 0 ? 'Le deben ' : b.balance < 0 ? 'Debe ' : '' }}{{ formatMoney(Math.abs(b.balance), base) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
