import { alerts, checklist, rainPlans, sources, transport } from './data'
import { connectionGuide, placeResearch } from './guide-view'
import type { Place, State } from './types'
import { allPlaces, button, city, dayOptions, e, icon, kind, mapSearch, option, sourceLink, title } from './ui'

export function emergencyLinks() {
  return `<div class="emergency-grid"><section><h3>Singapur</h3><a class="button" href="tel:999">Policía · 999</a><a class="button" href="tel:995">Ambulancia y bomberos · 995</a></section><section><h3>Malasia</h3><a class="button" href="tel:999">Emergencias · 999</a></section></div>`
}

export interface PlaceView { tab: 'list' | 'map'; date: string; query: string; city: string; kind: string; selection: string; mapCity: Place['city']; mapFilter: string; centered: boolean }

function placeCard(place: Place, state: State) {
  const favorite = state.favorites.includes(place.id)
  return `<article class="card place-card" data-place="${e(place.id)}">
    <div class="place-top"><span class="tag ${place.kind === 'must' ? 'ok' : ''}">${kind[place.kind]}</span><button type="button" class="icon-button favorite${favorite ? ' chosen' : ''}" data-action="favorite" data-id="${e(place.id)}" aria-pressed="${favorite}" aria-label="Favorito ${e(place.name)}">${icon('star')}</button></div>
    <h2>${e(place.name)}</h2><p class="muted locality">${icon('lugares')} ${city[place.city]} · ${e(place.area)}</p><p>${e(place.description)}</p>
    <details><summary>Horario, entradas y accesibilidad</summary>${placeResearch(place,state)}${sourceLink(place.source)}</details>
    <div class="actions">${button('Añadir al plan', 'place-add', 'plus', 'compact', place.id)}${button(`Cómo llegar a ${place.name}`, 'directions', 'lugares', 'compact', place.id)}${button('Copiar dirección', 'copy', 'copy', 'compact', place.id)}
      <a class="button compact" href="${e(mapSearch(place))}" target="_blank" rel="noopener noreferrer">Abrir Maps</a>${state.customPlaces.some(item => item.id === place.id) ? button('Editar lugar', 'edit-place', '', 'compact', place.id) : ''}
    </div></article>`
}

function normalized(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

export function placeList(state: State, view: PlaceView) {
  const query = normalized(view.query.trim())
  const matches = allPlaces(state).filter(place => (view.city === 'all' || view.city === place.city) && (view.kind === 'all' || view.kind === place.kind || (view.kind === 'favorite' && state.favorites.includes(place.id))) && normalized(`${place.name} ${place.address} ${place.area} ${city[place.city]}`).includes(query))
  return `<p class="result-count" aria-live="polite">${matches.length} ${matches.length === 1 ? 'lugar' : 'lugares'}</p><div class="places-grid">${matches.map(place => placeCard(place, state)).join('') || '<div class="card empty">No hay lugares con esos filtros.</div>'}</div>`
}

function geographicMap(state: State, view: PlaceView) {
  const located = allPlaces(state).filter((p): p is Place & {lat:number;lon:number} => p.city === view.mapCity && p.lat !== null && p.lon !== null)
  const visits = state.activities.filter(a => a.date === view.date && a.plan !== 'B' && !a.archived && a.status !== 'skipped').flatMap(item => {
    const place = located.find(p => p.id === item.placeId)
    return place ? [place] : []
  })
  const hotel = located.find(p => p.kind === 'hotel')
  const eligible = view.mapFilter === 'day' ? (hotel ? [hotel, ...visits] : visits) : located.filter(place => view.mapFilter === 'all' || (view.mapFilter === 'favorite' ? state.favorites.includes(place.id) : view.mapFilter === place.kind))
  const unique = Array.from(new Map(eligible.map(p => [p.id, p])).values())
  const chosen = located.find(p => p.id === view.selection)
  const bounds = unique.length ? unique : hotel ? [hotel] : [{lat: 0, lon: 0}]
  const midLat = view.centered && chosen ? chosen.lat : (Math.min(...bounds.map(p => p.lat)) + Math.max(...bounds.map(p => p.lat))) / 2
  const midLon = view.centered && chosen ? chosen.lon : (Math.min(...bounds.map(p => p.lon)) + Math.max(...bounds.map(p => p.lon))) / 2
  const cos = Math.cos(midLat * Math.PI / 180)
  const span = view.centered && chosen ? .018 : Math.max(0.003, ...bounds.map(p => Math.max(Math.abs(p.lat - midLat), Math.abs((p.lon - midLon) * cos))))
  const point = (p: typeof bounds[number]) => [50 + (p.lon - midLon) * cos / span * 36, 50 - (p.lat - midLat) / span * 36]
  const itinerary = visits.length > 1 ? `<svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${visits.map(p => point(p).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/></svg>` : ''
  const markerIcon: Record<Place['kind'], string> = { must:'lugares', optional:'lugares', food:'gastronomia', hotel:'hotel', station:'transporte', medical:'emergencias', airport:'plane' }
  const map = unique.length ? `<div class="map-layout"><div class="map-plot" role="group" aria-label="Mapa geográfico esquemático de ${city[view.mapCity]}"><span class="map-north" aria-hidden="true">↑ N</span>${itinerary}${unique.map(p => {
    const [x, y] = point(p)
    if (x < 7 || x > 93 || y < 7 || y > 93) return ''
    const sequence = visits.findIndex(item => item.id === p.id) + 1
    return `<button type="button" class="map-pin${p.id === view.selection ? ' selected' : ''}${state.favorites.includes(p.id) ? ' map-favorite' : ''}" style="--x:${x}%;--y:${y}%" data-action="marker" data-id="${e(p.id)}" aria-label="${e(kind[p.kind])} · ${e(p.name)}" aria-pressed="${p.id === view.selection}">${sequence || icon(markerIcon[p.kind])}</button>`
  }).join('')}</div><div class="map-itinerary"><h3>${view.mapFilter === 'day' ? 'Orden de visitas' : 'Puntos del mapa'}</h3><ol>${(view.mapFilter === 'day' ? visits : unique).map(p => `<li><button class="text-link" type="button" data-action="marker" data-id="${e(p.id)}">${e(p.name)}</button></li>`).join('')}</ol>${hotel && view.mapFilter === 'day' ? `<button class="text-link" type="button" data-action="marker" data-id="${e(hotel.id)}">${icon('hotel')} ${e(hotel.name)}</button>` : ''}</div></div>` : '<p>No hay puntos con coordenadas para esta selección.</p>'
  return `<div class="card map-card"><h2>Mapa esquemático offline</h2><p>Puntos geográficos aproximados. Las líneas discontinuas representan el orden del plan A.</p>
    <div class="control-grid"><label class="field"><span>Ciudad del mapa</span><select data-action="map-city">${option('sg','Singapur',view.mapCity)}${option('kl','Kuala Lumpur',view.mapCity)}</select></label>
    <label class="field"><span>Día del mapa</span><select data-action="map-date">${dayOptions(view.date)}</select></label>
    <label class="field"><span>Puntos</span><select aria-label="Puntos del mapa" data-action="map-filter">${[['day','Actividades del día'],['all','Todos'],['favorite','Favoritos'],...Object.entries(kind)].map(([value,name])=>option(value,name,view.mapFilter)).join('')}</select></label></div>
    ${map}<div class="actions">${chosen ? button(view.centered ? 'Ver área completa' : 'Centrar en este lugar', 'center-map', 'map') : ''}</div>
    <p class="muted">El esquema está disponible sin red. Las indicaciones por calles, el tráfico y Google Maps requieren conexión.</p></div>
    ${chosen ? `<div class="map-selected">${placeCard(chosen, state)}</div>` : ''}<section class="card map-landmarks"><h2>Hoteles y aeropuertos</h2><ul>${allPlaces(state).filter(p => p.kind === 'hotel' || p.kind === 'airport').map(p => `<li>${icon(p.kind === 'hotel' ? 'hotel' : 'plane')} <strong>${e(p.name)}</strong> <span>${e(p.address)}</span> ${button('Cómo llegar', 'directions', '', 'compact', p.id)}</li>`).join('')}</ul></section>`
}

export function placeView(state: State, view: PlaceView) {
  const content = view.tab === 'list' ? `<div class="filter-bar"><label class="search-field">${icon('search')}<span class="sr-only">Buscar lugares</span><input type="search" data-action="place-query" placeholder="Busca un lugar o un barrio" value="${e(view.query)}"></label><label><span class="sr-only">Ciudad</span><select data-action="place-city">${[['all','Todas las ciudades'],['sg','Singapur'],['kl','Kuala Lumpur']].map(([v,l]) => option(v,l,view.city)).join('')}</select></label><label><span class="sr-only">Tipo de lugar</span><select data-action="place-kind">${[['all','Todos los tipos'],...Object.entries(kind),['favorite','Favoritos']].map(([v,l]) => option(v,l,view.kind)).join('')}</select></label></div><div id="place-results">${placeList(state, view)}</div>` : geographicMap(state, view)
  return `${title('Lugares', 'Encuentra un sitio para visitar, comer o refugiarte de la lluvia.', button('Añadir lugar','new-place','plus','primary'))}<div class="segmented" role="group" aria-label="Vista de lugares"><button type="button" data-action="place-list" aria-pressed="${view.tab === 'list'}">${icon('list')} Lista</button><button type="button" data-action="place-map" aria-pressed="${view.tab === 'map'}">${icon('map')} Mapa</button></div>${content}`
}

export function transportView(state: State) {
  return `${title('Transporte', 'Opciones para cinco viajeros, con tiempo para conexiones y equipaje.')}${connectionGuide(state)}<h2 class="section-heading">Billetes, normas y operadores</h2><div class="reference-grid">${transport.map((item) => `<article class="card reference"><span class="quick-icon">${icon('transporte')}</span><h2>${e(item.title)}</h2><p>${e(item.detail)}</p>${sourceLink(item.source)}</article>`).join('')}</div>`
}

export function travel(state: State, tools = '') {
  return `${title('Viaje', 'Documentación, conexión y planes de emergencia.')}${tools}
    <div class="travel-grid"><div><section class="card">
    <div class="section-line"><h2>Lista de preparación</h2><span class="tag ok">${state.checks.length}/${checklist.length}</span></div>
    <div class="checklist">${checklist.map(item => `<div class="check-row"><label><input type="checkbox" data-action="check" data-id="${e(item.id)}"${state.checks.includes(item.id) ? ' checked' : ''}><span><strong>${e(item.title)}</strong><span>${e(item.detail)}</span></span></label>${sourceLink(item.source)}</div>`).join('')}</div></section>
    <section class="card"><h2>Fuentes y consultas</h2><p>Consulta del 25 de noviembre de 2026. Cada ficha y evento incluye su referencia.</p>
    <ul class="source-list">${sources.map(item => `<li>${sourceLink(item.url, item.label)}<p>${e(item.note)}</p></li>`).join('')}</ul></section></div>
    <div><section class="card"><h2>Emergencias</h2>${emergencyLinks()}<a href="#emergencias" class="button">Ver direcciones y contactos</a></section>
    <section class="card"><h2>Lluvia o cansancio</h2>${rainPlans.map(plan => `<div class="notice"><span class="notice-icon">${icon('rain')}</span><div><h3>${e(plan.title)}</h3><p>${e(plan.detail)}</p></div></div>`).join('')}</section>
    <section class="card"><h2>Vuelos y traslados</h2>${alerts.map(alert => `<div class="notice"><div><h3>${e(alert.title)}</h3><p>${e(alert.detail)}</p></div></div>`).join('')}</section></div></div>`
}
