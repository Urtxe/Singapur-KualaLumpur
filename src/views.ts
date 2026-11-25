import { alerts, checklist, days, rainPlans, sources, transport } from './data'
import { asiaDate, convertAmount } from './state'
import type { Activity, Place, State } from './types'
import { activeDay, allPlaces, button, categories, city, currentHotel, dateLong, dateShort, dayOptions, e, getDay, getPlace, icon, kind, mapSearch, money, nextActivity, option, sourceLink, statuses, title, tripEnd, tripStart } from './ui'

export function emergencyLinks() {
  return `<div class="emergency-grid"><section><h3>Singapur</h3><a class="button" href="tel:999">Policía · 999</a><a class="button" href="tel:995">Ambulancia y bomberos · 995</a></section><section><h3>Malasia</h3><a class="button" href="tel:999">Emergencias · 999</a></section></div>`
}

export function home(state: State, now: Date) {
  const active = activeDay(now)
  const next = nextActivity(state, now)
  const hotel = currentHotel(state, now)
  const before = +now < tripStart
  const after = +now > tripEnd
  const minutes = Math.max(0, Math.ceil((tripStart - +now) / 60_000))
  const done = state.activities.filter(item => item.status === 'done').length
  const skipped = state.activities.filter(item => item.status === 'skipped').length
  const progress = state.activities.length ? Math.round((done + skipped) * 100 / state.activities.length) : 0
  const hotelButton = hotel ? button('Volver al hotel', 'directions', 'hotel', '', hotel.id) : ''
  const nextPlace = getPlace(state, next?.placeId ?? '')
  const nextCard = next ? `<article class="card next-card"><div class="eyebrow muted">${icon(next.flight ? 'plane' : 'compass')} ${before ? 'Primera etapa' : 'Siguiente etapa'}</div><div class="next-info"><div><h2>${e(next.title)}</h2><p>${e(next.detail || next.zone)}</p></div><div class="next-date"><b>${dateShort(next.date)}</b><time>${e(next.time)}</time></div></div>${next.flight === 'provisional' ? '<span class="tag warm">Vuelo provisional</span>' : ''}<div class="actions">${button('Ver en agenda', 'agenda-day', 'agenda', '', next.date)}${nextPlace ? button('Cómo llegar', 'directions', 'lugares', '', nextPlace.id) : ''}</div></article>` : '<article class="card"><h2>Sin etapas pendientes</h2><p>Consulta tu agenda o recupera tus recuerdos en el diario.</p></article>'
  if (state.family) return `${title('Modo familia', active ? dateLong(active.date) : 'Singapur y Kuala Lumpur', button('Volver a vista completa', 'family', 'people'))}${nextCard}${next ? `<div class="card family-times"><h2>Tiempos orientativos</h2><p><strong>Desde el hotel</strong> ${e(next.fromHotel || 'Pendiente')}</p><p><strong>Desde la parada anterior</strong> ${e(next.fromPrevious || 'Pendiente')}</p></div>` : ''}<div class="actions prominent">${hotelButton}${button('Emergencias', 'emergency', 'shield', 'danger')}</div>`
  return `<section class="hero" aria-labelledby="trip-title"><div class="hero-content"><div class="eyebrow hero-kicker"><span></span> VIAJE EN FAMILIA</div><h1 id="trip-title">Asia Trip <em>2026</em></h1><p>Singapur <span class="hero-dot">·</span> Kuala Lumpur</p><div class="hero-meta">${icon('agenda')} 3–12 diciembre ${icon('people')} 5 viajeros</div></div><div class="hero-caption">SINGAPUR</div></section>
  <div class="quick-actions"><button class="quick" type="button" data-action="today"><span class="quick-icon">${icon('agenda')}</span><span><b>${active ? 'Agenda de hoy' : 'Ir a la agenda'}</b><small>${active ? e(dateLong(active.date)) : 'El plan día a día'}</small></span></button>${hotel ? `<button class="quick" type="button" data-action="directions" data-id="${e(hotel.id)}"><span class="quick-icon">${icon('hotel')}</span><span><b>Volver al hotel</b><small>${e(hotel.name)}</small></span></button>` : ''}<button class="quick" type="button" data-action="family"><span class="quick-icon">${icon('people')}</span><span><b>Modo familia</b><small>Solo lo esencial</small></span></button></div>
  <section class="dashboard"><div class="dashboard-main">${nextCard}<div class="card advisories"><h2>Avisos del viaje</h2>${alerts.slice(0, 4).map((alert, i) => `<div class="notice"><span class="notice-icon">${icon(i === 0 ? 'alert' : 'clock')}</span><div><h3>${e(alert.title)}</h3><p>${e(alert.detail)}</p></div></div>`).join('')}</div></div><div class="dashboard-side"><article class="card countdown"><div class="eyebrow">${icon('clock')} ${before ? 'Falta para salir' : after ? 'Viaje finalizado' : 'Viaje en marcha'}</div>${before ? `<div class="count-nums"><div><b>${Math.floor(minutes / 1440)}</b><span>días</span></div><div><b>${Math.floor(minutes % 1440 / 60)}</b><span>horas</span></div><div><b>${minutes % 60}</b><span>min</span></div></div>` : `<h2>${active ? e(dateLong(active.date)) : '3–12 de diciembre'}</h2>`}<p>${before ? 'Salida de Bilbao · 3 dic, 11:55 (hora local)' : 'La fecha de la agenda se calcula en UTC+8.'}</p></article><article class="card"><h2>Avance del plan</h2><div class="progress-line"><progress aria-label="Avance del plan" max="100" value="${progress}">${progress}%</progress><strong>${progress}%</strong></div><p>${done} realizadas · ${skipped} omitidas · ${state.activities.length - done - skipped} pendientes</p></article></div></section>`
}

function activity(item: Activity, state: State, index: number, count: number) {
  const place = getPlace(state, item.placeId)
  const label = item.flight === 'confirmed' ? '<span class="tag ok">Vuelo confirmado</span>' : item.flight === 'provisional' ? '<span class="tag warm">Vuelo provisional</span>' : ''
  return `<article class="activity card status-${item.status}" data-activity="${e(item.id)}"><div class="activity-top"><div><div class="activity-meta">${label}<span>${e(item.zone || place?.area || 'Plan propio')}</span></div><h3>${e(item.title)}</h3><p class="activity-time">${icon('clock')} ${e(item.time)} · ${item.duration} min${item.localTime ? ` · ${e(item.localTime)}` : ''}</p></div><label class="activity-status"><span class="sr-only">Estado de ${e(item.title)}</span><select data-action="status" data-id="${e(item.id)}">${Object.entries(statuses).map(([value, name]) => option(value, name, item.status)).join('')}</select></label></div>
  ${item.detail ? `<p>${e(item.detail)}</p>` : ''}<div class="tags"><span class="tag">Esfuerzo ${e(item.effort)}</span><span class="tag ${item.priority === 'principal' ? 'ok' : ''}">${e(item.priority)}</span></div>
  <details><summary>Comida, entradas y plan B</summary><dl class="facts">${[[ 'Comida', item.food ], [ 'Entradas', item.tickets ], [ 'Si llueve', item.rain ], [ 'Desde el hotel', item.fromHotel ], [ 'Desde la parada anterior', item.fromPrevious ]].map(([key, value]) => `<div><dt>${key}</dt><dd>${e(value || 'Pendiente')}</dd></div>`).join('')}</dl></details>
  <div class="activity-controls"><div class="actions">${place ? button(`Cómo llegar a ${place.name}`, 'directions', 'lugares', 'compact', place.id) : ''}<button type="button" class="button compact" aria-label="Editar actividad ${e(item.title)}" data-action="edit-activity" data-id="${e(item.id)}">Editar</button></div><div class="actions reorder"><button type="button" class="button compact" aria-label="Subir ${e(item.title)}" data-action="up" data-id="${e(item.id)}"${index === 0 ? ' disabled' : ''}>Subir</button><button type="button" class="button compact" aria-label="Bajar ${e(item.title)}" data-action="down" data-id="${e(item.id)}"${index === count - 1 ? ' disabled' : ''}>Bajar</button></div></div></article>`
}

export function agenda(state: State, date: string, now: Date) {
  const day = getDay(date)
  const today = asiaDate(now)
  const items = state.activities.filter(item => item.date === date)
  return `${title('Agenda', 'Horas locales, descansos y alternativas para cada día.', button('Añadir actividad', 'new-activity', 'plus', 'primary'))}<div class="day-tabs" role="group" aria-label="Días del viaje">${days.map(d => `<button type="button" class="day-tab${date === d.date ? ' selected' : ''}" data-action="select-day" data-id="${d.date}" aria-pressed="${date === d.date}"><small>${d.date === today ? 'Hoy' : dateLong(d.date).split(',')[0].split(' ')[0]}</small><b>${d.date.slice(-2)}</b></button>`).join('')}</div><div class="card day-banner"><div><div class="eyebrow muted">${e(dateLong(date))} · ${city[day.city]}</div><h2>${e(day.title)}</h2><p>${e(day.subtitle)}</p></div><label><span class="sr-only">Día de la agenda</span><select data-action="agenda-date">${dayOptions(date)}</select></label></div><div class="timeline">${items.map((item, i) => activity(item, state, i, items.length)).join('') || '<div class="card empty">Todavía no hay actividades para este día.</div>'}</div>`
}

export interface PlaceView { tab: 'list' | 'map'; date: string; query: string; city: string; kind: string; selection: string }

function placeCard(place: Place, state: State) {
  const favorite = state.favorites.includes(place.id)
  return `<article class="card place-card" data-place="${e(place.id)}"><div class="place-top"><span class="tag ${place.kind === 'must' ? 'ok' : ''}">${kind[place.kind]}</span><button type="button" class="icon-button favorite${favorite ? ' chosen' : ''}" data-action="favorite" data-id="${e(place.id)}" aria-pressed="${favorite}" aria-label="Favorito ${e(place.name)}">${icon('star')}</button></div><h2>${e(place.name)}</h2><p class="muted locality">${icon('lugares')} ${city[place.city]} · ${e(place.area)}</p><p>${e(place.description)}</p><details><summary>Fotografía, acceso y sombra</summary><dl class="facts">${[['Foto', place.photo], ['Accesibilidad', place.access], ['Sombra', place.shade], ['Precio', place.price], ['Dirección', place.address]].map(([key, val]) => `<div><dt>${key}</dt><dd>${e(val || 'Pendiente')}</dd></div>`).join('')}</dl>${sourceLink(place.source)}</details><div class="actions">${button(`Cómo llegar a ${place.name}`, 'directions', 'lugares', 'compact', place.id)}${button('Copiar dirección', 'copy', 'copy', 'compact', place.id)}<a class="button compact" href="${e(mapSearch(place))}" target="_blank" rel="noopener noreferrer">Abrir Maps</a>${state.customPlaces.some(item => item.id === place.id) ? button('Editar lugar', 'edit-place', '', 'compact', place.id) : ''}</div></article>`
}

function normalized(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

export function placeList(state: State, view: PlaceView) {
  const query = normalized(view.query.trim())
  const matches = allPlaces(state).filter(place => (view.city === 'all' || view.city === place.city) && (view.kind === 'all' || view.kind === place.kind || (view.kind === 'favorite' && state.favorites.includes(place.id))) && normalized(`${place.name} ${place.address} ${place.area} ${city[place.city]}`).includes(query))
  return `<p class="result-count" aria-live="polite">${matches.length} ${matches.length === 1 ? 'lugar' : 'lugares'}</p><div class="places-grid">${matches.map(place => placeCard(place, state)).join('') || '<div class="card empty">No hay lugares con esos filtros.</div>'}</div>`
}

function geographicMap(state: State, view: PlaceView) {
  const day = getDay(view.date)
  const located = allPlaces(state).filter((p): p is Place & {lat:number;lon:number} => p.lat !== null && p.lon !== null)
  const visits = state.activities.filter(a => a.date === day.date).flatMap(item => {
    const place = located.find(p => p.id === item.placeId)
    return place ? [place] : []
  })
  const hotel = located.find(p => p.id === day.hotelId)
  const unique = Array.from(new Map((hotel ? [hotel, ...visits] : visits).map(p => [p.id, p])).values())
  const bounds = unique.length ? unique : [{lat: 0, lon: 0}]
  const midLat = (Math.min(...bounds.map(p => p.lat)) + Math.max(...bounds.map(p => p.lat))) / 2
  const midLon = (Math.min(...bounds.map(p => p.lon)) + Math.max(...bounds.map(p => p.lon))) / 2
  const cos = Math.cos(midLat * Math.PI / 180)
  const span = Math.max(0.003, ...bounds.map(p => Math.max(Math.abs(p.lat - midLat), Math.abs((p.lon - midLon) * cos))))
  const point = (p: typeof bounds[number]) => [50 + (p.lon - midLon) * cos / span * 36, 50 - (p.lat - midLat) / span * 36]
  const itinerary = visits.length > 1 ? `<svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${visits.map(p => point(p).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width=".75" stroke-dasharray="2 1.4" vector-effect="non-scaling-stroke"/></svg>` : ''
  const chosen = unique.find(p => p.id === view.selection)
  const map = unique.length ? `<div class="map-layout"><div class="map-plot" role="group" aria-label="Mapa geográfico esquemático"><span class="map-north" aria-hidden="true">↑ N</span>${itinerary}${unique.map(p => {
    const [x, y] = point(p)
    const sequence = visits.findIndex(item => item.id === p.id) + 1
    return `<button type="button" class="map-pin${p.id === view.selection ? ' selected' : ''}" style="--x:${x}%;--y:${y}%" data-action="marker" data-id="${e(p.id)}" aria-label="Punto ${sequence || 'hotel'}: ${e(p.name)}" aria-pressed="${p.id === view.selection}">${sequence || icon('hotel')}</button>`
  }).join('')}</div><div class="map-itinerary"><h3>Orden de visitas</h3>${visits.length ? `<ol>${visits.map(p => `<li><button class="text-link" type="button" data-action="marker" data-id="${e(p.id)}">${e(p.name)}</button></li>`).join('')}</ol>` : '<p>Sin visitas ubicadas.</p>'}${hotel ? `<button class="text-link" type="button" data-action="marker" data-id="${e(hotel.id)}">${icon('hotel')} ${e(hotel.name)}</button>` : ''}</div></div>` : '<p>Este día no tiene paradas con coordenadas en el mapa.</p>'
  return `<div class="card map-card"><div class="section-line"><div><h2>Mapa esquemático offline</h2><p>Coordenadas aproximadas. Las líneas indican el orden de visita.</p></div><label><span class="sr-only">Día del mapa</span><select data-action="map-date">${dayOptions(view.date)}</select></label></div>${map}<p class="muted">Este mapa no contiene calles, rutas transitables ni tráfico. Para indicaciones, Google Maps necesita conexión.</p></div>${chosen ? `<div class="map-selected">${placeCard(chosen, state)}</div>` : ''}<section class="card map-landmarks"><h2>Hoteles y aeropuertos</h2><ul>${allPlaces(state).filter(p => p.kind === 'hotel' || p.kind === 'airport').map(p => `<li>${icon(p.kind === 'hotel' ? 'hotel' : 'plane')} <strong>${e(p.name)}</strong> <span>${e(p.address)}</span> ${button('Cómo llegar', 'directions', '', 'compact', p.id)}</li>`).join('')}</ul></section>`
}

export function placeView(state: State, view: PlaceView) {
  const content = view.tab === 'list' ? `<div class="filter-bar"><label class="search-field">${icon('search')}<span class="sr-only">Buscar lugares</span><input type="search" data-action="place-query" placeholder="Busca un lugar o un barrio" value="${e(view.query)}"></label><label><span class="sr-only">Ciudad</span><select data-action="place-city">${[['all','Todas las ciudades'],['sg','Singapur'],['kl','Kuala Lumpur']].map(([v,l]) => option(v,l,view.city)).join('')}</select></label><label><span class="sr-only">Tipo de lugar</span><select data-action="place-kind">${[['all','Todos los tipos'],...Object.entries(kind),['favorite','Favoritos']].map(([v,l]) => option(v,l,view.kind)).join('')}</select></label></div><div id="place-results">${placeList(state, view)}</div>` : geographicMap(state, view)
  return `${title('Lugares', 'Encuentra un sitio para visitar, comer o refugiarte de la lluvia.', button('Añadir lugar','new-place','plus','primary'))}<div class="segmented" role="group" aria-label="Vista de lugares"><button type="button" data-action="place-list" aria-pressed="${view.tab === 'list'}">${icon('list')} Lista</button><button type="button" data-action="place-map" aria-pressed="${view.tab === 'map'}">${icon('map')} Mapa</button></div>${content}`
}

export function transportView() {
  return `${title('Transporte', 'Opciones para cinco viajeros, con tiempo para conexiones y equipaje.')}<div class="reference-grid">${transport.map((item) => `<article class="card reference"><span class="quick-icon">${icon('transporte')}</span><h2>${e(item.title)}</h2><p>${e(item.detail)}</p>${sourceLink(item.source)}</article>`).join('')}</div>`
}

function expenseSummary(state: State) {
  const byDay = new Map<string, {total:number;pending:number}>()
  const byCategory = new Map<string, {total:number;pending:number}>()
  let total = 0, pending = 0
  for (const expense of state.expenses) {
    const converted = convertAmount(expense.amount, expense.currency, state.rates)
    const day = byDay.get(expense.date) ?? {total:0,pending:0}
    const category = byCategory.get(expense.category) ?? {total:0,pending:0}
    if (converted === null) { pending++; day.pending++; category.pending++ }
    else { total += converted; day.total += converted; category.total += converted }
    byDay.set(expense.date, day)
    byCategory.set(expense.category, category)
  }
  return { total, pending, byDay, byCategory }
}

export function diary(state: State, tab: 'notes' | 'expenses' | 'backup') {
  const tabs = `<div class="segmented" role="group" aria-label="Sección del diario">${[['notes','Notas'],['expenses','Gastos'],['backup','Copias']].map(([key, name]) => `<button type="button" data-action="diary-${key}" aria-pressed="${key === tab}">${e(name)}</button>`).join('')}</div>`
  const summary = expenseSummary(state)
  const groups = (rows: Map<string, {total:number;pending:number}>, date = false) => `<ul class="totals">${Array.from(rows.entries()).sort().map(([key, entry]) => `<li><span>${e(date ? dateShort(key) : key)}${entry.pending ? ` · ${entry.pending} sin cambiar` : ''}</span><strong>${e(money(entry.total))}</strong></li>`).join('')}</ul>`
  let panel = ''
  if (tab === 'notes') panel = `<div class="section-line"><h2>Notas y recuerdos</h2>${button('Añadir nota', 'new-note', 'plus', 'primary')}</div>${state.notes.length ? `<div class="reference-grid">${[...state.notes].sort((a,b) => a.date.localeCompare(b.date)).map(note => `<article class="card"><div class="eyebrow muted">${dateShort(note.date)} ${e(getPlace(state,note.placeId)?.name || '')}</div><h3>${e(note.memory || 'Nota del viaje')}</h3><p class="preserve">${e(note.text)}</p>${note.rating ? `<p>Valoración · ${note.rating}/5</p>` : ''}${button('Editar nota', 'edit-note', '', 'compact', note.id)}</article>`).join('')}</div>` : '<div class="card empty">Aún no hay notas. Puedes guardar un recuerdo por día y lugar.</div>'}`
  if (tab === 'expenses') panel = `<div class="section-line"><h2>Gastos</h2><div class="actions">${button('Configurar presupuesto', 'budget', 'wallet')}${button('Añadir gasto', 'new-expense', 'plus','primary')}</div></div><div class="reference-grid ledger"><article class="card"><div class="eyebrow muted">${icon('wallet')} Total convertido</div><strong class="total-amount">${e(money(summary.total))}</strong><p>${state.budget === null ? 'Presupuesto sin configurar' : `Presupuesto ${money(state.budget)} · ${money(state.budget - summary.total)} de saldo sobre el total convertido`}</p><p class="muted">Tipos manuales (EUR por 1 unidad) · SGD ${e(state.rates.SGD ?? 'pendiente')} · MYR ${e(state.rates.MYR ?? 'pendiente')}${summary.pending ? ` · ${summary.pending} sin convertir` : ''}</p></article><article class="card"><h3>Por día</h3>${summary.byDay.size ? groups(summary.byDay,true) : '<p>Aún no hay gastos.</p>'}<h3>Por categoría</h3>${summary.byCategory.size ? groups(summary.byCategory) : '<p>Aún no hay gastos.</p>'}</article></div><section class="card"><div class="section-line"><h3>Movimientos</h3>${button('Exportar CSV', 'export-csv')}</div>${state.expenses.length ? `<ul class="expense-list">${[...state.expenses].sort((a,b) => b.date.localeCompare(a.date)).map(exp => { const converted = convertAmount(exp.amount,exp.currency,state.rates); return `<li><div><b>${e(exp.title)}</b><p>${dateShort(exp.date)} · ${e(exp.category)} · ${converted === null ? 'Sin tipo manual' : e(money(converted))}</p></div><strong>${e(money(exp.amount, exp.currency))}</strong>${button('Editar', 'edit-expense', '', 'compact', exp.id)}</li>` }).join('')}</ul>` : '<p>No hay movimientos guardados.</p>'}</section>`
  if (tab === 'backup') panel = `<section class="card backup-card"><h2>Copias de seguridad</h2><p>El plan base forma parte de la app. Tus cambios, notas, gastos y favoritos se guardan en este navegador. Descarga una copia para conservarlos o llevarlos a otro dispositivo.</p><div class="actions">${button('Exportar JSON', 'export-json')}${button('Exportar CSV', 'export-csv')}</div><label class="field file-field"><span>Restaurar copia JSON</span><input type="file" accept="application/json,.json" data-action="import"></label><p class="muted">Una restauración sustituye todos los datos locales. Guarda la copia fuera de carpetas públicas.</p></section>`
  return `${title('Diario','Recuerdos y gastos guardados en este dispositivo.')}${tabs}${panel}`
}

export function travel(state: State) {
  return `${title('Viaje', 'Documentación, conexión y planes de emergencia.')}<div class="travel-grid"><div><section class="card"><div class="section-line"><h2>Lista de preparación</h2><span class="tag ok">${state.checks.length}/${checklist.length}</span></div><div class="checklist">${checklist.map(item => `<div class="check-row"><label><input type="checkbox" data-action="check" data-id="${e(item.id)}"${state.checks.includes(item.id) ? ' checked' : ''}><span><strong>${e(item.title)}</strong><span>${e(item.detail)}</span></span></label>${sourceLink(item.source)}</div>`).join('')}</div></section><section class="card"><h2>Fuentes y consultas</h2><p>Consulta del 25 de noviembre de 2026. Revisa las condiciones cerca de la fecha de viaje.</p><ul class="source-list">${sources.map(item => `<li>${sourceLink(item.url, item.label)}<p>${e(item.note)}</p></li>`).join('')}</ul></section></div><div><section class="card"><h2>Emergencias</h2>${emergencyLinks()}</section><section class="card"><h2>Lluvia o cansancio</h2>${rainPlans.map(plan => `<div class="notice"><span class="notice-icon">${icon('rain')}</span><div><h3>${e(plan.title)}</h3><p>${e(plan.detail)}</p></div></div>`).join('')}</section><section class="card"><h2>Vuelos y traslados</h2>${alerts.map(alert => `<div class="notice"><div><h3>${e(alert.title)}</h3><p>${e(alert.detail)}</p></div></div>`).join('')}</section></div></div>`
}

export const expenseCategoryOptions = (selected: string) => categories.map(category => option(category, category, selected)).join('')
