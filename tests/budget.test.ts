import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actualBase, balances, currencyDecimals, estimatedBase, estimatedTotal, extrasTotal, parseExtraRows,
  roundMoney, settle, splitEqually, summarize,
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

test('roundMoney nunca devuelve -0', () => {
  assert.equal(Object.is(roundMoney(-0.001, 'USD'), 0), true)
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

test('settle: transferencias que dejan a todos en cero', () => {
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

test('estimatedTotal: precio base más extras, en la moneda del ítem', () => {
  const extras = [{ name: 'Audioguía', amount: 3000 }, { name: 'Foto', amount: 1500 }]
  assert.equal(extrasTotal(item({ estimated_amount: 20000, extras })), 4500)
  assert.equal(estimatedTotal(item({ estimated_amount: 20000, extras })), 24500)
  assert.equal(estimatedTotal(item({ estimated_amount: 20000, extras: [] })), 20000)
  assert.equal(estimatedTotal(item({ currency: 'USD', estimated_amount: 0.1, extras: [{ name: 'x', amount: 0.2 }] })), 0.3)
})

test('estimatedTotal: ítem sin la clave extras se calcula como sin extras', () => {
  assert.equal(extrasTotal(item({ estimated_amount: 20000 })), 0)
  assert.equal(estimatedTotal(item({ estimated_amount: 20000 })), 20000)
  assert.equal(estimatedTotal(item({})), null)
  assert.equal(estimatedTotal(item({ extras: [] })), null)
})

test('estimatedTotal: extras sin precio base; un extra de monto 0 cuenta', () => {
  assert.equal(estimatedTotal(item({ extras: [{ name: 'Audioguía', amount: 3000 }] })), 3000)
  assert.equal(estimatedTotal(item({ extras: [{ name: 'Incluido', amount: 0 }] })), 0)
})

test('estimatedBase: convierte el total con extras con el cambio del viaje', () => {
  const it = item({ currency: 'KRW', estimated_amount: 20000, extras: [{ name: 'Audioguía', amount: 3000 }] })
  assert.equal(estimatedBase(it, 'CLP', { KRW: 0.73 }), 16790) // 23.000 × 0,73
  assert.equal(estimatedBase(it, 'CLP', {}), null)
})

test('summarize: los extras entran en el estimado, la diferencia y el costo por persona', () => {
  const s = summarize([
    item({ id: 'a', category: 'tickets', estimated_amount: 20000, extras: [{ name: 'Audioguía', amount: 3000 }], actual_amount: 25000, actual_rate: 1 }),
  ], 'CLP', {}, 2)
  assert.equal(s.estimated, 23000)
  assert.equal(s.actual, 25000)
  assert.equal(s.variance, 2000)
  assert.equal(s.perPerson, 11500)
})

test('summarize: informa la moneda sin cambio aunque el ítem solo tenga extras', () => {
  const s = summarize([
    item({ id: 'a', category: 'tickets', currency: 'THB', actual_amount: 100, actual_rate: 40, extras: [{ name: 'Audioguía', amount: 50 }] }),
  ], 'CLP', {}, 1)
  assert.deepEqual(s.missingRates, ['THB'])
})

test('balances: los extras no cambian el reparto, que depende del monto pagado', () => {
  const base = { actual_amount: 100, actual_rate: 1, paid_by: 'ana', member_ids: ['ana', 'beto'] }
  assert.deepEqual(
    balances([item({ ...base, extras: [{ name: 'Audioguía', amount: 30 }] })], 'CLP', ['ana', 'beto']),
    balances([item(base)], 'CLP', ['ana', 'beto']),
  )
})

test('parseExtraRows: recorta nombres, acepta coma decimal y números, ignora filas vacías', () => {
  const r = parseExtraRows([
    { name: ' Audioguía ', amount: '3000' },
    { name: '', amount: '' },
    { name: 'Foto', amount: '1,5' },
    { name: 'Incluido', amount: 0 },
    { name: 'Foto', amount: 2 },
  ])
  assert.deepEqual(r.extras, [
    { name: 'Audioguía', amount: 3000 },
    { name: 'Foto', amount: 1.5 },
    { name: 'Incluido', amount: 0 },
    { name: 'Foto', amount: 2 },
  ])
  assert.deepEqual(r.errors, [])
})

test('parseExtraRows: marca el error en la fila y el campo, y no guarda la fila', () => {
  const r = parseExtraRows([
    { name: '', amount: '10' },
    { name: 'Sin monto', amount: '' },
    { name: 'Texto', amount: 'abc' },
    { name: 'Negativo', amount: '-1' },
    { name: 'x'.repeat(121), amount: '1' },
    { name: '  ', amount: 'abc' },
  ])
  assert.deepEqual(r.extras, [])
  assert.deepEqual(r.errors, [
    { index: 0, field: 'name', message: 'Ponle un nombre al extra' },
    { index: 1, field: 'amount', message: 'Ingresa un monto válido' },
    { index: 2, field: 'amount', message: 'Ingresa un monto válido' },
    { index: 3, field: 'amount', message: 'Ingresa un monto válido' },
    { index: 4, field: 'name', message: 'Máximo 120 caracteres' },
    { index: 5, field: 'name', message: 'Ponle un nombre al extra' },
    { index: 5, field: 'amount', message: 'Ingresa un monto válido' },
  ])
})

test('parseExtraRows: no deja pasar más de 20 extras', () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ name: `Extra ${i}`, amount: '1' }))
  const r = parseExtraRows(rows)
  assert.equal(r.extras.length, 20)
  assert.deepEqual(r.errors, [{ index: 20, field: 'name', message: 'Máximo 20 extras' }])
})
