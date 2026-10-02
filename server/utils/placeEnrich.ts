/**
 * Precarga info básica de un lugar SIN IA, solo con APIs gratuitas:
 *   OpenStreetMap (Overpass) → horarios, web, teléfono y enlace a Wikidata/Wikipedia
 *   Wikidata                 → artículo exacto de Wikipedia + foto oficial (P18) + descripción corta
 *   Wikipedia                → historia (resumen) + foto
 *   Wikimedia Commons        → fotos tomadas cerca de las coordenadas (respaldo)
 *   Pexels                   → foto genérica por nombre (último respaldo, opcional)
 * Cada fuente puede fallar sin romper el resto: mejor un dato vacío que
 * mostrar información de otro lugar.
 */

export interface EnrichInput {
  name: string
  latitude: number
  longitude: number
}

export interface Photo {
  url: string
  credit: string
}

export interface EnrichResult {
  history: string | null
  historySource: 'wikipedia' | 'wikidata' | null
  openingHours: string | null
  website: string | null
  phone: string | null
  photo: Photo | null
  wikipediaUrl: string | null
  wikidataId: string | null
}

// Wikimedia y Overpass piden un User-Agent identificable
const UA = 'TripPlanner/1.0 (https://github.com/; contacto no publicado)'

const norm = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const sameName = (a?: string, b?: string) => {
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').trim()

export async function enrichPlace(place: EnrichInput): Promise<EnrichResult> {
  // 1. OpenStreetMap: horarios y, si existe, el enlace exacto a Wikidata/Wikipedia
  const osm = await getOsm(place)

  // 2. Wikidata (si OSM trae el ID): da el título exacto del artículo y la foto oficial
  const wd = osm?.wikidata ? await getWikidata(osm.wikidata) : null

  // 3. Wikipedia: primero por enlace exacto (OSM o Wikidata), si no, por cercanía + nombre
  const wikiRef = parseWikiTag(osm?.wikipedia) ?? wd?.wiki ?? null
  const wiki = wikiRef
    ? await getWikipediaSummary(wikiRef.lang, wikiRef.title)
    : await findWikipediaNearby(place)

  // 4. Foto: Wikipedia → Wikidata → Commons cercano → Pexels
  const photo: Photo | null
    = (wiki?.photo ? { url: wiki.photo, credit: 'Wikipedia / Wikimedia Commons' } : null)
      ?? (wd?.image ? { url: commonsFileUrl(wd.image), credit: 'Wikimedia Commons' } : null)
      ?? (await getCommonsNearby(place))
      ?? (await getPexelsPhoto(place.name))

  const history = wiki?.extract ?? wd?.description ?? null

  return {
    history,
    historySource: wiki?.extract ? 'wikipedia' : wd?.description ? 'wikidata' : null,
    openingHours: osm?.hours ?? null,
    website: osm?.website ?? null,
    phone: osm?.phone ?? null,
    photo,
    wikipediaUrl: wiki?.url ?? null,
    wikidataId: osm?.wikidata ?? wiki?.wikidata ?? null,
  }
}

// Overpass público se satura seguido (responde HTML con error): se prueba en orden
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

type OsmElement = { tags?: Record<string, string> }

// Fuera de países de alfabeto latino, `name` viene en el idioma local (ej. coreano):
// se compara también con name:en, name:es, int_name, etc.
const osmNames = (t: Record<string, string> = {}) =>
  Object.entries(t)
    .filter(([k]) => k === 'name' || /^(name:[a-z]{2}|int_name|official_name|alt_name|old_name)$/.test(k))
    .map(([, v]) => v)

// --- OpenStreetMap (Overpass): el elemento más cercano con el mismo nombre ---
async function getOsm({ name, latitude, longitude }: EnrichInput) {
  const q = `[out:json][timeout:10];nwr(around:200,${latitude},${longitude})["name"];out tags 100;`
  let elements: OsmElement[] | null = null
  for (const url of OVERPASS_URLS) {
    const res = await $fetch<{ elements?: OsmElement[] }>(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: q }).toString(),
      timeout: 12_000,
    }).catch(() => null)
    if (Array.isArray(res?.elements)) {
      elements = res.elements
      break
    }
  }

  const t = (elements ?? []).find(e => osmNames(e.tags).some(n => sameName(n, name)))?.tags
  if (!t) return null
  return {
    hours: t.opening_hours ?? null,
    website: t.website ?? t['contact:website'] ?? null,
    phone: t.phone ?? t['contact:phone'] ?? null,
    wikidata: t.wikidata ?? null,
    wikipedia: t.wikipedia ?? null, // ej. "es:Cerro Santa Lucía"
  }
}

function parseWikiTag(tag?: string | null) {
  const m = tag?.match(/^([a-z-]+):(.+)$/)
  return m ? { lang: m[1]!, title: m[2]! } : null
}

interface WikidataEntity {
  sitelinks?: { eswiki?: { title?: string }, enwiki?: { title?: string } }
  claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] }
  descriptions?: { es?: { value?: string }, en?: { value?: string } }
}

// --- Wikidata: artículo en español (o inglés), foto P18 y descripción corta ---
async function getWikidata(id: string) {
  const res = await $fetch<{ entities?: Record<string, WikidataEntity> }>('https://www.wikidata.org/w/api.php', {
    query: { action: 'wbgetentities', ids: id, props: 'sitelinks|claims|descriptions', languages: 'es|en', format: 'json' },
    headers: { 'User-Agent': UA },
    timeout: 8_000,
  }).catch(() => null)

  const e = res?.entities?.[id]
  if (!e) return null

  const es = e.sitelinks?.eswiki?.title
  const en = e.sitelinks?.enwiki?.title
  return {
    wiki: es ? { lang: 'es', title: es } : en ? { lang: 'en', title: en } : null,
    image: e.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null,
    description: e.descriptions?.es?.value ?? e.descriptions?.en?.value ?? null,
  }
}

const commonsFileUrl = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1200`

interface WikiSummary {
  extract?: string
  originalimage?: { source?: string }
  thumbnail?: { source?: string }
  content_urls?: { desktop?: { page?: string } }
  wikibase_item?: string
}

// --- Wikipedia: resumen de un artículo concreto ---
async function getWikipediaSummary(lang: string, title: string) {
  const s = await $fetch<WikiSummary>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { 'User-Agent': UA }, timeout: 8_000 },
  ).catch(() => null)

  if (!s?.extract) return null
  return {
    extract: s.extract,
    photo: s.originalimage?.source ?? s.thumbnail?.source ?? null,
    url: s.content_urls?.desktop?.page ?? null,
    wikidata: s.wikibase_item ?? null,
  }
}

interface GeoSearchResult { query?: { geosearch?: { title: string }[] } }

// --- Wikipedia: artículos cerca de las coordenadas que coincidan por nombre ---
async function findWikipediaNearby({ name, latitude, longitude }: EnrichInput) {
  for (const lang of ['es', 'en']) {
    const geo = await $fetch<GeoSearchResult>(`https://${lang}.wikipedia.org/w/api.php`, {
      query: { action: 'query', list: 'geosearch', gscoord: `${latitude}|${longitude}`, gsradius: 1000, gslimit: 10, format: 'json' },
      headers: { 'User-Agent': UA },
      timeout: 8_000,
    }).catch(() => null)

    const match = (geo?.query?.geosearch ?? []).find(p => sameName(p.title, name))
    if (!match) continue // mejor nada que el artículo de otro lugar

    const summary = await getWikipediaSummary(lang, match.title)
    if (summary) return summary
  }
  return null
}

interface CommonsImageInfo { thumburl?: string, url?: string, mime?: string, extmetadata?: { Artist?: { value?: string }, LicenseShortName?: { value?: string } } }
interface CommonsPage { title: string, index?: number, imageinfo?: CommonsImageInfo[] }
interface CommonsGeoSearch { query?: { pages?: Record<string, CommonsPage> } }

// --- Wikimedia Commons: fotos subidas cerca de las coordenadas ---
async function getCommonsNearby({ name, latitude, longitude }: EnrichInput): Promise<Photo | null> {
  const res = await $fetch<CommonsGeoSearch>('https://commons.wikimedia.org/w/api.php', {
    query: {
      action: 'query',
      generator: 'geosearch',
      ggscoord: `${latitude}|${longitude}`,
      ggsradius: 300,
      ggsnamespace: 6, // solo archivos
      ggslimit: 15,
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: 1200,
      format: 'json',
    },
    headers: { 'User-Agent': UA },
    timeout: 10_000,
  }).catch(() => null)

  const files = Object.values(res?.query?.pages ?? {})
    .filter(p => p.imageinfo?.[0]?.mime === 'image/jpeg')
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) // más cercanas primero

  // Solo si el nombre del archivo menciona el lugar: una foto cercana sin
  // relación por nombre es, muchas veces, de otra cosa (un edificio vecino,
  // una calle) — mejor no mostrar nada que mostrar el lugar equivocado.
  const pick = files.find(p => sameName(p.title.replace(/^File:/, ''), name))
  if (!pick?.imageinfo?.[0]) return null

  const info = pick.imageinfo[0]
  const artist = stripHtml(info.extmetadata?.Artist?.value)
  const license = info.extmetadata?.LicenseShortName?.value
  const url = info.thumburl ?? info.url
  if (!url) return null
  return { url, credit: [artist, license, 'Wikimedia Commons'].filter(Boolean).join(' · ') }
}

interface PexelsResult { photos?: { src?: { large?: string }, photographer?: string }[] }

// --- Pexels: foto genérica por nombre (opcional, requiere NUXT_PEXELS_API_KEY) ---
async function getPexelsPhoto(name: string): Promise<Photo | null> {
  const { pexelsApiKey } = useRuntimeConfig()
  if (!pexelsApiKey) return null

  const res = await $fetch<PexelsResult>('https://api.pexels.com/v1/search', {
    query: { query: name, per_page: 1 },
    headers: { Authorization: pexelsApiKey as string },
    timeout: 8_000,
  }).catch(() => null)

  const p = res?.photos?.[0]
  return p?.src?.large ? { url: p.src.large, credit: `Foto de ${p.photographer} en Pexels` } : null
}
