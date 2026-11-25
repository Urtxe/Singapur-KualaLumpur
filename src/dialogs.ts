import type { Activity, Expense, Note, Place, State } from './types'
import { button, dayOptions, e, icon, kind, option, placeOptions } from './ui'
import { expenseCategoryOptions } from './views'

const input = (label: string, name: string, value: unknown, attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${e(value)}" ${attrs}></label>`
const text = (label: string, name: string, value: unknown, max: number, attrs = '') => `<label class="field"><span>${label}</span><textarea name="${name}" maxlength="${max}" ${attrs}>${e(value)}</textarea></label>`
const select = (label: string, name: string, options: string) => `<label class="field"><span>${label}</span><select name="${name}">${options}</select></label>`
const choices = (values: string[], value: string) => values.map(v => option(v,v,value)).join('')
const submit = (label: string, remove = '') => `<div class="actions form-actions"><button class="button primary" type="submit">${label}</button>${button('Cancelar', 'close-dialog')}${remove}</div>`
const hidden = (name: string, val: string) => `<input type="hidden" name="${name}" value="${e(val)}">`
const amount = 'type="number" inputmode="decimal" min="0" max="1000000000" step="0.01"'

export function dialogContent(title: string, content: string) {
  return `<div class="dialog-top"><h2 id="dialog-title">${e(title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">${icon('close')}</button></div>${content}`
}

export function activityForm(state: State, date: string, item?: Activity) {
  return `<form data-form="activity">${hidden('id',item?.id ?? '')}${input('Nombre','title',item?.title,'required maxlength="200" autofocus')}<div class="form-grid">${select('Día','date',dayOptions(item?.date ?? date))}${input('Hora','time',item?.time ?? '10:00','type="time" required')}${input('Duración (minutos)','duration',item?.duration ?? 45,'type="number" min="1" max="1440" step="1" required')}${select('Lugar','placeId',placeOptions(state,item?.placeId ?? ''))}${input('Zona','zone',item?.zone,'maxlength="200"')}${select('Esfuerzo','effort',choices(['bajo','medio','alto'],item?.effort ?? 'bajo'))}${select('Prioridad','priority',choices(['principal','opcional','pausa'],item?.priority ?? 'opcional'))}</div>${text('Detalles','detail',item?.detail,3000)}${input('Comida','food',item?.food,'maxlength="1000"')}${input('Entradas','tickets',item?.tickets,'maxlength="1000"')}${input('Plan B si llueve','rain',item?.rain,'maxlength="1000"')}${input('Tiempo desde el hotel','fromHotel',item?.fromHotel,'maxlength="500"')}${input('Tiempo desde la parada anterior','fromPrevious',item?.fromPrevious,'maxlength="500"')}${submit('Guardar actividad', item?.custom ? button('Borrar actividad','delete-activity','','danger',item.id) : '')}</form>`
}

export function placeForm(place?: Place) {
  const cityChoices = option('sg','Singapur',place?.city ?? 'sg') + option('kl','Kuala Lumpur',place?.city ?? 'sg')
  const kindChoices = Object.entries(kind).filter(([key]) => ['must','food','optional'].includes(key)).map(([key,name]) => option(key,name,place?.kind ?? 'optional')).join('')
  return `<form data-form="place">${hidden('id',place?.id ?? '')}${input('Nombre','name',place?.name,'required maxlength="200" autofocus')}<div class="form-grid">${select('Ciudad','city',cityChoices)}${select('Tipo','kind',kindChoices)}${input('Zona','area',place?.area,'maxlength="200"')}${input('Dirección','address',place?.address,'maxlength="500" required')}</div>${text('Por qué merece la pena','description',place?.description,2000)}<div class="form-grid">${input('Qué fotografiar','photo',place?.photo,'maxlength="500"')}${input('Accesibilidad','access',place?.access,'maxlength="1000"')}${input('Sombra','shade',place?.shade,'maxlength="1000"')}${input('Precio y fuente o estimación','price',place?.price,'maxlength="300"')}${input('Latitud (opcional)','lat',place?.lat,'type="number" step="any" min="-90" max="90" inputmode="decimal"')}${input('Longitud (opcional)','lon',place?.lon,'type="number" step="any" min="-180" max="180" inputmode="decimal"')}</div>${submit('Guardar lugar',place ? button('Borrar lugar','delete-place','','danger',place.id) : '')}</form>`
}

export function noteForm(state: State, date: string, note?: Note) {
  return `<form data-form="note">${hidden('id',note?.id ?? '')}<div class="form-grid">${select('Día','date',dayOptions(note?.date ?? date))}${select('Lugar','placeId',placeOptions(state,note?.placeId ?? ''))}</div>${text('Nota','text',note?.text,10000,'required autofocus')}${select('Valoración','rating',option('','Sin valoración',String(note?.rating ?? '')) + choices(['1','2','3','4','5'],String(note?.rating ?? '')))}${input('Recuerdo','memory',note?.memory,'maxlength="200"')}${submit('Guardar nota',note ? button('Borrar nota','delete-note','','danger',note.id) : '')}</form>`
}

export function expenseForm(date: string, expense?: Expense) {
  return `<form data-form="expense">${hidden('id',expense?.id ?? '')}${select('Día','date',dayOptions(expense?.date ?? date))}${input('Concepto','title',expense?.title,'required maxlength="300" autofocus')}<div class="form-grid">${input('Importe','amount',expense?.amount,`${amount} required`)}${select('Moneda','currency',choices(['EUR','SGD','MYR'],expense?.currency ?? 'EUR'))}</div>${select('Categoría','category',expenseCategoryOptions(expense?.category ?? 'Comida'))}${submit('Guardar gasto',expense ? button('Borrar gasto','delete-expense','','danger',expense.id) : '')}</form>`
}

export function budgetForm(state: State) {
  const rate = 'type="number" inputmode="decimal" min="0.000001" max="1000000" step="any"'
  return `<form data-form="budget">${input('Presupuesto (EUR)','budget',state.budget,amount)}<p>Usa tu tipo manual. Si 1 SGD equivale a 0,67 €, escribe 0,67.</p><div class="form-grid">${input('EUR por 1 SGD','SGD',state.rates.SGD,rate)}${input('EUR por 1 MYR','MYR',state.rates.MYR,rate)}</div>${submit('Guardar presupuesto')}</form>`
}
