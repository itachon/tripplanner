// Traduce errores de Supabase / Postgres / API a mensajes para el usuario

interface MaybeError {
  message?: string
  code?: string
  data?: { message?: string }
  statusMessage?: string
}

const CONSTRAINTS: Record<string, string> = {
  trip_dates_valid: 'La fecha de término debe ser igual o posterior a la de inicio.',
  trip_length_valid: 'El viaje puede durar como máximo 120 días.',
  stops_outside_new_dates: 'Hay paradas del itinerario fuera de las nuevas fechas. Muévelas o quítalas primero.',
  stop_day_outside_trip: 'El día de la parada está fuera de las fechas del viaje.',
  stop_times_valid: 'La hora de término debe ser posterior a la de inicio.',
  stop_has_subject: 'La parada necesita un lugar o una descripción.',
  'Zona horaria no válida': 'La zona horaria no es válida.',
}

const AUTH: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
}

export function errorMessage(err: unknown, fallback = 'Ocurrió un error. Intenta nuevamente.'): string {
  if (!err) return fallback
  const e = err as MaybeError

  // Respuestas de nuestra API (/api/i/...) vía $fetch
  if (e.data?.message) return e.data.message

  const msg = e.message ?? ''
  for (const [key, text] of Object.entries(CONSTRAINTS)) {
    if (msg.includes(key)) return text
  }
  if (AUTH[msg]) return AUTH[msg]
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera un momento y vuelve a intentar.'

  // Mensajes propios lanzados desde funciones SQL (ya vienen en español)
  if (e.code === '42501' || e.code === 'P0001' || e.code === 'P0002' || e.code === '22023') return msg

  return msg || fallback
}
