<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Member } from '~/composables/useTripAdmin'

const { trip, members, votesByMember, stats, refresh } = useTripCtx()
const { client } = useDb()
const toast = useToast()
const memberUrl = useMemberUrl()

const search = ref('')
const filter = ref<'all' | 'pending' | 'accepted' | 'declined'>('all')

const filterItems = computed(() => [
  { label: `Todos (${stats.value.members})`, value: 'all' },
  { label: `Pendientes (${stats.value.pending})`, value: 'pending' },
  { label: `Van (${stats.value.accepted})`, value: 'accepted' },
  { label: `No van (${stats.value.declined})`, value: 'declined' },
])

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase()

const filtered = computed(() => {
  const q = normalize(search.value.trim())
  return members.value.filter(i =>
    (filter.value === 'all' || i.status === filter.value)
    && (!q || normalize(i.name).includes(q) || normalize(i.notes ?? '').includes(q)),
  )
})

// ---- Modales ----
const formOpen = ref(false)
const editing = ref<Member | null>(null)
const shareOpen = ref(false)
const sharing = ref<Member | null>(null)
const deleteTarget = ref<Member | null>(null)
const regenTarget = ref<Member | null>(null)
const busy = ref(false)

const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })
const regenOpen = computed({ get: () => !!regenTarget.value, set: (v) => { if (!v) regenTarget.value = null } })

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openShare(inv: Member) {
  sharing.value = inv
  shareOpen.value = true
}

async function onSaved(created: Member[]) {
  await refresh()
  // Recién creada una sola: abrir directo el link/QR para enviarla
  if (created.length === 1) openShare(created[0]!)
}

function rowMenu(inv: Member): DropdownMenuItem[][] {
  return [
    [
      { label: 'Copiar link', icon: 'i-lucide-link', onSelect: () => copyLink(inv) },
      { label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => { editing.value = inv; formOpen.value = true } },
      { label: 'Generar link nuevo', icon: 'i-lucide-refresh-cw', onSelect: () => { regenTarget.value = inv } },
    ],
    [
      { label: 'Quitar del viaje', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { deleteTarget.value = inv } },
    ],
  ]
}

async function copyLink(inv: Member) {
  try {
    await navigator.clipboard.writeText(memberUrl(inv.token))
    toast.add({ color: 'success', title: 'Link copiado', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    openShare(inv)
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  busy.value = true
  const { error } = await client.from('members').delete().eq('id', deleteTarget.value.id)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
  toast.add({ title: 'Viajero quitado' })
  await refresh()
}

async function confirmRegen() {
  if (!regenTarget.value) return
  const inv = regenTarget.value
  busy.value = true
  const { error } = await client.rpc('regenerate_member_token', { p_member_id: inv.id })
  busy.value = false
  regenTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo generar', description: errorMessage(error) })
  await refresh()
  const updated = members.value.find(i => i.id === inv.id)
  toast.add({ color: 'success', title: 'Link nuevo generado', description: 'El link anterior ya no funciona.' })
  if (updated) openShare(updated)
}

// ---- Exportar a Excel (CSV con ; y BOM para que Excel en español lo abra bien) ----
function exportCsv() {
  const statusText = { pending: 'Pendiente', accepted: 'Va', declined: 'No va' } as const
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const tz = trip.value?.time_zone ?? 'UTC'
  const header = ['Nombre', 'Estado', 'Votos', 'Respondió', 'Nota', 'Link']
  const lines = members.value.map(m => [
    m.name,
    statusText[m.status],
    votesByMember.value.get(m.id) ?? 0,
    m.responded_at ? formatShortDateTime(m.responded_at, tz) : '',
    m.notes ?? '',
    memberUrl(m.token),
  ].map(esc).join(';'))
  const csv = '\uFEFF' + [header.join(';'), ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `viajeros-${(trip.value?.name ?? 'viaje').replace(/[^\w-]+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Buscar viajero…" class="sm:w-64" />
      <USelect v-model="filter" :items="filterItems" class="sm:w-48" />
      <div class="flex gap-2 sm:ml-auto">
        <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" :disabled="!members.length" @click="exportCsv">
          <span class="hidden sm:inline">Exportar</span>
        </UButton>
        <UButton icon="i-lucide-plus" class="flex-1 justify-center sm:flex-none" @click="openCreate">
          Invitar viajero
        </UButton>
      </div>
    </div>

    <UEmpty
      v-if="!members.length"
      icon="i-lucide-user-plus"
      title="Aún no invitas a nadie"
      description="Cada viajero recibe un link único para confirmar, ver el itinerario y votar por lugares."
      :actions="[{ label: 'Invitar viajero', icon: 'i-lucide-plus', onClick: openCreate }]"
      class="rounded-lg border border-dashed border-default bg-default py-14"
    />

    <p v-else-if="!filtered.length" class="py-10 text-center text-sm text-muted">
      No hay viajeros que coincidan.
    </p>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <li v-for="inv in filtered" :key="inv.id" class="flex items-center gap-3 px-4 py-3">
        <UAvatar :alt="inv.name" size="md" class="hidden shrink-0 sm:inline-flex" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p class="truncate font-medium">
              {{ inv.name }}
            </p>
            <MemberStatusBadge :member="inv" size="sm" />
          </div>
          <p class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-heart" class="size-3.5" />
              {{ votesByMember.get(inv.id) ?? 0 }} votos
            </span>
            <span v-if="inv.notes" class="italic">{{ inv.notes }}</span>
          </p>
        </div>
        <UButton icon="i-lucide-qr-code" color="primary" variant="soft" size="sm" @click="openShare(inv)">
          <span class="hidden sm:inline">Compartir</span>
        </UButton>
        <UDropdownMenu :items="rowMenu(inv)" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Más acciones" />
        </UDropdownMenu>
      </li>
    </ul>

    <MemberFormModal v-model:open="formOpen" :member="editing" @saved="onSaved" />
    <MemberShareModal v-model:open="shareOpen" :member="sharing" />

    <ConfirmModal
      v-model:open="deleteOpen"
      title="¿Quitar a este viajero?"
      :description="`El link de ${deleteTarget?.name} dejará de funcionar y se borrarán sus votos.`"
      confirm-label="Quitar"
      :loading="busy"
      @confirm="confirmDelete"
    />
    <ConfirmModal
      v-model:open="regenOpen"
      title="¿Generar un link nuevo?"
      :description="`El link actual de ${regenTarget?.name} dejará de funcionar. Úsalo si el link se compartió por error. Su respuesta y sus votos se mantienen.`"
      confirm-label="Generar link nuevo"
      color="warning"
      :loading="busy"
      @confirm="confirmRegen"
    />
  </div>
</template>
