import './style.css'
import { baseActivities, checklist, places } from './data'
import { activityForm, budgetForm, dialogContent, expenseForm, noteForm, placeForm } from './dialogs'
import { asiaDate, convertAmount, createInitialState, loadState, MAX_BACKUP_BYTES, parseBackup, saveState, serializeBackup, toSafeCSVCell } from './state'
import { registerSW } from './sw-register'
import type { Activity, Currency, Expense, Note, Place, State } from './types'
import { button, cityHotel, dateLong, directions, e, getDay, getPlace, icon, labels, mapSearch, offlineText, option, placeQuery, planningDay, routes, statuses, type Route } from './ui'
import { agenda, diary, emergencyLinks, home, placeList, placeView, transportView, travel, type PlaceView } from './views'

const root = document.querySelector<HTMLElement>('#app')!
root.innerHTML = `<a class="skip" href="#content">Saltar al contenido</a><aside class="sidebar"><a class="brand" href="#inicio"><span class="brand-icon">${icon('compass')}</span><span><strong>Asia Trip</strong><small>Singapur · Kuala Lumpur</small></span></a><nav class="navigation" aria-label="Navegación principal">${routes.map(item => `<a href="#${item}" data-route="${item}">${icon(item)}<span>${labels[item]}</span></a>`).join('')}</nav><div class="side-foot"><div class="route-card"><small>DICIEMBRE 2026</small><div><span>BIO</span><span>SIN</span><span>KUL</span></div></div></div></aside><div class="workspace"><header class="topbar"><a class="mobile-brand" href="#inicio"><span class="brand-icon">${icon('compass')}</span><strong>Asia Trip</strong></a><div class="top-date">${icon('agenda')} <span id="asia-today"></span></div><div class="top-actions"><span id="offline-status" class="offline-status" role="status">${icon('wifi')} <span></span></span><button class="icon-button theme-button" type="button" aria-label="Preferencias de apariencia" data-action="theme">${icon('moon')}</button></div></header><main id="content" tabindex="-1"></main></div><dialog id="modal" aria-labelledby="dialog-title"></dialog><div class="toast" role="status" aria-live="polite" hidden></div>`

const content = document.querySelector<HTMLElement>('#content')!
const modal = document.querySelector<HTMLDialogElement>('#modal')!
const toast = document.querySelector<HTMLElement>('.toast')!
const knownPlaceIds = places.map(p => p.id)
const appPath = new URL(import.meta.env.BASE_URL, location.href).pathname
const storage = {
  getItem: (key: string) => localStorage.getItem(`${key}:${appPath}`),
  setItem: (key: string, value: string) => localStorage.setItem(`${key}:${appPath}`, value),
}
const baseline = createInitialState(baseActivities, [])
const stored = loadState(storage, knownPlaceIds)
let state = stored.state ?? baseline
let isCorrupt = stored.status === 'corrupt'
let storageWarning = stored.status === 'unavailable' ? 'El almacenamiento local no está disponible. Los cambios requieren un navegador con almacenamiento habilitado.' : isCorrupt ? 'La copia local no se pudo leer. Puedes restaurar una copia JSON desde el diario.' : ''
let agendaDate = planningDay(new Date())
let tab: 'notes' | 'expenses' | 'backup' = 'notes'
const view: PlaceView = { tab: 'list', date: agendaDate, query: '', city: 'all', kind: 'all', selection: '' }
let timer = 0
let returnFocus: HTMLElement | null = null
let routeContext: { destination: Place; hotel?: Place; previous?: Place; coords: string; activity?: Activity } | undefined

function route(): Route {
  const candidate = location.hash.slice(1) as Route
  return routes.includes(candidate) ? candidate : 'inicio'
}

function announce(message: string) {
  clearTimeout(timer)
  const output = modal.open ? modal.querySelector<HTMLElement>('.modal-feedback') ?? toast : toast
  output.hidden = false
  output.textContent = message
  timer = window.setTimeout(() => { output.hidden = true }, 5200)
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme
}

function updateTopbar(now = new Date()) {
  document.querySelector('#asia-today')!.textContent = `${dateLong(asiaDate(now))} · UTC+8`
  const ready = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller
  document.querySelector('#offline-status span')!.textContent = offlineText(ready)
  document.querySelector('#offline-status')!.classList.toggle('ready', ready)
}

function actionSelector(element: HTMLElement | null) {
  const action = element?.dataset.action
  const id = element?.dataset.id
  return action ? `[data-action="${CSS.escape(action)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}` : ''
}

function render(focusPage = false) {
  const section = route()
  const now = new Date()
  document.title = section === 'inicio' ? 'Asia Trip 2026' : `${labels[section]} · Asia Trip 2026`
  document.querySelectorAll<HTMLElement>('[data-route]').forEach(link => {
    if (link.dataset.route === section) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  const focused = document.activeElement instanceof HTMLElement && content.contains(document.activeElement) ? document.activeElement : null
  const focusTarget = actionSelector(focused)
  const open = [...content.querySelectorAll<HTMLDetailsElement>('details[open]')].map(details => details.closest<HTMLElement>('[data-activity], [data-place]')?.dataset).filter(Boolean)
  const screen = { inicio: () => home(state, now), agenda: () => agenda(state, agendaDate, now), lugares: () => placeView(state, view), transporte: transportView, diario: () => diary(state, tab), viaje: () => travel(state) }
  content.innerHTML = (storageWarning ? `<div class="storage-warning" role="alert">${e(storageWarning)}</div>` : '') + screen[section]()
  for (const entry of open) {
    const id = entry?.activity ?? entry?.place
    if (!id) continue
    const details = content.querySelector<HTMLDetailsElement>(`[data-${entry?.activity ? 'activity' : 'place'}="${CSS.escape(id)}"] details`)
    if (details) details.open = true
  }
  applyTheme()
  updateTopbar(now)
  if (focusPage) {
    content.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  } else if (focusTarget) content.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true })
}

function go(to: Route) {
  if (route() === to) render(true)
  else location.hash = to
}

function save(next: State, restore = false) {
  if (isCorrupt && !restore && !confirm('La copia local está dañada. ¿Quieres sustituirla con el plan de este dispositivo?')) return false
  if (!saveState(next, storage, knownPlaceIds)) {
    announce('No se pudo guardar. Revisa los campos o el espacio de almacenamiento. Los datos anteriores se conservan.')
    return false
  }
  state = next
  isCorrupt = false
  storageWarning = ''
  return true
}

function show(title: string, html: string) {
  if (!modal.open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  modal.innerHTML = dialogContent(title, `<p class="modal-feedback storage-warning" role="status" hidden></p>${html}`)
  if (!modal.open) modal.showModal()
}

function finish(message: string) {
  const focusTarget = actionSelector(returnFocus)
  modal.close()
  render()
  if (focusTarget) (content.querySelector<HTMLElement>(focusTarget) ?? content).focus({ preventScroll: true })
  announce(message)
}

function openDirections(id: string, activityId?: string) {
  const destination = getPlace(state, id)
  if (!destination) return
  const now = new Date()
  const planned = state.activities.filter(item => item.placeId === id).sort((a,b) => a.date.localeCompare(b.date))
  const section = route()
  const date = section === 'agenda' ? agendaDate : section === 'lugares' && view.tab === 'map' ? view.date : planned.find(item => item.date >= asiaDate(now))?.date ?? planned[0]?.date ?? agendaDate
  const visits = state.activities.filter(activity => activity.date === date)
  const index = visits.findIndex(item => activityId ? item.id === activityId : item.placeId === id)
  const prior = index > 0 ? visits.slice(0, index).reverse().find(item => item.status !== 'skipped' && item.placeId && item.placeId !== id) : undefined
  const previous = prior ? getPlace(state, prior.placeId) : undefined
  const hotel = getPlace(state, getDay(date).hotelId ?? cityHotel(destination.city))
  const originHotel = hotel?.city === destination.city ? hotel : getPlace(state, cityHotel(destination.city))
  routeContext = { destination, previous, hotel: originHotel?.id === destination.id ? undefined : originHotel, coords: '', activity: visits[index] }
  const origin = routeContext.hotel ? 'hotel' : previous ? 'previous' : 'location'
  show('Cómo llegar', `<p><strong>${e(destination.name)}</strong> · ${e(destination.address)}</p><div class="form-grid"><label class="field"><span>Origen</span><select id="direction-origin">${routeContext.hotel ? option('hotel', `Hotel · ${routeContext.hotel.name}`, origin) : ''}${previous ? option('previous', `Lugar anterior · ${previous.name}`, origin) : ''}${option('location', 'Ubicación actual', origin)}</select></label><label class="field"><span>Modo</span><select id="direction-mode">${option('walking','A pie','walking')}${option('transit','Transporte público','walking')}${option('driving','Coche / Grab','walking')}</select></label></div><div class="actions" id="gps-actions" hidden>${button('Usar mi ubicación', 'locate','lugares')}</div><p id="direction-detail" class="muted"></p><p>Google Maps necesita conexión. Si eliges tu ubicación, se comparte con Maps al abrir el enlace.</p><div class="actions"><a class="button primary" id="open-directions" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a><a class="button" href="${e(mapSearch(destination))}" target="_blank" rel="noopener noreferrer">Ver en el mapa</a>${button('Copiar dirección', 'copy', 'copy', '', id)}</div>`)
  updateDirections()
}

function updateDirections() {
  if (!routeContext) return
  const { destination, hotel, previous, coords, activity } = routeContext
  const origin = modal.querySelector<HTMLSelectElement>('#direction-origin')?.value
  const mode = modal.querySelector<HTMLSelectElement>('#direction-mode')?.value ?? 'walking'
  const source = origin === 'hotel' ? hotel : origin === 'previous' ? previous : undefined
  const link = modal.querySelector<HTMLAnchorElement>('#open-directions')
  if (!link) return
  const urlOrigin = source ? placeQuery(source) : origin === 'location' ? coords : ''
  if (urlOrigin) { link.href = directions(destination, urlOrigin, mode); link.removeAttribute('aria-disabled') }
  else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true') }
  modal.querySelector<HTMLElement>('#gps-actions')!.hidden = origin !== 'location'
  modal.querySelector('#direction-detail')!.textContent = origin === 'location' ? (coords ? 'Ubicación obtenida para esta consulta.' : 'Activa tu ubicación para preparar las indicaciones.') : (origin === 'hotel' ? activity?.fromHotel : activity?.fromPrevious) || 'Tiempo del tramo pendiente. Comprueba el trayecto al abrir Maps.'
}

function locate() {
  const requesting = routeContext
  if (!requesting || !navigator.geolocation) { announce('La ubicación no está disponible en este navegador.'); return }
  const detail = modal.querySelector('#direction-detail')
  if (detail) detail.textContent = 'Obteniendo ubicación…'
  navigator.geolocation.getCurrentPosition(position => {
    if (routeContext !== requesting || !modal.open) return
    requesting.coords = `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`
    updateDirections()
  }, () => {
    if (routeContext === requesting && detail) detail.textContent = 'No se pudo obtener la ubicación. Comprueba el permiso o elige otro origen.'
  }, { timeout: 12000, maximumAge: 0 })
}

function download(filename: string, body: string, mime: string) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function exportCSV() {
  const rows = [['Fecha', 'Concepto', 'Categoría', 'Importe original', 'Moneda', 'EUR por unidad (manual)', 'Importe EUR'], ...state.expenses.map(exp => [exp.date, exp.title, exp.category, exp.amount.toFixed(2), exp.currency, exp.currency === 'EUR' ? 1 : state.rates[exp.currency] ?? '', convertAmount(exp.amount, exp.currency, state.rates)?.toFixed(2) ?? ''])]
  download('asia-trip-gastos.csv', '\uFEFF' + rows.map(row => row.map(toSafeCSVCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
}

async function restore(file: File) {
  let imported: State
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('size')
    imported = parseBackup(await file.text(), knownPlaceIds)
    const checkIds = new Set(checklist.map(item => item.id))
    if (imported.checks.some(id => !checkIds.has(id))) throw new Error('checklist')
  } catch {
    announce('Archivo inválido o versión incompatible. Revisa que sea una copia JSON de Asia Trip.'); return
  }
  if (!confirm('¿Restaurar copia? Se sustituirán la agenda, las notas, los gastos y los ajustes locales.')) return
  if (save(imported, true)) { render(); announce('Copia restaurada.') }
}

function reorder(id: string, direction: number) {
  const list = [...state.activities]
  const index = list.findIndex(item => item.id === id)
  if (index < 0) return
  const dayItems = list.filter(item => item.date === list[index].date)
  const neighbor = dayItems[dayItems.findIndex(item => item.id === id) + direction]
  if (!neighbor) return
  const target = list.indexOf(neighbor)
  ;[list[index], list[target]] = [list[target], list[index]]
  if (save({ ...state, activities: list })) render()
}

async function copyAddress(id: string) {
  const place = getPlace(state,id)
  if (!place) return
  try { await navigator.clipboard.writeText(place.address); announce('Dirección copiada.') }
  catch { window.prompt('Copia la dirección:', place.address) }
}

function remove(kind: string, id: string) {
  if (!confirm('¿Borrar este elemento?')) return
  let next: State
  if (kind === 'delete-activity') next = { ...state, activities: state.activities.filter(item => item.id !== id || !item.custom) }
  else if (kind === 'delete-note') next = { ...state, notes: state.notes.filter(item => item.id !== id) }
  else if (kind === 'delete-expense') next = { ...state, expenses: state.expenses.filter(item => item.id !== id) }
  else {
    if (state.activities.some(item => item.placeId === id) || state.notes.some(item => item.placeId === id)) { announce('Primero desvincula el lugar de sus actividades y notas.'); return }
    next = { ...state, customPlaces: state.customPlaces.filter(item => item.id !== id), favorites: state.favorites.filter(item => item !== id) }
  }
  if (save(next)) finish('Elemento borrado.')
}

root.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return
  if (event.target.closest('.skip')) { event.preventDefault(); content.focus(); return }
  const target = event.target.closest<HTMLElement>('[data-action]')
  if (!(target instanceof HTMLButtonElement)) return
  const action = target.dataset.action ?? ''
  const id = target.dataset.id ?? ''
  switch (action) {
    case 'today': agendaDate = planningDay(new Date()); go('agenda'); break
    case 'agenda-day': agendaDate = id; go('agenda'); break
    case 'select-day': agendaDate = id; render(); break
    case 'directions': openDirections(id, target.closest<HTMLElement>('[data-activity]')?.dataset.activity); break
    case 'locate': locate(); break
    case 'copy': void copyAddress(id); break
    case 'family': if (save({ ...state, family: !state.family })) go('inicio'); break
    case 'emergency': show('Emergencias', emergencyLinks()); break
    case 'theme': show('Apariencia', `<form data-form="theme"><label class="field"><span>Tema</span><select name="theme">${option('auto','Sistema',state.theme)}${option('light','Claro',state.theme)}${option('dark','Oscuro',state.theme)}</select></label><button class="button primary" type="submit">Guardar apariencia</button></form>`); break
    case 'new-activity': show('Nueva actividad', activityForm(state, agendaDate)); break
    case 'edit-activity': show('Editar actividad', activityForm(state, agendaDate, state.activities.find(item => item.id === id))); break
    case 'up': reorder(id, -1); break
    case 'down': reorder(id, 1); break
    case 'place-list': view.tab = 'list'; render(); break
    case 'place-map': view.tab = 'map'; render(); break
    case 'favorite': if (save({ ...state, favorites: state.favorites.includes(id) ? state.favorites.filter(value => value !== id) : [...state.favorites, id] })) render(); break
    case 'marker': view.selection = id; render(); break
    case 'new-place': show('Nuevo lugar', placeForm()); break
    case 'edit-place': show('Editar lugar', placeForm(state.customPlaces.find(item => item.id === id))); break
    case 'diary-notes': tab = 'notes'; render(); break
    case 'diary-expenses': tab = 'expenses'; render(); break
    case 'diary-backup': tab = 'backup'; render(); break
    case 'new-note': show('Nueva nota', noteForm(state, agendaDate)); break
    case 'edit-note': show('Editar nota', noteForm(state, agendaDate, state.notes.find(item => item.id === id))); break
    case 'new-expense': show('Nuevo gasto', expenseForm(agendaDate)); break
    case 'edit-expense': show('Editar gasto', expenseForm(agendaDate, state.expenses.find(item => item.id === id))); break
    case 'budget': show('Configurar presupuesto', budgetForm(state)); break
    case 'export-json':
      try { download('asia-trip-copia.json', serializeBackup(state, knownPlaceIds), 'application/json;charset=utf-8') }
      catch { announce('No se pudo preparar la copia de seguridad.') }
      break
    case 'export-csv': exportCSV(); break
    case 'delete-activity': case 'delete-place': case 'delete-note': case 'delete-expense': remove(action, id); break
    case 'close-dialog': modal.close(); break
  }
})

root.addEventListener('input', event => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.dataset.action === 'place-query') {
    view.query = target.value
    document.querySelector('#place-results')!.innerHTML = placeList(state, view)
  }
})

root.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return
  const action = target.dataset.action
  if (target.id === 'direction-origin' || target.id === 'direction-mode') { updateDirections(); return }
  if (action === 'agenda-date') { agendaDate = target.value; render() }
  if (action === 'map-date') { view.date = target.value; view.selection = ''; render() }
  if (action === 'place-city') { view.city = target.value; render() }
  if (action === 'place-kind') { view.kind = target.value; render() }
  if (action === 'status' && Object.hasOwn(statuses, target.value)) {
    const status = target.value as Activity['status']
    const activities = state.activities.map(item => item.id === target.dataset.id ? { ...item, status } : item)
    save({ ...state, activities }); render()
  }
  if (action === 'check' && target instanceof HTMLInputElement && target.dataset.id) {
    const id = target.dataset.id
    const checks = target.checked ? [...new Set([...state.checks,id])] : state.checks.filter(item => item !== id)
    save({ ...state, checks }); render()
  }
  if (action === 'import' && target instanceof HTMLInputElement && target.files?.[0]) { const file = target.files[0]; target.value = ''; void restore(file) }
})

function upsert<T extends { id: string }>(list: T[], item: T) {
  return list.some(old => old.id === item.id) ? list.map(old => old.id === item.id ? item : old) : [...list,item]
}

function formState(form: HTMLFormElement) {
  const values = new FormData(form)
  const value = (key: string) => String(values.get(key) ?? '').trim()
  const number = (key: string) => value(key) ? Number(value(key)) : null
  const id = value('id') || crypto.randomUUID()
  const date = value('date')
  const placeId = value('placeId')
  if (form.dataset.form === 'activity') {
    const old = state.activities.find(item => item.id === id)
    const item: Activity = { id, date, placeId, title: value('title'), time: value('time'), duration: Number(value('duration')), zone: value('zone'), effort: value('effort') as Activity['effort'], priority: value('priority') as Activity['priority'], status: old?.status ?? 'pending', food: value('food'), tickets: value('tickets'), rain: value('rain'), detail: value('detail'), fromHotel: value('fromHotel'), fromPrevious: value('fromPrevious'), flight: old?.flight, localTime: old?.localTime, custom: old ? old.custom : true }
    if (!item.title) throw new Error('Escribe un nombre para la actividad.')
    const activities = old && old.date !== item.date ? [...state.activities.filter(previous => previous.id !== id), item] : upsert(state.activities, item)
    return { ...state, activities }
  }
  if (form.dataset.form === 'place') {
    const item: Place = { id, name: value('name'), city: value('city') as Place['city'], kind: value('kind') as Place['kind'], area: value('area'), address: value('address'), lat: number('lat'), lon: number('lon'), description: value('description'), photo: value('photo'), access: value('access'), shade: value('shade'), price: value('price') }
    if (!item.name || !item.address) throw new Error('Escribe el nombre y la dirección del lugar.')
    if ((item.lat === null) !== (item.lon === null)) throw new Error('Rellena las dos coordenadas o deja ambas vacías.')
    return { ...state, customPlaces: upsert(state.customPlaces, item) }
  }
  if (form.dataset.form === 'note') {
    const note: Note = { id, date, placeId, text: value('text'), memory: value('memory'), rating: number('rating') }
    if (!note.text) throw new Error('Escribe una nota antes de guardarla.')
    return { ...state, notes: upsert(state.notes, note) }
  }
  if (form.dataset.form === 'expense') {
    const expense: Expense = { id, date, title: value('title'), amount: Number(value('amount')), currency: value('currency') as Currency, category: value('category') }
    if (!expense.title) throw new Error('Escribe un concepto para el gasto.')
    return { ...state, expenses: upsert(state.expenses, expense) }
  }
  if (form.dataset.form === 'budget') return { ...state, budget: number('budget'), rates: { SGD: number('SGD'), MYR: number('MYR') } }
  if (form.dataset.form === 'theme') return { ...state, theme: value('theme') as State['theme'] }
  return state
}

root.addEventListener('submit', event => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return
  event.preventDefault()
  try {
    if (save(formState(form))) finish('Cambios guardados.')
  } catch (error) { announce(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.') }
})

modal.addEventListener('close', () => {
  if (modal.open) return
  routeContext = undefined
  modal.replaceChildren()
  if (returnFocus?.isConnected) returnFocus.focus()
  returnFocus = null
})
window.addEventListener('hashchange', () => render(true))
window.addEventListener('online', () => updateTopbar())
window.addEventListener('offline', () => updateTopbar())
navigator.serviceWorker?.addEventListener('controllerchange', () => updateTopbar())
window.setInterval(() => {
  updateTopbar()
  if (route() === 'inicio' && !modal.open && !content.contains(document.activeElement)) render()
}, 60_000)
render()
registerSW()
