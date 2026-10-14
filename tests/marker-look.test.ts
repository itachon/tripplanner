import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerLook } from '../app/utils/marker-look.ts'

const C = '#7c3aed'

test('markerLook: en votación, relleno del color con icono blanco y borde blanco', () => {
  assert.deepEqual(markerLook('primary', C), { small: false, style: { backgroundColor: C, color: '#ffffff', borderColor: '#ffffff', borderStyle: 'solid' } })
  assert.deepEqual(markerLook(undefined, C), markerLook('primary', C))
})

test('markerLook: votado se ve igual que en votación (la burbuja lo distingue)', () => {
  assert.deepEqual(markerLook('success', C), markerLook('primary', C))
})

test('markerLook: fuera de la votación, color al 45 % y chico', () => {
  assert.deepEqual(markerLook('off', C), { small: true, style: { backgroundColor: '#7c3aed73', color: '#ffffff', borderColor: '#ffffff', borderStyle: 'solid' } })
})

test('markerLook: del catálogo, blanco con icono y borde punteado del color', () => {
  assert.deepEqual(markerLook('catalog', C), { small: true, style: { backgroundColor: '#ffffff', color: C, borderColor: C, borderStyle: 'dashed' } })
})
