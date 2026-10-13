<script setup lang="ts">
import type { Map as MapboxMap, Marker as MapboxMarker, GeoJSONSource, MapMouseEvent } from 'mapbox-gl'
import type { MapMarker } from '~~/shared/types/map'


const props = withDefaults(defineProps<{
  markers: MapMarker[]
  selectedId?: string | null
  /** resaltado desde fuera (ej. al pasar el mouse por la lista) */
  highlightId?: string | null
  /** línea que une puntos en orden: [lng, lat][] */
  route?: [number, number][] | null
  /** modo "marcar en el mapa": el clic emite pick */
  picking?: boolean
  pendingPin?: { latitude: number, longitude: number } | null
  /** cambia este valor para volver a encuadrar todos los puntos */
  fitKey?: string | number
  /** pide dos dedos (o Ctrl + rueda) para mover el mapa; se apaga cuando el mapa ocupa toda la pantalla */
  cooperative?: boolean
}>(), {
  selectedId: null,
  highlightId: null,
  route: null,
  picking: false,
  pendingPin: null,
  fitKey: 0,
  cooperative: true,
})

const emit = defineEmits<{
  select: [id: string | null]
  pick: [coords: { latitude: number, longitude: number, name?: string | null, category?: string | null }]
}>()

defineSlots<{
  card?: (props: { marker: MapMarker, pinned: boolean, close: () => void }) => unknown
}>()

// terracotta-600 (no se puede usar una clase: Mapbox pinta la línea en el canvas)
const ROUTE_COLOR = '#b4532a'
const CARD_W = 300

const token = useRuntimeConfig().public.mapboxToken as string
const container = ref<HTMLDivElement | null>(null)
const root = ref<HTMLDivElement | null>(null)
const map = shallowRef<MapboxMap | null>(null)
const loaded = ref(false)
const mapError = ref('')

const hoveredId = ref<string | null>(null)
const pinnedId = ref<string | null>(props.selectedId)
const cardPos = ref<{ x: number, y: number, above: boolean, sheet: boolean } | null>(null)

const markerEls = new Map<string, { marker: MapboxMarker, el: HTMLButtonElement }>()
let pendingMarker: MapboxMarker | null = null
let mapboxgl: typeof import('mapbox-gl').default | null = null
let resizeObs: ResizeObserver | null = null
let lastSize = { w: 0, h: 0 }
let lastSelectedByMe: string | null = null

const activeId = computed(() => hoveredId.value ?? pinnedId.value)
const activeMarker = computed(() => props.markers.find(m => m.id === activeId.value) ?? null)
const isPinned = computed(() => !!pinnedId.value && activeId.value === pinnedId.value)

const TONES: Record<NonNullable<MapMarker['tone']>, string> = {
  primary: 'bg-primary text-inverted',
  success: 'bg-success text-inverted',
  neutral: 'bg-neutral-600 text-white',
  warning: 'bg-warning text-white',
}

// El estilo va en un círculo interior: el <button> exterior es de Mapbox, que
// le pone sus clases (mapboxgl-marker, position absolute) y lo ubica con
// `transform`. Si se le pisa className o se anima su transform, el punto salta.
function markerClass(m: MapMarker) {
  const active = m.id === activeId.value || m.id === props.highlightId
  return [
    'trip-marker flex items-center justify-center rounded-full border-2 border-white shadow-md',
    'size-8 text-xs font-bold transition-[scale,box-shadow] duration-150',
    TONES[m.tone ?? 'primary'],
    m.dimmed && !active ? 'opacity-55' : '',
    active ? 'scale-125 ring-4 ring-primary/35' : 'group-hover:scale-110',
  ].join(' ')
}

function createMarkerEl(m: MapMarker) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'group cursor-pointer'
  el.appendChild(document.createElement('span'))
  el.dataset.markerId = m.id
  el.addEventListener('mouseenter', () => { hoveredId.value = m.id })
  el.addEventListener('mouseleave', () => { if (hoveredId.value === m.id) hoveredId.value = null })
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    pinnedId.value = m.id
    lastSelectedByMe = m.id
    emit('select', m.id)
  })
  return el
}

function paintMarker(m: MapMarker, el: HTMLButtonElement, marker: MapboxMarker) {
  const dot = el.firstElementChild as HTMLSpanElement
  dot.className = markerClass(m)
  dot.textContent = m.label ?? ''
  el.setAttribute('aria-label', m.title)
  el.title = ''
  const active = m.id === activeId.value || m.id === props.highlightId
  // Mapbox ordena los marcadores por orden de inserción; subimos el activo
  el.style.zIndex = active ? '5' : m.dimmed ? '1' : '2'
  const ll = marker.getLngLat()
  if (ll.lat !== m.latitude || ll.lng !== m.longitude) marker.setLngLat([m.longitude, m.latitude])
}

function syncMarkers() {
  if (!map.value || !mapboxgl) return
  const keep = new Set(props.markers.map(m => m.id))
  for (const [id, { marker }] of markerEls) {
    if (!keep.has(id)) {
      marker.remove()
      markerEls.delete(id)
    }
  }
  for (const m of props.markers) {
    let entry = markerEls.get(m.id)
    if (!entry) {
      const el = createMarkerEl(m)
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([m.longitude, m.latitude])
        .addTo(map.value)
      entry = { marker, el }
      markerEls.set(m.id, entry)
    }
    paintMarker(m, entry.el, entry.marker)
  }
  updateCardPos()
}

function fit(animate = true) {
  const m = map.value
  if (!m || !mapboxgl || !props.markers.length) return
  if (!m.getContainer().clientWidth) return
  if (props.markers.length === 1) {
    const p = props.markers[0]!
    m.easeTo({ center: [p.longitude, p.latitude], zoom: 14, duration: animate ? 600 : 0 })
    return
  }
  const b = new mapboxgl.LngLatBounds()
  for (const p of props.markers) b.extend([p.longitude, p.latitude])
  m.fitBounds(b, { padding: 64, maxZoom: 15, duration: animate ? 600 : 0 })
}

function updateCardPos() {
  const m = map.value
  const mk = activeMarker.value
  const box = root.value
  if (!m || !mk || !box) {
    cardPos.value = null
    return
  }
  const p = m.project([mk.longitude, mk.latitude])
  const w = box.clientWidth
  const half = Math.min(CARD_W, w - 16) / 2
  const x = Math.min(Math.max(p.x, half + 8), w - half - 8)
  // En pantallas angostas la ficha va como hoja anclada abajo del mapa
  cardPos.value = { x, y: p.y, above: p.y > box.clientHeight * 0.55, sheet: w < 520 }
}

function syncRoute() {
  const m = map.value
  if (!m || !loaded.value) return
  const coords = props.route ?? []
  const data = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: coords.length >= 2 ? coords : [] },
  }
  const src = m.getSource('trip-route') as GeoJSONSource | undefined
  if (src) {
    src.setData(data)
    return
  }
  m.addSource('trip-route', { type: 'geojson', data })
  m.addLayer({
    id: 'trip-route',
    type: 'line',
    source: 'trip-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 3, 'line-opacity': 0.75, 'line-dasharray': [1.5, 1.5] },
  })
}

function syncPendingPin() {
  if (!map.value || !mapboxgl) return
  const p = props.pendingPin
  if (!p) {
    pendingMarker?.remove()
    pendingMarker = null
    return
  }
  // terracotta-400
  if (!pendingMarker) pendingMarker = new mapboxgl.Marker({ color: '#d38057' })
  pendingMarker.setLngLat([p.longitude, p.latitude]).addTo(map.value)
}

watch(() => props.cooperative, (on) => { map.value?.setCooperativeGestures(on) })

function close() {
  pinnedId.value = null
  hoveredId.value = null
  lastSelectedByMe = null
  emit('select', null)
}

/** Capas de puntos de interés del estilo de calles (museos, monumentos, aeropuertos, etc.) */
function poiLayerIds(): string[] {
  const layers = map.value?.getStyle()?.layers ?? []
  return layers.filter(l => l.type === 'symbol' && /poi|airport|transit/i.test(l.id)).map(l => l.id)
}

interface RenderedPointFeature {
  geometry: { type: string, coordinates: [number, number] }
  properties: Record<string, string | number | boolean | null | undefined> | null
}

/** Busca el punto de interés más cercano al clic entre los ya dibujados en el mapa */
function findNearestPoi(point: { x: number, y: number }): { name: string, category: string | null } | null {
  const m = map.value
  const ids = poiLayerIds()
  if (!m || !ids.length) return null
  const pad = 8
  const features = m.queryRenderedFeatures(
    [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]],
    { layers: ids },
  ) as unknown as RenderedPointFeature[]
  let best: RenderedPointFeature | null = null
  let bestDist = Infinity
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue
    const p = m.project(f.geometry.coordinates)
    const dist = Math.hypot(p.x - point.x, p.y - point.y)
    if (dist < bestDist) {
      bestDist = dist
      best = f
    }
  }
  const props = best?.properties
  const name = props?.name_es || props?.name_en || props?.name
  if (!name) return null
  const category = props?.class || props?.maki || props?.type || null
  return { name: String(name), category: category ? String(category) : null }
}

onMounted(async () => {
  if (!token || !container.value) return
  try {
    mapboxgl = (await import('mapbox-gl')).default
    mapboxgl.accessToken = token
    const m = new mapboxgl.Map({
      container: container.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-70.65, -33.45],
      zoom: 1.5,
      cooperativeGestures: props.cooperative,
      attributionControl: true,
    })
    // Español primero; si una etiqueta no tiene traducción, usa inglés (alfabeto latino)
    // antes que caer al idioma local del lugar.
    m.setLanguage(['es', 'en'])
    map.value = m
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    m.on('load', () => {
      loaded.value = true
      syncRoute()
    })
    m.on('error', (e) => {
      const status = (e.error as { status?: number } | undefined)?.status
      if (status === 401 || status === 403) mapError.value = 'El token de Mapbox no es válido o no tiene permiso para este dominio.'
    })
    m.on('move', updateCardPos)
    m.on('click', (e: MapMouseEvent) => {
      if (props.picking) {
        const poi = findNearestPoi(e.point)
        emit('pick', { latitude: e.lngLat.lat, longitude: e.lngLat.lng, name: poi?.name ?? null, category: poi?.category ?? null })
        return
      }
      if (pinnedId.value) close()
    })

    syncMarkers()
    syncPendingPin()
    fit(false)

    // La pestaña puede estar oculta al crear el mapa: al hacerse visible, reencuadrar
    resizeObs = new ResizeObserver(() => {
      const el = container.value
      if (!el) return
      const size = { w: el.clientWidth, h: el.clientHeight }
      if (size.w === lastSize.w && size.h === lastSize.h) return
      const wasHidden = !lastSize.w || !lastSize.h
      lastSize = size
      m.resize()
      if (wasHidden) fit(false)
      updateCardPos()
    })
    resizeObs.observe(container.value)
  }
  catch (e) {
    console.error(e)
    mapError.value = 'No se pudo cargar el mapa.'
  }
})

onBeforeUnmount(() => {
  resizeObs?.disconnect()
  for (const { marker } of markerEls.values()) marker.remove()
  markerEls.clear()
  pendingMarker?.remove()
  map.value?.remove()
  map.value = null
})

watch(() => props.markers, syncMarkers, { deep: true })
watch([activeId, () => props.highlightId], syncMarkers)
watch(() => props.route, syncRoute, { deep: true })
watch(() => props.pendingPin, syncPendingPin, { deep: true })

const idsKey = computed(() => props.markers.map(m => m.id).sort().join(','))
watch([idsKey, () => props.fitKey], () => nextTick(() => fit()))

watch(() => props.picking, (on) => {
  const canvas = map.value?.getCanvas()
  if (canvas) canvas.style.cursor = on ? 'crosshair' : ''
})

// Selección desde fuera (lista): fijar ficha y centrar el mapa
watch(() => props.selectedId, (id) => {
  if (id === lastSelectedByMe) return
  lastSelectedByMe = id
  pinnedId.value = id
  const mk = props.markers.find(m => m.id === id)
  if (mk && map.value) {
    map.value.easeTo({ center: [mk.longitude, mk.latitude], zoom: Math.max(map.value.getZoom(), 13), duration: 600 })
  }
})
</script>

<template>
  <div ref="root" class="relative size-full overflow-hidden bg-elevated" :class="{ 'trip-map-picking': picking }">
    <!-- size-full (no absolute): el CSS de Mapbox fuerza position: relative en este div -->
    <div ref="container" class="size-full" />

    <div v-if="!token" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <UIcon name="i-lucide-map" class="size-10 text-dimmed" />
      <p class="font-medium">
        Mapa no disponible
      </p>
      <p class="max-w-xs text-sm text-muted">
        Falta configurar <code class="text-xs">NUXT_PUBLIC_MAPBOX_TOKEN</code>.
      </p>
    </div>

    <div v-else-if="mapError" class="absolute inset-x-3 top-3 z-30">
      <UAlert color="error" variant="subtle" icon="i-lucide-map-pin-off" :description="mapError" />
    </div>

    <div
      v-if="picking"
      class="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center"
    >
      <span class="rounded-full bg-inverted px-3 py-1.5 text-xs font-medium text-inverted shadow">
        Toca un lugar marcado en el mapa para usar su nombre, o cualquier punto para marcarlo
      </span>
    </div>

    <div
      v-if="activeMarker && cardPos && $slots.card"
      class="absolute z-20"
      :class="isPinned ? 'pointer-events-auto' : 'pointer-events-none'"
      :style="cardPos.sheet
        ? { left: '8px', right: '8px', bottom: '8px', maxHeight: 'calc(100% - 16px)', overflowY: 'auto' }
        : {
          left: `${cardPos.x}px`,
          top: `${cardPos.y}px`,
          width: `${CARD_W}px`,
          maxWidth: 'calc(100% - 16px)',
          transform: cardPos.above ? 'translate(-50%, calc(-100% - 24px))' : 'translate(-50%, 24px)',
        }"
      data-testid="map-card"
    >
      <slot name="card" :marker="activeMarker" :pinned="isPinned" :close="close" />
    </div>
  </div>
</template>

<style>
.trip-map-picking .mapboxgl-canvas-container { cursor: crosshair; }
.mapboxgl-ctrl-attrib { font-size: 10px; }
</style>
