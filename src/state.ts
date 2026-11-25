import type { Activity, Currency, Expense, Note, Place, State } from './types';

export const STORAGE_KEY = 'asia-trip-state-v1';
export const MAX_BACKUP_BYTES = 1_000_000;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { state: State | null; status: 'ok' | 'empty' | 'corrupt' | 'unavailable' };

const LIMITS = { activities: 500, customPlaces: 200, favorites: 500, notes: 500, expenses: 1000, checks: 200 };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T => typeof value === 'string' && choices.includes(value as T);

function fail(message: string): never { throw new Error(`Invalid trip data: ${message}`); }

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tripDate(value: unknown): value is string {
  return validDate(value) && value >= '2026-12-03' && value <= '2026-12-12';
}

function id(value: unknown): value is string { return typeof value === 'string' && /^[\w.:@-]{1,100}$/.test(value); }

function arrayOf<T>(value: unknown, key: keyof typeof LIMITS, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > LIMITS[key]) fail(`${String(key)} must be an array within its size limit`);
  return value.map(parse);
}

function parsePlace(value: unknown): Place {
  if (!record(value)) fail('place must be an object');
  const { id: placeId, name, city, area, kind, address, lat, lon, description, photo, access, shade, price, source } = value;
  if (!id(placeId) || !str(name, 200) || !oneOf(city, ['sg', 'kl']) || !str(area, 200) || !oneOf(kind, ['must', 'food', 'optional', 'hotel', 'airport']) || !str(address, 500) || !(lat === null || finite(lat)) || !(lon === null || finite(lon)) || !str(description, 2000) || !str(photo, 500) || !str(access, 1000) || !str(shade, 1000) || !str(price, 300) || (source !== undefined && !str(source, 1000))) fail('place fields are invalid');
  if (source !== undefined) {
    try { if (new URL(source).protocol !== 'https:') fail('place source must use HTTPS'); }
    catch { fail('place source must be a valid HTTPS URL'); }
  }
  if ((lat === null) !== (lon === null) || (lat !== null && (lat < -90 || lat > 90 || (lon as number) < -180 || (lon as number) > 180))) fail('place coordinates are invalid');
  return { id: placeId, name, city: city as Place['city'], area, kind: kind as Place['kind'], address, lat, lon, description, photo, access, shade, price, ...(source === undefined ? {} : { source }) };
}

function parseActivity(value: unknown): Activity {
  if (!record(value)) fail('activity must be an object');
  const { id: activityId, date, title, time, duration, placeId, zone, effort, priority, status, food, tickets, rain, detail, fromHotel, fromPrevious, flight, localTime, custom } = value;
  const timeOk = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!id(activityId) || !tripDate(date) || !str(title, 200) || !timeOk(time) || !finite(duration) || duration <= 0 || duration > 1440 || !(placeId === '' || id(placeId)) || !str(zone, 200) || !oneOf(effort, ['bajo', 'medio', 'alto']) || !oneOf(priority, ['principal', 'opcional', 'pausa']) || !oneOf(status, ['pending', 'done', 'skipped']) || !str(food, 1000) || !str(tickets, 1000) || !str(rain, 1000) || !str(detail, 3000) || !str(fromHotel, 500) || !str(fromPrevious, 500) || (flight !== undefined && !oneOf(flight, ['confirmed', 'provisional'])) || (localTime !== undefined && !str(localTime, 200)) || (custom !== undefined && typeof custom !== 'boolean')) fail('activity fields are invalid');
  return { id: activityId, date, title, time, duration, placeId, zone, effort: effort as Activity['effort'], priority: priority as Activity['priority'], status: status as Activity['status'], food, tickets, rain, detail, fromHotel, fromPrevious, ...(flight === undefined ? {} : { flight: flight as Activity['flight'] }), ...(localTime === undefined ? {} : { localTime }), ...(custom === undefined ? {} : { custom }) };
}

function parseNote(value: unknown): Note {
  if (!record(value)) fail('note must be an object');
  const { id: noteId, date, placeId, text, rating, memory } = value;
  if (!id(noteId) || !tripDate(date) || !(placeId === '' || id(placeId)) || !str(text, 10000) || !(rating === null || (finite(rating) && rating >= 1 && rating <= 5)) || !str(memory, 10000)) fail('note fields are invalid');
  return { id: noteId, date, placeId, text, rating, memory };
}

function parseExpense(value: unknown): Expense {
  if (!record(value)) fail('expense must be an object');
  const { id: expenseId, date, title, amount, currency, category } = value;
  if (!id(expenseId) || !tripDate(date) || !str(title, 300) || !finite(amount) || amount < 0 || amount > 1_000_000_000 || (currency !== 'EUR' && currency !== 'SGD' && currency !== 'MYR') || !str(category, 100)) fail('expense fields are invalid');
  return { id: expenseId, date, title, amount, currency: currency as Currency, category };
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`duplicate ${label} id`);
}

export function createInitialState(activities: Activity[], checks: string[]): State {
  return {
    version: 1,
    activities: activities.map(parseActivity),
    customPlaces: [], favorites: [], notes: [], expenses: [],
    budget: null, rates: { SGD: null, MYR: null }, checks: [...checks], theme: 'auto', family: false,
  };
}

/** Validates imported and persisted data, returning a fresh object with only supported fields. */
export function validateState(value: unknown, knownPlaceIds?: string[]): State {
  if (!record(value) || value.version !== 1) fail('unsupported state version');
  const customPlaces = arrayOf(value.customPlaces, 'customPlaces', parsePlace);
  const activities = arrayOf(value.activities, 'activities', parseActivity);
  const notes = arrayOf(value.notes, 'notes', parseNote);
  const expenses = arrayOf(value.expenses, 'expenses', parseExpense);
  const favorites = arrayOf(value.favorites, 'favorites', item => { if (!id(item)) fail('favorite id is invalid'); return item; });
  const checks = arrayOf(value.checks, 'checks', item => { if (!str(item, 200)) fail('check item is invalid'); return item; });
  unique(activities.map(item => item.id), 'activity');
  unique(customPlaces.map(item => item.id), 'place');
  unique(notes.map(item => item.id), 'note');
  unique(expenses.map(item => item.id), 'expense');
  unique(favorites, 'favorite');
  unique(checks, 'check');
  const known = new Set(knownPlaceIds ?? []);
  for (const place of customPlaces) if (known.has(place.id)) fail(`custom place duplicates a base place: ${place.id}`);
  const availablePlaces = new Set([...(knownPlaceIds ?? []), ...customPlaces.map(place => place.id)]);
  if (knownPlaceIds !== undefined) {
    for (const placeId of [...activities.map(item => item.placeId), ...notes.map(item => item.placeId)]) {
      if (placeId === '') continue;
      if (!availablePlaces.has(placeId)) fail(`unknown place reference: ${placeId}`);
    }
  }
  for (const placeId of favorites) if (!availablePlaces.has(placeId) && knownPlaceIds !== undefined) fail(`unknown favorite place: ${placeId}`);
  let budget: number | null;
  if (value.budget === null) budget = null;
  else if (finite(value.budget) && value.budget >= 0 && value.budget <= 1_000_000_000) budget = value.budget;
  else return fail('budget is invalid');
  if (!record(value.rates) || !(value.rates.SGD === null || (finite(value.rates.SGD) && value.rates.SGD > 0 && value.rates.SGD <= 1_000_000)) || !(value.rates.MYR === null || (finite(value.rates.MYR) && value.rates.MYR > 0 && value.rates.MYR <= 1_000_000))) fail('rates are invalid');
  if (!['auto', 'light', 'dark'].includes(String(value.theme)) || typeof value.family !== 'boolean') fail('settings are invalid');
  return { version: 1, activities, customPlaces, favorites, notes, expenses, budget, rates: { SGD: value.rates.SGD as number | null, MYR: value.rates.MYR as number | null }, checks, theme: value.theme as State['theme'], family: value.family };
}

export function parseBackup(text: string, knownPlaceIds?: string[]): State {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) fail('backup is too large');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return fail('backup is not valid JSON'); }
  return validateState(parsed, knownPlaceIds);
}

export function serializeBackup(state: State, knownPlaceIds?: string[]): string {
  const validated = validateState(state, knownPlaceIds);
  const text = JSON.stringify(validated, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) fail('backup is too large');
  return text;
}

function browserStorage(): StorageLike | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function loadState(storage: StorageLike | undefined = browserStorage(), knownPlaceIds?: string[]): LoadResult {
  if (!storage) return { state: null, status: 'unavailable' };
  let raw: string | null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { state: null, status: 'unavailable' }; }
  if (raw === null) return { state: null, status: 'empty' };
  try { return { state: parseBackup(raw, knownPlaceIds), status: 'ok' }; }
  catch { return { state: null, status: 'corrupt' }; }
}

/** Returns false on unavailable storage, serialization errors, or quota errors. */
export function saveState(state: State, storage: StorageLike | undefined = browserStorage(), knownPlaceIds?: string[]): boolean {
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, serializeBackup(state, knownPlaceIds)); return true; }
  catch { return false; }
}

export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string);
}

/** Produces one quoted CSV field and neutralizes spreadsheet formula prefixes. */
export function toSafeCSVCell(value: unknown): string {
  let text = String(value ?? '');
  if ('=+-@'.includes(text.trimStart()[0] ?? '')) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function convertAmount(amount: number, currency: Currency, rates: State['rates']): number | null {
  if (!Number.isFinite(amount)) return null;
  if (currency === 'EUR') return amount;
  const rate = rates[currency];
  return rate === null || !Number.isFinite(rate) || rate <= 0 ? null : amount * rate;
}

/** Current calendar date in Singapore/Malaysia time (UTC+8). */
export function asiaDate(now = new Date()): string {
  return new Date(now.valueOf() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}
