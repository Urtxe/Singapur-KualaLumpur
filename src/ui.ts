import { days, places } from './data'
import { guidePlaces } from './guide-data'
import { asiaDate, escapeHTML } from './state'
import type { Activity, Day, Place, State } from './types'

export const primaryRoutes = ['inicio', 'agenda', 'lugares', 'gastos', 'mas'] as const
export const extraRoutes = ['eventos', 'gastronomia', 'transporte', 'viaje', 'compartir', 'diario', 'preparativos', 'offline', 'documentos', 'emergencias'] as const
export const routes = [...primaryRoutes, ...extraRoutes] as const
export type Route = typeof routes[number]
export const labels: Record<Route, string> = { inicio: 'Hoy', agenda: 'Planes', lugares: 'Explorar', transporte: 'Transporte', diario: 'Diario', viaje: 'Vuelos y hoteles', mas: 'Más', preparativos: 'Preparativos', eventos: 'Agenda local', gastronomia: 'Gastronomía', gastos: 'Gastos', compartir: 'Compartir e importar', offline: 'Diagnóstico offline', documentos: 'Documentos', emergencias: 'Emergencias' }
export const city = { sg: 'Singapur', kl: 'Kuala Lumpur', air: 'En ruta' }
export const kind = { must: 'Imprescindible', food: 'Comida', optional: 'Opcional', hotel: 'Hotel', airport: 'Aeropuerto', station: 'Estación', medical: 'Centro médico' }
export const e = (value: unknown) => escapeHTML(String(value ?? ''))

const paths: Record<string, string> = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  inicio: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
  lugares: '<path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  transporte: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21l2-3m6 3-2-3M9 14h.01m6 0h.01"/>',
  diario: '<path d="M5 4h12a2 2 0 0 1 2 2v14H6a3 3 0 0 1 0-6h13M6 4a2 2 0 0 0-2 2v11m5-9h6"/>',
  viaje: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 7V4h6v3m-6 4v6m6-6v6"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3M17 4a3 3 0 0 1 0 6m4 10v-3a4 4 0 0 0-3-4"/>',
  hotel: '<path d="M3 18v-8m18 8v-5a2 2 0 0 0-2-2h-5v5m-11 0h18M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plane: '<path d="m17 21 2-2-4-6 4-4c2-2 2-4 1-5s-3-1-5 1l-4 4-6-4-2 2 6 6-3 3-3-1-1 2 4 2 2 4 2-1-1-3 3-3z"/>',
  wifi: '<path d="M3 9a15 15 0 0 1 18 0M6 13a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 4h.01"/>',
  alert: '<path d="M10 4a2.3 2.3 0 0 1 4 0l7 13a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3zM12 9v4m0 3h.01"/>',
  shield: '<path d="m12 3 8 3v5c0 4-3 7-8 10-5-3-8-6-8-10V6l8-3zM9 12l2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3L3 9.6l6.2-.9z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15A8 8 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  wallet: '<path d="M20 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3M3 8h15m-1 2h5v6h-5a3 3 0 0 1 0-6m1 3h.01"/>',
  rain: '<path d="M5 15a4 4 0 0 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 1 6M8 16l-2 4m7-4-2 4m7-4-2 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  eventos: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  gastronomia: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18m8-3h4m0 3V3c-3 2-4 6-4 10h4"/>',
  gastos: '<path d="M20 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3M3 8h15m-1 2h5v6h-5a3 3 0 0 1 0-6m1 3h.01"/>',
  compartir: '<path d="M12 16V3m-4 4 4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
  offline: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  emergencias: '<path d="m12 3 8 3v5c0 4-3 7-8 10-5-3-8-6-8-10V6l8-3zM9 12h6m-3-3v6"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4-4 3 3 4-5 5 6"/>',
  mas: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  settings: '<path d="M4 7h16M4 12h16M4 17h16M9 5v4m6 1v4m-5 1v4"/>',
  document: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h4m-9 5h5m-5 4h5"/>',
  preparativos: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-6 9 2 2 4-5"/>',
  navigation: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5"/>',
}
export const icon = (name: string, cls = '') => `<svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.compass}</svg>`
export const dateShort = (date: string) => `${Number(date.slice(-2))} dic`
export function dateLong(date: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
export function dayOptions(selected: string) {
  return days.map(day => option(day.date, `${dateShort(day.date)} · ${day.title}`, selected)).join('') +
    (selected && !days.some(day => day.date === selected) ? option(selected, dateLong(selected), selected) : '')
}
export function option(value: string, label: string, selected: string) {
  return `<option value="${e(value)}"${selected === value ? ' selected' : ''}>${e(label)}</option>`
}
export function placeOptions(state: State, selected: string) {
  return option('', 'Sin lugar asociado', selected) + allPlaces(state).map(place => option(place.id, `${place.name} · ${city[place.city]}`, selected)).join('')
}
export const publicPlaces = [...places, ...guidePlaces]
export const allPlaces = (state: State) => [...publicPlaces, ...state.customPlaces]
export const getPlace = (state: State, id: string) => allPlaces(state).find(place => place.id === id)
export const getDay = (date: string) => days.find(day => day.date === date) ?? days[0]
export const cityHotel = (location: Place['city']) => location === 'sg' ? 'mi-rochor' : 'star-residence'
export function activeDay(now: Date): Day | undefined { return days.find(day => day.date === asiaDate(now)) }
export function planningDay(now: Date) {
  return activeDay(now)?.date ?? (asiaDate(now) < days[0].date ? days[0].date : '2026-12-04')
}

export function dayPreference(state: State, date: string): { preferences: string[]; active: 'A' | 'B' } {
  const value = state.dayPreferences[date]
  return value && !Array.isArray(value) ? value : { preferences: value ?? [], active: 'A' }
}

export function withDayPreference(state: State, date: string, update: Partial<ReturnType<typeof dayPreference>>): State {
  const { active, preferences } = { ...dayPreference(state, date), ...update }
  const dayPreferences = { ...state.dayPreferences }
  if (active === 'B') dayPreferences[date] = { preferences, active }
  else if (preferences.length) dayPreferences[date] = preferences
  else delete dayPreferences[date]
  return { ...state, dayPreferences }
}

export const activePlan = (state: State, date: string) => dayPreference(state, date).active

export function activitiesForPlan(state: State, date: string, plan: 'A' | 'B'): Activity[] {
  const entries = state.activities.filter(item => item.date === date && !item.archived)
  const ordered = entries.filter(item => (item.plan ?? 'A') === plan)
  if (plan === 'A') return ordered
  const common = entries.filter(item => item.plan !== 'B' && (item.fixed || item.flight))
  for (const item of common) {
    const firstLater = ordered.findIndex(other => !other.time || Boolean(item.time && other.time > item.time))
    ordered.splice(firstLater < 0 ? ordered.length : firstLater, 0, item)
  }
  return ordered
}

export function activeActivities(state: State, date?: string): Activity[] {
  if (date) return activitiesForPlan(state, date, activePlan(state, date))
  return [...new Set(state.activities.map(item => item.date).filter(Boolean))].flatMap(day => activeActivities(state, day))
}
export const tripStart = Date.parse('2026-12-03T11:55:00+01:00')
export function currentHotel(state: State, now: Date) {
  const date = asiaDate(now)
  if (date > '2026-12-11') return undefined
  return getPlace(state, now.valueOf() >= Date.parse('2026-12-07T16:10:00+08:00') ? 'star-residence' : 'mi-rochor')
}
export const placeQuery = (place: Place) => `${place.name}, ${place.address}, ${city[place.city]}`
export function directDistance(a: Pick<Place, 'lat'|'lon'>, b: Pick<Place, 'lat'|'lon'>) {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return null
  const rad = Math.PI / 180
  const h = Math.sin((a.lat - b.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((a.lon - b.lon) * rad / 2) ** 2
  return 12_742 * Math.asin(Math.sqrt(Math.min(1, h)))
}
export function mapSearch(place: Place) {
  const params = new URLSearchParams({ api: '1', query: placeQuery(place) })
  return `https://www.google.com/maps/search/?${params}`
}
export function directions(destination: Place, origin: string, mode: string) {
  const params = new URLSearchParams({ api: '1', destination: placeQuery(destination), origin, travelmode: mode })
  return `https://www.google.com/maps/dir/?${params}`
}
export const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
export const sourceLink = (url?: string, label = 'Fuente oficial') => url?.startsWith('https://') ? `<a class="text-link" href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : ''
export const button = (label: string, action: string, image = '', cls = '', id = '') => `<button type="button" class="button ${cls}" data-action="${action}"${id ? ` data-id="${e(id)}"` : ''}>${image ? icon(image) : ''}${e(label)}</button>`
export const title = (name: string, description: string, actions = '') => `<header class="page-head"><div><h1>${e(name)}</h1><p>${e(description)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</header>`
export function offlineText(ready: boolean) {
  if (ready) return navigator.onLine ? 'Listo offline' : 'Modo offline'
  return navigator.onLine ? 'Con conexión' : 'Sin conexión'
}
