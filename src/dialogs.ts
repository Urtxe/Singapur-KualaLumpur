import type { Note, Place, State } from './types'
import { button, e, icon, kind, option, placeOptions } from './ui'

const input = (label: string, name: string, value: unknown, attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${e(value)}" ${attrs}></label>`
const text = (label: string, name: string, value: unknown, max: number, attrs = '') => `<label class="field"><span>${label}</span><textarea name="${name}" maxlength="${max}" ${attrs}>${e(value)}</textarea></label>`
const select = (label: string, name: string, options: string) => `<label class="field"><span>${label}</span><select name="${name}">${options}</select></label>`
const choices = (values: string[], value: string) => values.map(v => option(v,v,value)).join('')
const submit = (label: string, remove = '') => `<div class="actions form-actions"><button class="button primary" type="submit">${label}</button>${button('Cancelar', 'close-dialog')}${remove}</div>`
const hidden = (name: string, val: string) => `<input type="hidden" name="${name}" value="${e(val)}">`
export function dialogContent(title: string, content: string) {
  return `<div class="dialog-top"><h2 id="dialog-title">${e(title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">${icon('close')}</button></div>${content}`
}

export function placeForm(place?: Place) {
  const cityChoices = option('sg','Singapur',place?.city ?? 'sg') + option('kl','Kuala Lumpur',place?.city ?? 'sg')
  const kindChoices = Object.entries(kind).filter(([key]) => ['must','food','optional'].includes(key)).map(([key,name]) => option(key,name,place?.kind ?? 'optional')).join('')
  return `<form data-form="place">${hidden('id',place?.id ?? '')}${input('Nombre','name',place?.name,'required maxlength="200" autofocus')}<div class="form-grid">${select('Ciudad','city',cityChoices)}${select('Tipo','kind',kindChoices)}${input('Zona','area',place?.area,'maxlength="200"')}${input('Dirección','address',place?.address,'maxlength="500" required')}</div>${text('Por qué merece la pena','description',place?.description,2000)}<div class="form-grid">${input('Qué fotografiar','photo',place?.photo,'maxlength="500"')}${input('Accesibilidad','access',place?.access,'maxlength="1000"')}${input('Sombra','shade',place?.shade,'maxlength="1000"')}${input('Precio y fuente o estimación','price',place?.price,'maxlength="300"')}${input('Latitud (opcional)','lat',place?.lat,'type="number" step="any" min="-90" max="90" inputmode="decimal"')}${input('Longitud (opcional)','lon',place?.lon,'type="number" step="any" min="-180" max="180" inputmode="decimal"')}</div>${submit('Guardar lugar',place ? button('Borrar lugar','delete-place','','danger',place.id) : '')}</form>`
}

export function noteForm(state: State, date: string, note?: Note) {
  const activities = option('','Sin actividad',note?.activityId ?? '') + state.activities.filter(item => !item.archived).map(item => option(item.id,item.title,note?.activityId ?? '')).join('')
  return `<form data-form="note">${hidden('id',note?.id ?? '')}
    <div class="form-grid">${input('Día','date',note?.date ?? date,'type="date" required')}${select('Lugar','placeId',placeOptions(state,note?.placeId ?? ''))}</div>
    ${text('Nota','text',note?.text,10000,'required autofocus')}
    <div class="form-grid">${select('Valoración','rating',option('','Sin valoración',String(note?.rating ?? '')) + choices(['1','2','3','4','5'],String(note?.rating ?? '')))}${select('Actividad asociada','activityId',activities)}</div>
    ${input('Recuerdo','memory',note?.memory,'maxlength="200"')}
    <label class="field"><span>Foto del recuerdo</span><input type="file" accept="image/jpeg,image/png,image/webp" name="photo"></label>
    ${note?.photoId ? '<label class="filter-check"><input name="clearPhoto" type="checkbox"> Desvincular foto</label>' : ''}
    <p class="fineprint">La foto queda en los archivos locales de este teléfono.</p>
    ${submit('Guardar nota',note?.id ? button('Borrar nota','delete-note','','danger',note.id) : '')}</form>`
}
