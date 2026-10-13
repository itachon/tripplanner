import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveStopToDay } from '../app/utils/itinerary.ts'

const days = ['2027-04-10', '2027-04-11', '2027-04-12']
const stop = (id: string, day: string, sort_order: number) => ({ id, day, sort_order })

test('moveStopToDay: a un día vacío queda con orden 1', () => {
  const s = stop('a', '2027-04-10', 4)
  assert.deepEqual(moveStopToDay(s, '2027-04-11', [s], days), { day: '2027-04-11', sort_order: 1 })
})

test('moveStopToDay: queda al final del día de destino', () => {
  const s = stop('a', '2027-04-10', 1)
  const all = [s, stop('b', '2027-04-11', 2), stop('c', '2027-04-11', 5), stop('d', '2027-04-12', 9)]
  assert.deepEqual(moveStopToDay(s, '2027-04-11', all, days), { day: '2027-04-11', sort_order: 6 })
})

test('moveStopToDay: soltar en el mismo día no cambia nada', () => {
  const s = stop('a', '2027-04-10', 1)
  assert.equal(moveStopToDay(s, '2027-04-10', [s, stop('b', '2027-04-10', 2)], days), null)
})

test('moveStopToDay: un día fuera del viaje no cambia nada', () => {
  const s = stop('a', '2027-04-10', 1)
  assert.equal(moveStopToDay(s, '2027-05-01', [s], days), null)
  assert.equal(moveStopToDay(s, '', [s], days), null)
})
