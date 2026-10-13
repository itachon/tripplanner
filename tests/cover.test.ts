import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverPhoto, placePhoto } from '../app/utils/image.ts'

test('placePhoto: usa la foto subida y, si falta, la de la ficha', () => {
  assert.equal(placePhoto({ photo_url: 'a.jpg', info: { photo_url: 'wiki.jpg' } }), 'a.jpg')
  assert.equal(placePhoto({ photo_url: null, info: { photo_url: 'wiki.jpg' } }), 'wiki.jpg')
  assert.equal(placePhoto({ photo_url: null, info: null }), null)
  assert.equal(placePhoto({}), null)
})

test('placePhoto: una URL vacía cuenta como sin foto', () => {
  assert.equal(placePhoto({ photo_url: '', info: { photo_url: '' } }), null)
  assert.equal(placePhoto({ photo_url: '', info: { photo_url: 'wiki.jpg' } }), 'wiki.jpg')
})

test('coverPhoto: gana el lugar más votado que tenga foto', () => {
  assert.equal(coverPhoto([
    { photo_url: 'a.jpg', vote_count: 1 },
    { photo_url: 'b.jpg', vote_count: 5 },
    { photo_url: 'c.jpg', vote_count: 3 },
  ]), 'b.jpg')
})

test('coverPhoto: salta al más votado si no tiene foto', () => {
  assert.equal(coverPhoto([
    { photo_url: null, vote_count: 9 },
    { photo_url: 'b.jpg', vote_count: 2 },
  ]), 'b.jpg')
})

test('coverPhoto: en un empate gana el primero de la lista', () => {
  assert.equal(coverPhoto([
    { photo_url: 'a.jpg', vote_count: 2 },
    { photo_url: 'b.jpg', vote_count: 2 },
  ]), 'a.jpg')
})

test('coverPhoto: sin votos, el primero con foto', () => {
  assert.equal(coverPhoto([
    { photo_url: null },
    { photo_url: null, info: { photo_url: 'wiki.jpg' } },
    { photo_url: 'c.jpg' },
  ]), 'wiki.jpg')
})

test('coverPhoto: sin fotos o sin lugares devuelve null', () => {
  assert.equal(coverPhoto([{ photo_url: null, vote_count: 4 }, { photo_url: '' }]), null)
  assert.equal(coverPhoto([]), null)
})
