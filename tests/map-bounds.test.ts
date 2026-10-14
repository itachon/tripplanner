import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapBox } from '../app/utils/map-bounds.ts'

test('mapBox: una zona normal pasa igual', () => {
  assert.deepEqual(mapBox(126.9, 37.5, 127.1, 37.6), { south: 37.5, west: 126.9, north: 37.6, east: 127.1 })
})

test('mapBox: con el mundo entero a la vista cubre todas las longitudes', () => {
  assert.deepEqual(mapBox(-250, -80, 150, 80), { south: -80, west: -180, north: 80, east: 180 })
})

test('mapBox: longitudes fuera de ±180 se llevan al rango', () => {
  assert.deepEqual(mapBox(190, 0, 200, 1), { south: 0, west: -170, north: 1, east: -160 })
  assert.deepEqual(mapBox(-200, 0, -190, 1), { south: 0, west: 160, north: 1, east: 170 })
})

test('mapBox: cruzando el antimeridiano el oeste queda mayor que el este', () => {
  assert.deepEqual(mapBox(170, 0, 190, 1), { south: 0, west: 170, north: 1, east: -170 })
})
