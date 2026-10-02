import type { InjectionKey } from 'vue'
import type { Database } from '~~/shared/types/database.types'

export type Trip = Database['public']['Tables']['trips']['Row']
export type Member = Database['public']['Tables']['members']['Row']
export type Place = Database['public']['Tables']['places']['Row']
export type PlaceInfoRow = Database['public']['Tables']['place_info']['Row']
export type Stop = Database['public']['Tables']['itinerary_stops']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
export interface TripAdminRow {
  user_id: string
  created_at: string
  profile: { email: string, full_name: string | null } | null
}
export interface OwnerProfile { email: string, full_name: string | null }

/** Borrador para abrir el formulario de parada desde cualquier pestaña */
export interface StopDraft { stop?: Stop | null, placeId?: string | null, day?: string | null }

/**
 * Todos los datos de un viaje para el panel de administración.
 * Se cargan juntos para que todas las pestañas muestren lo mismo.
 */
export async function useTripAdmin(tripId: string) {
  const { client, userId } = useDb()

  const { data, error, refresh, status } = await useAsyncData(`trip-admin-${tripId}`, async () => {
    const [trip, members, places, stops, votes, admins, placeInfo] = await Promise.all([
      client.from('trips').select('*, owner:profiles!trips_owner_id_fkey(email, full_name)').eq('id', tripId).maybeSingle(),
      client.from('members').select('*').eq('trip_id', tripId).order('created_at'),
      client.from('places').select('*').eq('trip_id', tripId).order('sort_order').order('created_at'),
      client.from('itinerary_stops').select('*').eq('trip_id', tripId).order('day').order('start_time', { nullsFirst: false }).order('sort_order').order('created_at'),
      client.from('votes').select('*').eq('trip_id', tripId),
      client.from('trip_admins').select('user_id, created_at, profile:profiles!trip_admins_user_id_fkey(email, full_name)').eq('trip_id', tripId).order('created_at'),
      client.from('place_info').select('*').eq('trip_id', tripId),
    ])
    for (const r of [trip, members, places, stops, votes, admins, placeInfo]) {
      if (r.error) throw r.error
    }
    return {
      trip: trip.data as unknown as (Trip & { owner: OwnerProfile | null }) | null,
      members: (members.data ?? []) as Member[],
      places: (places.data ?? []) as unknown as Place[],
      stops: (stops.data ?? []) as Stop[],
      votes: (votes.data ?? []) as Vote[],
      admins: (admins.data ?? []) as unknown as TripAdminRow[],
      placeInfo: (placeInfo.data ?? []) as PlaceInfoRow[],
    }
  })

  const trip = computed(() => data.value?.trip ?? null)
  const members = computed(() => data.value?.members ?? [])
  const places = computed(() => data.value?.places ?? [])
  const stops = computed(() => data.value?.stops ?? [])
  const votes = computed(() => data.value?.votes ?? [])
  const admins = computed(() => data.value?.admins ?? [])
  const placeInfo = computed(() => data.value?.placeInfo ?? [])
  const placeInfoByPlace = computed(() => new Map(placeInfo.value.map(pi => [pi.place_id, pi])))
  const isOwner = computed(() => !!trip.value && trip.value.owner_id === userId.value)
  const isClosed = computed(() => !!trip.value && new Date(trip.value.rsvp_deadline) < new Date())
  const tz = computed(() => trip.value?.time_zone ?? 'America/Santiago')
  const days = computed(() => trip.value ? tripDays(trip.value.start_date, trip.value.end_date) : [])

  const placeById = computed(() => new Map(places.value.map(p => [p.id, p])))
  const memberById = computed(() => new Map(members.value.map(m => [m.id, m])))

  /** place_id → miembros que votaron */
  const votersByPlace = computed(() => {
    const map = new Map<string, Member[]>()
    for (const v of votes.value) {
      const m = memberById.value.get(v.member_id)
      if (!m) continue
      const list = map.get(v.place_id) ?? []
      list.push(m)
      map.set(v.place_id, list)
    }
    return map
  })

  /** member_id → cantidad de votos */
  const votesByMember = computed(() => {
    const map = new Map<string, number>()
    for (const v of votes.value) map.set(v.member_id, (map.get(v.member_id) ?? 0) + 1)
    return map
  })

  /** day → paradas ordenadas */
  const stopsByDay = computed(() => {
    const map = new Map<string, Stop[]>()
    for (const d of days.value) map.set(d, [])
    for (const s of stops.value) {
      const list = map.get(s.day) ?? []
      list.push(s)
      map.set(s.day, list)
    }
    return map
  })

  /** place_id → paradas donde aparece */
  const stopsByPlace = computed(() => {
    const map = new Map<string, Stop[]>()
    for (const s of stops.value) {
      if (!s.place_id) continue
      const list = map.get(s.place_id) ?? []
      list.push(s)
      map.set(s.place_id, list)
    }
    return map
  })

  const ranking = computed(() =>
    places.value
      .filter(p => p.votable)
      .map(p => ({ place: p, votes: votersByPlace.value.get(p.id)?.length ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.place.name.localeCompare(b.place.name)),
  )

  const stats = computed(() => ({
    members: members.value.length,
    accepted: members.value.filter(m => m.status === 'accepted').length,
    declined: members.value.filter(m => m.status === 'declined').length,
    pending: members.value.filter(m => m.status === 'pending').length,
    places: places.value.length,
    votable: places.value.filter(p => p.votable).length,
    votes: votes.value.length,
    stops: stops.value.length,
    daysWithStops: [...stopsByDay.value.values()].filter(l => l.length).length,
  }))

  /** Título visible de una parada */
  function stopTitle(s: Stop) {
    return s.title || (s.place_id ? placeById.value.get(s.place_id)?.name : null) || 'Parada'
  }

  // Formulario de parada compartido entre pestañas
  const stopDraft = ref<StopDraft | null>(null)
  const openStopForm = (draft: StopDraft = {}) => { stopDraft.value = draft }

  return {
    data, error, status, refresh,
    trip, members, places, stops, votes, admins, placeInfo,
    isOwner, isClosed, tz, days, stats, ranking,
    placeById, memberById, votersByPlace, votesByMember, stopsByDay, stopsByPlace, placeInfoByPlace,
    stopTitle, stopDraft, openStopForm,
  }
}

export type TripAdminContext = Awaited<ReturnType<typeof useTripAdmin>>

const KEY: InjectionKey<TripAdminContext> = Symbol('trip-admin-ctx')

export function provideTripCtx(ctx: TripAdminContext) {
  provide(KEY, ctx)
}

/** Datos del viaje abierto en el panel (lo provee /admin/viajes/[id]) */
export function useTripCtx(): TripAdminContext {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('useTripCtx() fuera de la página del viaje')
  return ctx
}
