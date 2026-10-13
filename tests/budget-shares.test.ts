import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expectedShares, itemShare, type BudgetItemLike } from '../shared/utils/budget.ts'

const item = (over: Partial<BudgetItemLike>): BudgetItemLike => ({
  id: 'i1', category: 'other', currency: 'CLP',
  estimated_amount: null, actual_amount: null, actual_rate: null, paid_by: null, member_ids: [],
  ...over,
})
const byId = (list: { member_id: string, share: number }[]) => Object.fromEntries(list.map(s => [s.member_id, s.share]))

test('expectedShares: un gasto dividido sin pagar reparte su estimado', () => {
  const items = [item({ estimated_amount: 30000, member_ids: ['a', 'b'] })]
  assert.deepEqual(byId(expectedShares(items, 'CLP', {}, ['a', 'b'])), { a: 15000, b: 15000 })
})

test('expectedShares: suma varios ítems y solo cobra a quien participa', () => {
  const items = [
    item({ id: 'i1', estimated_amount: 30000, member_ids: ['a', 'b'] }),
    item({ id: 'i2', estimated_amount: 9000, member_ids: ['a'] }),
  ]
  assert.deepEqual(byId(expectedShares(items, 'CLP', {}, ['a', 'b', 'c'])), { a: 24000, b: 15000, c: 0 })
})

test('expectedShares: convierte a la moneda principal con el cambio del viaje', () => {
  const items = [item({ currency: 'USD', estimated_amount: 100, member_ids: ['a', 'b'] })]
  assert.deepEqual(byId(expectedShares(items, 'CLP', { USD: 950 }, ['a', 'b'])), { a: 47500, b: 47500 })
})

test('expectedShares: si ya se pagó, usa lo gastado en vez del estimado', () => {
  const items = [item({ estimated_amount: 30000, actual_amount: 40000, paid_by: 'a', member_ids: ['a', 'b'] })]
  assert.deepEqual(byId(expectedShares(items, 'CLP', {}, ['a', 'b'])), { a: 20000, b: 20000 })
})

test('expectedShares: ignora ítems sin participantes, sin monto o sin tipo de cambio', () => {
  const items = [
    item({ id: 'i1', estimated_amount: 30000, member_ids: [] }),
    item({ id: 'i2', member_ids: ['a'] }),
    item({ id: 'i3', currency: 'USD', estimated_amount: 100, member_ids: ['a'] }),
  ]
  assert.deepEqual(byId(expectedShares(items, 'CLP', {}, ['a'])), { a: 0 })
})

test('expectedShares: cuenta los extras de una entrada', () => {
  const items = [item({ category: 'tickets', estimated_amount: 10000, extras: [{ name: 'Audioguía', amount: 2000 }], member_ids: ['a', 'b'] })]
  assert.deepEqual(byId(expectedShares(items, 'CLP', {}, ['a', 'b'])), { a: 6000, b: 6000 })
})

test('itemShare: parte de un viajero en la moneda del ítem', () => {
  const it = item({ currency: 'USD', estimated_amount: 100, member_ids: ['a', 'b', 'c'] })
  // 100 / 3: el centavo que sobra va al primero por id
  assert.equal(itemShare(it, 'a'), 33.34)
  assert.equal(itemShare(it, 'b'), 33.33)
})

test('itemShare: usa lo gastado si el ítem ya se pagó', () => {
  const it = item({ estimated_amount: 30000, actual_amount: 40000, member_ids: ['a', 'b'] })
  assert.equal(itemShare(it, 'a'), 20000)
})

test('itemShare: null si no participa o el ítem no tiene monto', () => {
  assert.equal(itemShare(item({ estimated_amount: 30000, member_ids: ['a'] }), 'z'), null)
  assert.equal(itemShare(item({ member_ids: ['a'] }), 'a'), null)
})
