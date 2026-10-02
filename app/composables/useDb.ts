import type { Database } from '~~/shared/types/database.types'

/** Cliente Supabase tipado + id del usuario actual (claims.sub) */
export function useDb() {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const userId = computed(() => user.value?.sub ?? null)
  return { client, user, userId }
}

/** URL pública de una foto del bucket place-photos */
export function usePlacePhotoUrl() {
  const client = useSupabaseClient<Database>()
  return (path: string | null | undefined) =>
    path ? client.storage.from('place-photos').getPublicUrl(path).data.publicUrl : null
}
