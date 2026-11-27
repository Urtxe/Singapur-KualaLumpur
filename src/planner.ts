import type { Activity, Currency, Place, State } from './types'
import type { AppContext } from './app-api'
import { activeActivities, activePlan, activitiesForPlan, city, dayPreference, getDay, icon, sourceLink, withDayPreference } from './ui'
import { placeGuides } from './guide-data'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const currency = (value: unknown): Currency => value === 'SGD' || value === 'MYR' ? value : 'EUR'
const makeId = () => `activity-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const readSession = (key: string) => { try { return sessionStorage.getItem(key) ?? '' } catch { return '' } }
const writeSession = (key: string, value: string) => { try { sessionStorage.setItem(key, value) } catch { /* Selection is a convenience; the itinerary itself is saved separately. */ } }
const minute = (time: string) => /^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null
const baseActivity = (seed: Partial<Activity> = {}): Activity => ({
  id: seed.id ?? makeId(), date: seed.date ?? '', title: seed.title ?? '', time: seed.time ?? '', duration: seed.duration ?? 60,
  placeId: seed.placeId ?? '', zone: seed.zone ?? '', effort: seed.effort ?? 'bajo', priority: seed.priority ?? 'opcional', status: seed.status ?? 'pending',
  food: seed.food ?? '', tickets: seed.tickets ?? '', rain: seed.rain ?? '', detail: seed.detail ?? '', fromHotel: seed.fromHotel ?? '', fromPrevious: seed.fromPrevious ?? '',
  ...(seed as object),
})

export type PlannerWarning = { kind: 'overlap' | 'rest' | 'busy' | 'distance'; activityIds: string[]; message: string }
const dialogControllers = new WeakMap<HTMLDialogElement, AbortController>()
const isTransfer = (item: Activity) => /traslado|transfer/i.test(item.title) || item.zone.includes('→')

export function plannerWarnings(items: Activity[], places: Place[]): PlannerWarning[] {
  const warnings: PlannerWarning[] = []
  const scheduled = items.filter(item => !item.archived && item.status !== 'skipped' && minute(item.time) !== null)
    .sort((a, b) => minute(a.time)! - minute(b.time)!)
  for (let i = 0; i < scheduled.length; i++) {
    const current = scheduled[i]
    const previous = scheduled[i - 1]
    const gap = previous ? minute(current.time)! - (minute(previous.time)! + previous.duration) : Infinity
    const overlaps = gap < 0
    if (previous && overlaps) {
      warnings.push({ kind: 'overlap', activityIds: [previous.id, current.id], message: `Se solapa «${current.title}» con la actividad anterior.` })
    }
    const samePlace = Boolean(previous?.placeId && previous.placeId === current.placeId)
    const sameZone = Boolean(previous?.zone && current.zone && previous.zone === current.zone)
    if (previous && !overlaps && gap < 30 && !samePlace && !sameZone && !isTransfer(previous) && !isTransfer(current)) {
      warnings.push({ kind: 'rest', activityIds: [previous.id, current.id], message: `Deja al menos 30 minutos de margen antes de «${current.title}».` })
    }
    const from = places.find(place => place.id === previous?.placeId)
    const to = places.find(place => place.id === current.placeId)
    if (previous && !sameZone && !samePlace && !isTransfer(previous) && !isTransfer(current) && from?.lat != null && from.lon != null && to?.lat != null && to.lon != null) {
      const km = greatCircleKm(from.lat, from.lon, to.lat, to.lon)
      if (km > 8 && gap < 60) warnings.push({ kind: 'distance', activityIds: [scheduled[i - 1].id, current.id], message: `Hay unos ${Math.round(km)} km en línea recta hasta «${current.title}» y poco margen. La distancia real por carretera puede ser mayor.` })
    }
  }
  const visits = scheduled.filter(item => item.placeId && item.priority !== 'pausa' && !item.flight && !isTransfer(item) && !['changi','mi-rochor','star-residence','kul-airport'].includes(item.placeId))
  if (visits.length > 5) warnings.push({ kind: 'busy', activityIds: visits.map(item => item.id), message: 'El día tiene más de cinco visitas con hora. Valora dejar alguna como idea opcional.' })
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

function activityCard(item: Activity, places: Place[], reordering: boolean) {
  const place = places.find(entry => entry.id === item.placeId)
  const fixed = protectedActivity(item)
  const canReorder = reordering && !fixed
  const id = escapeAttr(item.id)
  const title = esc(item.title || 'Actividad sin título')
  const zone = item.zone || place?.area
  return `<article class="pl-activity" ${attrs(item)} draggable="${canReorder}">
    <h3 class="pl-row-heading"><button type="button" class="pl-open" data-pl-action="details" data-id="${id}" aria-haspopup="dialog" aria-label="Ver ${title}">
      <span class="pl-time">${item.time ? esc(item.time) : 'Sin hora'}</span><span class="pl-row-name"><strong>${title}</strong><span class="pl-meta">
      ${zone ? `<span>${esc(zone)}</span>` : ''}${item.flight === 'confirmed' ? '<b class="pl-fixed">VUELO CONFIRMADO</b>' : item.flight === 'provisional' ? '<b class="pl-plan-b">VUELO PROVISIONAL</b>' : ''}
      ${item.fixed && !item.flight ? '<b class="pl-fixed">RESERVA FIJA</b>' : ''}${item.plan === 'B' ? '<b class="pl-plan-b">PLAN B</b>' : ''}${item.status === 'skipped' ? '<b>Omitida</b>' : ''}</span></span>${icon('chevron-right','pl-row-chevron')}
    </button></h3>
    ${canReorder ? `<button class="pl-grip" type="button" aria-label="Reordenar ${title} con las flechas arriba y abajo" data-pl-action="grab" data-id="${id}">⠿</button>` : fixed ? `<span class="pl-complete-lock"><span class="sr-only">${item.status === 'done' ? 'Realizada' : 'Protegida'}</span>${icon(item.status === 'done' ? 'check' : 'shield')}</span>` : `<button type="button" class="pl-status" aria-label="Marcar realizada: ${title}" data-pl-action="toggle-done" data-id="${id}">○</button>`}
  </article>`
}

function activityDetails(app: AppContext, item: Activity, onAction: (action: string, item: Activity, dialog: HTMLDialogElement) => void) {
  const place = app.places().find(entry => entry.id === item.placeId)
  const status = item.status === 'done' ? 'Realizada' : item.status === 'skipped' ? 'Omitida' : 'Pendiente'
  const facts = [
    ['Entradas', item.tickets], ['Reserva', item.booking], ['Dirección', item.address || place?.address],
    ['Desde la parada anterior', item.fromPrevious], ['Desde el alojamiento', item.fromHotel],
    ['Transporte', item.transport], ['Si llueve', item.alternate || item.rain], ['Accesibilidad', item.access || place?.access],
    ['Comida', item.food], ['Notas de la actividad', item.notes],
  ].filter(([, value]) => value)
  const notes = app.getState().notes.filter(note => note.activityId === item.id)
  const canChange = !protectedActivity(item)
  const canReopen = item.status === 'done' && !item.fixed && !item.flight
  const dialog = app.openDialog(item.title || 'Actividad sin título', `<div class="pl-activity-detail">
    <p class="pl-detail-meta">${[dayLabel(item.date), item.localTime || item.time || 'Horario flexible', `${item.duration} min`, status].map(esc).join(' · ')}</p>
    <div class="actions pl-detail-actions">${place || item.address ? button('directions','Cómo llegar',item.id,'pl-primary') : ''}${button('note','Añadir nota',item.id)}</div>
    ${item.detail ? `<p class="pl-detail-intro">${esc(item.detail)}</p>` : ''}
    <dl class="pl-detail-facts">${facts.map(([label,value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    ${sourceLink(item.officialUrl || place?.source)}
    ${notes.length ? `<section class="pl-detail-notes"><h3>Diario</h3>${notes.map(note => `<p>${esc(note.text)}</p>`).join('')}</section>` : ''}
    ${canChange || canReopen ? `<details class="pl-detail-options"><summary>Gestionar actividad</summary><div class="actions">
      ${canChange ? `${button('edit','Editar',item.id)}${button('move','Mover a otro día',item.id)}${button('duplicate','Duplicar',item.id)}${button('skip','Omitir',item.id)}${button('archive','Archivar',item.id)}${button('delete','Eliminar y guardar en papelera',item.id,'pl-danger')}` : button('mark-pending','Marcar pendiente',item.id)}
    </div></details>` : '<p class="pl-protected-note">Esta reserva o actividad está protegida.</p>'}
  </div>`)
  dialog.querySelector('.pl-activity-detail')?.addEventListener('click', event => {
    const action = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-pl-action]')?.dataset.plAction : undefined
    if (action) onAction(action, item, dialog)
  })
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
  const advanced = (editing && !!(current.zone || current.category || current.fixed || current.estimatedPrice != null || current.actualPrice != null || current.lat != null || current.lon != null || current.address || current.transport || current.officialUrl || current.mapsUrl || current.detail || current.booking || current.notes || current.access || current.alternate || current.food || current.tickets || current.fromHotel || current.fromPrevious))
  return `<form class="pl-form" data-pl-form="activity"><input type="hidden" name="id" value="${escapeAttr(current.id)}"><input type="hidden" name="date" value="${escapeAttr(current.date)}"><div class="pl-form-grid">
    ${field('Nombre','title',current.title,'text','required maxlength="200"')}<div class="pl-quick-row">${field('Hora (opcional)','time',current.time,'time')}${field('Duración (opcional)','duration',current.duration ?? '','number','min="1" max="1440" placeholder="60"')}</div>
    <label class="pl-field pl-quick-place"><span>Lugar asociado (opcional)</span><select name="placeId">${placeOpts}</select></label>
    <div class="pl-quick-type" aria-label="Tipo de actividad">${[['visita','Visita'],['comida','Comida'],['pausa','Descanso'],['traslado','Traslado'],['custom','Otra']].map(([key,label]) => `<button type="button" class="pl-type${(current.category === key || (!current.category && key === 'custom')) ? ' is-active' : ''}" data-pl-action="quick-type" data-type="${key}">${label}</button>`).join('')}<input type="hidden" name="category" value="${escapeAttr(current.category ?? 'custom')}"></div>
    <details class="pl-advanced"${advanced ? ' open' : ''}><summary>Detalles avanzados</summary><div class="pl-form-grid">
    <label class="pl-field"><span>Día</span><input name="date" type="date" value="${escapeAttr(current.date)}" min="2026-12-03" max="2026-12-12"></label>${field('Zona','zone',current.zone)}<label class="pl-field"><span>Prioridad</span><select name="priority"><option value="principal"${current.priority === 'principal' ? ' selected' : ''}>Imprescindible</option><option value="opcional"${current.priority === 'opcional' ? ' selected' : ''}>Opcional</option><option value="pausa"${current.priority === 'pausa' ? ' selected' : ''}>Descanso</option></select></label><label class="pl-field"><span>Plan</span><select name="plan"><option value="A"${chosen === 'A' ? ' selected' : ''}>Plan A</option><option value="B"${chosen === 'B' ? ' selected' : ''}>Plan B</option></select></label>${field('Categoría','categoryAdvanced',current.category)}
    <label class="pl-check"><input type="checkbox" name="fixed"${current.fixed ? ' checked' : ''}> Reserva u horario fijo</label><label class="pl-field"><span>Esfuerzo</span><select name="effort"><option value="bajo"${current.effort === 'bajo' ? ' selected' : ''}>Suave</option><option value="medio"${current.effort === 'medio' ? ' selected' : ''}>Moderado</option><option value="alto"${current.effort === 'alto' ? ' selected' : ''}>Intenso</option></select></label>
    ${field('Precio estimado','estimatedPrice',current.estimatedPrice ?? '','number','min="0" step="0.01" inputmode="decimal"')}${field('Precio real','actualPrice',current.actualPrice ?? '','number','min="0" step="0.01" inputmode="decimal"')}<label class="pl-field"><span>Moneda</span><select name="priceCurrency">${currencies}</select></label>${field('Latitud','lat',current.lat ?? '','number','step="any" min="-90" max="90"')}${field('Longitud','lon',current.lon ?? '','number','step="any" min="-180" max="180"')}
    ${field('Dirección','address',current.address)}${field('Transporte','transport',current.transport)}${field('Tiempo de trayecto (min)','journeyMinutes',current.journeyMinutes ?? '','number','min="0" max="1440"')}${field('Enlace oficial','officialUrl',current.officialUrl,'url')}${field('Google Maps','mapsUrl',current.mapsUrl,'url')}
    ${area('Descripción','detail',current.detail)}${area('Comida','food',current.food)}${area('Entradas','tickets',current.tickets)}${area('Reserva / información','booking',current.booking)}${area('Notas','notes',current.notes)}${area('Accesibilidad','access',current.access)}${area('Alternativa si llueve','alternate',current.alternate || current.rain)}${area('Trayecto desde el hotel','fromHotel',current.fromHotel)}${area('Trayecto desde la actividad anterior','fromPrevious',current.fromPrevious)}
    </div></details></div><div class="pl-form-actions"><button class="pl-button pl-primary" type="submit">Guardar actividad</button><button class="pl-button" type="button" data-pl-action="close">Cancelar</button></div></form>`
}

export function openActivity(app: AppContext, seed: Partial<Activity> = {}) {
  if (seed.id && isProtectedAction(app, seed.id)) return null
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
    if (target.dataset.plAction === 'delete') removeActivity(app, id, 'delete', dialog)
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
    if (old && protectedActivity(old)) { app.notify('No se pueden modificar reservas fijas, vuelos ni actividades realizadas.'); return }
    const activity = baseActivity({ ...(old ?? {}), date: val('date'), title: val('title'), time: val('time'), duration: Number(val('duration')) || old?.duration || 60,
      placeId: val('placeId'), zone: val('zone'), priority: (val('priority') || (val('category') === 'pausa' ? 'pausa' : 'opcional')) as Activity['priority'], effort: (val('effort') || 'bajo') as Activity['effort'],
      fixed: raw.fixed === 'on', plan: val('plan') === 'B' ? 'B' : 'A', estimatedPrice: num('estimatedPrice'), actualPrice: num('actualPrice'), priceCurrency: currency(raw.priceCurrency),
      lat: num('lat'), lon: num('lon'), address: val('address'), transport: val('transport'), journeyMinutes: num('journeyMinutes'), officialUrl: val('officialUrl'), mapsUrl: val('mapsUrl'),
      category: val('categoryAdvanced') || val('category') || '', detail: val('detail'), booking: val('booking'), notes: val('notes'), access: val('access'), alternate: val('alternate'), rain: val('alternate'), food: val('food'), tickets: val('tickets'), fromHotel: val('fromHotel'), fromPrevious: val('fromPrevious'), custom: old?.custom ?? true,
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
  dialog.addEventListener('change', event => {
    const target = event.target instanceof HTMLSelectElement ? event.target : null
    if (target?.name !== 'placeId' || !target.value) return
    const place = app.places().find(entry => entry.id === target.value)
    const form = target.form
    if (!place || !form) return
    const setIfEmpty = (name: string, value: string | number | null) => {
      const input = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null
      if (input && !input.value && value != null) input.value = String(value)
    }
    setIfEmpty('title', place.name); setIfEmpty('zone', place.area); setIfEmpty('address', place.address)
    setIfEmpty('lat', place.lat); setIfEmpty('lon', place.lon); setIfEmpty('detail', place.description); setIfEmpty('access', place.access)
    const recommended = placeGuides[place.id]?.duration.match(/\d+/)?.[0]
    setIfEmpty('duration', recommended ? Number(recommended) : 60)
  }, { signal: controller.signal })
  dialog.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pl-action="quick-type"]') : null
    if (!target) return
    const form = target.closest('form')
    const input = form?.elements.namedItem('category') as HTMLInputElement | null
    if (input) input.value = target.dataset.type ?? 'custom'
    form?.querySelectorAll('.pl-type').forEach(button => button.classList.toggle('is-active', button === target))
  }, { signal: controller.signal })
  // A touch device should open the form before showing its keyboard.
  if (matchMedia('(pointer: fine)').matches) dialog.querySelector<HTMLInputElement>('[name="title"]')?.focus({ preventScroll: true })
}

function removeActivity(app: AppContext, id: string, action: 'delete' | 'archive', dialog: HTMLDialogElement) {
  const state = app.getState()
  const item = state.activities.find(entry => entry.id === id)
  if (!item) return false
  if (protectedActivity(item)) { app.notify('No se pueden archivar ni eliminar reservas fijas, vuelos o actividades realizadas.'); return false }
  const archive = action === 'archive'
  const next = archive
    ? { ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, archived: true } : entry) }
    : { ...state, activities: state.activities.filter(entry => entry.id !== id), trash: [...(state.trash ?? []).filter(entry => entry.id !== id), { ...item, archived: false }] }
  if (app.commit(next)) {
    dialog.close()
    app.notify(archive ? 'Actividad archivada. Puedes recuperarla en Archivadas.' : 'Actividad eliminada. Puedes recuperarla en Papelera.')
  }
}

function moveInDay(app: AppContext, id: string, offset: number) {
  const state = app.getState()
  const item = state.activities.find(entry => entry.id === id)
  if (!item || protectedActivity(item)) return
  const peers = state.activities.filter(entry => entry.date === item.date && !entry.archived && (entry.plan ?? 'A') === (item.plan ?? 'A') && !protectedActivity(entry))
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
  if (from < 0 || to < 0 || state.activities[from].date !== state.activities[to].date || protectedActivity(state.activities[from]) || protectedActivity(state.activities[to]) || (state.activities[from].plan ?? 'A') !== (state.activities[to].plan ?? 'A')) return
  const activities = [...state.activities]
  const [moved] = activities.splice(from, 1)
  activities.splice(to, 0, moved)
  app.commit({ ...state, activities }, 'Orden actualizado.')
}

type PlannerView = 'day' | 'week' | 'timeline' | 'zones'
const preferences = [['quiet','Día tranquilo'],['normal','Día normal'],['intense','Día intenso'],['rain','Día de lluvia'],['children','Priorizar niñas'],['culture','Cultura'],['food','Gastronomía'],['walking','Minimizar caminatas']]

function dayDateRange(date: string, offset: number) {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + offset)
  return day.toISOString().slice(0, 10)
}
function boundedTripDate(date: string) { return date < '2026-12-03' ? '2026-12-03' : date > '2026-12-12' ? '2026-12-12' : date }
function viewedPlan(state: State, date: string): 'A' | 'B' {
  const saved = readSession(`asia-trip-planner-plan:${date}`)
  return saved === 'A' || saved === 'B' ? saved : activePlan(state, date)
}

function activityDay(app: AppContext, date: string, view: PlannerView, places: Place[], plan: 'A' | 'B', reordering = false) {
  const state = app.getState()
  const items = (plan === activePlan(state, date) ? activeActivities(state, date) : state.activities.filter(item => item.date === date && !item.archived && ((item.plan ?? 'A') === plan || !!item.fixed || !!item.flight)))
  if (view === 'zones') {
    const groups = new Map<string, Activity[]>()
    for (const item of items) { const key = item.zone || places.find(place => place.id === item.placeId)?.area || 'Sin zona'; groups.set(key, [...groups.get(key) ?? [], item]) }
    return [...groups].map(([zone, group]) => `<section class="pl-zone"><h3>${esc(zone)} <small>${group.length} paradas</small></h3>${group.map(item => activityCard(item, places, false)).join('')}</section>`).join('') || `<div class="pl-empty">Aún no hay visitas. Añade una actividad o mueve una idea desde la bandeja.</div>`
  }
  const ordered = view === 'timeline' ? [...items].sort((a, b) => (minute(a.time) ?? 2000) - (minute(b.time) ?? 2000)) : items
  return ordered.length ? ordered.map(item => activityCard(item, places, reordering)).join('') : `<div class="pl-empty">Aún no hay visitas. Añade una actividad o mueve una idea desde la bandeja.</div>`
}

function ideaTray(app: AppContext, places: Place[]) {
  const ideas = app.getState().activities.filter(item => !item.date && !item.archived)
  return `<section class="pl-ideas"><div class="pl-section-head"><div><span class="pl-kicker">BANDEJA</span><h2>Ideas pendientes</h2></div><span>${ideas.length}</span></div><button type="button" class="pl-button" data-pl-action="new-idea">＋ Guardar una idea</button>${ideas.length ? ideas.map(item => `<div class="pl-idea" ${attrs(item)}><div><strong>${esc(item.title)}</strong><small>${esc(item.zone || placeName(item.placeId, places) || 'Sin asignar')}</small></div><select aria-label="Asignar ${esc(item.title)} a un día" data-pl-action="assign" data-id="${escapeAttr(item.id)}"><option value="">Elige día…</option>${Array.from({ length: 10 }, (_, index) => { const date = `2026-12-${String(index + 3).padStart(2, '0')}`; return `<option value="${date}">${dayLabel(date)}</option>` }).join('')}</select>${button('edit','Editar',item.id)}</div>`).join('') : '<p>Guarda aquí lugares e ideas para decidir el día más adelante.</p>'}<div class="pl-select-places"><label>Selecciona varios lugares para añadirlos juntos<select multiple size="4" data-pl-multi>${places.filter(place => place.kind !== 'hotel' && place.kind !== 'airport').map(place => `<option value="${escapeAttr(place.id)}">${esc(place.name)} · ${esc(place.area)}</option>`).join('')}</select></label><button type="button" class="pl-button" data-pl-action="add-selected">Añadir seleccionados a este día</button></div></section>`
}

function preferencesFor(state: State, date: string) {
  const selected = new Set(dayPreference(state, date).preferences)
  return preferences.map(([value, label]) => `<label class="pl-pref"><input type="checkbox" data-pl-action="preference" data-pref="${value}"${selected.has(value) ? ' checked' : ''}><span>${label}</span></label>`).join('')
}

function templateItems(state: State, date: string, places: Place[], full: boolean, zone = '') {
  const used = new Set(state.activities.filter(item => item.date === date).map(item => item.placeId))
  const count = full ? 4 : 2
  const selected = places.filter(place => place.kind !== 'hotel' && place.kind !== 'airport' && (!zone || place.area === zone) && !used.has(place.id)).slice(0, count)
  return selected.map((place, index) => baseActivity({ date, title: place.name, placeId: place.id, zone: place.area, time: full ? ['09:30','11:30','14:30','17:00'][index] : ['09:30','11:30'][index], duration: full ? 75 : 60, priority: 'opcional', detail: place.description, custom: true }))
}

type DaySnapshot = { savedAt: string; activities: Activity[] }
const snapshotKey = (date: string) => `asia-trip-planner-snapshot:${date}`
function readDaySnapshot(date: string): DaySnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(snapshotKey(date)) ?? 'null') as Partial<DaySnapshot> | null
    return value && typeof value.savedAt === 'string' && Array.isArray(value.activities) ? value as DaySnapshot : null
  } catch { return null }
}
function writeDaySnapshot(date: string, activities: Activity[]) {
  try { localStorage.setItem(snapshotKey(date), JSON.stringify({ savedAt: new Date().toISOString(), activities })) } catch { return false }
  return true
}
function protectedActivity(item: Activity) { return !!item.fixed || !!item.flight || item.status === 'done' }
function isProtectedAction(app: AppContext, id: string) {
  const item = app.getState().activities.find(entry => entry.id === id)
  if (!item || !protectedActivity(item)) return false
  app.notify('Esta actividad está protegida porque es una reserva fija, un vuelo o ya está realizada.')
  return true
}
function restoreDaySnapshot(app: AppContext, date: string) {
  const snapshot = readDaySnapshot(date)
  if (!snapshot) return
  const state = app.getState()
  const currentProtected = state.activities.filter(item => item.date === date && protectedActivity(item))
  const keepElsewhere = state.activities.filter(item => item.date !== date)
  const savedEditable = snapshot.activities.filter(item => !protectedActivity(item))
  const ids = new Set(currentProtected.map(item => item.id))
  const activities = [...keepElsewhere, ...currentProtected, ...savedEditable.filter(item => !ids.has(item.id))]
  if (app.commit({ ...state, activities }, 'Versión del día recuperada; reservas y actividades realizadas se han conservado.')) return
}
function moveActivityToDate(app: AppContext, id: string) {
  if (isProtectedAction(app, id)) return
  const item = app.getState().activities.find(entry => entry.id === id)
  if (!item) return
  const options = Array.from({ length: 10 }, (_, index) => {
    const date = `2026-12-${String(index + 3).padStart(2, '0')}`
    return `<option value="${date}"${date === item.date ? ' selected' : ''}>${dayLabel(date)}</option>`
  }).join('')
  const dialog = app.openDialog('Mover actividad', `<form data-pl-move><label class="pl-field"><span>Nuevo día</span><select name="date">${options}</select></label><div class="pl-form-actions"><button class="pl-button pl-primary" type="submit">Mover</button><button class="pl-button" type="button" data-pl-action="close">Cancelar</button></div></form>`)
  const form = dialog.querySelector<HTMLFormElement>('[data-pl-move]')!
  form.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('[data-pl-action="close"]')) dialog.close() })
  form.addEventListener('submit', event => {
    event.preventDefault()
    const date = String(new FormData(form).get('date') ?? '')
    const state = app.getState()
    if (app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, date } : entry) })) {
      dialog.close()
      app.notify('Actividad trasladada.')
    }
  })
}

function bindPlanner(element: HTMLElement, app: AppContext, selectedMode?: PlannerView) {
  const dateKey = app.selectedDate()
  const savedMode = readSession(`asia-trip-planner-mode:${dateKey}`)
  let mode: PlannerView = selectedMode ?? (['day','week','timeline','zones'].includes(savedMode) ? savedMode as PlannerView : 'day')
  let selectedPlan: 'A' | 'B' = viewedPlan(app.getState(), dateKey)
  let showArchived = readSession(`asia-trip-planner-archive:${dateKey}`) === 'true'
  let selectedZone = readSession(`asia-trip-planner-zone:${dateKey}`)
  let reordering = readSession(`asia-trip-planner-reorder:${dateKey}`) === 'true'
  let dragId = ''
  let pointer: { id:number; activity:string; startY:number; y:number } | null = null
  const render = () => {
    const state = app.getState()
    const date = app.selectedDate()
    const places = app.places()
    const items = activitiesForPlan(state, date, selectedPlan)
    const activatedPlan = activePlan(state, date)
    const dayPrefs = dayPreference(state, date)
    const savedSnapshot = readDaySnapshot(date)
    const canReorder = mode === 'day' && items.filter(item => !protectedActivity(item)).length > 1
    const isReordering = canReorder && reordering
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday
    const weekDates = Array.from({ length: 7 }, (_, index) => dayDateRange(date, mondayOffset + index))
    const daysHTML = mode === 'week' ? weekDates.map(day => `<section class="pl-day-section"><div class="pl-day-heading"><div><span class="pl-kicker">${esc(city[getDay(day).city])}</span><h2>${dayLabel(day)}</h2></div><button type="button" class="pl-day-open" data-pl-action="choose-day" data-date="${day}">Abrir día</button></div><div class="pl-timeline">${activityDay(app, day, 'day', places, selectedPlan)}</div></section>`).join('') : ''
    const warnings = plannerWarnings(items, places)
    const warningHTML = warnings.length ? `<aside class="pl-warnings"><strong>Revisa el ritmo</strong>${warnings.map(warning => `<p>${esc(warning.message)}</p>`).join('')}</aside>` : ''
    const archived = [...state.activities.filter(item => item.archived), ...(state.trash ?? [])]
    element.innerHTML = `<section class="planner-shell"><header class="pl-hero"><div><span class="pl-kicker">${esc(city[getDay(date).city])}</span><h1>Planes</h1></div>
      <div class="pl-hero-actions">${canReorder ? `<button type="button" class="pl-button pl-order-toggle" data-pl-action="reorder-mode" aria-pressed="${isReordering}">${isReordering ? 'Terminar' : 'Reordenar'}</button>` : ''}<button class="pl-add" type="button" aria-label="Añadir actividad" data-pl-action="new">＋ <span>Añadir actividad</span></button></div></header>
      <div class="pl-date-strip" role="group" aria-label="Cambiar día"><button type="button" class="pl-date-step" data-pl-action="date-prev" aria-label="Día anterior"${date === '2026-12-03' ? ' disabled' : ''}>${icon('chevron-left')}</button><input aria-label="Día de la agenda" type="date" min="2026-12-03" max="2026-12-12" value="${date}"><button type="button" class="pl-date-step" data-pl-action="date-next" aria-label="Día siguiente"${date === '2026-12-12' ? ' disabled' : ''}>${icon('chevron-right')}</button></div>
      <div class="pl-section-head pl-plan-head"><div><h2>${dayLabel(date)}</h2><span class="pl-kicker">${items.length} ${items.length === 1 ? 'actividad' : 'actividades'}</span></div><div class="pl-plan-switch">${planButton('A',selectedPlan)}${planButton('B',selectedPlan)}${selectedPlan !== activatedPlan ? button('activate-plan',`Activar Plan ${selectedPlan}`,'','pl-activate') : '<span class="pl-active-label">Activo</span>'}</div></div>
      ${warningHTML}${isReordering ? '<p class="pl-order-help">Arrastra el asa o usa las flechas arriba y abajo con el asa enfocada.</p>' : ''}
      ${mode === 'week' ? daysHTML : `<div class="pl-timeline">${activityDay(app,date,mode,places,selectedPlan,isReordering)}</div>`}
      <details class="pl-secondary"><summary>Más herramientas para organizar el día</summary><div class="pl-secondary-content"><div class="pl-secondary-actions">${button('save-version',savedSnapshot ? 'Guardar nueva versión' : 'Guardar versión del día')}${savedSnapshot ? button('restore-version','Recuperar versión guardada') : ''}${modeButton('week',mode,'Semana')}${modeButton('timeline',mode,'Cronología')}${modeButton('zones',mode,'Por zonas')}</div>
      <div class="pl-day-banner"><p>${esc(dayPrefs.preferences.length ? `Preferencias: ${dayPrefs.preferences.map(value => preferences.find(entry => entry[0] === value)?.[1]).filter(Boolean).join(' · ')}` : 'Elige el ritmo de esta jornada si te ayuda a organizarla.')}</p><div class="pl-templates"><label class="pl-zone-choice"><span class="sr-only">Zona de la plantilla</span><select aria-label="Zona de la plantilla" data-pl-zone><option value="">Todas las zonas</option>${[...new Set(places.map(place => place.area).filter(Boolean))].sort().map(zone => `<option value="${esc(zone)}"${zone === selectedZone ? ' selected' : ''}>${esc(zone)}</option>`).join('')}</select></label><button type="button" class="pl-button" data-pl-action="template-half">＋ Media jornada</button><button type="button" class="pl-button" data-pl-action="template-full">＋ Jornada completa</button></div></div>
      <section class="pl-preferences"><h3>Preferencias del día</h3><div class="pl-preference-list">${preferencesFor(state,date)}</div></section>${ideaTray(app,places)}
      <section class="pl-ideas"><h3>Alternativas para Plan B</h3><p>Consultar Plan B y activarlo son acciones independientes.</p>${state.activities.filter(item => item.date === date && item.plan === 'B').map(item => `<div class="pl-idea"><div><strong>${esc(item.title)}</strong><small>${esc(item.time || 'Horario flexible')}</small></div>${button('edit','Editar',item.id)}${button('use-plan','Copiar a A',item.id)}</div>`).join('') || '<p>Aún no hay alternativas. Puedes crear una y elegir Plan B en los detalles.</p>'}</section>
      <section class="pl-archive"><button type="button" class="pl-button" data-pl-action="toggle-archive">${showArchived ? 'Ocultar' : 'Ver'} archivadas y papelera (${archived.length})</button>${showArchived ? `<div class="pl-archived">${archived.map(item => { const deleted = (state.trash ?? []).some(entry => entry.id === item.id); return `<div class="pl-archived-row"><span>${esc(item.title)} <small>${item.date ? dayLabel(item.date) : 'Idea'} · ${deleted ? 'Papelera' : 'Archivada'}</small></span>${button(deleted ? 'restore-trash' : 'restore', deleted ? 'Restaurar' : 'Recuperar', item.id)}</div>` }).join('') || '<p>Sin actividades archivadas o eliminadas.</p>'}</div>` : ''}</section></div></details><button type="button" class="pl-add-float" data-pl-action="new" aria-label="Añadir actividad">＋</button></section>`
  }
  render()
  const restoreDayView = (date: string) => {
    const saved = readSession(`asia-trip-planner-mode:${date}`)
    mode = (['day','week','timeline','zones'].includes(saved) ? saved : 'day') as PlannerView
    selectedPlan = viewedPlan(app.getState(), date)
    showArchived = readSession(`asia-trip-planner-archive:${date}`) === 'true'
    selectedZone = readSession(`asia-trip-planner-zone:${date}`)
    reordering = readSession(`asia-trip-planner-reorder:${date}`) === 'true'
  }

  function detailAction(action: string, item: Activity, dialog: HTMLDialogElement) {
    const state = app.getState()
    const id = item.id
    if (action === 'directions') app.directions(item.placeId, id)
    else if (action === 'note') app.quickNote(id)
    else if (action === 'edit') openActivity(app, item)
    else if (action === 'move') moveActivityToDate(app, id)
    else if (action === 'delete' || action === 'archive') removeActivity(app, id, action, dialog)
    else {
      const update = (activities: Activity[], message: string) => {
        if (app.commit({ ...state, activities })) {
          dialog.close()
          app.notify(message)
        }
      }
      if (action === 'mark-pending' && item.status === 'done' && !item.fixed && !item.flight && window.confirm(`¿Marcar «${item.title}» como pendiente?`)) {
        update(state.activities.map(entry => entry.id === id ? { ...entry, status: 'pending' } : entry), 'Actividad marcada como pendiente.')
      } else if (action === 'skip' && !protectedActivity(item)) {
        update(state.activities.map(entry => entry.id === id ? { ...entry, status: 'skipped' } : entry), 'Actividad omitida.')
      } else if (action === 'duplicate' && !isProtectedAction(app, id)) {
        const copy = baseActivity({ ...item, id: makeId(), title: `${item.title} (copia)`, status: 'pending', fixed: false, flight: undefined, custom: true })
        update([...state.activities, copy], 'Actividad duplicada.')
      }
    }
  }

  element.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pl-action]') : null
    if (!target || !element.contains(target)) return
    const action = target.dataset.plAction ?? ''
    const id = target.dataset.id ?? ''
    const date = app.selectedDate()
    const state = app.getState()
    const item = state.activities.find(entry => entry.id === id) ?? (state.trash ?? []).find(entry => entry.id === id)
    if (action === 'new') {
      target.focus({ preventScroll: true })
      openActivity(app, { date })
    }
    else if (action === 'new-idea') openActivity(app, { date: '' })
    else if (action === 'edit' && item) openActivity(app, item)
    else if (action === 'details' && item) {
      target.focus({ preventScroll: true })
      activityDetails(app, item, detailAction)
    }
    else if (action === 'reorder-mode') {
      reordering = !reordering
      writeSession(`asia-trip-planner-reorder:${date}`, String(reordering))
      render()
      element.querySelector<HTMLElement>('[data-pl-action="reorder-mode"]')?.focus({ preventScroll: true })
    }
    else if (action === 'mode') { mode = target.dataset.mode as PlannerView; writeSession(`asia-trip-planner-mode:${date}`, mode); render() }
    else if (action === 'plan') { selectedPlan = target.dataset.plan === 'B' ? 'B' : 'A'; writeSession(`asia-trip-planner-plan:${date}`, selectedPlan); render() }
    else if (action === 'activate-plan') { if (app.commit(withDayPreference(state, date, { active: selectedPlan }), `Plan ${selectedPlan} activado para esta jornada.`)) render() }
    else if (action === 'save-version') { const snapshotItems = state.activities.filter(entry => entry.date === date); if (writeDaySnapshot(date, snapshotItems)) { app.notify('Versión del día guardada en este dispositivo.'); render() } else app.notify('No se pudo guardar la versión en este dispositivo.') }
    else if (action === 'restore-version') restoreDaySnapshot(app, date)
    else if (action === 'choose-day') { const nextDate = boundedTripDate(target.dataset.date ?? date); app.setSelectedDate(nextDate); restoreDayView(nextDate); render() }
    else if (action === 'date-prev' || action === 'date-next') { const nextDate = boundedTripDate(dayDateRange(date, action === 'date-prev' ? -1 : 1)); app.setSelectedDate(nextDate); restoreDayView(nextDate); render() }
    else if (action === 'toggle-archive') { showArchived = !showArchived; writeSession(`asia-trip-planner-archive:${date}`, String(showArchived)); render() }
    else if (action === 'template-half' || action === 'template-full') { const add = templateItems(state, date, app.places(), action === 'template-full', selectedZone); if (add.length) app.commit({ ...state, activities: [...state.activities, ...add] }, action === 'template-full' ? 'Plantilla de jornada completa añadida.' : 'Plantilla de media jornada añadida.'); else app.notify('No quedan lugares libres en esa zona para esta plantilla.') }
    else if (action === 'add-selected') { const select = element.querySelector<HTMLSelectElement>('[data-pl-multi]'); const picks = [...(select?.selectedOptions ?? [])].map(option => app.places().find(place => place.id === option.value)).filter((place): place is Place => !!place); if (picks.length) { app.commit({ ...state, activities: [...state.activities, ...picks.map(place => baseActivity({ date, title: place.name, placeId: place.id, zone: place.area, detail: place.description, custom: true }))] }, `${picks.length} lugares añadidos al día.`) } }
    else if (action === 'restore' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, archived: false } : entry) }, 'Actividad recuperada.')
    else if (action === 'restore-trash' && item) { const trash = (state.trash ?? []).filter(entry => entry.id !== id); app.commit({ ...state, trash, activities: [...state.activities, { ...item, archived: false }] }, 'Actividad restaurada.') }
    else if (action === 'use-plan' && item && !isProtectedAction(app, id)) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, plan: 'A' } : entry) }, 'Alternativa trasladada al Plan A. Revisa los posibles solapamientos.')
    else if (action === 'toggle-done' && item && !isProtectedAction(app, id)) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, status: 'done' } : entry) }, 'Actividad marcada como realizada.')
  })
  element.addEventListener('keydown', event => {
    const grip = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-pl-action="grab"]') : null
    if (!grip?.dataset.id || !['ArrowUp','ArrowDown'].includes(event.key)) return
    event.preventDefault()
    moveInDay(app, grip.dataset.id, event.key === 'ArrowUp' ? -1 : 1)
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
    if (action === 'status' && item && !isProtectedAction(app, id)) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, status: (target as HTMLSelectElement).value as Activity['status'] } : entry) }, 'Estado guardado.')
    else if (action === 'assign' && item) app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, date: (target as HTMLSelectElement).value } : entry) }, 'Idea asignada al día.')
    else if (action === 'preference') { const date = app.selectedDate(); const value = target.dataset.pref ?? ''; const current = new Set(dayPreference(state, date).preferences); if ((target as HTMLInputElement).checked) current.add(value); else current.delete(value); app.commit(withDayPreference(state, date, { preferences: [...current] }), 'Preferencias del día guardadas.') }
  })
  element.addEventListener('dragstart', event => { const card = (event.target as Element).closest<HTMLElement>('.pl-activity[draggable="true"]'); if (card) { dragId = card.dataset.item ?? ''; event.dataTransfer?.setData('text/plain', dragId); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move' } })
  element.addEventListener('dragend', () => { dragId = '' })
  element.addEventListener('dragover', event => { if ((event.target as Element).closest('[data-item]')) event.preventDefault() })
  element.addEventListener('drop', event => { const card = (event.target as Element).closest<HTMLElement>('[data-item]'); const target = card?.dataset.item ?? ''; if (dragId && target) { event.preventDefault(); reorder(app,dragId,target); dragId = '' } })
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
