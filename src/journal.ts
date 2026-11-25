import { financeTotals } from './finance'
import type { Note, State } from './types'
import { button, dateLong, e, getPlace, icon, money, title } from './ui'

export function journalView(state: State) {
  const complete = state.activities.filter(activity => activity.status === 'done')
  const visited = new Set(complete.map(activity => activity.placeId).filter(Boolean))
  const favourites = state.notes.filter(note => note.rating !== null && note.rating >= 4)
  const totals = financeTotals(state)
  const byDay = new Map<string, Note[]>()
  for (const note of [...state.notes].sort((a,b) => a.date.localeCompare(b.date))) {
    const group = byDay.get(note.date) ?? []
    group.push(note)
    byDay.set(note.date,group)
  }
  return `${title('Diario', 'Recuerdos y fotos para volver a los mejores momentos.', button('Añadir nota','new-note','plus','primary'))}
  <div class="segmented journal-nav" role="group" aria-label="Sección del diario"><button type="button" aria-pressed="true" data-action="diary-notes">Notas</button><button type="button" aria-pressed="false" data-action="diary-expenses">Gastos</button><button type="button" aria-pressed="false" data-action="diary-backup">Copias</button></div>
  ${[...byDay].map(([date,notes]) => `<section class="journal-day"><h2>${e(dateLong(date))}</h2><div class="reference-grid">${notes.map(note => {
    const location = getPlace(state,note.placeId)
    const activity = state.activities.find(item => item.id === note.activityId) ?? state.trash.find(item => item.id === note.activityId)
    const expenses = activity ? state.expenses.filter(item => item.activityId === activity.id) : []
    return `<article class="card journal-card">
      ${note.photoId ? `<img class="journal-photo" data-photo="${e(note.photoId)}" alt="Foto local del recuerdo" hidden>` : ''}
      <div class="journal-body"><div class="eyebrow muted">${icon('lugares')} ${e(location?.name ?? activity?.title ?? 'Recuerdo del viaje')}</div>
      ${note.memory ? `<h3>${e(note.memory)}</h3>` : ''}<p class="preserve">${e(note.text)}</p>
      ${note.rating ? `<p class="journal-rating">${icon('star')} ${note.rating} de 5</p>` : ''}
      ${expenses.length ? `<p class="fineprint">Gastos asociados · ${expenses.map(item => e(`${item.title}: ${money(item.amount,item.currency)}`)).join(' · ')}</p>` : ''}
      ${button('Editar nota','edit-note','','compact',note.id)}</div>
    </article>`
  }).join('')}</div></section>`).join('') || '<div class="card empty"><h2>El primer recuerdo empieza aquí</h2><p>Una foto, la frase de una de las niñas o el plato del día. Puedes enlazar tu nota a un lugar y una actividad.</p></div>'}
  <section class="card journal-summary"><div class="section-line"><div><h2>Resumen del viaje</h2><p>Se actualiza con lo que registréis en este teléfono.</p></div>${button('Imprimir resumen','print-journal','diario')}</div>
    <div class="journal-metrics"><div><strong>${complete.length}</strong><span>Actividades realizadas</span></div><div><strong>${visited.size}</strong><span>Lugares visitados</span></div><div><strong>${favourites.length}</strong><span>Recuerdos favoritos</span></div><div><strong>${e(money(totals.total / 100))}</strong><span>Gasto convertido</span></div></div>
    ${favourites.length ? `<h3>Los mejores momentos</h3><ul>${favourites.map(note => `<li>${e(note.memory || note.text.slice(0,120))}</li>`).join('')}</ul>` : ''}
  </section>`
}
