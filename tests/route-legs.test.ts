import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WALK_MAX_M, directionsRequestUrl, distanceM, formatLeg, legsFor, parseDirections } from '../app/utils/route-legs.ts'

// Seúl: Gyeongbokgung → Bukchon (~1 km) → Namsan (~4 km)
const palace = { id: 's1', latitude: 37.5796, longitude: 126.977 }
const bukchon = { id: 's2', latitude: 37.5826, longitude: 126.9837 }
const namsan = { id: 's3', latitude: 37.5512, longitude: 126.9882 }

test('distanceM: distancia en línea recta aproximada', () => {
  const d = distanceM(palace, bukchon)
  assert.ok(d > 600 && d < 800, `fue ${d}`)
})

test('legsFor: un tramo por cada par de paradas seguidas, a pie si es corto y en auto si es largo', () => {
  const legs = legsFor([palace, bukchon, namsan])
  assert.equal(legs.length, 2)
  assert.deepEqual(legs.map(l => [l.fromId, l.toId, l.mode]), [['s1', 's2', 'walking'], ['s2', 's3', 'driving']])
  assert.ok(WALK_MAX_M === 2000)
})

test('legsFor: sin tramo entre dos paradas en el mismo punto, ni con menos de dos paradas', () => {
  assert.deepEqual(legsFor([palace, { ...palace, id: 's9' }]), [])
  assert.deepEqual(legsFor([palace]), [])
  assert.deepEqual(legsFor([]), [])
})

test('legsFor: la clave identifica modo y coordenadas (redondeadas) para reutilizar la ruta', () => {
  const [a] = legsFor([palace, bukchon])
  const [b] = legsFor([{ ...palace, id: 'x', latitude: 37.579600001 }, { ...bukchon, id: 'y' }])
  assert.equal(a!.key, b!.key)
  assert.equal(a!.key, 'walking:126.97700,37.57960;126.98370,37.58260')
})

test('directionsRequestUrl: perfil, coordenadas lng,lat y geometría GeoJSON', () => {
  const [leg] = legsFor([palace, bukchon])
  const url = directionsRequestUrl(leg!, 'pk.abc')
  assert.equal(url, 'https://api.mapbox.com/directions/v5/mapbox/walking/126.977,37.5796;126.9837,37.5826?geometries=geojson&overview=full&access_token=pk.abc')
})

test('parseDirections: toma la primera ruta', () => {
  const r = parseDirections({ routes: [{ distance: 1234.5, duration: 900, geometry: { coordinates: [[1, 2], [3, 4]] } }] })
  assert.deepEqual(r, { distance: 1234.5, duration: 900, coordinates: [[1, 2], [3, 4]] })
})

test('parseDirections: sin rutas o con datos raros es null', () => {
  assert.equal(parseDirections({ routes: [] }), null)
  assert.equal(parseDirections({ code: 'NoRoute' }), null)
  assert.equal(parseDirections(null), null)
  assert.equal(parseDirections({ routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }] }), null)
})

test('formatLeg: metros, kilómetros con coma y minutos u horas', () => {
  assert.equal(formatLeg(850, 610), '850 m · 10 min')
  assert.equal(formatLeg(1234, 900), '1,2 km · 15 min')
  assert.equal(formatLeg(12_400, 3900), '12,4 km · 1 h 05 min')
  assert.equal(formatLeg(40, 20), '40 m · 1 min')
})
