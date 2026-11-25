import type { Activity, Currency, Place, State } from './types'
import type { AppContext } from './app-api'
import { budgetSpent, financeTotals } from './finance'
import { placeGuides } from './guide-data'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const currency = (value: unknown): Currency => value === 'SGD' || value === 'MYR' ? value : 'EUR'
const makeId = () => `activity-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const todayAsia = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const readSession = (key: string) => { try { return sessionStorage.getItem(key) ?? '' } catch { return '' } }
const writeSession = (key: string, value: string) => { try { sessionStorage.setItem(key, value) } catch { /* Selection is a convenience; the itinerary itself is saved separately. */ } }
const minute = (time: string) => /^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null
const formatPrice = (amount: number | null | undefined, unit: string) => amount == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: unit }).format(amount)
const baseActivity = (seed: Partial<Activity> = {}): Activity => ({
  id: seed.id ?? makeId(), date: seed.date ?? '', title: seed.title ?? '', time: seed.time ?? '', duration: seed.duration ?? 60,
  placeId: seed.placeId ?? '', zone: seed.zone ?? '', effort: seed.effort ?? 'bajo', priority: seed.priority ?? 'opcional', status: seed.status ?? 'pending',
  food: seed.food ?? '', tickets: seed.tickets ?? '', rain: seed.rain ?? '', detail: seed.detail ?? '', fromHotel: seed.fromHotel ?? '', fromPrevious: seed.fromPrevious ?? '',
  ...(seed as object),
})

export type PlannerWarning = { kind: 'overlap' | 'rest' | 'busy' | 'distance'; activityIds: string[]; message: string }
const dialogControllers = new WeakMap<HTMLDialogElement, AbortController>()

export function plannerWarnings(items: Activity[], places: Place[]): PlannerWarning[] {
  const warnings: PlannerWarning[] = []
  const scheduled = items.filter(item => !item.archived && item.status !== 'skipped' && minute(item.time) !== null)
    .sort((a, b) => minute(a.time)! - minute(b.time)!)
  for (let i = 0; i < scheduled.length; i++) {
    const current = scheduled[i]
    const end = minute(current.time)! + current.duration
    if (i && minute(current.time)! < minute(scheduled[i - 1].time)! + scheduled[i - 1].duration) {
      warnings.push({ kind: 'overlap', activityIds: [scheduled[i - 1].id, current.id], message: `Se solapa «${current.title}» con la actividad anterior.` })
    }
    if (i && minute(current.time)! - (minute(scheduled[i - 1].time)! + scheduled[i - 1].duration) < 30) {
      warnings.push({ kind: 'rest', activityIds: [scheduled[i - 1].id, current.id], message: `Deja al menos 30 minutos de margen antes de «${current.title}».` })
    }
    const from = places.find(place => place.id === scheduled[i - 1]?.placeId)
    const to = places.find(place => place.id === current.placeId)
    if (i && from?.lat != null && from.lon != null && to?.lat != null && to.lon != null) {
      const km = greatCircleKm(from.lat, from.lon, to.lat, to.lon)
      const gap = minute(current.time)! - (minute(scheduled[i - 1].time)! + scheduled[i - 1].duration)
      if (km > 8 && gap < 60) warnings.push({ kind: 'distance', activityIds: [scheduled[i - 1].id, current.id], message: `Hay unos ${Math.round(km)} km en línea recta hasta «${current.title}» y poco margen. La distancia real por carretera puede ser mayor.` })
    }
    void end
  }
  if (scheduled.length > 5) warnings.push({ kind: 'busy', activityIds: scheduled.map(item => item.id), message: 'El día tiene más de cinco actividades con hora. Valora dejar alguna como opcional.' })
  return warnings
}

export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function escapeAttr(value: unknown) { return esc(value).replace(/`/g, '&#96;') }
function dayLabel(date: string) { return date ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : 'Ideas' }
function activityBase(state: State, date: string, seed: Partial<Activity> = {}): Activity {
  const item = baseActivity({ date, ...seed })
  if (item.placeId) {
    const place = [...state.customPlaces, ...[]].find(entry => entry.id === item.placeId)
    if (place) item.zone ||= place.area
  }
  return item
}
function attrs(item: Activity) { return `data-item="${escapeAttr(item.id)}"` }
function button(action: string, label: string, id = '', cls = '') { return `<button type="button" class="pl-button ${cls}" data-pl-action="${action}"${id ? ` data-id="${escapeAttr(id)}"` : ''}>${label}</button>` }
function modeButton(mode: string, selected: string, label: string) { return `<button type="button" class="pl-mode${mode === selected ? ' is-active' : ''}" data-pl-action="mode" data-mode="${mode}" aria-pressed="${mode === selected}">${label}</button>` }
function planButton(plan: 'A' | 'B', selected: 'A' | 'B') { return `<button type="button" class="pl-mode${plan === selected ? ' is-active' : ''}" data-pl-action="plan" data-plan="${plan}" aria-pressed="${plan === selected}">Plan ${plan}</button>` }
function placeName(placeId: string, places: Place[]) { return places.find(place => place.id === placeId)?.name ?? '' }

function activityCard(item: Activity, index: number, count: number, app: AppContext, places: Place[]) {
  const place = places.find(entry => entry.id === item.placeId)
  const fixed = !!item.fixed || !!item.flight
  return `<article class="pl-activity${item.status === 'done' ? ' is-done' : ''}${item.priority === 'pausa' ? ' is-rest' : ''}" ${attrs(item)} draggable="true">
    <div class="pl-rail"><button class="pl-grip" type="button" aria-label="Arrastrar ${esc(item.title)}" data-pl-action="grab" data-id="${escapeAttr(item.id)}">⠿</button><span class="pl-time">${item.time ? esc(item.time) : '— —'}<small>${item.duration} min</small></span></div>
    <div class="pl-activity-body"><div class="pl-meta"><span>${esc(item.zone || place?.area || 'Sin zona')}</span>${item.flight === 'confirmed' ? '<b class="pl-fixed">VUELO CONFIRMADO</b>' : item.flight === 'provisional' ? '<b class="pl-plan-b">VUELO PROVISIONAL</b>' : ''}${fixed ? '<b class="pl-fixed">HORARIO FIJO</b>' : ''}${item.plan === 'B' ? '<b class="pl-plan-b">PLAN B</b>' : ''}</div><div class="pl-title-row"><h3>${esc(item.title || 'Actividad sin título')}</h3><select aria-label="Estado de ${esc(item.title)}" data-pl-action="status" data-id="${escapeAttr(item.id)}"><option value="pending"${item.status === 'pending' ? ' selected' : ''}>Pendiente</option><option value="done"${item.status === 'done' ? ' selected' : ''}>Realizada</option><option value="skipped"${item.status === 'skipped' ? ' selected' : ''}>Omitida</option></select></div>
    ${item.detail ? `<p class="pl-description">${esc(item.detail)}</p>` : ''}<div class="pl-tags">${item.priority === 'principal' ? '<span>Imprescindible</span>' : item.priority === 'pausa' ? '<span>Descanso</span>' : '<span>Opcional</span>'}${item.duration ? `<span>${item.duration} min</span>` : ''}${place ? `<span>${esc(place.name)}</span>` : ''}</div>
    <div class="pl-controls">${button('edit', 'Editar', item.id)}${button('duplicate', 'Duplicar', item.id)}${place ? `<button type="button" class="pl-button" data-pl-action="directions" data-id="${escapeAttr(item.id)}">Cómo llegar</button>` : ''}<span class="pl-reorder">${button('up', '↑', item.id, 'pl-icon')}${button('down', '↓', item.id, 'pl-icon')}</span><button type="button" class="pl-more" aria-label="Más opciones de ${esc(item.title)}" data-pl-action="more" data-id="${escapeAttr(item.id)}">•••</button></div>
    <div class="pl-more-menu" hidden>${button('archive', 'Archivar', item.id)}${button('delete', 'Eliminar y guardar en papelera', item.id)}</div></div></article>`
}

function formHTML(state: State, date: string, item?: Activity, places: Place[] = [], editing = !!item?.id) {
  const current = item ?? activityBase(state, date)
  const placeOpts = `<option value="">Sin lugar asociado</option>${places.map(place => `<option value="${escapeAttr(place.id)}"${place.id === current.placeId ? ' selected' : ''}>${esc(place.name)} · ${esc(place.area)}</option>`).join('')}`
  const currencies = (['EUR', 'SGD', 'MYR'] as Currency[]).map(value => `<option${value === currency(current.priceCurrency) ? ' selected' : ''}>${value}</option>`).join('')
  const field = (label: string, name: string, value: unknown, type = 'text', extra = '') => `<label class="pl-field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${extra}></label>`
  const area = (label: string, name: string, value: unknown) => {
    const limit = name === 'detail' ? 3000 : name === 'notes' ? 5000 : name === 'food' || name === 'tickets' || name === 'fromHotel' || name === 'fromPrevious' ? 1000 : 2000
    return `<label class="pl-field pl-wide"><span>${label}</span><textarea name="${name}" rows="2" maxlength="${limit}">${esc(value)}</textarea></label>`
  }
  const chosen = current.plan === 'B' ? 'B' : 'A'
  return `<form class="pl-form" data-pl-form="activity"><input type="hidden" name="id" value="${escapeAttr(current.id)}"><div class="pl-form-grid">
    ${field('Nombre','title',current.title,'text','required maxlength="200" autofocus')}${field('Fecha','date',current.date,'date')}${field('Hora de inicio','time',current.time,'time')}${field('Duración (min)','duration',current.duration,'number','min="1" max="1440"')}
    <label class="pl-field"><span>Lugar asociado</span><select name="placeId">${placeOpts}</select></label>${field('Zona','zone',current.zone)}<label class="pl-field"><span>Prioridad</span><select name="priority"><option value="principal"${current.priority === 'principal' ? ' selected' : ''}>Imprescindible</option><option value="opcional"${current.priority === 'opcional' ? ' selected' : ''}>Opcional</option><option value="pausa"${current.priority === 'pausa' ? ' selected' : ''}>Descanso</option></select></label><label class="pl-field"><span>Plan</span><select name="plan"><option value="A"${chosen === 'A' ? ' selected' : ''}>Plan A</option><option value="B"${chosen === 'B' ? ' selected' : ''}>Plan B</option></select></label>${field('Categoría','category',current.category)}
    <label class="pl-check"><input type="checkbox" name="fixed"${current.fixed ? ' checked' : ''}> Reserva u horario fijo</label><label class="pl-field"><span>Esfuerzo</span><select name="effort"><option value="bajo"${current.effort === 'bajo' ? ' selected' : ''}>Suave</option><option value="medio"${current.effort === 'medio' ? ' selected' : ''}>Moderado</option><option value="alto"${current.effort === 'alto' ? ' selected' : ''}>Intenso</option></select></label>
    ${field('Precio estimado','estimatedPrice',current.estimatedPrice ?? '','number','min="0" step="0.01" inputmode="decimal"')}${field('Precio real','actualPrice',current.actualPrice ?? '','number','min="0" step="0.01" inputmode="decimal"')}<label class="pl-field"><span>Moneda</span><select name="priceCurrency">${currencies}</select></label>${field('Latitud','lat',current.lat ?? '','number','step="any" min="-90" max="90"')}${field('Longitud','lon',current.lon ?? '','number','step="any" min="-180" max="180"')}
    ${field('Dirección','address',current.address)}${field('Transporte','transport',current.transport)}${field('Tiempo de trayecto (min)','journeyMinutes',current.journeyMinutes ?? '','number','min="0" max="1440"')}${field('Enlace oficial','officialUrl',current.officialUrl,'url')}${field('Google Maps','mapsUrl',current.mapsUrl,'url')}
    ${area('Descripción','detail',current.detail)}${area('Comida','food',current.food)}${area('Entradas','tickets',current.tickets)}${area('Reserva / información','booking',current.booking)}${area('Notas','notes',current.notes)}${area('Accesibilidad','access',current.access)}${area('Alternativa si llueve','alternate',current.alternate || current.rain)}${area('Trayecto desde el hotel','fromHotel',current.fromHotel)}${area('Trayecto desde la actividad anterior','fromPrevious',current.fromPrevious)}
    </div><div class="pl-form-actions"><button class="pl-button pl-primary" type="submit">Guardar actividad</button><button class="pl-button" type="button" data-pl-action="close">Cancelar</button>${editing ? `<button class="pl-button pl-danger" type="button" data-pl-action="delete" data-id="${escapeAttr(current.id)}">Eliminar</button>` : ''}</div></form>`
}

export function openActivity(app: AppContext, seed: Partial<Activity> = {}) {
  const date = seed.date ?? app.selectedDate()
  const dialog = app.openDialog(seed.id ? 'Editar actividad' : 'Nueva actividad', formHTML(app.getState(), date, baseActivity(seed), app.places(), !!seed.id))
  bindDialog(dialog, app)
  return dialog
}

function bindDialog(dialog: HTMLDialogElement, app: AppContext) {
  dialogControllers.get(dialog)?.abort()
  const controller = new AbortController()
  dialogControllers.set(dialog, controller)
  dialog.addEventListener('close', () => controller.abort(), { once: true })
  dialog.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pl-action]') : null
    if (!target) return
    const id = target.dataset.id ?? ''
    if (target.dataset.plAction === 'close') dialog.close()
    if (target.dataset.plAction === 'delete' && removeActivity(app, id, 'delete')) dialog.close()
  }, { signal: controller.signal })
  dialog.addEventListener('submit', event => {
    const form = event.target instanceof HTMLFormElement && event.target.matches('[data-pl-form="activity"]') ? event.target : null
    if (!form) return
    event.preventDefault()
    const data = new FormData(form)
    const raw = Object.fromEntries(data.entries())
    const old = app.getState().activities.find(item => item.id === String(raw.id))
    const val = (key: string) => String(raw[key] ?? '').trim()
    const num = (key: string) => val(key) === '' ? null : Number(val(key))
    const activity = baseActivity({ ...(old ?? {}), date: val('date'), title: val('title'), time: val('time'), duration: Number(val('duration')) || 60,
      placeId: val('placeId'), zone: val('zone'), priority: val('priority') as Activity['priority'], effort: val('effort') as Activity['effort'],
      fixed: raw.fixed === 'on', plan: val('plan') === 'B' ? 'B' : 'A', estimatedPrice: num('estimatedPrice'), actualPrice: num('actualPrice'), priceCurrency: currency(raw.priceCurrency),
      lat: num('lat'), lon: num('lon'), address: val('address'), transport: val('transport'), journeyMinutes: num('journeyMinutes'), officialUrl: val('officialUrl'), mapsUrl: val('mapsUrl'), category: val('category'),
      detail: val('detail'), booking: val('booking'), notes: val('notes'), access: val('access'), alternate: val('alternate'), rain: val('alternate'), food: val('food'), tickets: val('tickets'), fromHotel: val('fromHotel'), fromPrevious: val('fromPrevious'), custom: old?.custom ?? true,
    })
    if (!activity.title) { app.notify('Escribe un nombre para la actividad.'); return }
    if (activity.time && minute(activity.time) === null) { app.notify('La hora debe tener el formato HH:MM.'); return }
    for (const value of [activity.officialUrl, activity.mapsUrl]) {
      if (value) { try { if (new URL(value).protocol !== 'https:') throw new Error('protocol') } catch { app.notify('Los enlaces deben ser direcciones HTTPS válidas.'); return } }
    }
    if ((activity.lat == null) !== (activity.lon == null) || (activity.lat != null && (Math.abs(activity.lat) > 90 || Math.abs(activity.lon!) > 180))) { app.notify('Revisa las coordenadas.'); return }
    const current = app.getState()
    const activities = old ? current.activities.map(entry => entry.id === old.id ? activity : entry) : [...current.activities, activity]
    if (app.commit({ ...current, activities }, old ? 'Actividad guardada.' : 'Actividad añadida.')) dialog.close()
  }, { signal: controller.signal })
  dialog.querySelector<HTMLInputElement>('[name="title"]')?.focus()
}

function removeActivity(app: AppContext, id: string, action: 'delete' | 'archive') {
  const state = app.getState()
  const item = state.activities.find(entry => entry.id === id)
  if (!item) return false
  if (action === 'archive') {
    const activities = state.activities.map(entry => entry.id === id ? { ...entry, archived: true } : entry)
    return app.commit({ ...state, activities }, 'Actividad archivada. Puedes recuperarla en Archivadas.')
  }
  const trash = [...(state.trash ?? []).filter(entry => entry.id !== id), { ...item, archived: false }]
  return app.commit({ ...state, activities: state.activities.filter(entry => entry.id !== id), trash }, 'Actividad eliminada. Puedes recuperarla en Papelera.')
}

function moveInDay(app: AppContext, id: string, offset: number) {
  const state = app.getState()
  const item = state.activities.find(entry => entry.id === id)
  if (!item) return
  const peers = state.activities.filter(entry => entry.date === item.date && !entry.archived)
  const at = peers.findIndex(entry => entry.id === id)
  const target = peers[at + offset]
  if (!target) return
  const list = [...state.activities]
  const a = list.findIndex(entry => entry.id === id)
  const b = list.findIndex(entry => entry.id === target.id)
  ;[list[a], list[b]] = [list[b], list[a]]
  app.commit({ ...state, activities: list }, 'Orden actualizado.')
}

function reorder(app: AppContext, id: string, targetId: string) {
  if (!targetId || targetId === id) return
  const state = app.getState()
  const from = state.activities.findIndex(item => item.id === id)
  const to = state.activities.findIndex(item => item.id === targetId)
  if (from < 0 || to < 0 || state.activities[from].date !== state.activities[to].date) return
  const activities = [...state.activities]
  const [moved] = activities.splice(from, 1)
  activities.splice(to, 0, moved)
  app.commit({ ...state, activities }, 'Orden actualizado.')
}

type PlannerView = 'day' | 'week' | 'timeline' | 'zones'
const preferences = [['tranquilo','Día tranquilo'],['normal','Día normal'],['intenso','Día intenso'],['lluvia','Día de lluvia'],['infantil','Priorizar niñas'],['cultural','Cultura'],['gastronomia','Gastronomía'],['pocas-caminatas','Minimizar caminatas']]

function dayDateRange(date: string, offset: number) {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + offset)
  return day.toISOString().slice(0, 10)
}
function boundedTripDate(date: string) { return date < '2026-12-03' ? '2026-12-03' : date > '2026-12-12' ? '2026-12-12' : date }

function activityDay(app: AppContext, date: string, view: PlannerView, places: Place[], plan: 'A' | 'B' = 'A') {
  const state = app.getState()
  const items = state.activities.filter(item => item.date === date && !item.archived && (item.plan ?? 'A') === plan)
  if (view === 'zones') {
    const groups = new Map<string, Activity[]>()
    for (const item of items) { const key = item.zone || places.find(place => place.id === item.placeId)?.area || 'Sin zona'; groups.set(key, [...groups.get(key) ?? [], item]) }
    return [...groups].map(([zone, group]) => `<section class="pl-zone"><h3>${esc(zone)} <small>${group.length} paradas</small></h3>${group.map((item, index) => activityCard(item, index, group.length, app, places)).join('')}</section>`).join('') || `<div class="pl-empty">Aún no hay visitas. Añade una actividad o mueve una idea desde la bandeja.</div>`
  }
  const ordered = view === 'timeline' ? [...items].sort((a, b) => (minute(a.time) ?? 2000) - (minute(b.time) ?? 2000)) : items
  return ordered.length ? ordered.map((item, index) => activityCard(item, index, ordered.length, app, places)).join('') : `<div class="pl-empty">Aún no hay visitas. Añade una actividad o mueve una idea desde la bandeja.</div>`
}

function ideaTray(app: AppContext, places: Place[]) {
  const ideas = app.getState().activities.filter(item => !item.date && !item.archived)
  return `<section class="pl-ideas"><div class="pl-section-head"><div><span class="pl-kicker">BANDEJA</span><h2>Ideas pendientes</h2></div><span>${ideas.length}</span></div><button type="button" class="pl-button" data-pl-action="new-idea">＋ Guardar una idea</button>${ideas.length ? ideas.map(item => `<div class="pl-idea" ${attrs(item)}><div><strong>${esc(item.title)}</strong><small>${esc(item.zone || placeName(item.placeId, places) || 'Sin asignar')}</small></div><select aria-label="Asignar ${esc(item.title)} a un día" data-pl-action="assign" data-id="${escapeAttr(item.id)}"><option value="">Elige día…</option>${Array.from({ length: 10 }, (_, index) => { const date = `2026-12-${String(index + 3).padStart(2, '0')}`; return `<option value="${date}">${dayLabel(date)}</option>` }).join('')}</select>${button('edit','Editar',item.id)}</div>`).join('') : '<p>Guarda aquí lugares e ideas para decidir el día más adelante.</p>'}<div class="pl-select-places"><label>Selecciona varios lugares para añadirlos juntos<select multiple size="4" data-pl-multi>${places.filter(place => place.kind !== 'hotel' && place.kind !== 'airport').map(place => `<option value="${escapeAttr(place.id)}">${esc(place.name)} · ${esc(place.area)}</option>`).join('')}</select></label><button type="button" class="pl-button" data-pl-action="add-selected">Añadir seleccionados a este día</button></div></section>`
}

function preferencesFor(state: State, date: string) {
  const selected = new Set(state.dayPreferences?.[date] ?? [])
  return preferences.map(([value, label]) => `<label class="pl-pref"><input type="checkbox" data-pl-action="preference" data-pref="${value}"${selected.has(value) ? ' checked' : ''}><span>${label}</span></label>`).join('')
}

function templateItems(state: State, date: string, places: Place[], full: boolean, zone = '') {
  const used = new Set(state.activities.filter(item => item.date === date).map(item => item.placeId))
  const count = full ? 4 : 2
  const selected = places.filter(place => place.kind !== 'hotel' && place.kind !== 'airport' && (!zone || place.area === zone) && !used.has(place.id)).slice(0, count)
  return selected.map((place, index) => baseActivity({ date, title: place.name, placeId: place.id, zone: place.area, time: full ? ['09:30','11:30','14:30','17:00'][index] : ['09:30','11:30'][index], duration: full ? 75 : 60, priority: 'opcional', detail: place.description, custom: true }))
}

function bindPlanner(element: HTMLElement, app: AppContext, selectedMode?: PlannerView) {
  const dateKey = app.selectedDate()
  const savedMode = readSession(`asia-trip-planner-mode:${dateKey}`)
  let mode: PlannerView = selectedMode ?? (['day','week','timeline','zones'].includes(savedMode) ? savedMode as PlannerView : 'day')
  let selectedPlan: 'A' | 'B' = readSession(`asia-trip-planner-plan:${dateKey}`) === 'B' ? 'B' : 'A'
  let showArchived = readSession(`asia-trip-planner-archive:${dateKey}`) === 'true'
  let selectedZone = readSession(`asia-trip-planner-zone:${dateKey}`)
  let dragId = ''
  let pointer: { id:number; activity:string; startY:number; y:number } | null = null
  const render = () => {
    const state = app.getState()
    const date = app.selectedDate()
    const places = app.places()
    const items = state.activities.filter(item => item.date === date && !item.archived && (item.plan ?? 'A') === selectedPlan)
    const city = date < '2026-12-07' ? 'SINGAPUR' : date > '2026-12-11' ? 'EN RUTA' : 'KUALA LUMPUR'
    const dateButtons = Array.from({ length: 10 }, (_, index) => `2026-12-${String(index + 3).padStart(2, '0')}`)
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday
    const weekDates = Array.from({ length: 7 }, (_, index) => dayDateRange(date, mondayOffset + index))
    const shownDates = mode === 'week' ? weekDates : [date]
    const daysHTML = shownDates.map(day => `<section class="pl-day-section"><div class="pl-day-heading"><div><span class="pl-kicker">${day < '2026-12-07' ? 'SINGAPUR' : day > '2026-12-11' ? 'EN RUTA' : 'KUALA LUMPUR'}</span><h2>${dayLabel(day)}</h2></div><button type="button" class="pl-day-open" data-pl-action="choose-day" data-date="${day}">Abrir día</button></div><div class="pl-timeline">${activityDay(app, day, 'day', places, selectedPlan)}</div></section>`).join('')
    const warnings = plannerWarnings(items, places)
    const warningHTML = warnings.length ? `<aside class="pl-warnings"><strong>Revisa el ritmo</strong>${warnings.map(warning => `<p>${esc(warning.message)}</p>`).join('')}</aside>` : ''
    const archived = [...state.activities.filter(item => item.archived), ...(state.trash ?? [])]
    element.innerHTML = `<section class="planner-shell"><header class="pl-hero"><div><span class="pl-kicker">${city} · VIAJE EN FAMILIA</span><h1>Tu viaje, a tu ritmo</h1><p>Organiza el día, deja espacio para descansar y conserva tus alternativas.</p></div><button class="pl-add" type="button" data-pl-action="new">＋ <span>Añadir</span></button></header>
      <div class="pl-date-strip"><button class="pl-date-arrow" data-pl-action="date-prev" aria-label="Día anterior">‹</button><label><span class="pl-kicker">DÍA SELECCIONADO</span><input aria-label="Día de la agenda" type="date" min="2026-12-03" max="2026-12-12" value="${date}"></label><button class="pl-date-arrow" data-pl-action="date-next" aria-label="Día siguiente">›</button><div class="pl-day-pills">${dateButtons.map(day => `<button type="button" data-pl-action="choose-day" data-date="${day}" class="${day === date ? 'is-selected' : ''}">${day.slice(-2)}<small>${day === todayAsia() ? 'Hoy' : ''}</small></button>`).join('')}</div></div>
      <nav class="pl-modes" aria-label="Vistas del planificador">${modeButton('day',mode,'Día')}${modeButton('week',mode,'Semana')}${modeButton('timeline',mode,'Cronología')}${modeButton('zones',mode,'Por zonas')}</nav>
      <div class="pl-layout"><div class="pl-primary"><div class="pl-section-head pl-plan-head"><div><span class="pl-kicker">${dayLabel(date)} · ${items.length} actividades</span><h2>Plan del día</h2></div><div class="pl-plan-switch">${planButton('A',selectedPlan)}${planButton('B',selectedPlan)}</div></div>
      ${mode === 'week' ? daysHTML : `<div class="pl-day-banner"><p>${esc((state.dayPreferences?.[date] ?? []).length ? `Preferencias: ${(state.dayPreferences[date] ?? []).map(value => preferences.find(entry => entry[0] === value)?.[1]).filter(Boolean).join(' · ')}` : 'Día flexible · organiza por hora o mantén las ideas sin asignar.')}</p><div class="pl-templates"><label class="pl-zone-choice"><span class="sr-only">Zona de la plantilla</span><select aria-label="Zona de la plantilla" data-pl-zone><option value="">Todas las zonas</option>${[...new Set(places.map(place => place.area).filter(Boolean))].sort().map(zone => `<option value="${esc(zone)}"${zone === selectedZone ? ' selected' : ''}>${esc(zone)}</option>`).join('')}</select></label><button type="button" class="pl-button" data-pl-action="template-half">＋ Media jornada</button><button type="button" class="pl-button" data-pl-action="template-full">＋ Jornada completa</button></div></div><div class="pl-timeline">${activityDay(app,date,mode,places,selectedPlan)}</div>`}${warningHTML}
      <section class="pl-preferences"><div class="pl-section-head"><div><span class="pl-kicker">RITMO Y BIENESTAR</span><h2>¿Cómo será el día?</h2></div></div><div class="pl-preference-list">${preferencesFor(state,date)}</div></section>
      <section class="pl-archive"><button type="button" class="pl-button" data-pl-action="toggle-archive">${showArchived ? 'Ocultar' : 'Ver'} archivadas y papelera (${archived.length})</button>${showArchived ? `<div class="pl-archived">${archived.map(item => { const deleted = (state.trash ?? []).some(entry => entry.id === item.id); return `<div class="pl-archived-row"><span>${esc(item.title)} <small>${item.date ? dayLabel(item.date) : 'Idea'} · ${deleted ? 'Papelera' : 'Archivada'}</small></span>${button(deleted ? 'restore-trash' : 'restore', deleted ? 'Restaurar' : 'Recuperar', item.id)}</div>` }).join('') || '<p>Sin actividades archivadas o eliminadas.</p>'}</div>` : ''}</section>
      </div><aside class="pl-aside">${ideaTray(app,places)}<section class="pl-ideas"><span class="pl-kicker">PLANES ALTERNATIVOS</span><h2>Plan B del día</h2><p>Guarda opciones con Plan B y cámbialas a Plan A cuando quieras. El plan principal nunca se modifica solo.</p>${state.activities.filter(item => item.date === date && item.plan === 'B').map(item => `<div class="pl-idea"><div><strong>${esc(item.title)}</strong><small>${esc(item.time || 'Horario flexible')}</small></div>${button('edit','Editar',item.id)}${button('use-plan','Usar en A',item.id)}</div>`).join('') || '<p>Aún no hay alternativas. Al crear una actividad, elige Plan B.</p>'}</section></aside></div></section>`
  }
  render()
  const restoreDayView = (date: string) => {
    const saved = readSession(`asia-trip-planner-mode:${date}`)
    mode = (['day','week','timeline','zones'].includes(saved) ? saved : 'day') as PlannerView
    selectedPlan = readSession(`asia-trip-planner-plan:${date}`) === 'B' ? 'B' : 'A'
    showArchived = readSession(`asia-trip-planner-archive:${date}`) === 'true'
    selectedZone = readSession(`asia-trip-planner-zone:${date}`)
  }
  element.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pl-action]') : null
    if (!target || !element.contains(target)) return
    const action = target.dataset.plAction ?? ''
    const id = target.dataset.id ?? ''
    const date = app.selectedDate()
    const state = app.getState()
    const item = state.activities.find(entry => entry.id === id) ?? (state.trash ?? []).find(entry => entry.id === id)
    if (action === 'new') openActivity(app, { date })
    else if (action === 'new-idea') openActivity(app, { date: '' })
    else if (action === 'edit' && item) openActivity(app, item)
    else if (action === 'up') moveInDay(app, id, -1)
    else if (action === 'down') moveInDay(app, id, 1)
    else if (action === 'duplicate' && item) { const copy = baseActivity({ ...item, id: makeId(), title: `${item.title} (copia)`, custom: true }); app.commit({ ...state, activities: [...state.activities, copy] }, 'Actividad duplicada.') }
    else if (action === 'delete' || action === 'archive') removeActivity(app, id, action)
    else if (action === 'more') { const menu = target.closest('.pl-activity')?.querySelector<HTMLElement>('.pl-more-menu'); if (menu) menu.hidden = !menu.hidden }
    else if (action === 'mode') { mode = target.dataset.mode as PlannerView; writeSession(`asia-trip-planner-mode:${date}`, mode); render() }
    else if (action === 'plan') { selectedPlan = target.dataset.plan === 'B' ? 'B' : 'A'; writeSession(`asia-trip-planner-plan:${date}`, selectedPlan); render() }
    else if (action === 'choose-day') { const nextDate = boundedTripDate(target.dataset.date ?? date); app.setSelectedDate(nextDate); restoreDayView(nextDate); render() }
    else if (action === 'date-prev' || action === 'date-next') { const nextDate = boundedTripDate(dayDateRange(date, action === 'date-prev' ? -1 : 1)); app.setSelectedDate(nextDate); restoreDayView(nextDate); render() }
    else if (action === 'toggle-archive') { showArchived = !showArchived; writeSession(`asia-trip-planner-archive:${date}`, String(showArchived)); render() }
    else if (action === 'template-half' || action === 'template-full') { const add = templateItems(state, date, app.places(), action === 'template-full', selectedZone); if (add.length) app.commit({ ...state, activities: [...state.activities, ...add] }, action === 'template-full' ? 'Plantilla de jornada completa añadida.' : 'Plantilla de media jornada añadida.'); else app.notify('No quedan lugares libres en esa zona para esta plantilla.') }
    else if (action === 'add-selected') { const select = element.querySelector<HTMLSelectElement>('[data-pl-multi]'); const picks = [...(select?.selectedOptions ?? [])].map(option => app.places().find(place => place.id === option.value)).filter((place): place is Place => !!place); if (picks.length) { app.commit({ ...state, activities: [...state.activities, ...picks.map(place => baseActivity({ date, title: place.name, placeId: place.id, zone: place.area, detail: place.description, custom: true }))] }, `${picks.length} lugares añadidos al día.`) } }
    else if (action === 'directions' && item?.placeId) app.directions(item.placeId, item.id)
    else if (action === 'restore' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, archived: false } : entry) }, 'Actividad recuperada.')
    else if (action === 'restore-trash' && item) { const trash = (state.trash ?? []).filter(entry => entry.id !== id); app.commit({ ...state, trash, activities: [...state.activities, { ...item, archived: false }] }, 'Actividad restaurada.') }
    else if (action === 'use-plan' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, plan: 'A' } : entry) }, 'Alternativa añadida al Plan A. Revisa los posibles solapamientos.')
  })
  element.addEventListener('change', event => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target) return
    if (target.matches('[aria-label="Día de la agenda"]')) { const nextDate = boundedTripDate((target as HTMLInputElement).value); app.setSelectedDate(nextDate); restoreDayView(nextDate); render(); return }
    if (target.matches('[data-pl-zone]')) { selectedZone = (target as HTMLSelectElement).value; writeSession(`asia-trip-planner-zone:${app.selectedDate()}`, selectedZone); return }
    const action = target.dataset.plAction
    const id = target.dataset.id ?? ''
    const state = app.getState()
    const item = state.activities.find(entry => entry.id === id)
    if (action === 'status' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, status: (target as HTMLSelectElement).value as Activity['status'] } : entry) }, 'Estado guardado.')
    else if (action === 'assign' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, date: (target as HTMLSelectElement).value } : entry) }, 'Idea asignada al día.')
    else if (action === 'preference') { const date = app.selectedDate(); const value = target.dataset.pref ?? ''; const current = new Set(state.dayPreferences?.[date] ?? []); if ((target as HTMLInputElement).checked) current.add(value); else current.delete(value); app.commit({ ...state, dayPreferences: { ...(state.dayPreferences ?? {}), [date]: [...current] } }, 'Preferencias del día guardadas.') }
  })
  element.addEventListener('dragstart', event => { const card = (event.target as Element).closest<HTMLElement>('[data-item]'); if (card) { dragId = card.dataset.item ?? ''; event.dataTransfer?.setData('text/plain', dragId); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move' } })
  element.addEventListener('dragover', event => { if ((event.target as Element).closest('[data-item]')) event.preventDefault() })
  element.addEventListener('drop', event => { const card = (event.target as Element).closest<HTMLElement>('[data-item]'); const target = card?.dataset.item ?? ''; const moving = dragId || event.dataTransfer?.getData('text/plain') || ''; if (moving && target) { event.preventDefault(); reorder(app,moving,target); dragId = '' } })
  element.addEventListener('pointerdown', event => {
    const grip = (event.target as Element).closest<HTMLElement>('[data-pl-action="grab"]')
    if (!grip?.dataset.id || event.button !== 0 || pointer) return
    pointer = { id:event.pointerId, activity:grip.dataset.id, startY:event.clientY, y:event.clientY }
    grip.setPointerCapture(event.pointerId)
  })
  element.addEventListener('pointermove', event => { if (pointer?.id === event.pointerId) pointer.y = event.clientY })
  element.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) pointer = null })
  element.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return
    const drag = pointer
    pointer = null
    const y = Math.abs(event.clientY - drag.startY) >= 18 ? event.clientY : drag.y
    if (Math.abs(y - drag.startY) < 18) return
    const target = Array.from(element.querySelectorAll<HTMLElement>('.pl-activity[data-item]')).find(card => {
      const rect = card.getBoundingClientRect()
      return y >= rect.top && y <= rect.bottom
    })?.dataset.item
    if (target) reorder(app,drag.activity,target)
  })
}

export function mountPlanner(element: HTMLElement, app: AppContext) { bindPlanner(element, app) }

function scheduledTime(item: Activity) {
  if (minute(item.time) === null) return null
  const europe = item.date === '2026-12-03' || item.date === '2026-12-12'
  return Date.parse(`${item.date}T${item.time}:00${europe ? '+01:00' : '+08:00'}`)
}

function countdown(instant: number | null, now: number) {
  if (instant === null) return ''
  const minutes = Math.max(0,Math.ceil((instant - now) / 60_000))
  return minutes > 59 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : minutes ? `${minutes} min` : 'Ahora'
}

export function mountToday(element: HTMLElement, app: AppContext) {
  const render = () => {
    const state = app.getState()
    const places = app.places()
    const now = new Date()
    const actualDate = todayAsia(now)
    const date = app.selectedDate() || actualDate
    const preview = date !== actualDate
    const current = state.activities.filter(item => item.date === date && !item.archived && item.status === 'pending' && (item.plan ?? 'A') === 'A').sort((a,b) => (minute(a.time) ?? 9999) - (minute(b.time) ?? 9999))
    const beforeArrival = now.valueOf() < Date.parse('2026-12-07T16:10:00+08:00')
    const cityCode = date < '2026-12-07' || !preview && date === '2026-12-07' && beforeArrival ? 'sg' : 'kl'
    const localZone = cityCode === 'sg' ? 'Asia/Singapore' : 'Asia/Kuala_Lumpur'
    const nowLabel = new Intl.DateTimeFormat('es-ES',{timeZone:localZone,hour:'2-digit',minute:'2-digit'}).format(now)
    const isTransfer = date === '2026-12-07' && (preview || !preview && beforeArrival && now.valueOf() >= Date.parse('2026-12-07T15:05:00+08:00'))
    const cityName = date === '2026-12-03' || date === '2026-12-12' ? 'En ruta' : isTransfer ? 'Singapur · Kuala Lumpur' : cityCode === 'sg' ? 'Singapur' : 'Kuala Lumpur'
    const upcoming = current.filter(item => preview || scheduledTime(item) === null || scheduledTime(item)! + item.duration * 60_000 > now.valueOf())
    const next = upcoming[0]
    const reservation = current.find(item => (item.fixed || item.flight) && scheduledTime(item) !== null && (preview || scheduledTime(item)! >= now.valueOf()))
    const untilNext = next && !preview ? countdown(scheduledTime(next),now.valueOf()) : ''
    const untilReservation = reservation && !preview ? countdown(scheduledTime(reservation),now.valueOf()) : ''
    const place = next ? places.find(p => p.id === next.placeId) : undefined
    const totals = financeTotals(state)
    const budget = state.budgets.find(item => item.scope === 'total') ?? state.budgets.find(item => item.scope === 'destination')
    const remaining = budget ? (budget.amountMinor - budgetSpent(state,budget)) / 100 : state.budget == null ? null : (Math.round(state.budget * 100) - totals.total) / 100
    const occupied = new Set(current.map(item => item.placeId).filter(Boolean))
    const prefs = new Set(state.dayPreferences[date] ?? [])
    const nearbyKm = (candidate: Place) => place?.lat != null && place.lon != null && candidate.lat != null && candidate.lon != null ? greatCircleKm(place.lat,place.lon,candidate.lat,candidate.lon) : Number.POSITIVE_INFINITY
    const maximumWalk = prefs.has('pocas-caminatas') || prefs.has('tranquilo') ? 2 : 4
    const indoor = (candidate: Place) => /cubiert|interior|climatiz/i.test(`${candidate.shade} ${placeGuides[candidate.id]?.weather ?? ''}`)
    const score = (candidate: Place) => Math.min(8,nearbyKm(candidate)) - (prefs.has('lluvia') && indoor(candidate) ? 3 : 0) -
      (prefs.has('gastronomia') && candidate.kind === 'food' ? 3 : 0) - (prefs.has('cultural') && /muse|templo|mezquita|patrimonio/i.test(candidate.description) ? 2 : 0) -
      (prefs.has('infantil') && /niñ|familia|interactiv/i.test(placeGuides[candidate.id]?.children ?? '') ? 2 : 0)
    const alternatives = place && !next?.fixed && !next?.flight ? places.filter(candidate => candidate.city === place.city &&
      ['must','optional','food'].includes(candidate.kind) && candidate.id !== place.id && !occupied.has(candidate.id) &&
      (candidate.area === place.area || nearbyKm(candidate) <= maximumWalk)).sort((a,b) => score(a) - score(b)).slice(0,3) : []
    const notices: Record<string,string[]> = {
      '2026-12-05': ['Aviso de movilidad: hay cambios viales relacionados con el maratón de Singapur. Confirma accesos antes de salir.'],
      '2026-12-06': ['Aviso de movilidad: continúan restricciones del maratón en Singapur. Usa transporte público y revisa el acceso a Gardens by the Bay.'],
      '2026-12-07': ['Vuelo Singapur–Kuala Lumpur: horario indicado provisional. Confirma hora, terminal y equipaje antes de salir.'],
      '2026-12-11': ['Salida internacional desde KUL esta noche. Confirma terminal; el festivo de Selangor puede afectar servicios locales.'],
    }
    const placeLinks = alternatives.map(candidate => `<article class="pl-nearby"><div><strong>${esc(candidate.name)}</strong><small>${esc(candidate.area)}${Number.isFinite(nearbyKm(candidate)) ? ` · ${nearbyKm(candidate).toFixed(1)} km en línea recta` : ''}${indoor(candidate) ? ' · Opciones cubiertas' : ''}</small></div><button class="pl-button" data-pl-today="replace" data-id="${escapeAttr(next?.id ?? '')}" data-place="${escapeAttr(candidate.id)}">Sustituir</button></article>`).join('')
    const trip = next?.journeyMinutes ? `${next.journeyMinutes} min de trayecto estimado` :
      next ? next.fromPrevious || next.fromHotel : ''
    const transport = next?.transport || (place ? placeGuides[place.id]?.transport : '')
    const todayButton = (key: string, label: string, extra = '') => `<button type="button" class="pl-button ${extra}" data-pl-today="${key}" data-id="${escapeAttr(next?.id ?? '')}">${label}</button>`
    const main = next ? `<article class="pl-next">
      <span class="pl-kicker">PRÓXIMA · ${esc(next.time || 'SIN HORA')}${untilNext ? ` · ${untilNext}` : ''}</span>
      <h2>${esc(next.title)}</h2><p>${esc(place?.address || next.address || next.zone || 'Dirección pendiente')}</p>
      ${!state.family && next.detail ? `<p class="pl-description">${esc(next.detail)}</p>` : ''}
      ${trip ? `<p><strong>Trayecto</strong> · ${esc(trip)}</p>` : ''}
      ${transport && !state.family && trip !== transport ? `<p><strong>Cómo llegar</strong> · ${esc(transport)}</p>` : ''}
      <div class="pl-today-actions">${todayButton('done','Hecho','pl-primary')}${!next.fixed && !next.flight ? todayButton('delay','+15 min') : ''}
        ${todayButton('skip','Omitir')}${place || next.address ? todayButton('directions','Navegar') : ''}
        ${state.family ? '' : todayButton('spend','＋ Gasto') + todayButton('note','＋ Nota')}
      </div></article>` :
      '<article class="pl-next"><h2>Por hoy, el plan está al día</h2><p>Consulta otra fecha o prepara una actividad en la agenda.</p></article>'
    element.innerHTML = `<section class="planner-shell today-shell">
      <header class="pl-hero pl-today-hero" data-city="${cityCode}"><div>
        <span class="pl-kicker">${esc(cityName.toLocaleUpperCase('es'))} · ${nowLabel} HORA DE ASIA</span>
        <h1>HOY</h1><h2 class="sr-only">Asia Trip 2026</h2><p>${dayLabel(date)} · ${preview ? 'Vista previa' : 'Día actual'} · ${navigator.onLine ? 'Con conexión' : 'Sin conexión'}</p>
      </div><button class="pl-add" type="button" data-pl-today="plan" aria-label="Abrir el plan del día">Abrir plan</button></header>
      <div class="pl-today-date"><label><span class="pl-kicker">CONSULTAR FECHA</span><input aria-label="Fecha de HOY" type="date" min="2026-12-03" max="2026-12-12" value="${escapeAttr(date)}"></label>
      <button type="button" class="pl-button" data-pl-today="family" aria-pressed="${state.family}">${state.family ? 'Vista completa' : 'Modo familia'}</button></div>
      ${main}
      ${reservation ? `<div class="trip-progress"><span><strong>Próxima reserva</strong> · ${esc(reservation.title)}</span><strong>${esc(reservation.time)}${untilReservation ? ` · ${untilReservation}` : ''}</strong></div>` : ''}
      ${notices[date]?.length ? `<aside class="pl-warnings"><strong>Avisos para este día</strong>${notices[date].map(notice => `<p>${esc(notice)}</p>`).join('')}</aside>` : ''}
      ${alternatives.length && !state.family ? `<section class="pl-nearby-list"><h2>Alternativas cercanas</h2>${placeLinks}<p>Las distancias son en línea recta. Comprueba el trayecto y las condiciones del día.</p></section>` : ''}
      ${state.family ? '' : `<div class="pl-today-summary"><div><span class="pl-kicker">PRESUPUESTO RESTANTE</span><strong>${remaining == null ? 'Sin configurar' : formatPrice(remaining,'EUR')}</strong></div><div><span class="pl-kicker">ACTIVIDADES PENDIENTES</span><strong>${current.length}</strong></div><div><span class="pl-kicker">CONEXIÓN</span><strong>${navigator.onLine ? 'En línea' : 'Sin red'}</strong></div></div>`}
      <section class="pl-today-list"><h2>Lo que queda</h2>${current.map(item => `<button type="button" class="pl-today-row" data-pl-today="focus"><time>${esc(item.time || '— —')}</time><span><strong>${esc(item.title)}</strong><small>${esc(item.zone || placeName(item.placeId,places))}</small></span><span>›</span></button>`).join('') || '<p>No quedan actividades pendientes.</p>'}</section></section>`
  }
  render()
  element.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pl-today]') : null
    if (!target) return
    const action = target.dataset.plToday ?? ''
    const id = target.dataset.id ?? ''
    const state = app.getState()
    const item = state.activities.find(entry => entry.id === id)
    if (target.matches('[data-pl-today="replace"]') && item) {
      const candidate = app.places().find(entry => entry.id === target.dataset.place)
      if (!candidate || !window.confirm(`¿Sustituir «${item.title}» por «${candidate.name}»?`)) return
      app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, title: candidate.name, placeId: candidate.id, zone: candidate.area, address: candidate.address, lat: candidate.lat, lon: candidate.lon, detail: candidate.description } : entry) }, 'Actividad sustituida. Revisa el horario y el trayecto.')
    }
    if (action === 'plan') { app.navigate('agenda') }
    else if (action === 'family') app.commit({ ...state,family:!state.family })
    else if (action === 'done' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, status: 'done' } : entry) }, 'Actividad marcada como realizada.')
    else if (action === 'skip' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, status: 'skipped' } : entry) }, 'Actividad omitida.')
    else if (action === 'delay' && item && !item.fixed && !item.flight) {
      const start = minute(item.time) ?? 9 * 60
      if (start + 15 >= 1440) { app.notify('Edita el día y la hora desde la agenda.'); return }
      const delayed = `${String(Math.floor((start + 15) / 60)).padStart(2,'0')}:${String((start + 15) % 60).padStart(2,'0')}`
      app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, time: delayed } : entry) }, `Actividad retrasada a las ${delayed}.`)
    }
    else if (action === 'directions' && item) app.directions(item.placeId, item.id)
    else if (action === 'spend') app.quickSpend(id)
    else if (action === 'note') app.quickNote(id)
    else if (action === 'focus') { app.setSelectedDate(app.selectedDate()); app.navigate('agenda') }
  })
  element.addEventListener('change', event => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.matches('[aria-label="Fecha de HOY"]')) { app.setSelectedDate(boundedTripDate((target as HTMLInputElement).value)); render() }
  })
}
