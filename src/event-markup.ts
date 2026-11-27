import type { LocalEvent } from './guide-data'
import { e, sourceLink } from './ui'

export function eventTiming(event: LocalEvent) {
  return `<dl class="event-timing" aria-label="Horario y duración">
    <div><dt>Horario</dt><dd>${e(event.hours)}</dd></div>
    <div><dt>Duración</dt><dd>${e(event.duration)}</dd></div>
  </dl>`
}

export function eventProgramme(event: LocalEvent) {
  if (!event.programme?.length) return ''
  return `<section class="event-program" aria-label="${e(event.programmeTitle ?? 'Horarios del evento')}">
    <h3>${e(event.programmeTitle ?? 'Horarios destacados')}</h3>
    <ul>${event.programme.map(slot => `<li><strong>${e(slot.time)}</strong><span>${e(slot.activity)}</span></li>`).join('')}</ul>
  </section>`
}

export function eventSources(event: LocalEvent) {
  return [
    event.source ? sourceLink(event.source, event.sourceLabel ?? 'Fuente oficial') : '',
    ...(event.relatedSources ?? []).map(source => sourceLink(source.url, source.label)),
  ].join('')
}
