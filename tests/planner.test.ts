import assert from 'node:assert/strict'
import test from 'node:test'
import { greatCircleKm, plannerWarnings } from '../src/planner'
import type { Activity, Place } from '../src/types'

function activity(id: string, time: string, duration: number, placeId = '', zone = ''): Activity {
  return { id, date: '2026-12-05', title: id, time, duration, placeId, zone, effort: 'bajo', priority: 'opcional', status: 'pending', food: '', tickets: '', rain: '', detail: '', fromHotel: '', fromPrevious: '' }
}

test('great circle estimates straight line distance between Singapore and Kuala Lumpur', () => {
  const km = greatCircleKm(1.3521, 103.8198, 3.139, 101.6869)
  assert.ok(km > 300 && km < 400)
})

test('planner warns about time collisions without duplicating a rest warning', () => {
  const rows = [activity('morning', '09:00', 90), activity('next', '10:15', 60)]
  const warnings = plannerWarnings(rows, [])
  assert.ok(warnings.some(warning => warning.kind === 'overlap'))
  assert.ok(!warnings.some(warning => warning.kind === 'rest'))
  assert.deepEqual(rows.map(row => row.id), ['morning', 'next'])
})

test('planner only requests a rest buffer between different places when the gap is short', () => {
  const samePlace = plannerWarnings([activity('first', '09:00', 60, 'museum', 'Marina Bay'), activity('second', '10:00', 60, 'museum', 'Marina Bay')], [])
  const otherZone = plannerWarnings([activity('first', '09:00', 60, 'museum', 'Marina Bay'), activity('second', '10:15', 60, 'park', 'Gardens')], [])
  assert.ok(!samePlace.some(warning => warning.kind === 'rest'))
  assert.ok(otherZone.some(warning => warning.kind === 'rest'))
})

test('planner counts tourist visits rather than meals and transfers when flagging busy days', () => {
  const visits = Array.from({ length: 5 }, (_, index) => activity(`visit-${index}`, `${String(9 + index).padStart(2, '0')}:00`, 30, `place-${index}`))
  const meal = activity('meal', '14:00', 45, 'cafe')
  meal.priority = 'pausa'
  assert.ok(!plannerWarnings([...visits, meal], []).some(warning => warning.kind === 'busy'))
  assert.ok(plannerWarnings([...visits, activity('visit-5', '15:00', 30, 'museum-5')], []).some(warning => warning.kind === 'busy'))
})

test('planner flags long geographic jumps with short transfer buffers', () => {
  const places: Place[] = [
    { id: 'sg', name: 'Singapore', city: 'sg', area: '', kind: 'must', address: '', lat: 1.3521, lon: 103.8198, description: '', photo: '', access: '', shade: '', price: '' },
    { id: 'kl', name: 'Kuala Lumpur', city: 'kl', area: '', kind: 'must', address: '', lat: 3.139, lon: 101.6869, description: '', photo: '', access: '', shade: '', price: '' },
  ]
  const warnings = plannerWarnings([activity('a', '09:00', 60, 'sg'), activity('b', '10:30', 60, 'kl')], places)
  const distance = warnings.find(warning => warning.kind === 'distance')
  assert.ok(distance)
  assert.match(distance.message, /línea recta/)
})
