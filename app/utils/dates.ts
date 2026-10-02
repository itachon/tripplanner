// Fechas del viaje
// ---------------------------------------------------------------------
// * Los días del viaje y los horarios del itinerario son "hora de pared"
//   del destino: '2027-04-11' y '09:00'. No se convierten: se muestran
//   tal cual, para todos, porque es la hora del lugar donde ocurren.
// * Los instantes (fecha límite, respuestas) se muestran en la zona
//   horaria del viaje, que se pasa explícitamente. Así servidor y
//   navegador renderizan lo mismo (sin errores de hidratación).

const LOCALE = 'es-CL'
const fmtCache = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string, key: string, opts: Intl.DateTimeFormatOptions, locale = LOCALE) {
  const k = `${tz}|${locale}|${key}`
  let f = fmtCache.get(k)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz })
    }
    catch {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' })
    }
    fmtCache.set(k, f)
  }
  return f
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- Fechas de calendario ('YYYY-MM-DD'), sin zona ----------

/** 'YYYY-MM-DD' → Date a medianoche UTC (solo para formatear en UTC) */
function dayToDate(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

/** "Sábado 10 de abril" (o "sábado 10 de abril" con inline) */
export function formatDay(day: string | null | undefined, inline = false): string {
  if (!day) return ''
  const s = fmt('UTC', 'day', { weekday: 'long', day: 'numeric', month: 'long' }).format(dayToDate(day)).replace(',', '')
  return inline ? s : cap(s)
}

/** "sáb 10 abr" */
export function formatDayShort(day: string | null | undefined): string {
  if (!day) return ''
  return fmt('UTC', 'dayShort', { weekday: 'short', day: 'numeric', month: 'short' }).format(dayToDate(day)).replace(',', '').replace(/\./g, '')
}

/** "10 al 20 de abril de 2027" / "28 de marzo al 3 de abril de 2027" */
export function formatDateRange(start: string, end: string): string {
  const a = dayToDate(start)
  const b = dayToDate(end)
  const day = (d: Date) => d.getUTCDate()
  const month = (d: Date) => fmt('UTC', 'month', { month: 'long' }).format(d)
  if (start === end) return `${day(a)} de ${month(a)} de ${a.getUTCFullYear()}`
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${day(a)} de ${month(a)} de ${a.getUTCFullYear()} al ${day(b)} de ${month(b)} de ${b.getUTCFullYear()}`
  }
  if (a.getUTCMonth() === b.getUTCMonth()) return `${day(a)} al ${day(b)} de ${month(b)} de ${b.getUTCFullYear()}`
  return `${day(a)} de ${month(a)} al ${day(b)} de ${month(b)} de ${b.getUTCFullYear()}`
}

/** Lista de días del viaje: ['2027-04-10', '2027-04-11', …] */
export function tripDays(start: string, end: string): string[] {
  const out: string[] = []
  const d = dayToDate(start)
  const last = dayToDate(end).getTime()
  while (d.getTime() <= last && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Número de noches/días */
export function tripLength(start: string, end: string): number {
  return Math.round((dayToDate(end).getTime() - dayToDate(start).getTime()) / 86_400_000) + 1
}

/** "09:00:00" → "09:00" */
export function shortTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

// ---------- Instantes (timestamptz) en la zona del viaje ----------

/** "Martes 6 de abril de 2027, 23:59" */
export function formatDateTime(iso: string | null | undefined, tz: string, inline = false): string {
  if (!iso) return ''
  const s = fmt(tz, 'long', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(iso)).replace(/^(\p{L}+),/u, '$1')
  return inline ? s : cap(s)
}

/** "06 abr 2027, 23:59" */
export function formatShortDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  return fmt(tz, 'short', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** Diferencia (ms) entre la hora local de tz y UTC en ese instante */
function tzOffset(date: Date, tz: string): number {
  const parts = fmt(tz, 'parts', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }, 'en-US').formatToParts(date)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** ISO → valor de <input type="datetime-local"> en la zona tz */
export function toLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() + tzOffset(d, tz)).toISOString().slice(0, 16)
}

/** Valor de <input type="datetime-local"> interpretado en tz → ISO UTC */
export function fromLocalInput(value: string, tz: string): string {
  const [date = '', time = '00:00'] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!)
  let t = guess - tzOffset(new Date(guess), tz)
  const off2 = tzOffset(new Date(t), tz)
  if (guess - off2 !== t) t = guess - off2 // ajuste en cambios de horario
  return new Date(t).toISOString()
}

/** Fecha de hoy ('YYYY-MM-DD') en la zona tz */
export function todayIn(tz: string): string {
  const now = new Date()
  return new Date(now.getTime() + tzOffset(now, tz)).toISOString().slice(0, 10)
}

/** "faltan 12 días" / "en curso" / "terminó" respecto de las fechas del viaje */
export function tripCountdown(start: string, end: string, tz: string): string {
  const today = todayIn(tz)
  if (today > end) return 'Terminó'
  if (today >= start) return 'En curso'
  const days = Math.round((dayToDate(start).getTime() - dayToDate(today).getTime()) / 86_400_000)
  return days === 1 ? 'Mañana' : `Faltan ${days} días`
}

/** Zonas horarias disponibles en el navegador / Node */
export function timeZoneList(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  }
  catch {
    return ['America/Santiago', 'UTC']
  }
}

/** "Asia/Seoul" → "Asia / Seoul (UTC+9)" */
export function timeZoneLabel(tz: string): string {
  const off = tzOffset(new Date(), tz) / 3_600_000
  const sign = off >= 0 ? '+' : '−'
  const abs = Math.abs(off)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return `${tz.replace(/_/g, ' ').replace('/', ' / ')} (UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''})`
}
