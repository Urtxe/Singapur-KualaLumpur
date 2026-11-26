import './style.css'
import './premium.css'
import './planner.css'
import './finance.css'
import './offline.css'
import './trip-design.css'
import { BASE_UPDATED_ACTIVITY_IDS, baseActivities, days } from './data'
import type { AppContext } from './app-api'
import { dialogContent, noteForm, placeForm } from './dialogs'
import { asiaDate, createInitialState, loadState, refreshBaseActivities, saveState, stampChanges, STORAGE_KEY } from './state'
import { registerSW } from './sw-register'
import { mountPlanner, openActivity } from './planner'
import { mountToday } from './today'
import { mountFinance, openExpense } from './finance'
import { mountExchange } from './exchange-view'
import { mountOffline } from './offline-view'
import { getAttachment, removeAttachment, storeAttachment } from './vault'
import { eventFilters, eventSeed, eventsView, foodFilters, foodResults, gastronomy, safetyView } from './guide-view'
import { journalView } from './journal'
import type { Activity, Note, Place, State } from './types'
import { activeActivities, activePlan, activitiesForPlan, allPlaces, button, cityHotel, directions, e, getDay, getPlace, icon, labels, mapSearch, offlineText, option, placeQuery, planningDay, primaryRoutes, publicPlaces, routes, type Route } from './ui'
import { placeList, placeView, preparations, transportView, travel, type PlaceView } from './views'

const root = document.querySelector<HTMLElement>('#app')!
const navLink = (item: Route) => `<a href="#${item}" data-route="${item}">${icon(item)}<span>${labels[item]}</span></a>`
root.innerHTML = `
  <a class="skip" href="#content">Saltar al contenido</a>
  <aside class="sidebar">
    <a class="brand" href="#inicio"><span class="brand-icon">${icon('compass')}</span><span><strong>SNG-KLL</strong><small>Singapur · Kuala Lumpur</small></span></a>
    <nav class="navigation" aria-label="Navegación principal">${primaryRoutes.map(navLink).join('')}</nav>
  </aside>
  <div class="workspace">
    <header class="topbar"><a class="mobile-brand" href="#inicio"><span class="brand-icon">${icon('compass')}</span><strong>SNG-KLL</strong></a>
      <div class="top-actions"><a href="#offline" id="offline-status" class="offline-status" aria-label="Diagnóstico offline">${icon('wifi')} <span role="status"></span></a>
        <button type="button" class="button theme-shortcut" data-action="toggle-theme"></button></div></header>
    <main id="content" tabindex="-1"></main>
  </div>
  <dialog id="modal" aria-labelledby="dialog-title"></dialog><div class="toast" role="status" aria-live="polite" hidden></div>`

const themeShortcut = root.querySelector<HTMLButtonElement>('.theme-shortcut')!
const content = document.querySelector<HTMLElement>('#content')!
const modal = document.querySelector<HTMLDialogElement>('#modal')!
const toast = document.querySelector<HTMLElement>('.toast')!
const knownPlaceIds = publicPlaces.map(p => p.id)
const appPath = new URL(import.meta.env.BASE_URL, location.href).pathname
const storage = {
  getItem: (key: string) => localStorage.getItem(`${key}:${appPath}`),
  setItem: (key: string, value: string) => localStorage.setItem(`${key}:${appPath}`, value),
  removeItem: (key: string) => localStorage.removeItem(`${key}:${appPath}`),
}
const baseline = createInitialState(baseActivities, [])
const stored = loadState(storage, knownPlaceIds)
let state = stored.state ?? baseline
if (stored.state) state = refreshBaseActivities(state, BASE_UPDATED_ACTIVITY_IDS)
if (stored.status === 'empty' || stored.migrated || state !== stored.state) saveState(state, storage, knownPlaceIds)
function diskSnapshot() {
  try { return storage.getItem(STORAGE_KEY) } catch { return null }
}
let lastSaved = diskSnapshot()
let isCorrupt = stored.status === 'corrupt'
let storageWarning = stored.status === 'unavailable' ? 'El almacenamiento local no está disponible. Los cambios requieren un navegador con almacenamiento habilitado.' : isCorrupt ? 'La copia local no se pudo leer. Puedes recuperarla en Compartir e importar.' : ''
let agendaDate = planningDay(new Date())
let todayPreview: string | undefined
function placeDate(date: string) {
  if (getDay(date).city !== 'air') return date
  return days.find(day => day.date >= date && day.city !== 'air')?.date ?? [...days].reverse().find(day => day.date <= date && day.city !== 'air')?.date ?? date
}
const exploreDate = placeDate(agendaDate)
const view: PlaceView = { tab: 'list', date: exploreDate, query: '', city: 'all', kind: 'featured', selection: '', mapCity: getDay(exploreDate).city === 'kl' ? 'kl' : 'sg', mapFilter: 'day', centered: false }
let timer = 0
let returnFocus: HTMLElement | null = null
let routeContext: { destination: Place; hotel?: Place; previous?: Place; coords: string; activity?: Activity } | undefined
const journalImages = new Set<string>()

const app: AppContext = {
  getState: () => state,
  commit: (next, message) => commit(next, message),
  applyImported: (next, message) => commit(next, message, true),
  render: () => render(),
  notify: announce,
  openDialog: show,
  navigate: path => { if (routes.includes(path as Route)) go(path as Route) },
  directions: openDirections,
  places: () => allPlaces(state),
  selectedDate: () => agendaDate,
  setSelectedDate: setAgendaDate,
  todayPreview: () => todayPreview,
  setTodayPreview: date => { todayPreview = date },
  quickSpend: activityId => openExpense(app, activityId),
  quickNote: activityId => openNote(undefined, activityId),
}

function route(): Route {
  const candidate = location.hash.slice(1) as Route
  return routes.includes(candidate) ? candidate : 'inicio'
}

function setAgendaDate(date: string) {
  agendaDate = date
  view.date = placeDate(date)
  view.selection = ''
  view.centered = false
  const city = getDay(view.date).city
  if (city !== 'air') view.mapCity = city
}

function navigationSection(section: Route) {
  if (primaryRoutes.some(link => link === section)) return section
  return section === 'eventos' || section === 'gastronomia' || section === 'transporte' ? 'lugares' : 'mas'
}

function announce(message: string) {
  clearTimeout(timer)
  const output = modal.open ? modal.querySelector<HTMLElement>('.modal-feedback') ?? toast : toast
  output.hidden = false
  output.textContent = message
  timer = window.setTimeout(() => { output.hidden = true }, 5200)
}

const systemAppearance = matchMedia('(prefers-color-scheme: dark)')

function applyTheme() {
  const effectiveTheme = state.theme === 'auto' ? (systemAppearance.matches ? 'dark' : 'light') : state.theme
  const rootElement = document.documentElement
  if (rootElement.dataset.theme === effectiveTheme) return
  rootElement.dataset.theme = effectiveTheme
  const night = effectiveTheme === 'dark'
  themeShortcut.setAttribute('aria-label', night ? 'Activar modo normal' : 'Activar modo noche')
  themeShortcut.innerHTML = `${icon(night ? 'sun' : 'moon')}<span>${night ? 'Normal' : 'Noche'}</span>`
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = getComputedStyle(rootElement).getPropertyValue('--page').trim()
}

function updateTopbar() {
  document.querySelector('#offline-status span')!.textContent = offlineText()
  document.querySelector('#offline-status')!.classList.toggle('ready', navigator.onLine)
}

function actionSelector(element: HTMLElement | null) {
  const action = element?.dataset.action
  const id = element?.dataset.id
  return action ? `[data-action="${CSS.escape(action)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}` : ''
}

function render(focusPage = false) {
  const section = route()
  document.documentElement.dataset.route = section
  document.querySelectorAll<HTMLElement>('[data-route]').forEach(link => {
    if (link.dataset.route === navigationSection(section)) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  const focused = document.activeElement instanceof HTMLElement && content.contains(document.activeElement) ? document.activeElement : null
  const focusTarget = actionSelector(focused)
  const open = [...content.querySelectorAll<HTMLDetailsElement>('details[open]')].map(details => details.closest<HTMLElement>('[data-activity], [data-place]')?.dataset).filter(Boolean)
  for (const url of journalImages) URL.revokeObjectURL(url)
  journalImages.clear()
  const screens: Partial<Record<Route, () => string>> = {
    lugares: () => placeView(state, view), transporte: () => transportView(state),
    viaje: () => travel(state), preparativos: () => preparations(state), mas: moreView,
    diario: () => journalView(state), eventos: eventsView, gastronomia: () => gastronomy(state), emergencias: () => safetyView(state),
  }
  const mounted: Partial<Record<Route, (element: HTMLElement, ctx: AppContext) => void>> = {
    inicio: mountToday, agenda: mountPlanner, gastos: mountFinance, compartir: mountExchange,
    offline: (element, app) => mountOffline(element, app, 'diagnostics'), documentos: (element, app) => mountOffline(element, app, 'files'),
  }
  content.innerHTML = (storageWarning ? `<div class="storage-warning" role="alert">${e(storageWarning)}</div>` : '') +
    (screens[section]?.() ?? '<div id="route-body"></div>')
  const body = content.querySelector<HTMLElement>('#route-body')
  if (body) mounted[section]?.(body,app)
  if (section === 'diario') void loadJournalPhotos()
  for (const entry of open) {
    const id = entry?.activity ?? entry?.place
    if (!id) continue
    const details = content.querySelector<HTMLDetailsElement>(`[data-${entry?.activity ? 'activity' : 'place'}="${CSS.escape(id)}"] details`)
    if (details) details.open = true
  }
  applyTheme()
  updateTopbar()
  if (focusPage) {
    content.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  } else if (focusTarget) content.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true })
}

function go(to: Route) {
  if (route() === to) render(true)
  else location.hash = to
}

function moreView() {
  const item = (route: Route, glyph: string = route) => `<a href="#${route}"><span class="more-icon">${icon(glyph)}</span><span>${labels[route]}</span></a>`
  const appearance = ([
    ['light', 'Normal', 'sun'],
    ['dark', 'Noche', 'moon'],
    ['auto', 'Sistema', 'settings'],
  ] as const).map(([value, label, glyph]) => `<button type="button" data-action="theme" data-id="${value}" aria-pressed="${state.theme === value}">${icon(glyph)}${label}</button>`).join('')
  return `<section class="more-screen"><header class="page-head"><h1>Más</h1></header><div class="more-layout">
    <nav class="more-group" aria-label="Viaje"><h2>El viaje</h2>${item('viaje','plane')}${item('preparativos')}${item('diario')}${item('emergencias')}</nav>
    <section class="more-group" aria-labelledby="more-device"><h2 id="more-device">En este dispositivo</h2>${item('compartir')}${item('documentos','document')}${item('offline','wifi')}
      <div class="more-appearance"><h3 id="appearance-heading">Apariencia</h3><div class="segmented" role="group" aria-labelledby="appearance-heading">${appearance}</div></div>
      <details class="more-settings"><summary><span class="more-icon">${icon('settings')}</span>Configuración</summary><div class="actions">${button(state.family ? 'Desactivar modo familia' : 'Activar modo familia','family','people')}</div></details>
    </section></div></section>`
}

const activityGroup = (item: Activity) => `${item.date}:${item.plan ?? 'A'}`

function groupedActivities(items: Activity[]) {
  const result = new Map<string,Activity[]>()
  for (const item of items) {
    const key = activityGroup(item)
    const group = result.get(key) ?? []
    group.push(item)
    result.set(key,group)
  }
  return result
}

function stampActivityOrder(before: Activity[], after: Activity[]) {
  if (before === after) return after
  const previous = groupedActivities(before)
  const order = new Map<string,number>()
  for (const [key, group] of groupedActivities(after)) {
    const old = previous.get(key) ?? []
    if (old.length === group.length && group.every((item,index) => item.id === old[index].id)) continue
    group.forEach((item,index)=>order.set(item.id,index))
  }
  return after.map(item => order.has(item.id) ? { ...item,order:order.get(item.id) } : item)
}

function applyActivityOrder(items: Activity[]) {
  const groups = groupedActivities(items)
  for (const group of groups.values()) group.sort((a,b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
  const nextIndex = new Map<string,number>()
  return items.map(item => {
    const key = activityGroup(item)
    const index = nextIndex.get(key) ?? 0
    nextIndex.set(key,index + 1)
    return groups.get(key)![index]
  })
}

async function loadJournalPhotos() {
  for (const image of content.querySelectorAll<HTMLImageElement>('img[data-photo]')) {
    try {
      const record = await getAttachment(image.dataset.photo!)
      if (!record || !image.isConnected || !record.type.startsWith('image/')) continue
      const url = URL.createObjectURL(record.blob)
      journalImages.add(url)
      image.src = url
      image.hidden = false
    } catch { /* El diario de texto sigue disponible. */ }
  }
}

function save(next: State, restore = false, imported = false) {
  const disk = diskSnapshot()
  if (disk !== lastSaved) {
    const latest = loadState(storage, knownPlaceIds)
    if (latest.state) {
      state = latest.state
      lastSaved = disk
      render()
      announce('Los datos cambiaron en otra pestaña. Revisa la versión actual antes de volver a guardar.')
      return false
    }
  }
  if (isCorrupt && !restore && !confirm('La copia local está dañada. ¿Quieres sustituirla con el plan de este dispositivo?')) return false
  const updated = imported ? { ...next, activities:applyActivityOrder(next.activities) } :
    stampChanges(state,{ ...next, activities:stampActivityOrder(state.activities,next.activities) })
  if (!saveState(updated, storage, knownPlaceIds)) {
    announce('No se pudo guardar. Revisa los campos o el espacio de almacenamiento. Los datos anteriores se conservan.')
    return false
  }
  state = updated
  lastSaved = diskSnapshot()
  isCorrupt = false
  storageWarning = ''
  return true
}

function commit(next: State, message?: string, imported = false) {
  if (!save(next, imported, imported)) return false
  render()
  if (message) announce(message)
  return true
}

function show(title: string, html: string) {
  if (!modal.open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  modal.innerHTML = dialogContent(title, `<p class="modal-feedback storage-warning" role="status" hidden></p>${html}`)
  if (!modal.open) modal.showModal()
  modal.scrollTop = 0
  return modal
}

function finish(message: string) {
  const focusTarget = actionSelector(returnFocus)
  modal.close()
  render()
  if (focusTarget) (content.querySelector<HTMLElement>(focusTarget) ?? content).focus({ preventScroll: true })
  announce(message)
}

function openDirections(id: string, activityId?: string) {
  const act = state.activities.find(item => item.id === activityId)
  const activityCity = act && getDay(act.date).city
  const destination = getPlace(state, id) ?? (act?.address ? { id: act.id, name: act.title, city: activityCity === 'kl' ? 'kl' : 'sg', area: act.zone,
    kind: 'optional' as const, address: act.address, lat: act.lat ?? null, lon: act.lon ?? null, description: act.detail, photo: '', access: act.access ?? '', shade: '', price: '' } : undefined)
  if (!destination) return
  const now = new Date()
  const planned = activeActivities(state).filter(item => item.placeId === id).sort((a,b) => a.date.localeCompare(b.date))
  const section = route()
  const date = act?.date || (section === 'agenda' ? agendaDate : section === 'lugares' && view.tab === 'map' ? view.date : planned.find(item => item.date >= asiaDate(now))?.date ?? planned[0]?.date ?? agendaDate)
  const visits = act && !act.fixed && !act.flight ? activitiesForPlan(state,date,act.plan ?? 'A') : activeActivities(state,date)
  const index = visits.findIndex(item => activityId ? item.id === activityId : item.placeId === id)
  const prior = index > 0 ? visits.slice(0, index).reverse().find(item => item.status !== 'skipped' && item.placeId && item.placeId !== id) : undefined
  const previous = prior ? getPlace(state, prior.placeId) : undefined
  const hotel = getPlace(state, getDay(date).hotelId ?? cityHotel(destination.city))
  const originHotel = hotel?.city === destination.city ? hotel : getPlace(state, cityHotel(destination.city))
  routeContext = { destination, previous, hotel: originHotel?.id === destination.id ? undefined : originHotel, coords: '', activity: visits[index] ?? act }
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

async function copyAddress(id: string) {
  const place = getPlace(state,id)
  if (!place) return
  await copyText(place.address,'Dirección copiada.')
}

async function copyText(value: string, message: string) {
  try { await navigator.clipboard.writeText(value); announce(message) }
  catch { window.prompt('Copia este texto', value) }
}

function openNote(note?: Note, activityId?: string) {
  const activity = state.activities.find(item => item.id === activityId)
  const seed = note ?? (activity ? { id:'', date:activity.date || agendaDate, placeId:activity.placeId, text:'', rating:null, memory:'', activityId:activity.id } : undefined)
  show(note ? 'Editar nota' : 'Nueva nota', noteForm(state, agendaDate, seed))
}

async function saveJournal(form: HTMLFormElement) {
  const formData = new FormData(form)
  const input = formData.get('photo')
  let uploaded: string | undefined
  try {
    const next = formState(form)
    const id = String(formData.get('id') || '')
    const note = id ? next.notes.find(item => item.id === id) : next.notes.at(-1)
    if (!note) return
    if (input instanceof File && input.size) uploaded = (await storeAttachment(input,'photo')).id
    if (uploaded) note.photoId = uploaded
    if (save(next)) finish('Recuerdo guardado.')
    else if (uploaded) await removeAttachment(uploaded)
  } catch (error) {
    if (uploaded) await removeAttachment(uploaded).catch(() => undefined)
    announce(error instanceof Error ? error.message : 'No se pudo guardar el recuerdo.')
  }
}

function remove(kind: string, id: string) {
  if (!confirm('¿Borrar este elemento?')) return
  let next: State
  if (kind === 'delete-note') next = { ...state, notes: state.notes.filter(item => item.id !== id) }
  else {
    if ([...state.activities,...state.trash].some(item => item.placeId === id) || state.notes.some(item => item.placeId === id)) { announce('Primero desvincula el lugar de sus actividades, papelera y notas.'); return }
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
    case 'select-day': setAgendaDate(id); render(); break
    case 'directions': openDirections(id, target.closest<HTMLElement>('[data-activity]')?.dataset.activity); break
    case 'locate': locate(); break
    case 'copy': void copyAddress(id); break
    case 'emergency': go('emergencias'); break
    case 'toggle-theme':
      commit({ ...state, theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })
      break
    case 'theme':
      if ((id === 'light' || id === 'dark' || id === 'auto') && id !== state.theme) commit({ ...state, theme: id })
      break
    case 'family': commit({ ...state, family: !state.family }, state.family ? 'Modo familia desactivado.' : 'Modo familia activado.'); break
    case 'explore-city': view.city = id; render(); break
    case 'explore-category': view.kind = id; render(); break
    case 'place-list': view.tab = 'list'; render(); break
    case 'place-map': view.tab = 'map'; if (view.city === 'sg' || view.city === 'kl') view.mapCity = view.city; render(); break
    case 'favorite': if (save({ ...state, favorites: state.favorites.includes(id) ? state.favorites.filter(value => value !== id) : [...state.favorites, id] })) render(); break
    case 'marker': view.selection = id; render(); break
    case 'center-map': view.centered = !view.centered; render(); break
    case 'place-add': {
      const place = getPlace(state,id)
      if (place) openActivity(app,{title:place.name,date:agendaDate,plan:activePlan(state,agendaDate),placeId:id,zone:place.area,address:place.address,lat:place.lat,lon:place.lon,detail:place.description,officialUrl:place.source})
      break
    }
    case 'event-add': {
      const seed = eventSeed(id,agendaDate)
      if (seed) openActivity(app,seed)
      break
    }
    case 'dish-tried':
      commit({ ...state,triedDishes: state.triedDishes.includes(id) ? state.triedDishes.filter(value => value !== id) : [...state.triedDishes,id] }, 'Gastronomía actualizada.'); break
    case 'driver': {
      const place = getPlace(state,id)
      if (place) void copyText(`Please take us to ${place.name}. ${place.address}. We are five passengers.`, 'Mensaje para el conductor copiado.')
      break
    }
    case 'new-place': show('Nuevo lugar', placeForm()); break
    case 'edit-place': show('Editar lugar', placeForm(state.customPlaces.find(item => item.id === id))); break
    case 'new-note': openNote(); break
    case 'edit-note': openNote(state.notes.find(item => item.id === id)); break
    case 'print-journal': window.print(); break
    case 'delete-place': case 'delete-note': remove(action, id); break
    case 'close-dialog': modal.close(); break
  }
})

root.addEventListener('input', event => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.dataset.action === 'place-query') {
    view.query = target.value
    document.querySelector('#place-results')!.innerHTML = placeList(state, view)
  }
  if (target instanceof HTMLInputElement && target.dataset.action === 'dish-query') {
    foodFilters.query = target.value
    const results = content.querySelector('#food-results')
    if (results) results.innerHTML = foodResults(state)
  }
})

root.addEventListener('change', event => {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return
  const action = target.dataset.action
  if (target.id === 'direction-origin' || target.id === 'direction-mode') { updateDirections(); return }
  if (action === 'explore-date') { setAgendaDate(target.value); render(); return }
  if (action === 'map-date') { view.date = target.value; view.selection = ''; view.centered = false; const location = getDay(view.date).city; if (location !== 'air') view.mapCity = location; render() }
  if (action === 'map-city' && (target.value === 'sg' || target.value === 'kl')) { view.mapCity = target.value; view.selection = ''; view.centered = false; render() }
  if (action === 'map-filter') { view.mapFilter = target.value; view.centered = false; render() }
  if (action === 'place-city') { view.city = target.value; render() }
  if (action === 'place-kind') { view.kind = target.value; render() }
  if (action === 'event-date') { eventFilters.date = target.value; render() }
  if (action === 'event-city') { eventFilters.city = target.value; render() }
  if (action === 'event-category') { eventFilters.category = target.value; render() }
  if (action === 'event-price') { eventFilters.price = target.value; render() }
  if (action === 'dish-city') { foodFilters.city = target.value; render() }
  if (action === 'dish-only-tried' && target instanceof HTMLInputElement) { foodFilters.tried = target.checked; render() }
  if (action === 'check' && target instanceof HTMLInputElement && target.dataset.id) {
    const id = target.dataset.id
    const checks = target.checked ? [...new Set([...state.checks,id])] : state.checks.filter(item => item !== id)
    save({ ...state, checks }); render()
  }
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
  if (form.dataset.form === 'place') {
    const item: Place = { id, name: value('name'), city: value('city') as Place['city'], kind: value('kind') as Place['kind'], area: value('area'), address: value('address'), lat: number('lat'), lon: number('lon'), description: value('description'), photo: value('photo'), access: value('access'), shade: value('shade'), price: value('price') }
    if (!item.name || !item.address) throw new Error('Escribe el nombre y la dirección del lugar.')
    if ((item.lat === null) !== (item.lon === null)) throw new Error('Rellena las dos coordenadas o deja ambas vacías.')
    return { ...state, customPlaces: upsert(state.customPlaces, item) }
  }
  if (form.dataset.form === 'note') {
    const existing = state.notes.find(item => item.id === id)
    const note: Note = { id, date, placeId, text: value('text'), memory: value('memory'), rating: number('rating'), activityId: value('activityId') || undefined, photoId: value('clearPhoto') ? undefined : existing?.photoId }
    if (!note.text) throw new Error('Escribe una nota antes de guardarla.')
    return { ...state, notes: upsert(state.notes, note) }
  }
  return state
}

root.addEventListener('submit', event => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return
  event.preventDefault()
  if (form.dataset.form === 'note') { void saveJournal(form); return }
  try {
    if (save(formState(form))) finish('Cambios guardados.')
  } catch (error) { announce(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.') }
})

modal.addEventListener('close', () => {
  if (modal.open) return
  routeContext = undefined
  modal.replaceChildren()
  const opener = returnFocus
  returnFocus = null
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  else if (opener?.matches('.pl-add, .pl-add-float')) {
    content.querySelector<HTMLElement>(`.${opener.matches('.pl-add-float') ? 'pl-add-float' : 'pl-add'}`)?.focus({ preventScroll: true })
  }
})
window.addEventListener('hashchange', () => {
  if (modal.open) {
    returnFocus = null
    modal.close()
  }
  render(true)
})
function connectionChanged() { if (route() === 'inicio' && !modal.open) render(); else updateTopbar() }
window.addEventListener('online', connectionChanged)
window.addEventListener('offline', connectionChanged)
systemAppearance.addEventListener('change', applyTheme)
navigator.serviceWorker?.addEventListener('controllerchange', () => updateTopbar())
window.setInterval(() => {
  updateTopbar()
  if (route() === 'inicio' && !modal.open && !content.contains(document.activeElement)) render()
}, 60_000)
render()
registerSW()
