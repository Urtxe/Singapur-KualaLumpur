import { baseActivities } from './data';
import type { Activity, Budget, CashMovement, Currency, DayPreference, Expense, Note, Place, RecordRevision, State } from './types';

export const STORAGE_KEY = 'asia-trip-state-v1';
export const MAX_BACKUP_BYTES = 1_000_000;
export const MAX_REVISIONS_PER_RECORD = 256;
export const BASE_REVISION_DATE = '1970-01-01T00:00:00.000Z';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;
export type LoadResult = { state: State | null; status: 'ok' | 'empty' | 'corrupt' | 'unavailable'; migrated?: boolean };
export type RecordKind = 'activity' | 'place' | 'note' | 'expense' | 'favorite' | 'check' | 'cash' | 'budget' | 'trash' | 'dish' | 'dayPreference' | 'settings';

const LIMITS = { activities: 500, customPlaces: 200, favorites: 500, notes: 500, expenses: 1000, checks: 200, cash: 1000, budgets: 500, trash: 500, triedDishes: 300, dayPreferences: 100 } as const;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T => typeof value === 'string' && choices.includes(value as T);
const ID_PATTERN = /^[\w.:@-]{1,100}$/;
const MAX_MINOR = 1_000_000_000_000;

function fail(message: string): never { throw new Error(`Invalid trip data: ${message}`); }

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tripDate(value: unknown): value is string {
  return validDate(value) && value >= '2025-01-01' && value <= '2035-12-31';
}

function id(value: unknown): value is string { return typeof value === 'string' && ID_PATTERN.test(value); }
function recordKey(value: unknown): value is string { return typeof value === 'string' && value.length >= 1 && value.length <= 220 && /^[\w.:@-]+$/.test(value); }

function arrayOf<T>(value: unknown, key: keyof typeof LIMITS, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > LIMITS[key]) fail(`${String(key)} must be an array within its size limit`);
  return value.map(parse);
}

function parseHttps(value: unknown, label: string, max = 2000): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!str(value, max)) fail(`${label} is invalid`);
  try { if (new URL(value).protocol !== 'https:') fail(`${label} must use HTTPS`); }
  catch { fail(`${label} must be a valid HTTPS URL`); }
  return value;
}

function parsePlace(value: unknown): Place {
  if (!record(value)) fail('place must be an object');
  const { id: placeId, name, city, area, kind, address, lat, lon, description, photo, access, shade, price } = value;
  if (!id(placeId) || !str(name, 200) || !oneOf(city, ['sg', 'kl']) || !str(area, 200) || !oneOf(kind, ['must', 'food', 'optional', 'hotel', 'airport', 'station', 'medical']) || !str(address, 500) || !(lat === null || finite(lat)) || !(lon === null || finite(lon)) || !str(description, 2000) || !str(photo, 500) || !str(access, 1000) || !str(shade, 1000) || !str(price, 300)) fail('place fields are invalid');
  if ((lat === null) !== (lon === null) || (lat !== null && (lat < -90 || lat > 90 || (lon as number) < -180 || (lon as number) > 180))) fail('place coordinates are invalid');
  const source = parseHttps(value.source, 'place source', 1000);
  return { id: placeId, name, city, area, kind, address, lat, lon, description, photo, access, shade, price, ...(source ? { source } : {}) };
}

function parseActivity(value: unknown): Activity {
  if (!record(value)) fail('activity must be an object');
  const { id: activityId, date, title, time, duration, placeId, zone, effort, priority, status, food, tickets, rain, detail, fromHotel, fromPrevious, flight, localTime, custom } = value;
  const timeOk = (v: unknown): v is string => v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
  if (!id(activityId) || !(date === '' || tripDate(date)) || !str(title, 200) || !timeOk(time) || !finite(duration) || duration <= 0 || duration > 1440 || !(placeId === '' || id(placeId)) || !str(zone, 200) || !oneOf(effort, ['bajo', 'medio', 'alto']) || !oneOf(priority, ['principal', 'opcional', 'pausa']) || !oneOf(status, ['pending', 'done', 'skipped']) || !str(food, 1000) || !str(tickets, 1000) || !str(rain, 1000) || !str(detail, 3000) || !str(fromHotel, 500) || !str(fromPrevious, 500) || (flight !== undefined && !oneOf(flight, ['confirmed', 'provisional'])) || (localTime !== undefined && !str(localTime, 200)) || (custom !== undefined && typeof custom !== 'boolean')) fail('activity fields are invalid');
  const plan = value.plan === undefined ? undefined : oneOf(value.plan, ['A', 'B']) ? value.plan : fail('activity plan is invalid');
  const order = value.order === undefined ? undefined : Number.isSafeInteger(value.order) && (value.order as number) >= 0 && (value.order as number) <= 499 ? value.order as number : fail('activity order is invalid');
  const numberField = (field: string, low: number, high: number): number | null | undefined => {
    const item = value[field];
    if (item === undefined || item === null) return item;
    if (!finite(item) || item < low || item > high) fail(`activity ${field} is invalid`);
    return item;
  };
  const optionalString = (field: string, max: number) => value[field] === undefined ? undefined : str(value[field], max) ? value[field] as string : fail(`activity ${field} is invalid`);
  const lat = numberField('lat', -90, 90);
  const lon = numberField('lon', -180, 180);
  if (lat !== undefined && lon === undefined || lon !== undefined && lat === undefined) fail('activity coordinates must be paired');
  const priceCurrency = value.priceCurrency === undefined ? undefined : oneOf(value.priceCurrency, ['EUR', 'SGD', 'MYR']) ? value.priceCurrency : fail('activity priceCurrency is invalid');
  if (value.fixed !== undefined && typeof value.fixed !== 'boolean' || value.archived !== undefined && typeof value.archived !== 'boolean') fail('activity flags are invalid');
  return {
    id: activityId, date, title, time, duration, placeId, zone, effort, priority, status, food, tickets, rain, detail, fromHotel, fromPrevious,
    ...(flight === undefined ? {} : { flight }), ...(localTime === undefined ? {} : { localTime }), ...(custom === undefined ? {} : { custom }),
    ...(plan === undefined ? {} : { plan }), ...(order === undefined ? {} : { order }), ...(value.fixed === undefined ? {} : { fixed: value.fixed as boolean }), ...(value.archived === undefined ? {} : { archived: value.archived as boolean }),
    ...(['category','address','notes','booking','transport','access','alternate'].reduce<Record<string, string>>((out, key) => { const v = optionalString(key, key === 'notes' ? 5000 : 2000); if (v !== undefined) out[key] = v; return out; }, {})),
    ...(lat === undefined ? {} : { lat }), ...(lon === undefined ? {} : { lon }), ...(numberField('estimatedPrice', 0, 1_000_000_000) === undefined ? {} : { estimatedPrice: numberField('estimatedPrice', 0, 1_000_000_000) }),
    ...(numberField('actualPrice', 0, 1_000_000_000) === undefined ? {} : { actualPrice: numberField('actualPrice', 0, 1_000_000_000) }), ...(priceCurrency === undefined ? {} : { priceCurrency }),
    ...(numberField('journeyMinutes', 0, 1440) === undefined ? {} : { journeyMinutes: numberField('journeyMinutes', 0, 1440) }),
    ...(parseHttps(value.officialUrl, 'activity official URL') ? { officialUrl: parseHttps(value.officialUrl, 'activity official URL') } : {}),
    ...(parseHttps(value.mapsUrl, 'activity Maps URL') ? { mapsUrl: parseHttps(value.mapsUrl, 'activity Maps URL') } : {}),
  } as Activity;
}

function parseNote(value: unknown): Note {
  if (!record(value)) fail('note must be an object');
  const { id: noteId, date, placeId, text, rating, memory } = value;
  if (!id(noteId) || !tripDate(date) || !(placeId === '' || id(placeId)) || !str(text, 10000) || !(rating === null || (finite(rating) && rating >= 1 && rating <= 5)) || !str(memory, 10000)) fail('note fields are invalid');
  const photoId = value.photoId === undefined ? undefined : id(value.photoId) ? value.photoId : fail('note photo id is invalid');
  const activityId = value.activityId === undefined ? undefined : id(value.activityId) ? value.activityId : fail('note activity id is invalid');
  return { id: noteId, date, placeId, text, rating, memory, ...(photoId ? { photoId } : {}), ...(activityId ? { activityId } : {}) };
}

function parseExpense(value: unknown): Expense {
  if (!record(value)) fail('expense must be an object');
  const { id: expenseId, date, title, amount, currency, category } = value;
  if (!id(expenseId) || !tripDate(date) || !str(title, 300) || !finite(amount) || amount < 0 || amount > 1_000_000_000 || !oneOf(currency, ['EUR', 'SGD', 'MYR']) || !str(category, 100)) fail('expense fields are invalid');
  const amountMinor = value.amountMinor === undefined ? Math.round(amount * 100) : value.amountMinor;
  if (!finite(amountMinor) || amountMinor < 0 || amountMinor > MAX_MINOR || Math.round(amountMinor) !== amountMinor) fail('expense amountMinor is invalid');
  const city = value.city === undefined ? undefined : oneOf(value.city, ['sg','kl','other']) ? value.city : fail('expense city is invalid');
  const method = value.method === undefined ? undefined : oneOf(value.method, ['cash','card','other']) ? value.method : fail('expense method is invalid');
  const phase = value.phase === undefined ? undefined : oneOf(value.phase, ['prepaid','destination']) ? value.phase : fail('expense phase is invalid');
  const people = value.people === undefined ? undefined : finite(value.people) && value.people >= 1 && value.people <= 100 ? value.people : fail('expense people is invalid');
  const rate = value.rate === undefined ? undefined : value.rate === null || finite(value.rate) && value.rate > 0 && value.rate <= 1_000_000 ? value.rate : fail('expense rate is invalid');
  const eurMinor = value.eurMinor === undefined ? undefined : value.eurMinor === null || finite(value.eurMinor) && Math.round(value.eurMinor) === value.eurMinor && Math.abs(value.eurMinor) <= MAX_MINOR ? value.eurMinor : fail('expense eurMinor is invalid');
  const bankEurMinor = value.bankEurMinor === undefined ? undefined : value.bankEurMinor === null || finite(value.bankEurMinor) && Math.round(value.bankEurMinor) === value.bankEurMinor && value.bankEurMinor >= 0 && value.bankEurMinor <= MAX_MINOR ? value.bankEurMinor : fail('expense bank EUR amount is invalid');
  const time = value.time === undefined ? undefined : typeof value.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) ? value.time : fail('expense time is invalid');
  const activityId = value.activityId === undefined ? undefined : id(value.activityId) ? value.activityId : fail('expense activity id is invalid');
  const receiptId = value.receiptId === undefined ? undefined : id(value.receiptId) ? value.receiptId : fail('expense receipt id is invalid');
  if (value.payer !== undefined && !str(value.payer,100) || value.notes !== undefined && !str(value.notes,5000)) fail('expense text is invalid');
  return { id: expenseId, date, title, amount, currency, category, amountMinor, ...(time === undefined ? {} : {time}), ...(city === undefined ? {} : {city}), ...(value.payer === undefined ? {} : {payer:value.payer as string}), ...(method === undefined ? {} : {method}), ...(people === undefined ? {} : {people}), ...(rate === undefined ? {} : {rate}), ...(eurMinor === undefined ? {} : {eurMinor}), ...(bankEurMinor === undefined ? {} : {bankEurMinor}), ...(activityId === undefined ? {} : {activityId}), ...(receiptId === undefined ? {} : {receiptId}), ...(value.notes === undefined ? {} : {notes:value.notes as string}), ...(phase === undefined ? {} : {phase}) };
}

function parseBudget(value: unknown): Budget {
  if (!record(value) || !id(value.id) || !oneOf(value.scope,['total','destination','city','day','category']) || !str(value.qualifier,200) || !finite(value.amountMinor) || Math.round(value.amountMinor) !== value.amountMinor || value.amountMinor < 0 || value.amountMinor > MAX_MINOR) fail('budget record is invalid');
  return { id:value.id, scope:value.scope, qualifier:value.qualifier, amountMinor:value.amountMinor };
}

function parseCash(value: unknown): CashMovement {
  if (!record(value) || !id(value.id) || !tripDate(value.date) || typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) || !oneOf(value.currency,['SGD','MYR']) || !oneOf(value.kind,['exchange','withdrawal','refund','adjustment']) || !finite(value.amountMinor) || Math.round(value.amountMinor) !== value.amountMinor || Math.abs(value.amountMinor) > MAX_MINOR || !finite(value.feeMinor) || Math.round(value.feeMinor) !== value.feeMinor || value.feeMinor < 0 || value.feeMinor > MAX_MINOR || !(value.feeEurMinor === null || finite(value.feeEurMinor) && Math.round(value.feeEurMinor) === value.feeEurMinor && value.feeEurMinor >= 0 && value.feeEurMinor <= MAX_MINOR) || (value.eurMinor !== undefined && !(value.eurMinor === null || finite(value.eurMinor) && Math.round(value.eurMinor) === value.eurMinor && Math.abs(value.eurMinor) <= MAX_MINOR)) || !str(value.notes,5000)) fail('cash movement is invalid');
  const rate = value.rate === undefined ? undefined : value.rate === null || finite(value.rate) && value.rate > 0 && value.rate <= 1_000_000 ? value.rate : fail('cash rate is invalid');
  return { id:value.id,date:value.date,time:value.time,currency:value.currency,kind:value.kind,amountMinor:value.amountMinor,feeMinor:value.feeMinor,feeEurMinor:value.feeEurMinor, ...(rate === undefined ? {} : {rate}), ...(value.eurMinor === undefined ? {} : {eurMinor:value.eurMinor as number | null}),notes:value.notes };
}

function parseRevision(value: unknown): RecordRevision {
  if (!record(value) || !str(value.revision,200) || value.revision.length < 1 || !Array.isArray(value.parents) || value.parents.length > MAX_REVISIONS_PER_RECORD || value.parents.some(parent => !str(parent,200) || !parent) || new Set(value.parents).size !== value.parents.length || !validIso(value.createdAt) || !validIso(value.updatedAt) || !id(value.source) || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || typeof value.deleted !== 'boolean') fail('record revision is invalid');
  if (value.parents.includes(value.revision)) fail('record revision cannot parent itself');
  return { revision:value.revision,parents:[...value.parents],createdAt:value.createdAt,updatedAt:value.updatedAt,source:value.source,version:value.version as number,deleted:value.deleted };
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function parseMeta(value: unknown): State['meta'] {
  if (!record(value) || !id(value.deviceId) || !record(value.records) || Object.keys(value.records).length > 10_000) fail('sync metadata is invalid');
  const revisions: State['meta']['records'] = {};
  for (const [key, revision] of Object.entries(value.records)) {
    if (!recordKey(key)) fail('sync record key is invalid');
    revisions[key] = parseRevision(revision);
  }
  return { deviceId:value.deviceId,records:revisions };
}

function unique(values: string[], label: string): void { if (new Set(values).size !== values.length) fail(`duplicate ${label} id`); }
function canonical(value: unknown): string { return JSON.stringify(sortKeys(value)); }
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key,sortKeys(value[key])]));
}

function stableHash(value: string): string {
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let i=0;i<value.length;i++) { const code=value.charCodeAt(i); first=Math.imul(first^code,0x01000193); second=Math.imul(second+code,0x85ebca6b); }
  return `${(first>>>0).toString(16).padStart(8,'0')}${(second>>>0).toString(16).padStart(8,'0')}`;
}

export function createDeviceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
}

export function recordKeyFor(kind: RecordKind, recordId: string): string { return `${kind}:${recordId}`; }

function baselineRevision(kind: RecordKind, recordId: string, value: unknown): RecordRevision {
  return { revision:`base:${kind}:${recordId}:${stableHash(canonical(value))}`,parents:[],createdAt:BASE_REVISION_DATE,updatedAt:BASE_REVISION_DATE,source:'base',version:0,deleted:false };
}

function initialMeta(state: Omit<State,'meta'>, deviceId: string): State['meta'] {
  const records: State['meta']['records'] = {};
  const groups: Array<[RecordKind,string,unknown]> = [];
  state.activities.forEach(item => groups.push(['activity',item.id,item]));
  state.customPlaces.forEach(item => groups.push(['place',item.id,item]));
  state.notes.forEach(item => groups.push(['note',item.id,item]));
  state.expenses.forEach(item => groups.push(['expense',item.id,item]));
  state.favorites.forEach(item => groups.push(['favorite',item,item]));
  state.checks.forEach(item => groups.push(['check',item,item]));
  state.cash.forEach(item => groups.push(['cash',item.id,item]));
  state.budgets.forEach(item => groups.push(['budget',item.id,item]));
  state.trash.forEach(item => groups.push(['trash',item.id,item]));
  state.triedDishes.forEach(item => groups.push(['dish',item,item]));
  Object.entries(state.dayPreferences).forEach(([day,preference]) => groups.push(['dayPreference',day,preference]));
  groups.forEach(([kind,recordId,value]) => records[recordKeyFor(kind,recordId)] = baselineRevision(kind,recordId,value));
  records['settings:budget'] = baselineRevision('settings','budget',state.budget);
  records['settings:rates'] = baselineRevision('settings','rates',{rates:state.rates,rateDates:state.rateDates ?? {SGD:null,MYR:null}});
  records['settings:appearance'] = baselineRevision('settings','appearance',{theme:state.theme,family:state.family});
  return { deviceId,records };
}

export function createInitialState(activities: Activity[], checks: string[], deviceId = createDeviceId()): State {
  const base = {
    version:2 as const,
    activities: activities.map(parseActivity), customPlaces:[], favorites:[], notes:[], expenses:[], budget:null, rates:{SGD:null,MYR:null}, rateDates:{SGD:null,MYR:null}, checks:[...checks], theme:'auto' as const, family:false,
    cash:[],budgets:[],trash:[],triedDishes:[],dayPreferences:{},
  };
  return { ...base, meta:initialMeta(base,deviceId) };
}

function updatedBaseRevision(kind: RecordKind, recordId: string, value: unknown, previous: RecordRevision): RecordRevision {
  if (previous.version >= Number.MAX_SAFE_INTEGER) fail('record version limit reached');
  return {
    ...baselineRevision(kind, recordId, value),
    revision: `base-update:${stableHash(canonical([kind, recordId, previous.revision, value]))}`,
    parents: [...new Set([previous.revision, ...previous.parents])].slice(0, MAX_REVISIONS_PER_RECORD),
    version: previous.version + 1,
  };
}

export function refreshBaseActivities(state: State, activityIds: readonly string[]): State {
  const allowed = new Set(activityIds);
  const updates = new Map(baseActivities.filter(item => allowed.has(item.id)).map(item => [item.id, parseActivity(item)]));
  const records = { ...state.meta.records };
  let changed = false;
  const activities = state.activities.map(item => {
    const next = updates.get(item.id);
    const key = recordKeyFor('activity', item.id);
    const revision = records[key];
    if (!next || revision?.source !== 'base' || revision.deleted) return item;
    changed ||= canonical(item) !== canonical(next);
    if (canonical(item) !== canonical(next)) records[key] = updatedBaseRevision('activity', item.id, next, revision);
    return next;
  });
  for (const [id, item] of updates) {
    const key = recordKeyFor('activity', id);
    if (activities.some(entry => entry.id === id) || records[key]) continue;
    activities.push(item);
    records[key] = baselineRevision('activity', id, item);
    changed = true;
  }
  return changed ? { ...state, activities, meta: { ...state.meta, records } } : state;
}

function parseDayPreference(date: string, value: unknown): DayPreference {
  const activeB = record(value) && value.active === 'B';
  const entries = activeB ? value.preferences : value;
  if (!tripDate(date) || !Array.isArray(entries) || entries.length > 20 || entries.some(item => !oneOf(item,['quiet','normal','intense','rain','children','culture','food','walking']))) fail('day preference is invalid');
  const preferences = [...new Set(entries as string[])];
  if (preferences.length !== entries.length) fail('duplicate day preference');
  return activeB ? { preferences, active: 'B' } : preferences;
}

function validateStateV2(value: unknown, knownPlaceIds?: string[]): State {
  if (!record(value) || value.version !== 2) fail('unsupported state version');
  const activities = arrayOf(value.activities,'activities',parseActivity);
  const customPlaces = arrayOf(value.customPlaces,'customPlaces',parsePlace);
  const notes = arrayOf(value.notes,'notes',parseNote);
  const expenses = arrayOf(value.expenses,'expenses',parseExpense);
  const favorites = arrayOf(value.favorites,'favorites',item => { if (!id(item)) fail('favorite id is invalid'); return item; });
  const checks = arrayOf(value.checks,'checks',item => { if (!str(item,200) || !item) fail('check item is invalid'); return item; });
  const cash = arrayOf(value.cash,'cash',parseCash);
  const budgets = arrayOf(value.budgets,'budgets',parseBudget);
  const trash = arrayOf(value.trash,'trash',parseActivity);
  const triedDishes = arrayOf(value.triedDishes,'triedDishes',item => { if (!id(item)) fail('tried dish id is invalid'); return item; });
  if (!record(value.dayPreferences) || Object.keys(value.dayPreferences).length > LIMITS.dayPreferences) fail('day preferences are invalid');
  const dayPreferences = Object.fromEntries(Object.entries(value.dayPreferences).map(([date, preferences]) => [date, parseDayPreference(date, preferences)]));
  unique(activities.map(item=>item.id),'activity'); unique(customPlaces.map(item=>item.id),'place'); unique(notes.map(item=>item.id),'note'); unique(expenses.map(item=>item.id),'expense'); unique(favorites,'favorite'); unique(checks,'check'); unique(cash.map(item=>item.id),'cash'); unique(budgets.map(item=>item.id),'budget'); unique(trash.map(item=>item.id),'trash'); unique(triedDishes,'dish');
  if (activities.some(item => trash.some(removed => removed.id === item.id))) fail('an activity cannot be active and trashed');
  const known = new Set(knownPlaceIds ?? []);
  for (const place of customPlaces) if (known.has(place.id)) fail(`custom place duplicates a base place: ${place.id}`);
  const placesAvailable = new Set([...known,...customPlaces.map(place=>place.id)]);
  if (knownPlaceIds !== undefined) {
    for (const item of [...activities,...trash]) if (item.placeId && !placesAvailable.has(item.placeId)) fail(`unknown activity place: ${item.placeId}`);
    for (const item of notes) if (item.placeId && !placesAvailable.has(item.placeId)) fail(`unknown note place: ${item.placeId}`);
    for (const item of favorites) if (!placesAvailable.has(item)) fail(`unknown favorite place: ${item}`);
  }
  let budget: number | null;
  if (value.budget === null) budget=null; else if (finite(value.budget) && value.budget>=0 && value.budget<=1_000_000_000) budget=value.budget; else return fail('budget is invalid');
  if (!record(value.rates) || !(value.rates.SGD === null || finite(value.rates.SGD) && value.rates.SGD>0 && value.rates.SGD<=1_000_000) || !(value.rates.MYR === null || finite(value.rates.MYR) && value.rates.MYR>0 && value.rates.MYR<=1_000_000)) fail('rates are invalid');
  const rateDatesRaw = value.rateDates === undefined ? {SGD:null,MYR:null} : value.rateDates;
  if (!record(rateDatesRaw) || !(['SGD','MYR'] as const).every(currency => rateDatesRaw[currency] === null || typeof rateDatesRaw[currency] === 'string' && tripDate(rateDatesRaw[currency]))) fail('rate dates are invalid');
  if (!oneOf(value.theme,['auto','light','dark']) || typeof value.family !== 'boolean') fail('settings are invalid');
  const meta = parseMeta(value.meta);
  const active = new Map<string,unknown>();
  activities.forEach(item=>active.set(recordKeyFor('activity',item.id),item));
  customPlaces.forEach(item=>active.set(recordKeyFor('place',item.id),item));
  notes.forEach(item=>active.set(recordKeyFor('note',item.id),item));
  expenses.forEach(item=>active.set(recordKeyFor('expense',item.id),item));
  favorites.forEach(item=>active.set(recordKeyFor('favorite',item),item));
  checks.forEach(item=>active.set(recordKeyFor('check',item),item));
  cash.forEach(item=>active.set(recordKeyFor('cash',item.id),item));
  budgets.forEach(item=>active.set(recordKeyFor('budget',item.id),item));
  trash.forEach(item=>active.set(recordKeyFor('trash',item.id),item));
  triedDishes.forEach(item=>active.set(recordKeyFor('dish',item),item));
  Object.entries(dayPreferences).forEach(([day,preference])=>active.set(recordKeyFor('dayPreference',day),preference));
  active.set('settings:budget',budget);
  active.set('settings:rates',{rates:value.rates,rateDates:rateDatesRaw});
  active.set('settings:appearance',{theme:value.theme,family:value.family});
  for (const [key] of active) {
    const revision = meta.records[key];
    if (!revision || revision.deleted) fail(`missing live revision: ${key}`);
    if (!revision.revision.startsWith('base:') && revision.version < 1) fail(`invalid live revision version: ${key}`);
  }
  for (const [key,revision] of Object.entries(meta.records)) {
    if (revision.deleted && active.has(key)) fail(`deleted record is still present: ${key}`);
    if (!revision.deleted && !active.has(key)) fail(`live record is missing: ${key}`);
    if (revision.parents.length > MAX_REVISIONS_PER_RECORD) fail('record ancestry is too deep');
  }
  return { version:2,activities,customPlaces,favorites,notes,expenses,budget,rates:{SGD:value.rates.SGD as number|null,MYR:value.rates.MYR as number|null},rateDates:{SGD:rateDatesRaw.SGD as string|null,MYR:rateDatesRaw.MYR as string|null},checks,theme:value.theme,family:value.family,cash,budgets,trash,triedDishes,dayPreferences,meta };
}

export function validateState(value: unknown, knownPlaceIds?: string[]): State {
  if (record(value) && value.version === 1) return migrateV1(value,knownPlaceIds);
  return validateStateV2(value,knownPlaceIds);
}

function legacyObject(value: unknown): Record<string,unknown> {
  if (!record(value) || value.version !== 1) fail('unsupported legacy version');
  return value;
}

function migrateV1(value: unknown, knownPlaceIds?: string[], deviceId = createDeviceId()): State {
  const old=legacyObject(value);
  const list = (field:string): unknown[] => Array.isArray(old[field]) && old[field].length <= 1000 ? old[field] as unknown[] : fail(`legacy ${field} is invalid`);
  const activities=list('activities').map(parseActivity);
  const customPlaces=list('customPlaces').map(parsePlace);
  const notes=list('notes').map(parseNote);
  const oldRates=record(old.rates)?old.rates:{};
  const rate = (currency:Currency):number|null => currency === 'EUR' ? 1 : finite(oldRates[currency]) && (oldRates[currency] as number)>0 ? oldRates[currency] as number : null;
  const expenses=list('expenses').map(raw=>{
    const expense=parseExpense(raw);
    const historicalRate=rate(expense.currency);
    const equivalent=historicalRate===null?null:Math.round(expense.amountMinor!*historicalRate);
    return { ...expense,rate:historicalRate,eurMinor:equivalent,phase:(expense.date<'2026-12-03'?'prepaid':'destination') as Expense['phase'] };
  });
  const favorites=list('favorites').filter(id);
  const checks=list('checks').filter((item):item is string=>str(item,200));
  const budget:number|null = old.budget === null || finite(old.budget) ? old.budget as number|null : null;
  const partial={ version:2 as const, activities,customPlaces,notes,expenses,favorites,budget,rates:{ SGD:finite(oldRates.SGD)?oldRates.SGD:null,MYR:finite(oldRates.MYR)?oldRates.MYR:null },checks,theme:oneOf(old.theme,['auto','light','dark'])?old.theme:'auto' as const,family:typeof old.family==='boolean'?old.family:false,cash:[],budgets:[],trash:[],triedDishes:[],dayPreferences:{} };
  const meta=initialMeta(partial,deviceId);
  const baseMap=new Map(baseActivities.map(item=>[item.id,item]));
  for(const item of activities) {
    const key=recordKeyFor('activity',item.id), baseline=baseMap.get(item.id);
    if(baseline && canonical(item)!==canonical(baseline)) {
      const base=baselineRevision('activity',item.id,parseActivity(baseline));
      meta.records[key]=legacyRevision('activity',item.id,item,deviceId,[base.revision]);
    } else meta.records[key]=baselineRevision('activity',item.id,item);
  }
  for(const item of customPlaces) meta.records[recordKeyFor('place',item.id)]=legacyRevision('place',item.id,item,deviceId,[]);
  for(const item of notes) meta.records[recordKeyFor('note',item.id)]=legacyRevision('note',item.id,item,deviceId,[]);
  for(const item of expenses) meta.records[recordKeyFor('expense',item.id)]=legacyRevision('expense',item.id,item,deviceId,[]);
  for(const item of favorites) meta.records[recordKeyFor('favorite',item)]=legacyRevision('favorite',item,item,deviceId,[]);
  for(const item of checks) meta.records[recordKeyFor('check',item)]=legacyRevision('check',item,item,deviceId,[]);
  for(const [key,setting] of [['settings:budget',budget],['settings:rates',partial.rates],['settings:appearance',{theme:partial.theme,family:partial.family}]] as const) meta.records[key]=legacyRevision('settings',key,setting,deviceId,[meta.records[key].revision]);
  const migrated=validateStateV2({...partial,meta},knownPlaceIds);
  return migrated;
}

function legacyRevision(kind:RecordKind,recordId:string,value:unknown,source:string,parents:string[]):RecordRevision {
  const revision=`legacy:${kind}:${recordId}:${stableHash(canonical(value))}`;
  return { revision,parents:[...new Set(parents)].slice(-MAX_REVISIONS_PER_RECORD),createdAt:BASE_REVISION_DATE,updatedAt:BASE_REVISION_DATE,source,version:parents.length?1:1,deleted:false };
}

export function parseBackup(text: string, knownPlaceIds?: string[]): State {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) fail('backup is too large');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return fail('backup is not valid JSON'); }
  return validateState(parsed, knownPlaceIds);
}

export function serializeBackup(state: State, knownPlaceIds?: string[]): string {
  const validated=validateStateV2(state,knownPlaceIds);
  const text=JSON.stringify(validated,null,2);
  if(new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES) fail('backup is too large');
  return text;
}

function browserStorage(): StorageLike | undefined { try { return globalThis.localStorage; } catch { return undefined; } }

export function loadState(storage: StorageLike | undefined = browserStorage(), knownPlaceIds?: string[]): LoadResult {
  if(!storage) return {state:null,status:'unavailable'};
  let raw:string|null;
  try { raw=storage.getItem(STORAGE_KEY); } catch { return {state:null,status:'unavailable'}; }
  if(raw===null) return {state:null,status:'empty'};
  try {
    const parsed=JSON.parse(raw) as unknown;
    const migrated=record(parsed) && parsed.version===1;
    const state=validateState(parsed,knownPlaceIds);
    if(migrated && !saveState(state,storage,knownPlaceIds)) return {state,status:'ok',migrated:true};
    return {state,status:'ok',...(migrated?{migrated:true}:{})};
  } catch { return {state:null,status:'corrupt'}; }
}

export function saveState(state:State,storage:StorageLike|undefined=browserStorage(),knownPlaceIds?:string[]):boolean {
  if(!storage) return false;
  try { storage.setItem(STORAGE_KEY,serializeBackup(state,knownPlaceIds)); return true; } catch { return false; }
}

function causalParents(previous?:RecordRevision):string[] {
  if(!previous) return [];
  return [...new Set([previous.revision,...previous.parents])].slice(0,MAX_REVISIONS_PER_RECORD);
}

export function newRevision(source:string,previous:RecordRevision|undefined,deleted:boolean,now=new Date()):RecordRevision {
  const parents=causalParents(previous);
  if((previous?.version??0)>=Number.MAX_SAFE_INTEGER) fail('record version limit reached');
  return {revision:`rev:${createDeviceId()}`,parents,createdAt:previous?.createdAt??now.toISOString(),updatedAt:now.toISOString(),source,version:(previous?.version??0)+1,deleted};
}

type Entity = {key:string;value:unknown;deleted:boolean};
export function entities(state:State):Map<string,Entity> {
  const result=new Map<string,Entity>();
  const put=(kind:RecordKind,recordId:string,value:unknown)=>{const key=recordKeyFor(kind,recordId);result.set(key,{key,value,deleted:false});};
  state.activities.forEach(x=>put('activity',x.id,x)); state.customPlaces.forEach(x=>put('place',x.id,x)); state.notes.forEach(x=>put('note',x.id,x)); state.expenses.forEach(x=>put('expense',x.id,x));
  state.favorites.forEach(x=>put('favorite',x,x));state.checks.forEach(x=>put('check',x,x));state.cash.forEach(x=>put('cash',x.id,x));state.budgets.forEach(x=>put('budget',x.id,x));state.trash.forEach(x=>put('trash',x.id,x));state.triedDishes.forEach(x=>put('dish',x,x));
  Object.entries(state.dayPreferences).forEach(([date,preferences])=>put('dayPreference',date,preferences));
  put('settings','budget',state.budget);put('settings','rates',{rates:state.rates,rateDates:state.rateDates ?? {SGD:null,MYR:null}});put('settings','appearance',{theme:state.theme,family:state.family});
  return result;
}

export function applyEntity(state:State,key:string,value:unknown,deleted:boolean):State {
  const separator=key.indexOf(':');
  if(separator<1) fail('sync record key is invalid');
  const kind=key.slice(0,separator) as RecordKind;
  const recordId=key.slice(separator+1);
  const assertIdentity=(item:unknown):void=>{if(!record(item)||item.id!==recordId)fail('sync record id does not match its key');};
  const removeById=<T extends {id:string}>(items:T[])=>items.filter(item=>item.id!==recordId);
  const include=<T extends {id:string}>(items:T[],item:T):T[]=>items.some(old=>old.id===item.id)?items.map(old=>old.id===item.id?item:old):[...items,item];
  if(kind==='activity') {const item=deleted?undefined:parseActivity(value);if(item)assertIdentity(item);return {...state,activities:deleted?removeById(state.activities):include(state.activities,item!)};}
  if(kind==='place') {const item=deleted?undefined:parsePlace(value);if(item)assertIdentity(item);return {...state,customPlaces:deleted?removeById(state.customPlaces):include(state.customPlaces,item!)};}
  if(kind==='note') {const item=deleted?undefined:parseNote(value);if(item)assertIdentity(item);return {...state,notes:deleted?removeById(state.notes):include(state.notes,item!)};}
  if(kind==='expense') {const item=deleted?undefined:parseExpense(value);if(item)assertIdentity(item);return {...state,expenses:deleted?removeById(state.expenses):include(state.expenses,item!)};}
  if(kind==='cash') {const item=deleted?undefined:parseCash(value);if(item)assertIdentity(item);return {...state,cash:deleted?removeById(state.cash):include(state.cash,item!)};}
  if(kind==='budget') {const item=deleted?undefined:parseBudget(value);if(item)assertIdentity(item);return {...state,budgets:deleted?removeById(state.budgets):include(state.budgets,item!)};}
  if(kind==='trash') {const item=deleted?undefined:parseActivity(value);if(item)assertIdentity(item);return {...state,trash:deleted?removeById(state.trash):include(state.trash,item!)};}
  if(kind==='favorite') {if(!deleted&&value!==recordId)fail('favorite id does not match its key');return {...state,favorites:deleted?state.favorites.filter(item=>item!==recordId):[...new Set([...state.favorites,recordId])]};}
  if(kind==='check') {if(!deleted&&value!==recordId)fail('check id does not match its key');return {...state,checks:deleted?state.checks.filter(item=>item!==recordId):[...new Set([...state.checks,recordId])]};}
  if(kind==='dish') {if(!deleted&&value!==recordId)fail('dish id does not match its key');return {...state,triedDishes:deleted?state.triedDishes.filter(item=>item!==recordId):[...new Set([...state.triedDishes,recordId])]};}
  if(kind==='dayPreference') {
    const dayPreferences={...state.dayPreferences};
    if(deleted) delete dayPreferences[recordId]; else dayPreferences[recordId]=parseDayPreference(recordId,value);
    return {...state,dayPreferences};
  }
  if(kind==='settings' && recordId==='budget') return {...state,budget:deleted||value===null?null:finite(value)?value:fail('settings budget is invalid')};
  if(kind==='settings' && recordId==='rates') {
    const rates = record(value) && record(value.rates) ? value.rates : value;
    const dates = record(value) && record(value.rateDates) ? value.rateDates : {SGD:null,MYR:null};
    if(!record(rates)||!(rates.SGD===null||finite(rates.SGD))||!(rates.MYR===null||finite(rates.MYR))||!record(dates)||!(dates.SGD===null||typeof dates.SGD==='string'&&tripDate(dates.SGD))||!(dates.MYR===null||typeof dates.MYR==='string'&&tripDate(dates.MYR))) fail('settings rates are invalid');
    return {...state,rates:{SGD:rates.SGD as number|null,MYR:rates.MYR as number|null},rateDates:{SGD:dates.SGD as string|null,MYR:dates.MYR as string|null}};
  }
  if(kind==='settings' && recordId==='appearance') {
    if(!record(value)||!oneOf(value.theme,['auto','light','dark'])||typeof value.family!=='boolean') fail('settings appearance is invalid');
    return {...state,theme:value.theme,family:value.family};
  }
  return fail('unsupported sync record kind');
}

export function stampChanges(before:State,next:State,deviceId=next.meta.deviceId,now=new Date()):State {
  const old=entities(before), current=entities(next), records={...next.meta.records};
  for(const [key,entity] of current) {
    const oldEntity=old.get(key), oldRevision=before.meta.records[key];
    const currentRevision=next.meta.records[key]??oldRevision;
    if(!oldEntity || canonical(oldEntity.value)!==canonical(entity.value) || !currentRevision) records[key]=newRevision(deviceId,oldRevision,false,now);
    else records[key]=currentRevision;
  }
  for(const [key] of old) if(!current.has(key)) {
    const oldRevision=before.meta.records[key];
    if(oldRevision && !oldRevision.deleted) records[key]=newRevision(deviceId,oldRevision,true,now);
  }
  return {...next,meta:{deviceId,records}};
}

export function escapeHTML(value:string):string { return value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character] as string); }
export function toSafeCSVCell(value:unknown):string { let text=String(value??''),index=0;while(index<text.length){const code=text.charCodeAt(index);if(code<=0x20||code>=0x7f&&code<=0x9f||code===0xfeff||code>=0x200b&&code<=0x200d)index++;else break;}if('=+-@'.includes(text[index]??''))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`; }
export function convertAmount(amount:number,currency:Currency,rates:State['rates']):number|null { if(!Number.isFinite(amount))return null;if(currency==='EUR')return amount;const rate=rates[currency];return rate===null||!Number.isFinite(rate)||rate<=0?null:amount*rate; }
export function asiaDate(now=new Date()):string { return new Date(now.valueOf()+8*60*60_000).toISOString().slice(0,10); }
