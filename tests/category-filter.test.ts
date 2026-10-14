import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryIndex, categoryOf } from '../app/utils/place-category.ts'
import { categoryCounts, filterByCategory } from '../app/utils/category-filter.ts'

const index = buildCategoryIndex({
  categories: [
    { key: 'museum', icon: 'i-lucide-landmark', color: '#7c3aed', sort_order: 1, label_es: 'Museos' },
    { key: 'lodging', icon: 'i-lucide-bed-double', color: '#2563eb', sort_order: 7, label_es: 'Hoteles' },
    { key: 'other', icon: 'i-lucide-map-pin', color: '#78716c', sort_order: 99, label_es: 'Otros' },
  ],
  tags: [
    { tag: 'museum', category_key: 'museum' },
    { tag: 'museo', category_key: 'museum' },
    { tag: 'lodging', category_key: 'lodging' },
    { tag: 'other', category_key: 'other' },
  ],
})
const resolve = (t: string | null | undefined) => categoryOf(t, index)

const m = (id: string, category: string | null) => ({ id, latitude: 0, longitude: 0, title: id, category })
const markers = [m('a', 'lodging'), m('b', 'museum'), m('c', 'Museo'), m('d', null), m('e', 'desconocida')]

test('categoryCounts: categorías presentes con su cantidad, en el orden de las categorías', () => {
  assert.deepEqual(categoryCounts(markers, resolve).map(c => [c.category.key, c.count]), [['museum', 2], ['lodging', 1], ['other', 2]])
})

test('categoryCounts: sin categorías cargadas no hay chips', () => {
  const none = buildCategoryIndex({ categories: [], tags: [] })
  assert.deepEqual(categoryCounts(markers, t => categoryOf(t, none)), [])
})

test('filterByCategory: sin selección se ven todos', () => {
  assert.equal(filterByCategory(markers, new Set(), resolve), markers)
})

test('filterByCategory: solo las categorías elegidas', () => {
  assert.deepEqual(filterByCategory(markers, new Set(['museum']), resolve).map(x => x.id), ['b', 'c'])
  assert.deepEqual(filterByCategory(markers, new Set(['museum', 'other']), resolve).map(x => x.id), ['b', 'c', 'd', 'e'])
})

test('filterByCategory: sin categorías cargadas no filtra', () => {
  const none = buildCategoryIndex({ categories: [], tags: [] })
  assert.equal(filterByCategory(markers, new Set(['museum']), t => categoryOf(t, none)), markers)
})
