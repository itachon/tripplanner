import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actualBase, balances, currencyDecimals, estimatedBase, roundMoney, settle, splitEqually, summarize,
  type BudgetItemLike,
} from '../shared/utils/budget.ts'

const item = (over: Partial<BudgetItemLike>): BudgetItemLike => ({
  id: 'i1', category: 'other', currency: 'CLP',
  estimated_amount: null, actual_amount: null, actual_rate: null, paid_by: null, member_ids: [],
  ...over,
})
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

test('currencyDecimals: CLP, KRW y JPY sin decimales; USD con 2; código raro con 2', () => {
  assert.equal(currencyDecimals('CLP'), 0)
  assert.equal(currencyDecimals('KRW'), 0)
  assert.equal(currencyDecimals('JPY'), 0)
  assert.equal(currencyDecimals('USD'), 2)
  assert.equal(currencyDecimals('???'), 2)
})

test('roundMoney redondea a los decimales de la moneda', () => {
  assert.equal(roundMoney(1234.5, 'CLP'), 1235)
  assert.equal(roundMoney(12.346, 'USD'), 12.35)
})

test('estimatedBase: convierte con el cambio del viaje; misma moneda = 1', () => {
  assert.equal(estimatedBase(item({ currency: 'KRW', estimated_amount: 900000 }), 'CLP', { KRW: 0.73 }), 657000)
  assert.equal(estimatedBase(item({ estimated_amount: 5000 }), 'CLP', {}), 5000)
  assert.equal(estimatedBase(item({ currency: 'KRW', estimated_amount: 100 }), 'CLP', {}), null)
  assert.equal(estimatedBase(item({}), 'CLP', {}), null)
})

test('actualBase: usa el cambio congelado del ítem, no el del viaje', () => {
  assert.equal(actualBase(item({ currency: 'KRW', actual_amount: 1000, actual_rate: 0.7 }), 'CLP'), 700)
  assert.equal(actualBase(item({ actual_amount: 1000, actual_rate: 1 }), 'CLP'), 1000)
  assert.equal(actualBase(item({}), 'CLP'), null)
})

test('summarize: totales, diferencia, por categoría y por persona', () => {
  const s = summarize([
    item({ id: 'a', category: 'lodging', currency: 'KRW', estimated_amount: 900000, actual_amount: 950000, actual_rate: 0.7 }),
    item({ id: 'b', category: 'food', estimated_amount: 30000 }),
    item({ id: 'c', category: 'food', actual_amount: 12000, actual_rate: 1 }),
  ], 'CLP', { KRW: 0.73 }, 3)
  assert.equal(s.estimated, 687000) // 657.000 + 30.000
  assert.equal(s.actual, 677000) // 665.000 + 12.000
  assert.equal(s.variance, 8000) // solo el ítem con ambos montos: 665.000 − 657.000
  assert.equal(s.perPerson, 229000)
  assert.deepEqual(s.byCategory, [
    { category: 'lodging', estimated: 657000, actual: 665000, count: 1 },
    { category: 'food', estimated: 30000, actual: 12000, count: 2 },
  ])
  assert.deepEqual(s.missingRates, [])
})

test('summarize: moneda sin tipo de cambio queda fuera y se informa', () => {
  const s = summarize([
    item({ id: 'a', currency: 'THB', estimated_amount: 500 }),
    item({ id: 'b', estimated_amount: 1000 }),
  ], 'CLP', {}, 2)
  assert.equal(s.estimated, 1000)
  assert.deepEqual(s.missingRates, ['THB'])
})

test('summarize: decimales sin error de coma flotante; sin personas no divide', () => {
  const s = summarize([
    item({ id: 'a', currency: 'USD', estimated_amount: 0.1 }),
    item({ id: 'b', currency: 'USD', estimated_amount: 0.2 }),
  ], 'USD', {}, 0)
  assert.equal(s.estimated, 0.3)
  assert.equal(s.perPerson, 0)
})

test('splitEqually: el resto se reparte de a una unidad y la suma es exacta', () => {
  const parts = splitEqually(100, ['c', 'a', 'b'], 'CLP')
  assert.deepEqual([...parts], [['a', 34], ['b', 33], ['c', 33]])
  assert.equal(sum([...parts.values()]), 100)
  const usd = splitEqually(10, ['a', 'b', 'c'], 'USD')
  assert.deepEqual([...usd.values()], [3.34, 3.33, 3.33])
  assert.equal(splitEqually(100, [], 'CLP').size, 0)
  assert.deepEqual([...splitEqually(100, ['a', 'a'], 'CLP')], [['a', 100]])
})

test('balances: suman cero y reflejan quién pagó', () => {
  const list = balances([
    item({ id: 'a', actual_amount: 100, actual_rate: 1, paid_by: 'ana', member_ids: ['ana', 'beto', 'caro'] }),
    item({ id: 'b', actual_amount: 60, actual_rate: 1, paid_by: 'beto', member_ids: ['ana', 'beto'] }),
  ], 'CLP', ['ana', 'beto', 'caro'])
  assert.deepEqual(list, [
    { member_id: 'ana', paid: 100, owed: 64, balance: 36 },
    { member_id: 'beto', paid: 60, owed: 63, balance: -3 },
    { member_id: 'caro', paid: 0, owed: 33, balance: -33 },
  ])
  assert.equal(sum(list.map(b => b.balance)), 0)
})

test('balances: el pagador no participa del gasto', () => {
  const list = balances([
    item({ actual_amount: 90, actual_rate: 1, paid_by: 'ana', member_ids: ['beto', 'caro'] }),
  ], 'CLP', ['ana', 'beto', 'caro'])
  assert.deepEqual(list.map(b => b.balance), [90, -45, -45])
})

test('balances: ignora ítems sin pagador, sin participantes o sin gasto real', () => {
  const list = balances([
    item({ id: 'a', actual_amount: 100, actual_rate: 1, paid_by: null, member_ids: ['ana'] }),
    item({ id: 'b', actual_amount: 100, actual_rate: 1, paid_by: 'ana', member_ids: [] }),
    item({ id: 'c', estimated_amount: 100, paid_by: 'ana', member_ids: ['ana', 'beto'] }),
  ], 'CLP', ['ana', 'beto'])
  assert.deepEqual(list.map(b => b.balance), [0, 0])
})

test('settle: transferencias mínimas que dejan a todos en cero', () => {
  const t = settle([
    { member_id: 'ana', paid: 100, owed: 64, balance: 36 },
    { member_id: 'beto', paid: 60, owed: 63, balance: -3 },
    { member_id: 'caro', paid: 0, owed: 33, balance: -33 },
  ], 'CLP')
  assert.deepEqual(t, [
    { from: 'caro', to: 'ana', amount: 33 },
    { from: 'beto', to: 'ana', amount: 3 },
  ])
  assert.deepEqual(settle([{ member_id: 'ana', paid: 0, owed: 0, balance: 0 }], 'CLP'), [])
})

test('settle: con decimales no deja residuos', () => {
  const list = balances([
    item({ currency: 'USD', actual_amount: 10, actual_rate: 1, paid_by: 'ana', member_ids: ['ana', 'beto', 'caro'] }),
  ], 'USD', ['ana', 'beto', 'caro'])
  const t = settle(list, 'USD')
  assert.deepEqual(t, [
    { from: 'beto', to: 'ana', amount: 3.33 },
    { from: 'caro', to: 'ana', amount: 3.33 },
  ])
})
