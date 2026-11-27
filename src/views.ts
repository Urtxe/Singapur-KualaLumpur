import { alerts, checklist, days, rainPlans, sources, transport } from './data'
import { connectionGuide, placeResearch } from './guide-view'
import { localEvents } from './guide-data'
import { eventProgramme, eventSources, eventTiming } from './event-markup'
import { placePhotos } from './place-photos'
import { hoursStatus, visits, walkDetails } from './travel-guide'
import type { Place, State } from './types'
import { activeActivities, allPlaces, button, city, dateShort, dayOptions, e, icon, kind, mapSearch, option, sourceLink, title } from './ui'
import './explore.css'

export function emergencyLinks() {
  return `<div class="emergency-grid"><section><h3>Singapur</h3><a class="button" href="tel:999">Policía · 999</a><a class="button" href="tel:995">Ambulancia y bomberos · 995</a></section><section><h3>Malasia</h3><a class="button" href="tel:999">Emergencias · 999</a></section></div>`
}

export interface PlaceView { tab: 'list' | 'map'; date: string; query: string; city: string; kind: string; selection: string; mapCity: Place['city']; mapFilter: string; centered: boolean }

function placeCard(place: Place, state: State) {
  const favorite = state.favorites.includes(place.id)
  const photo = placePhotos.get(place.id)
  const visit = visits.get(place.id)
  const favoriteButton = `<button type="button" class="icon-button favorite${favorite ? ' chosen' : ''}" data-action="favorite" data-id="${e(place.id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Quitar de' : 'Añadir a'} favoritos: ${e(place.name)}">${icon('star')}</button>`
  return `<article class="card place-card explore-place" data-place="${e(place.id)}">
    ${photo ? `<div class="explore-photo-wrap"><img class="explore-photo" src="${import.meta.env.BASE_URL}places/${e(photo.file ?? place.id)}.webp" alt="${e(photo.alt)}" width="840" height="430" loading="lazy">${favoriteButton}</div>` : ''}
    <div class="explore-place-body"><div class="explore-place-top"><div class="explore-place-tags"><span class="tag ${place.kind === 'must' ? 'ok' : ''}">${kind[place.kind]}</span><span>${icon('lugares')} ${e(place.area)}</span></div>${photo ? '' : favoriteButton}</div>
    <h2>${e(place.name)}</h2><p class="explore-reason">${e(place.description)}</p>
    <div class="explore-facts"><span><small>Apertura</small><strong>${visit ? hoursStatus[visit.hoursStatus] : 'Horario por confirmar'}</strong></span><span><small>Precio orientativo</small><strong>${e(visit?.price ? 'Ver tarifa en la ficha' : place.price)}</strong></span></div>
    <details><summary>Detalles del lugar</summary>${placeResearch(place,state)}
      ${photo ? `<p class="fineprint">Foto de ${e(photo.author)} · ${sourceLink(photo.source,'Original')} · ${photo.licenseUrl ? sourceLink(photo.licenseUrl,photo.license) : e(photo.license)} · Adaptada y optimizada para la app bajo ${e(photo.license)}</p>` : ''}</details>
    <div class="actions explore-card-actions">${button('Añadir al plan', 'place-add', 'plus', 'primary compact', place.id)}<button type="button" class="button compact" data-action="directions" data-id="${e(place.id)}" aria-label="Cómo llegar a ${e(place.name)}">${icon('navigation')} Cómo llegar</button><a class="button compact" href="${e(mapSearch(place))}" target="_blank" rel="noopener noreferrer">Maps</a>${state.customPlaces.some(item => item.id === place.id) ? button('Editar lugar', 'edit-place', '', 'compact', place.id) : ''}</div></div></article>`
}

function normalized(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

export function placeList(state: State, view: PlaceView) {
  const query = normalized(view.query.trim())
  const featured = new Set(['merlion','helix','gardens','tekka','kampong-glam','petronas','klcc-park','batu-caves','central-market'])
  const neighborhood = (place: Place) => /chinatown|kampong glam|little india|brickfields|kampung baru|bukit bintang|pasar seni|marina bay/i.test(`${place.area} ${place.name}`)
  const family = (place: Place) => /niñ|famil|pausa|abuela|descans/i.test(`${place.description} ${place.access}`)
  const rainy = (place: Place) => /interior|cubiert|climatiz|protegida|lluvia/i.test(`${place.description} ${place.shade}`)
  const free = (place: Place) => /gratis|gratuito|público|libre/i.test(place.price)
  const eventIds = new Set(localEvents.filter(event => event.start <= '2026-12-11' && event.end >= '2026-12-04' && event.placeId).map(event => event.placeId!))
  const matches = allPlaces(state).filter(place => {
    if (view.city !== 'all' && view.city !== place.city) return false
    const category = view.kind === 'all' ? 'featured' : view.kind
    const categoryMatch = category === 'allPlaces' || category === 'all' || category === 'featured' && featured.has(place.id) || category === 'must' && place.kind === 'must' || category === 'neighborhoods' && neighborhood(place) || category === 'food' && place.kind === 'food' || category === 'family' && family(place) || category === 'rain' && rainy(place) || category === 'free' && free(place) || category === 'favorite' && state.favorites.includes(place.id) || category === 'events' && eventIds.has(place.id)
    return categoryMatch && normalized(`${place.name} ${place.address} ${place.area} ${city[place.city]}`).includes(query)
  })
  if (view.kind === 'events') return eventList(view)
  return `<p class="result-count" aria-live="polite">${matches.length} ${matches.length === 1 ? 'experiencia' : 'experiencias'}</p><div class="places-grid explore-grid">${matches.map(place => placeCard(place, state)).join('') || '<div class="card empty">No hay experiencias con esos filtros. Prueba otra ciudad o categoría.</div>'}</div>`
}

function eventList(view: PlaceView) {
  const events = localEvents.filter(item => item.start <= '2026-12-11' && item.end >= '2026-12-04' && (view.city === 'all' || item.city === view.city))
  return `<p class="result-count" aria-live="polite">${events.length} eventos durante la estancia · <a href="#eventos">Ver agenda local completa</a></p><div class="places-grid explore-grid">${events.map(item => `<article class="card explore-event-card"><span class="tag ${item.status === 'confirmed' ? 'ok' : ''}">${e(item.price === 'gratis' ? 'Gratis' : item.price === 'pago' ? 'De pago' : 'Precio por confirmar')}</span><p class="locality">${city[item.city]} · ${e(item.start)}${item.end !== item.start ? ` – ${e(item.end)}` : ''}${item.time ? ` · ${e(item.time)}` : ''}</p><h2>${e(item.name)}</h2><p>${e(item.detail)}</p>${eventTiming(item)}${eventProgramme(item)}<p class="fineprint">Comprobado ${e(item.verified)} · detalles y fuente en agenda local</p><div class="actions">${button('Añadir al plan','event-add','plus','primary compact',item.id)}${eventSources(item)}</div></article>`).join('')}</div>`
}

function geographicMap(state: State, view: PlaceView) {
  const located = allPlaces(state).filter((p): p is Place & {lat:number;lon:number} => p.city === view.mapCity && p.lat !== null && p.lon !== null)
  const visits = activeActivities(state, view.date).flatMap(item => {
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
  const map = unique.length ? `<div class="map-layout"><div class="map-plot" role="group" aria-label="Mapa geográfico esquemático de ${city[view.mapCity]}"><span class="map-north" aria-hidden="true">${icon('compass')} N</span>${itinerary}${unique.map(p => {
    const [x, y] = point(p)
    if (x < 7 || x > 93 || y < 7 || y > 93) return ''
    const sequence = visits.findIndex(item => item.id === p.id) + 1
    return `<button type="button" class="map-pin${p.id === view.selection ? ' selected' : ''}${state.favorites.includes(p.id) ? ' map-favorite' : ''}" style="--x:${x}%;--y:${y}%" data-action="marker" data-id="${e(p.id)}" aria-label="${e(kind[p.kind])} · ${e(p.name)}" aria-pressed="${p.id === view.selection}">${sequence || icon(markerIcon[p.kind])}</button>`
  }).join('')}</div><div class="map-itinerary"><h3>${view.mapFilter === 'day' ? 'Orden de visitas' : 'Puntos del mapa'}</h3><ol>${(view.mapFilter === 'day' ? visits : unique).map(p => `<li><button class="text-link" type="button" data-action="marker" data-id="${e(p.id)}">${e(p.name)}</button></li>`).join('')}</ol>${hotel && view.mapFilter === 'day' ? `<button class="text-link" type="button" data-action="marker" data-id="${e(hotel.id)}">${icon('hotel')} ${e(hotel.name)}</button>` : ''}</div></div>` : '<p>No hay puntos con coordenadas para esta selección.</p>'
  return `<div class="card map-card explore-map-card"><div class="explore-map-intro"><div><span class="eyebrow">${city[view.mapCity]}</span><h2>Mapa de lugares</h2><p>Vista esquemática offline con puntos geográficos aproximados. La línea discontinua sigue el orden del plan activo; no representa calles ni navegación.</p></div><div class="actions"><a class="button compact" href="#gastronomia">${icon('gastronomia')} Gastronomía</a><a class="button compact" href="#eventos">${icon('eventos')} Eventos</a><a class="button compact" href="#transporte">${icon('transporte')} Transporte</a></div></div>
    <div class="control-grid"><label class="field"><span>Ciudad del mapa</span><select data-action="map-city">${option('sg','Singapur',view.mapCity)}${option('kl','Kuala Lumpur',view.mapCity)}</select></label>
    <label class="field"><span>Día del mapa</span><select aria-label="Día del mapa" data-action="explore-date">${dayOptions(view.date)}</select></label>
    <label class="field"><span>Puntos</span><select aria-label="Puntos del mapa" data-action="map-filter">${[['day','Actividades del día'],['all','Todos'],['favorite','Favoritos'],...Object.entries(kind)].map(([value,name])=>option(value,name,view.mapFilter)).join('')}</select></label></div>
    ${map}<div class="actions">${chosen ? button(view.centered ? 'Ver área completa' : 'Centrar en este lugar', 'center-map', 'map') : ''}</div>
    <p class="muted">El esquema está disponible sin red. Las indicaciones por calles, el tráfico y Google Maps requieren conexión.</p></div>
    ${chosen ? `<div class="map-selected">${placeCard(chosen, state)}</div>` : ''}<section class="card map-landmarks"><h2>Hoteles y aeropuertos</h2><ul>${allPlaces(state).filter(p => p.kind === 'hotel' || p.kind === 'airport').map(p => `<li>${icon(p.kind === 'hotel' ? 'hotel' : 'plane')} <strong>${e(p.name)}</strong> <span>${e(p.address)}</span> ${button('Cómo llegar', 'directions', '', 'compact', p.id)}</li>`).join('')}</ul></section>`
}

export function placeView(state: State, view: PlaceView) {
  const categories: [string,string,string][] = [['featured','Para empezar','compass'],['allPlaces','Todos los lugares','list'],['must','Imprescindibles','star'],['neighborhoods','Barrios','map'],['food','Gastronomía','gastronomia'],['family','Con niñas','people'],['rain','Si llueve','rain'],['free','Gratis','check'],['events','Eventos','eventos'],['favorite','Favoritos','star']]
  const content = view.tab === 'list' ? `<div class="explore-toolbar"><div class="explore-city-switch" role="group" aria-label="Ciudad">${[['all','Ambas ciudades'],['sg','Singapur'],['kl','Kuala Lumpur']].map(([id,label]) => `<button type="button" data-action="explore-city" data-id="${id}" aria-pressed="${view.city === id}">${label}</button>`).join('')}</div></div><nav class="explore-categories" aria-label="Categorías de lugares">${categories.map(([id,label,ico]) => `<button type="button" data-action="explore-category" data-id="${id}" aria-pressed="${view.kind === id}">${icon(ico)}<span>${label}</span></button>`).join('')}</nav><div class="filter-bar explore-search"><label class="search-field">${icon('search')}<span class="sr-only">Buscar lugares</span><input type="search" data-action="place-query" placeholder="Busca un lugar o un barrio" value="${e(view.query)}"></label><button type="button" class="button compact" data-action="place-map">${icon('map')} Ver mapa</button></div><div class="explore-links"><a href="#gastronomia">Guía de platos</a><a href="#eventos">Agenda local</a><a href="#transporte">Cómo moverse</a></div><div id="place-results">${placeList(state, view)}</div>` : geographicMap(state, view)
  return `<header class="explore-header"><div><span class="eyebrow">Singapur · Kuala Lumpur</span><h1>Explorar</h1><p>Lugares elegidos para descubrir a vuestro ritmo.</p></div><div class="explore-header-tools"><label class="field explore-date"><span>Añadir al día</span><select data-action="explore-date">${dayOptions(view.date)}</select></label><div class="segmented" role="group" aria-label="Vista de Explorar"><button type="button" data-action="place-list" aria-pressed="${view.tab === 'list'}">${icon('photo')} Descubrir</button><button type="button" data-action="place-map" aria-pressed="${view.tab === 'map'}">${icon('map')} Mapa</button></div></div></header>${content}`
}

export function transportView(state: State) {
  return `${title('Transporte', 'Opciones para cinco viajeros, con tiempo para conexiones y equipaje.')}${connectionGuide(state)}
    <section class="card"><h2>Paseos por día</h2>${days.map(day => walkDetails(day.date, true)).join('')}</section>
    <h2 class="section-heading">Billetes, normas y operadores</h2><div class="reference-grid">${transport.map((item) => `<article class="card reference"><span class="quick-icon">${icon('transporte')}</span><h2>${e(item.title)}</h2><p>${e(item.detail)}</p>${sourceLink(item.source)}</article>`).join('')}</div>`
}

export function preparations(state: State) {
  return `${title('Preparativos', 'Todo lo que conviene revisar antes de salir.')}
    <div class="travel-grid"><div><section class="card">
    <div class="section-line"><h2>Lista de preparación</h2><span class="tag ok">${state.checks.length}/${checklist.length}</span></div>
    <div class="checklist">${checklist.map(item => `<div class="check-row"><label><input type="checkbox" data-action="check" data-id="${e(item.id)}"${state.checks.includes(item.id) ? ' checked' : ''}><span><strong>${e(item.title)}</strong><span>${e(item.detail)}</span></span></label>${sourceLink(item.source)}</div>`).join('')}</div></section>
    <details class="card"><summary>Fuentes y consultas</summary><p>Cada ficha indica la fecha de consulta; horarios, precios y requisitos pueden cambiar.</p>
    <ul class="source-list">${sources.map(item => `<li>${sourceLink(item.url, item.label)}<p>${e(item.note)}</p></li>`).join('')}</ul></details></div>
    <div><details class="card"><summary>Lluvia o cansancio</summary>${rainPlans.map(plan => `<div class="notice"><span class="notice-icon">${icon('rain')}</span><div><h3>${e(plan.title)}</h3><p>${e(plan.detail)}</p></div></div>`).join('')}</details></div></div>`
}

export function travel(state: State) {
  const flights = activeActivities(state).filter(item => item.flight && item.title.startsWith('Vuelo')).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const hotels = allPlaces(state).filter(place => place.kind === 'hotel')
  return `${title('Vuelos y hoteles', '')}<div class="travel-grid"><section class="more-group"><h2>Vuelos</h2>${flights.map(flight => `<article class="trip-booking"><span>${icon('plane')} ${dateShort(flight.date)}</span><h3>${e(flight.title)}</h3><p>${e(flight.localTime || flight.time || 'Hora pendiente')}</p><small>${flight.flight === 'provisional' ? `Horario provisional · ${e(flight.tickets)}` : e(flight.tickets)}</small></article>`).join('')}
    <details class="trip-booking"><summary>Avisos de vuelos y traslados</summary>${alerts.map(alert => `<h3>${e(alert.title)}</h3><p>${e(alert.detail)}</p>`).join('')}</details>
    <section class="trip-booking"><h2>Formularios de llegada</h2>${checklist.filter(item => item.id === 'sgac' || item.id === 'mdac').map(item => `<h3>${e(item.title)}</h3><p>${e(item.detail)}</p>${sourceLink(item.source,'Abrir formulario oficial')}`).join('')}</section></section>
    <section class="more-group"><h2>Alojamientos</h2>${hotels.map(hotel => {
      const visit = visits.get(hotel.id)
      return `<article class="trip-booking"><span>${icon('hotel')} ${city[hotel.city]}</span><h3>${e(hotel.name)}</h3><p>${e(hotel.address)}</p>${visit ? `<p>${e(visit.hours)}</p><details><summary>Acceso y estancia</summary><p>${e(visit.highlights)}</p><p>${e(visit.practical)}</p>${sourceLink(visit.source || hotel.source)}</details>` : ''}${button('Cómo llegar','directions','navigation','',hotel.id)}</article>`
    }).join('')}</section></div>`
}
