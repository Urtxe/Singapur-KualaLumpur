import { days } from './data'
import { connections, dishes, localEvents, placeGuides, safety } from './guide-data'
import type { Place, State } from './types'
import { allPlaces, button, city, cityHotel, dayOptions, directDistance, e, getPlace, icon, option, sourceLink, title } from './ui'

const eventStatus = { confirmed: 'Confirmado', recurring: 'Pendiente de confirmar', mobility: 'Aviso de movilidad', alternative: 'Sugerencia' }
const eventPrice = { gratis: 'Gratis', pago: 'De pago', pendiente: 'Precio pendiente' }
export const eventFilters = { city: 'all', date: '', category: 'all', price: 'all' }
export const foodFilters = { city: 'sg', query: '', tried: false }
const dishPhotos = new Map([['kaya-toast', 'kaya.webp'], ['nasi-lemak', 'nasi.webp']])

export function facts(entries: [string, string][]) {
  return `<dl class="facts">${entries.map(([label,value]) => `<div><dt>${e(label)}</dt><dd>${e(value || 'Pendiente de verificar')}</dd></div>`).join('')}</dl>`
}

const options = (values: string[], active: string, first: string) => option('all',first,active) + values.map(value => option(value,value,active)).join('')

export function placeResearch(place: Place, state: State) {
  const guide = placeGuides[place.id]
  const hotel = getPlace(state, cityHotel(place.city))
  const distance = hotel && directDistance(place, hotel)
  return facts([
    ['Qué fotografiar', place.photo], ['Horario', guide?.hours ?? 'Consulta el horario antes de ir'], ['Duración recomendada', guide?.duration ?? 'Pendiente'],
    ['Precio adulto', guide?.adult ?? place.price], ['Precio infantil', guide?.child ?? 'Pendiente'], ['Reserva', guide?.booking ?? 'Consulta la fuente oficial'],
    ['Accesibilidad', place.access], ['Para las niñas', guide?.children ?? 'Organizar la visita con pausas'], ['Adulto mayor', guide?.senior ?? place.access],
    ['Calor y lluvia', guide?.weather ?? place.shade], ['Mejor momento', guide?.bestTime ?? 'Pendiente'],
    ['Distancia directa desde el hotel', distance != null ? `${distance.toLocaleString('es-ES',{maximumFractionDigits:1})} km · línea recta` : 'Sin coordenadas completas'],
    ['Transporte', guide?.transport ?? 'Consulta el apartado Transporte o abre las indicaciones'], ['Dirección', place.address],
    ['Verificación', guide?.verified ?? (place.source ? 'Ver referencias en Viaje' : 'Pendiente')],
  ])
}

export function eventsView() {
  const matches = localEvents.filter(item => (eventFilters.city === 'all' || item.city === eventFilters.city) &&
    (!eventFilters.date || item.start <= eventFilters.date && item.end >= eventFilters.date) &&
    (eventFilters.category === 'all' || eventFilters.category === item.category) && (eventFilters.price === 'all' || eventFilters.price === item.price))
  const cityOptions = option('all','Ambas ciudades',eventFilters.city) + option('sg','Singapur',eventFilters.city) + option('kl','Kuala Lumpur',eventFilters.city)
  const filters = `<div class="control-grid">
    <label class="field"><span>Ciudad</span><select data-action="event-city">${cityOptions}</select></label>
    <label class="field"><span>Fecha</span><select data-action="event-date">${option('','Todo el viaje',eventFilters.date)}${dayOptions(eventFilters.date)}</select></label>
    <label class="field"><span>Categoría</span><select data-action="event-category">${options(Array.from(new Set(localEvents.map(item => item.category))).sort(),eventFilters.category,'Todas')}</select></label>
    <label class="field"><span>Precio</span><select data-action="event-price">${option('all','Todos',eventFilters.price)}${Object.entries(eventPrice).map(([value,name]) => option(value,name,eventFilters.price)).join('')}</select></label>
  </div>`
  return `${title('Agenda local', 'Eventos y cambios previstos durante el viaje.')}${filters}
    <p class="result-count" aria-live="polite">${matches.length} resultados</p>
    <div class="reference-grid">${matches.map(item => `<article class="card guide-card">
      <div class="tags"><span class="tag ${item.status === 'confirmed' ? 'ok' : item.status === 'mobility' ? 'warm' : ''}">${eventStatus[item.status]}</span><span class="tag">${eventPrice[item.price]}</span></div>
      <h2>${e(item.name)}</h2><p class="locality">${icon('eventos')} ${city[item.city]} · ${e(item.category)}${item.time ? ` · ${e(item.time)}` : ''}</p>
      <p>${e(item.detail)}</p><p class="fineprint">Comprobación ${e(item.verified)}</p>
      <div class="actions">${button('Añadir al plan','event-add','plus','',item.id)}${sourceLink(item.source)}</div>
    </article>`).join('') || '<p class="card empty">No hay resultados con estos filtros. Prueba otra fecha o ciudad.</p>'}</div>`
}

export function eventSeed(id: string, chosen: string) {
  const item = localEvents.find(event => event.id === id)
  if (!item) return undefined
  const selected = eventFilters.date || chosen
  const date = selected >= item.start && selected <= item.end ? selected : days.find(day => day.date >= item.start && day.date <= item.end && day.city === item.city)?.date ?? selected
  return { title: item.name, date, time: item.time && /^\d\d:\d\d$/.test(item.time) ? item.time : '', placeId: item.placeId ?? '', detail: item.detail, officialUrl: item.source, category: item.category }
}

export function foodResults(state: State) {
  const query = foodFilters.query.toLocaleLowerCase('es').trim()
  const matches = dishes.filter(dish => dish.city === foodFilters.city && (!foodFilters.tried || state.triedDishes.includes(dish.id)) && `${dish.name} ${dish.description}`.toLocaleLowerCase('es').includes(query))
  return `<div class="reference-grid">${matches.map(dish => {
    const tried = state.triedDishes.includes(dish.id)
    const image = dishPhotos.get(dish.id)
    const suggestions = dish.placeIds.flatMap(id => { const place = getPlace(state,id); return place ? [place] : [] })
    return `<article class="card food-card">${image ? `<img class="food-photo" src="${import.meta.env.BASE_URL}${image}" alt="Presentación ilustrativa de ${e(dish.name)}" width="640" height="360" loading="lazy">` : ''}
      <div class="food-card-body"><div class="section-line"><h2>${e(dish.name)}</h2><button type="button" class="button compact" data-action="dish-tried" data-id="${e(dish.id)}" aria-pressed="${tried}">${icon(tried ? 'check' : 'gastronomia')}${tried ? 'Probado' : 'Marcar probado'}</button></div>
      <p>${e(dish.description)}</p>${facts([['En familia', dish.family], ['Precio', dish.price]])}
      ${suggestions.map(place => `<div class="food-place"><div><b>${e(place.name)}</b><small>${e(place.area)}</small></div><div class="actions">${button(state.favorites.includes(place.id) ? 'Quitar favorito' : 'Favorito','favorite','star','compact',place.id)}${button('Añadir al plan','place-add','plus','compact',place.id)}</div></div>`).join('')}
      ${sourceLink(dish.source)}</div></article>`
  }).join('') || '<p class="card empty">No hay platos con estos filtros.</p>'}</div>`
}

export function gastronomy(state: State) {
  return `${title('Gastronomía', 'Qué pedir, dónde probarlo y cómo elegir opciones para cinco.')}
    <div class="filter-bar food-filter"><label class="search-field">${icon('search')}<span class="sr-only">Buscar platos</span><input type="search" data-action="dish-query" value="${e(foodFilters.query)}" placeholder="Buscar un plato"></label>
    <label class="sr-only" for="food-city">Ciudad</label><select id="food-city" data-action="dish-city">${option('sg','Singapur',foodFilters.city)}${option('kl','Kuala Lumpur',foodFilters.city)}</select>
    <label class="filter-check"><input type="checkbox" data-action="dish-only-tried"${foodFilters.tried ? ' checked' : ''}> Solo probados</label></div>
    <div id="food-results">${foodResults(state)}</div>`
}

export function connectionGuide(state: State) {
  return `<section class="transport-lead"><div><div class="eyebrow">${icon('transporte')} CINCO VIAJEROS</div><h2>Un traslado cómodo empieza por el equipaje</h2>
    <p>Para el aeropuerto, compara un vehículo de capacidad confirmada con dos coches. Comprueba plazas útiles, equipaje y requisitos infantiles. En los paseos urbanos el MRT o LRT puede evitar atascos y esperas.</p></div><div class="actions">${button('Dirección de Mi Rochor','copy','copy','','mi-rochor')}${button('Dirección de Star Residence','copy','copy','','star-residence')}</div></section>
    <div class="reference-grid route-grid">${connections.map(item => {
      const from = getPlace(state,item.from)
      const to = getPlace(state,item.to)
      return `<article class="card guide-card"><span class="tag ok">${city[item.city]}</span><h2>${e(item.title)}</h2>
        ${facts([['A pie',item.walking],['MRT o LRT',item.rail],['Coche',item.car],['Coste familiar',item.cost],['Para nuestro grupo',item.family]])}
        <div class="actions">${to ? button(`Cómo llegar a ${to.name}`,'directions','lugares','compact',to.id) : ''}${from && to ? button('Copiar destino','copy','copy','compact',to.id) : ''}${sourceLink(item.source)}</div></article>`
    }).join('')}</div>`
}

export function safetyView(state: State) {
  const hotels = allPlaces(state).filter(place => place.kind === 'hotel')
  return `${title('Emergencias', 'Contactos y direcciones disponibles aunque los teléfonos estén separados.')}
    <section class="emergency-banner"><div><h2>Singapur</h2><a href="tel:999" class="button">Policía · 999</a><a href="tel:995" class="button">Ambulancia y bomberos · 995</a></div>
    <div><h2>Malasia</h2><a href="tel:999" class="button">Emergencias · 999</a></div></section>
    <div class="reference-grid">${hotels.map(place => `<section class="card guide-card"><span class="tag ok">${city[place.city]}</span><h2>${e(place.name)}</h2><p>${e(place.address)}</p>
      <p class="driver-message" lang="en">Please take us to ${e(place.name)}. ${e(place.address)}. We are five passengers.</p>
      <div class="actions">${button('Copiar para el conductor','driver','copy','',place.id)}${button('Cómo llegar','directions','lugares','',place.id)}</div></section>`).join('')}
    ${safety.map(item => {
      const phone = item.phone?.replaceAll(' ','') ?? ''
      return `<section class="card guide-card"><span class="tag">${item.city === 'all' ? 'Ambos destinos' : city[item.city]}</span><h2>${e(item.title)}</h2><p>${e(item.detail)}</p>
      <div class="actions">${/^\+?\d{3,18}$/.test(phone) ? `<a class="button" href="tel:${e(phone)}">Llamar al ${e(item.phone)}</a>` : ''}${item.placeId ? button('Cómo llegar','directions','lugares','compact',item.placeId) : ''}${sourceLink(item.source)}</div></section>`
    }).join('')}</div>
    <section class="card guide-card safety-bottom"><h2>Si nos separamos o perdemos un teléfono</h2><p>Consultad el hotel en la app instalada y acordad un punto de encuentro. Si hace falta, pedid Wi‑Fi en el alojamiento o mostrársele al conductor la tarjeta anterior. Desde otro dispositivo, bloquead el teléfono perdido y avisad al operador.</p>
    <div class="actions"><a class="button" href="#offline">Documentos y seguro local</a><a class="button" href="#viaje">Formularios de llegada</a></div></section>`
}
