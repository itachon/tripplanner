import { test } from 'node:test'
import assert from 'node:assert/strict'
import { realMapboxId } from '../app/utils/mapbox-id.ts'

test('realMapboxId: deja pasar un identificador de Mapbox', () => {
  assert.equal(realMapboxId('dXJuOm1ieHBvaTox'), 'dXJuOm1ieHBvaTox')
  assert.equal(realMapboxId('  dXJuOm1ieHBvaTox  '), 'dXJuOm1ieHBvaTox')
})

test('realMapboxId: vacío o ausente es null', () => {
  assert.equal(realMapboxId(''), null)
  assert.equal(realMapboxId('   '), null)
  assert.equal(realMapboxId(null), null)
  assert.equal(realMapboxId(undefined), null)
})

test('realMapboxId: el id de respaldo "lat,lng" no es un identificador', () => {
  assert.equal(realMapboxId('37.5512,126.9882'), null)
  assert.equal(realMapboxId('-33.45,-70.65'), null)
})
