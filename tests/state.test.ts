import assert from 'node:assert/strict';
import test from 'node:test';
import { asiaDate, convertAmount, createInitialState, escapeHTML, loadState, parseBackup, saveState, serializeBackup, STORAGE_KEY, toSafeCSVCell, validateState } from '../src/state';
import type { Activity, Place, State } from '../src/types';
import { baseActivities, checklist, places } from '../src/data';

const activity: Activity = {
  id: 'a1', date: '2026-12-04', title: 'Arrival', time: '16:15', duration: 60, placeId: 'hotel', zone: 'Rochor',
  effort: 'bajo', priority: 'principal', status: 'pending', food: '', tickets: '', rain: '', detail: '', fromHotel: '', fromPrevious: '',
};
const state = (): State => createInitialState([activity], ['passports']);

test('creates defaults and round-trips a validated backup', () => {
  const original = state();
  const parsed = parseBackup(serializeBackup(original, ['hotel']), ['hotel']);
  assert.deepEqual(parsed, original);
  assert.equal(parsed.theme, 'auto');
  assert.equal(parsed.rates.SGD, null);
});

test('rejects bad version, malformed dates, duplicate IDs, missing references and oversized backup', () => {
  assert.throws(() => validateState({ ...state(), version: 2 }));
  assert.throws(() => validateState({ ...state(), activities: [{ ...activity, date: '2026-02-30' }] }));
  assert.throws(() => validateState({ ...state(), activities: [activity, activity] }));
  assert.throws(() => validateState(state(), []));
  assert.throws(() => parseBackup(' '.repeat(1_000_001)));
});

test('accepts blank place links and flight context while bounding all journal dates to the trip', () => {
  const blankLinked = { ...activity, placeId: '', localTime: 'Hora local estimada, terminal pendiente' };
  assert.equal(validateState({ ...state(), activities: [blankLinked] }, []).activities[0].placeId, '');
  assert.throws(() => validateState({ ...state(), notes: [{ id: 'n', date: '2026-12-13', placeId: '', text: 'x', rating: null, memory: '' }] }));
  assert.throws(() => validateState({ ...state(), expenses: [{ id: 'e', date: '2026-12-02', title: 'x', amount: 1, currency: 'EUR', category: 'food' }] }));
});

test('rejects colliding custom IDs and non-HTTPS sources; validates the actual itinerary baseline', () => {
  const place: Place = { id: 'hotel', name: 'Custom', city: 'sg', area: '', kind: 'hotel', address: '', lat: null, lon: null, description: '', photo: '', access: '', shade: '', price: '' };
  assert.throws(() => validateState({ ...state(), customPlaces: [place] }, ['hotel']));
  assert.throws(() => validateState({ ...state(), customPlaces: [{ ...place, id: 'custom', source: 'javascript:alert(1)' }] }));
  assert.throws(() => validateState({ ...state(), checks: ['passports', 'passports'] }));
  const baseline = createInitialState(baseActivities, checklist.map(item => item.id));
  assert.equal(validateState(baseline, places.map(item => item.id)).activities.length, baseActivities.length);
});

test('storage reports empty, corrupt, unavailable and saved states without throwing', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(loadState(storage).status, 'empty');
  assert.equal(saveState(state(), storage), true);
  assert.equal(loadState(storage, ['hotel']).status, 'ok');
  values.set(STORAGE_KEY, '{broken');
  assert.equal(loadState(storage).status, 'corrupt');
  assert.equal(loadState({ getItem() { throw new Error('blocked'); }, setItem() {} }).status, 'unavailable');
  assert.equal(saveState(state(), { getItem() { return null; }, setItem() { throw new Error('quota'); } }), false);
  assert.equal(saveState(state(), undefined), false);
});

test('escapes HTML and neutralizes spreadsheet formulas in CSV cells', () => {
  assert.equal(escapeHTML(`<script a="'">&`), '&lt;script a=&quot;&#39;&quot;&gt;&amp;');
  assert.equal(toSafeCSVCell('=1+1'), "\"'=1+1\"");
  assert.equal(toSafeCSVCell('safe, "quoted"'), '"safe, ""quoted"""');
});

test('converts with explicitly supplied rates and resolves the Asia calendar date', () => {
  assert.equal(convertAmount(22.99, 'EUR', { SGD: null, MYR: null }), 22.99);
  assert.equal(convertAmount(100, 'SGD', { SGD: 1.5, MYR: null }), 100 * 1.5);
  assert.equal(convertAmount(100, 'MYR', { SGD: null, MYR: null }), null);
  assert.equal(asiaDate(new Date('2026-12-03T16:30:00Z')), '2026-12-04');
});
