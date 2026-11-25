import type { AppContext } from './app-api'
import { days } from './data'
import { financeSummary, financeTotals } from './finance'
import { placeGuides } from './guide-data'
import { greatCircleKm } from './planner'
import { asiaDate } from './state'
import type { Activity, Place, State } from './types'
import { activeActivities, activePlan, dateLong, dayOptions, dayPreference, e, icon, money } from './ui'

const alerts: Record<string, string> = {
  '2026-12-05': 'El maratón afecta a los accesos de Marina Bay. Prioriza el MRT.',
  '2026-12-06': 'Siguen los cortes del maratón. Comprueba el acceso a Gardens by the Bay.',
  '2026-12-07': 'Confirma horario, terminal y equipaje del vuelo a Kuala Lumpur.',
  '2026-12-11': 'Salida internacional desde KUL esta noche. Confirma la terminal.',
}

function startsAt(item: Activity) {
  if (!item.time) return null
  const europe = item.date === '2026-12-03' || item.date === '2026-12-12'
  return Date.parse(`${item.date}T${item.time}:00${europe ? '+01:00' : '+08:00'}`)
}

function countdown(instant: number, now: number) {
  const minutes = Math.max(0, Math.ceil((instant - now) / 60_000))
  if (!minutes) return 'Ahora'
  return minutes < 60 ? `En ${minutes} min` : `En ${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function nearbyPlaces(state: State, date: string, place: Place, candidates: Place[], itinerary: Activity[]) {
  if (place.lat === null || place.lon === null) return []
  const occupied = new Set(itinerary.map(item => item.placeId))
  const prefs = new Set(dayPreference(state, date).preferences)
  const maxWalk = prefs.has('walking') || prefs.has('quiet') ? 2 : 4
  return candidates.flatMap(candidate => {
    if (candidate.id === place.id || candidate.city !== place.city || occupied.has(candidate.id) ||
        !['must','optional','food'].includes(candidate.kind) || candidate.lat === null || candidate.lon === null) return []
    const km = greatCircleKm(place.lat!, place.lon!, candidate.lat, candidate.lon)
    if (km > maxWalk && candidate.area !== place.area) return []
    const covered = /cubiert|interior|climatiz/i.test(`${candidate.shade} ${placeGuides[candidate.id]?.weather ?? ''}`)
    const score = km - (prefs.has('rain') && covered ? 3 : 0) - (prefs.has('food') && candidate.kind === 'food' ? 3 : 0) -
      (prefs.has('culture') && /muse|templo|mezquita|patrimonio/i.test(candidate.description) ? 2 : 0) -
      (prefs.has('children') && /niñ|familia|interactiv/i.test(placeGuides[candidate.id]?.children ?? '') ? 2 : 0)
    return [{ candidate, km, score }]
  }).sort((a, b) => a.score - b.score).slice(0, 3)
}

function todayAction(action: string, label: string, id = '', glyph = '', variant = '') {
  return `<button type="button" class="button ${variant}" data-today="${action}" data-id="${e(id)}">${glyph ? icon(glyph) : ''}${e(label)}</button>`
}

export function mountToday(element: HTMLElement, app: AppContext) {
  const render = () => {
    const state = app.getState()
    const places = app.places()
    const now = new Date()
    const actualDate = asiaDate(now)
    const chosen = app.todayPreview()
    const date = chosen ?? (actualDate < days[0].date ? '2026-12-04' : actualDate)
    const preview = date !== actualDate
    const day = days.find(entry => entry.date === date)
    const cityCode = day?.city === 'kl' && (date !== '2026-12-07' || preview || now.valueOf() >= Date.parse('2026-12-07T16:10:00+08:00')) ? 'kl' : 'sg'
    const cityName = !day ? 'Viaje finalizado' : day.city === 'air' ? 'En ruta' : date === '2026-12-07' && preview ? 'Singapur a Kuala Lumpur' : cityCode === 'sg' ? 'Singapur' : 'Kuala Lumpur'
    const localClock = now.toLocaleTimeString('es-ES', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' })
    const itinerary = activeActivities(state, date)
    const pending = itinerary.filter(item => item.status === 'pending')
    const upcoming = pending.map(item => ({ item, start: startsAt(item) }))
      .filter(({ item, start }) => preview || start === null || start + item.duration * 60_000 > now.valueOf())
      .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
    const next = upcoming[0]?.item
    const nextStart = upcoming[0]?.start
    const place = next ? places.find(item => item.id === next.placeId) : undefined
    const reservation = upcoming.find(({ item }) => item.id !== next?.id && (item.fixed || item.flight))?.item
    const tripText = next?.fromPrevious || next?.fromHotel || next?.transport || ''
    const estimatedTrip = next?.journeyMinutes ? `Trayecto de unos ${next.journeyMinutes} min` : tripText.match(/≈\s*\d+(?:\s*[–-]\s*\d+)?\s*min/i)?.[0]
    const alternatives = next && place && !next.fixed && !next.flight && !state.family ? nearbyPlaces(state,date,place,places,itinerary) : []
    const totals = financeTotals(state)
    const finance = financeSummary(state, now)
    const title = preview ? 'Vista previa' : `${localClock} · hora de Asia`
    const nextCard = next ? `<article class="today-next"><div class="today-next-line"><span>${next.fixed || next.flight ? 'Próxima reserva' : 'Próxima actividad'}</span><span>${!preview && nextStart != null ? countdown(nextStart, now.valueOf()) : e(next.time || 'Horario flexible')}</span></div>
      <h2>${e(next.title)}</h2><p class="today-next-info">${next.time ? `<time>${e(next.time)}</time>` : ''}${e(place?.area || next.zone)}${estimatedTrip ? ` <span>· ${e(estimatedTrip)}</span>` : ''}</p>
      <div class="today-next-actions">${place || next.address ? todayAction('directions','Cómo llegar',next.id,'navigation','primary') : next.flight ? '<a class="button primary" href="#viaje">Ver vuelo</a>' : ''}${todayAction('done','Marcar realizada',next.id,'check')}</div>
      ${next.detail || tripText || !state.family ? `<details class="today-detail"><summary>Detalles y opciones</summary>${place?.address || next.address ? `<p>${e(place?.address || next.address)}</p>` : ''}${next.detail ? `<p>${e(next.detail)}</p>` : ''}${tripText ? `<p>${e(tripText)}</p>` : ''}<div class="actions">${!next.fixed && !next.flight ? todayAction('delay','Retrasar 15 min',next.id) + todayAction('skip','Omitir',next.id) : ''}${todayAction('note','Añadir nota',next.id)}</div></details>` : ''}
    </article>` : `<article class="today-next empty-next"><h2>${day ? 'El plan está al día' : 'Sin actividades para hoy'}</h2><p>${day ? 'Consulta lo que queda o prepara otra jornada.' : 'Elige una jornada para ver el itinerario.'}</p></article>`
    element.innerHTML = `<section class="today-shell-v3">
      <header class="today-heading" data-city="${cityCode}"><div><p>${e(cityName)}</p><h1>Hoy</h1><p>${e(dateLong(date))}</p><small>${e(title)}</small></div></header>
      <div class="today-date-row"><label><span class="sr-only">Fecha de Hoy</span><select aria-label="Fecha de Hoy" data-today-date>${day ? '' : '<option value="" selected>Elegir jornada</option>'}${dayOptions(day ? date : '')}</select></label>${chosen ? todayAction('reset','Volver a hoy') : ''}${todayAction('plan','Ver plan',date,'agenda')}</div>
      ${nextCard}
      ${alerts[date] ? `<aside class="today-alert">${icon('alert')}<span>${e(alerts[date])}</span></aside>` : ''}
      <section class="today-wallet" aria-label="Gastos y presupuesto"><div><span>${preview ? 'Gastos del día' : 'Gastado hoy'}</span><strong>${money((totals.byDay.get(date) ?? 0) / 100)}</strong></div><div><span>Restante en destino</span><strong>${finance.destinationRemaining == null ? 'Sin fijar' : money(finance.destinationRemaining / 100)}</strong></div>${todayAction('spend','Anotar gasto','','plus','primary')}${finance.pendingCount ? `<p class="today-pending-money">${finance.pendingCount} ${finance.pendingCount === 1 ? 'importe pendiente' : 'importes pendientes'} de cambio</p>` : ''}</section>
      <section class="today-list"><div class="today-section-title"><h2>Actividades pendientes</h2><span>Plan ${activePlan(state,date)}</span></div>
      ${pending.length ? `<ol>${pending.map(item => `<li><time>${e(item.time || '—')}</time><span>${e(item.title)}</span>${item.fixed || item.flight ? icon('shield') : ''}</li>`).join('')}</ol>` : '<p>No quedan actividades pendientes.</p>'}
      ${reservation ? `<p class="today-reservation">${icon('clock')} ${e(reservation.time || 'Hora pendiente')} · ${e(reservation.title)}</p>` : ''}
      <progress aria-label="Progreso del plan" value="${itinerary.filter(item=>item.status==='done').length}" max="${itinerary.length || 1}"></progress>
      ${alternatives.length ? `<details class="today-detail"><summary>Alternativas cercanas</summary>${alternatives.map(({ candidate, km }) => `<div class="today-alternative"><span>${e(candidate.name)} <small>${e(candidate.area)} · ${km.toFixed(1)} km en línea recta</small></span><button type="button" class="button" data-today="replace" data-id="${e(next?.id)}" data-place="${e(candidate.id)}">Sustituir</button></div>`).join('')}</details>` : ''}</section>
    </section>`
  }
  render()
  element.addEventListener('change', event => {
    const input = event.target
    if (!(input instanceof HTMLSelectElement) || !input.matches('[data-today-date]') || !days.some(item => item.date === input.value)) return
    app.setTodayPreview(input.value)
    render()
  })
  element.addEventListener('click', event => {
    const control = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-today]') : null
    if (!control) return
    const state = app.getState()
    const id = control.dataset.id ?? ''
    const item = state.activities.find(entry => entry.id === id)
    const update = (change: Partial<Activity>, message: string) => app.commit({ ...state, activities: state.activities.map(entry => entry.id === id ? { ...entry, ...change } : entry) }, message)
    switch (control.dataset.today) {
      case 'reset': app.setTodayPreview(); render(); break
      case 'plan': if (days.some(day => day.date === id)) app.setSelectedDate(id); app.navigate('agenda'); break
      case 'directions': if (item) app.directions(item.placeId,item.id); break
      case 'spend': app.quickSpend(); break
      case 'note': app.quickNote(id); break
      case 'done': if (item?.status === 'pending') update({ status: 'done' }, 'Actividad realizada.'); break
      case 'skip': if (item?.status === 'pending' && !item.fixed && !item.flight) update({ status: 'skipped' }, 'Actividad omitida.'); break
      case 'delay': {
        if (!item || item.status !== 'pending' || item.fixed || item.flight) break
        const [hours, minutes] = (item.time || '09:00').split(':').map(Number)
        const delayed = hours * 60 + minutes + 15
        if (delayed >= 1440) { app.notify('Cambia el día desde Planes.'); break }
        const time = `${String(Math.floor(delayed / 60)).padStart(2,'0')}:${String(delayed % 60).padStart(2,'0')}`
        update({ time }, `Actividad retrasada a las ${time}.`)
        break
      }
      case 'replace': {
        const place = app.places().find(entry => entry.id === control.dataset.place)
        if (item?.status === 'pending' && !item.fixed && !item.flight && place && window.confirm(`¿Sustituir «${item.title}» por «${place.name}»?`)) {
          update({ title:place.name, placeId:place.id, zone:place.area, address:place.address, lat:place.lat, lon:place.lon, detail:place.description, fromPrevious:'', fromHotel:'', transport:'', journeyMinutes:null }, 'Actividad sustituida. Revisa el trayecto.')
        }
        break
      }
    }
  })
}
