import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayChipParts } from '../app/utils/dates.ts'

test('dayChipParts: día de la semana corto sin punto y número sin cero', () => {
  // 2027-04-12 es lunes
  assert.deepEqual(dayChipParts('2027-04-12'), { weekday: 'lun', num: '12' })
  assert.deepEqual(dayChipParts('2027-04-03'), { weekday: 'sáb', num: '3' })
})
