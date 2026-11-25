import { days, places } from './data'
import { asiaDate, escapeHTML } from './state'
import type { Activity, Day, Place, State } from './types'

export const routes = ['inicio', 'agenda', 'lugares', 'transporte', 'diario', 'viaje'] as const
export type Route = typeof routes[number]
export const labels: Record<Route, string> = { inicio: 'Inicio', agenda: 'Agenda', lugares: 'Lugares', transporte: 'Transporte', diario: 'Diario', viaje: 'Viaje' }
export const city = { sg: 'Singapur', kl: 'Kuala Lumpur', air: 'En ruta' }
export const kind = { must: 'Imprescindible', food: 'Comida', optional: 'Opcional', hotel: 'Hotel', airport: 'Aeropuerto' }
export const statuses = { pending: 'Pendiente', done: 'Realizado', skipped: 'Omitido' }
export const categories = ['Comida', 'Transporte', 'Entradas', 'Alojamiento', 'Compras', 'Otros']
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
  moon: '<path d="M20 15A8 8 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  wallet: '<path d="M20 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3M3 8h15m-1 2h5v6h-5a3 3 0 0 1 0-6m1 3h.01"/>',
  rain: '<path d="M5 15a4 4 0 0 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 1 6M8 16l-2 4m7-4-2 4m7-4-2 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
}
export const icon = (name: string, cls = '') => `<svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.compass}</svg>`
export const dateShort = (date: string) => `${Number(date.slice(-2))} dic`
export function dateLong(date: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
export function dayOptions(selected: string) {
  return days.map(day => option(day.date, `${dateShort(day.date)} · ${day.title}`, selected)).join('')
}
export function option(value: string, label: string, selected: string) {
  return `<option value="${e(value)}"${selected === value ? ' selected' : ''}>${e(label)}</option>`
}
export function placeOptions(state: State, selected: string) {
  return option('', 'Sin lugar asociado', selected) + [...places, ...state.customPlaces].map(place => option(place.id, `${place.name} · ${city[place.city]}`, selected)).join('')
}
export const allPlaces = (state: State) => [...places, ...state.customPlaces]
export const getPlace = (state: State, id: string) => allPlaces(state).find(place => place.id === id)
export const getDay = (date: string) => days.find(day => day.date === date) ?? days[0]
export const cityHotel = (location: Place['city']) => location === 'sg' ? 'mi-rochor' : 'star-residence'
export function activeDay(now: Date): Day | undefined { return days.find(day => day.date === asiaDate(now)) }
export function planningDay(now: Date) { return activeDay(now)?.date ?? '2026-12-04' }
export const tripStart = Date.parse('2026-12-03T11:55:00+01:00')
export const tripEnd = Date.parse('2026-12-12T11:20:00+01:00')
export function activityInstant(activity: Activity) {
  const european = activity.date === '2026-12-03' || activity.date === '2026-12-12'
  return Date.parse(`${activity.date}T${activity.time}:00${european ? '+01:00' : '+08:00'}`)
}
export function nextActivity(state: State, now: Date) {
  return state.activities.filter(item => item.status === 'pending' && activityInstant(item) >= +now)
    .sort((a, b) => activityInstant(a) - activityInstant(b))[0]
}
export function currentHotel(state: State, now: Date) {
  const date = asiaDate(now)
  if (date > '2026-12-11') return undefined
  return getPlace(state, now.valueOf() >= Date.parse('2026-12-07T16:10:00+08:00') ? 'star-residence' : 'mi-rochor')
}
export const placeQuery = (place: Place) => `${place.name}, ${place.address}, ${city[place.city]}`
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
export function offlineText(ready: boolean) { return !navigator.onLine ? (ready ? 'Modo offline' : 'Sin conexión') : ready ? 'Disponible offline' : 'Preparando offline' }
