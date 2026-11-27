import { baseActivities } from './data'
import { localEvents, type LocalEvent } from './guide-data'
import type { Activity } from './types'
import { dateShort, e, sourceLink } from './ui'
import { singaporeVisits } from './visit-details-sg'
import { kualaLumpurVisits } from './visit-details-kl'
import type { VisitDetails } from './visit-details-types'
import { walkingRoutes, type WalkLeg } from './walking-routes'

export const reviewedOn = '27 nov 2026'
export const visits: ReadonlyMap<string, VisitDetails> = new Map(Object.entries({ ...singaporeVisits, ...kualaLumpurVisits }))
export const hoursStatus: Record<VisitDetails['hoursStatus'], string> = {
  published: 'Horario publicado',
  variable: 'Horario variable',
  public: 'Espacio público',
  pending: 'Horario por confirmar',
}

const eventsByActivity = new Map([
  ['rhapsody', 'christmas-wonderland'],
  ['spectra-sunday-option', 'spectra-dec'],
  ['spectra-option', 'spectra-dec'],
  ['petronas-night', 'lake-symphony-dec'],
])
const eventsById = new Map(localEvents.map(event => [event.id, event]))
const baseById = new Map(baseActivities.map(activity => [activity.id, activity]))

export function eventOccursOn(event: LocalEvent, date: string) {
  return event.start <= date && date <= event.end &&
    (!event.weekdays || event.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
}

export function eventForActivity(activity: Activity) {
  const id = eventsByActivity.get(activity.id)
  const event = id ? eventsById.get(id) : undefined
  return event && event.placeId === activity.placeId && (!activity.date || eventOccursOn(event, activity.date)) ? event : undefined
}

export function visitSources(visit?: VisitDetails, fallback?: string) {
  const source = visit?.source || fallback
  return sourceLink(source, 'Fuente de la visita') +
    (visit?.accessSource && visit.accessSource !== source ? sourceLink(visit.accessSource, 'Acceso o información adicional') : '')
}

const distanceFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const distanceLabel = (metres: number) => `${distanceFormat.format(metres)} m`
const walkBasis: Record<WalkLeg['basis'], string> = {
  operator: 'Referencia del operador',
  mapped: 'Estimación del recorrido en mapa',
  pending: 'Recorrido pendiente de comprobar',
}

function walkLeg(leg: WalkLeg) {
  const distance = leg.metres === undefined ? '' : `${leg.basis === 'mapped' ? '≈' : ''}${distanceLabel(leg.metres)}`
  const data = [distance, leg.minutes ? `${leg.metres !== undefined ? '≈' : ''}${leg.minutes[0]}–${leg.minutes[1]} min de marcha` : 'Tiempo pendiente', walkBasis[leg.basis], leg.optional ? 'Opcional' : ''].filter(Boolean)
  const extras = (leg.relatedSources ?? []).map((url, index) => sourceLink(url, `Referencia adicional ${index + 1}`)).join('')
  return `<li><strong>${e(leg.from)} → ${e(leg.to)}</strong><p>${e(data.join(' · '))}</p><p>${e(leg.detail)}</p><div class="actions">${sourceLink(leg.source,leg.basis === 'mapped' ? 'Trazado en OpenStreetMap' : 'Ver referencia del tramo')}${extras}</div></li>`
}

export function walkDetails(date: string, showDate = false) {
  const legs = walkingRoutes[date]
  if (!legs?.length) return ''
  const measured = legs.filter(leg => leg.metres !== undefined && !leg.optional)
  const distance = measured.reduce((sum, leg) => sum + (leg.metres ?? 0), 0)
  const timed = legs.filter(leg => leg.minutes && !leg.optional)
  const min = timed.reduce((sum, leg) => sum + (leg.minutes?.[0] ?? 0), 0)
  const max = timed.reduce((sum, leg) => sum + (leg.minutes?.[1] ?? 0), 0)
  const summary = [
    measured.length ? `≈${distanceLabel(distance)} en ${measured.length} ${measured.length === 1 ? 'tramo con distancia' : 'tramos con distancia'}` : '',
    timed.length ? `${min}–${max} min de marcha${timed.length < legs.length ? ` en ${timed.length} tramos` : ''}` : '',
    `${legs.length} ${legs.length === 1 ? 'tramo descrito' : 'tramos descritos'}`,
  ].filter(Boolean).join(' · ')
  return `<details class="travel-walks"><summary><strong>${showDate ? `Paseos del ${e(dateShort(date))}` : 'Paseos del plan base'}</strong><small>${e(summary)}</small></summary>
    <p class="fineprint">Tramos de referencia del Plan A. La suma incluye los tramos principales medidos de esta lista. Añadid los tramos opcionales, las pausas, las colas y las visitas. Consultado el ${reviewedOn}.</p>
    <ol class="travel-walk-list">${legs.map(walkLeg).join('')}</ol></details>`
}

export function walksToActivity(activity: Activity) {
  const original = baseById.get(activity.id)
  if (!original || original.placeId !== activity.placeId || original.date !== activity.date || activity.plan === 'B') return ''
  const legs = walkingRoutes[activity.date]?.filter(leg => leg.toActivity === activity.id)
  return legs?.length ? `<details class="travel-walks"><summary>Trayectos a pie de referencia</summary><ul class="travel-walk-list">${legs.map(walkLeg).join('')}</ul></details>` : ''
}
