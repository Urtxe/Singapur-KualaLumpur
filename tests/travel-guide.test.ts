import assert from 'node:assert/strict'
import test from 'node:test'
import { BASE_UPDATED_ACTIVITY_IDS, baseActivities, places } from '../src/data'
import { guidePlaces, localEvents } from '../src/guide-data'
import { eventOccursOn, visits } from '../src/travel-guide'
import { walkingRoutes } from '../src/walking-routes'

test('every published place has visit guidance and a separate HTTPS source', () => {
  const catalogue = new Map([...places, ...guidePlaces].map(place => [place.id, place]))
  assert.deepEqual([...visits.keys()].sort(), [...catalogue.keys()].sort())
  for (const [id, visit] of visits) {
    assert.ok(visit.hours && visit.duration && visit.highlights, id)
    assert.equal(new URL(visit.source ?? catalogue.get(id)?.source ?? '').protocol, 'https:', id)
    if (visit.accessSource) assert.equal(new URL(visit.accessSource).protocol, 'https:', id)
  }
})

test('event times and days match the calendar and link to places', () => {
  for (const event of localEvents) {
    assert.ok(event.hours && event.duration && event.start <= event.end, event.id)
    assert.ok(event.placeId && visits.has(event.placeId), event.id)
    assert.equal(new URL(event.source).protocol, 'https:', event.id)
  }
  const borealis = localEvents.find(event => event.id === 'borealis-dec')
  assert.ok(borealis)
  assert.equal(eventOccursOn(borealis, '2026-12-05'), true)
  assert.equal(eventOccursOn(borealis, '2026-12-08'), false)
})

test('each dated walk points to a real activity and has valid measurements and sources', () => {
  for (const [date, legs] of Object.entries(walkingRoutes)) {
    for (const leg of legs) {
      assert.ok(baseActivities.some(item => item.date === date && item.id === leg.toActivity), `${date} ${leg.toActivity}`)
      if (leg.metres !== undefined) assert.ok(leg.metres > 0)
      if (leg.minutes) assert.ok(leg.minutes[0] > 0 && leg.minutes[0] <= leg.minutes[1])
      for (const url of [leg.source, ...leg.relatedSources ?? []]) {
        assert.doesNotMatch(url, /\s/)
        assert.equal(new URL(url).protocol, 'https:')
      }
    }
  }
  assert.equal(walkingRoutes['2026-12-08'].filter(leg => leg.basis === 'operator' && leg.metres === 1700).length, 1)
  assert.ok(BASE_UPDATED_ACTIVITY_IDS.includes('petronas-night'))
})
