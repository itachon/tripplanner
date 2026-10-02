/** Arma la URL pública del link de un viajero */
export function useMemberUrl() {
  const config = useRuntimeConfig()
  const origin = useRequestURL().origin
  const base = (config.public.siteUrl as string) || origin
  return (token: string) => `${base.replace(/\/$/, '')}/v/${token}`
}
