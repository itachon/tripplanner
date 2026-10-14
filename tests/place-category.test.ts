import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryIndex, categoryOf, categoryToSave, pickPoiCategory } from '../app/utils/place-category.ts'

const payload = {
  categories: [
    { key: 'museum', icon: 'i-lucide-landmark', color: '#7c3aed', sort_order: 1, label_es: 'Museos' },
    { key: 'monument', icon: 'i-lucide-castle', color: '#b45309', sort_order: 2, label_es: 'Monumentos' },
    { key: 'lodging', icon: 'i-lucide-bed-double', color: '#2563eb', sort_order: 7, label_es: 'Hoteles' },
    { key: 'other', icon: 'i-lucide-map-pin', color: '#78716c', sort_order: 99, label_es: 'Otros' },
  ],
  tags: [
    { tag: 'museum', category_key: 'museum' },
    { tag: 'museo', category_key: 'museum' },
    { tag: 'palacio', category_key: 'monument' },
    { tag: 'lodging', category_key: 'lodging' },
    { tag: 'other', category_key: 'other' },
  ],
}
const index = buildCategoryIndex(payload)

test('categoryOf: etiqueta exacta', () => {
  assert.equal(categoryOf('museum', index)?.label_es, 'Museos')
})

test('categoryOf: sin distinguir mayúsculas ni espacios', () => {
  assert.equal(categoryOf('Palacio', index)?.key, 'monument')
  assert.equal(categoryOf('  Lodging ', index)?.key, 'lodging')
})

test('categoryOf: alias en español', () => {
  assert.equal(categoryOf('museo', index)?.key, 'museum')
})

test('categoryOf: desconocida o vacía es Otros', () => {
  assert.equal(categoryOf('arts_and_entertainment', index)?.key, 'other')
  assert.equal(categoryOf(null, index)?.key, 'other')
  assert.equal(categoryOf('', index)?.key, 'other')
})

test('categoryOf: sin categorías cargadas es null', () => {
  assert.equal(categoryOf('museum', buildCategoryIndex({ categories: [], tags: [] })), null)
})

test('pickPoiCategory: prefiere maki, luego class, luego type', () => {
  assert.equal(pickPoiCategory({ maki: 'museum', class: 'arts_and_entertainment', type: 'Museum' }), 'museum')
  assert.equal(pickPoiCategory({ class: 'lodging', type: 'Hotel' }), 'lodging')
  assert.equal(pickPoiCategory({ type: 'Hotel' }), 'Hotel')
  assert.equal(pickPoiCategory({ maki: '', class: null }), null)
  assert.equal(pickPoiCategory(null), null)
})

test('categoryToSave: sin tocar el selector conserva la etiqueta original exacta', () => {
  assert.equal(categoryToSave('Palacio', 'monument', 'monument'), 'Palacio')
  assert.equal(categoryToSave('arts_and_entertainment', 'other', 'other'), 'arts_and_entertainment')
  assert.equal(categoryToSave('  ', 'other', 'other'), null)
  assert.equal(categoryToSave(null, 'other', 'other'), null)
})

test('categoryToSave: al elegir otra categoría guarda su key', () => {
  assert.equal(categoryToSave('arts_and_entertainment', 'other', 'museum'), 'museum')
  assert.equal(categoryToSave(null, 'other', 'lodging'), 'lodging')
})
