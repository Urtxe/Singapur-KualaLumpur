import type { AppContext } from './app-api'
import { renderFinance } from './finance-view'
import type { Budget, CashMovement, Currency, Expense, State } from './types'

const storeReceipt = async (file: File) => (await import('./vault')).storeAttachment(file, 'receipt')
const removeReceipt = async (id: string) => (await import('./vault')).removeAttachment(id)
const loadReceipt = async (id: string) => (await import('./vault')).getAttachment(id)

export const FINANCE_CATEGORIES = ['Vuelos', 'Alojamiento', 'Restaurantes', 'Comida callejera', 'Transporte', 'Atracciones', 'Compras', 'Supermercado', 'Farmacia', 'Telefonía', 'Propinas', 'Otros'] as const
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function toMinorUnits(value: number | string): number {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  if (!Number.isFinite(number) || number < 0) throw new Error('Introduce un importe válido.')
  return Math.round(number * 100)
}

export function fromMinorUnits(amountMinor: number): number { return amountMinor / 100 }

export function historicalEuroMinor(amountMinor: number, currency: Currency, rate: number | null): number | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null
  if (currency === 'EUR') return amountMinor
  return rate !== null && Number.isFinite(rate) && rate > 0 ? Math.round(amountMinor * rate) : null
}

export function expenseEuroMinor(expense: Expense, rates: State['rates']): number | null {
  if (Number.isSafeInteger(expense.eurMinor) && expense.eurMinor! >= 0) return expense.eurMinor!
  const minor = Number.isSafeInteger(expense.amountMinor) ? expense.amountMinor! : toMinorUnits(expense.amount)
  const rate = expense.rate ?? (expense.currency === 'EUR' ? 1 : rates[expense.currency])
  return historicalEuroMinor(minor, expense.currency, rate)
}

export function financeTotals(state: State) {
  let total = 0, prepaid = 0, destination = 0, pending = 0
  const byCity = new Map<string, number>(), byCategory = new Map<string, number>(), byDay = new Map<string, number>(), byMethod = new Map<string, number>()
  for (const item of state.expenses) {
    const euros = expenseEuroMinor(item, state.rates)
    if (euros === null) { pending++; continue }
    total += euros
    if ((item.phase ?? 'destination') === 'prepaid') prepaid += euros
    else destination += euros
    const city = item.city ?? 'other'
    byCity.set(city, (byCity.get(city) ?? 0) + euros)
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + euros)
    byDay.set(item.date, (byDay.get(item.date) ?? 0) + euros)
    const method = item.method ?? 'other'
    byMethod.set(method, (byMethod.get(method) ?? 0) + euros)
  }
  for (const movement of state.cash ?? []) {
    const fee = movement.feeEurMinor
    if (fee !== null) total += fee
    else if (movement.feeMinor > 0) pending++
    if (fee !== null && fee > 0) {
      destination += fee
      byCategory.set('Comisiones', (byCategory.get('Comisiones') ?? 0) + fee)
      byDay.set(movement.date, (byDay.get(movement.date) ?? 0) + fee)
    }
    // Cash refunds reduce trip cost only when their historical EUR value is recorded.
    if (movement.kind === 'refund' && movement.eurMinor != null) { total -= movement.eurMinor; destination -= movement.eurMinor }
  }
  return { total, prepaid, destination, pending, byCity, byCategory, byDay, byMethod }
}

function budgetMatch(budget: Budget, item: Expense): boolean {
  switch (budget.scope) {
    case 'total': return true
    case 'destination': return (item.phase ?? 'destination') === 'destination'
    case 'city': return (item.city ?? 'other') === budget.qualifier
    case 'day': return item.date === budget.qualifier
    case 'category': return item.category === budget.qualifier
    default: return false
  }
}

export function budgetSpent(state: State, budget: Budget): number {
  const expenseTotal = state.expenses.reduce((sum, item) => {
    if (!budgetMatch(budget, item)) return sum
    return sum + (expenseEuroMinor(item, state.rates) ?? 0)
  }, 0)
  const movementTotal = (state.cash ?? []).reduce((sum, movement) => {
    let total = 0
    const matches = budget.scope === 'total' || budget.scope === 'destination' || budget.scope === 'day' && budget.qualifier === movement.date || budget.scope === 'category' && budget.qualifier === 'Comisiones'
    if (!matches) return sum
    if (movement.feeEurMinor !== null && (budget.scope !== 'category' || budget.qualifier === 'Comisiones')) total += movement.feeEurMinor
    if (movement.kind === 'refund' && movement.eurMinor != null && (budget.scope === 'total' || budget.scope === 'destination' || budget.scope === 'day' && budget.qualifier === movement.date)) total -= movement.eurMinor
    return sum + total
  }, 0)
  return expenseTotal + movementTotal
}

function input(label: string, name: string, value: unknown = '', type = 'text', attrs = '') {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`
}
function select(label: string, name: string, choices: [string, string][], selected: string) {
  return `<label class="field"><span>${label}</span><select name="${name}">${choices.map(([v, n]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`
}
const formActions = (submit: string) => `<div class="actions form-actions"><button class="button primary" type="submit">${submit}</button><button class="button" type="button" data-finance-action="dismiss">Cancelar</button></div>`

function expenseForm(state: State, app: AppContext, old?: Expense, copy = false) {
  const rate = old?.rate ?? (old?.currency === 'EUR' ? 1 : old ? state.rates[old.currency] : null)
  const itemId = old && !copy ? old.id : ''
  const existingReceipt = !copy ? old?.receiptId ?? '' : ''
  const defaultDate = old?.date ?? app.selectedDate()
  const defaultPhase = old?.phase ?? (defaultDate < '2026-12-03' ? 'prepaid' : 'destination')
  const defaultCity = old?.city ?? (defaultDate < '2026-12-03' ? 'other' : defaultDate < '2026-12-07' ? 'sg' : 'kl')
  const categories: [string,string][] = [...new Set([...(old?.category ? [old.category] : []), ...FINANCE_CATEGORIES])].map(value => [value,value])
  const activities: [string,string][] = [['','Sin actividad'], ...state.activities.map(a => [a.id,`${a.date} · ${a.title}`] as [string,string])]
  const html = `<form data-finance-form="expense"><input type="hidden" name="id" value="${esc(itemId)}"><input type="hidden" name="receiptId" value="${esc(existingReceipt)}">${input('Fecha','date',defaultDate,'date','required')}<div class="form-grid">${input('Concepto','title',old?.title ?? '','text','required maxlength="300" autofocus')}${input('Importe','amount',old?.amountMinor != null ? (old.amountMinor / 100).toFixed(2) : old?.amount ?? '', 'number','required min="0" step="0.01" inputmode="decimal"')}${select('Moneda','currency',[['EUR','EUR · Euro'],['SGD','SGD · Dólar singapurense'],['MYR','MYR · Ringgit malasio']],old?.currency ?? 'EUR')}${input('Hora','time',old?.time ?? '12:00','time')}${select('Ciudad','city',[['sg','Singapur'],['kl','Kuala Lumpur'],['other','Otra / antes del viaje']],defaultCity)}${select('Categoría','category',categories,old?.category ?? 'Otros')}${input('Quién pagó','payer',old?.payer ?? '','text','maxlength="100"')}${select('Método','method',[['cash','Efectivo'],['card','Tarjeta'],['other','Otro']],old?.method ?? 'card')}${input('Personas','people',old?.people ?? 5,'number','min="1" max="20" step="1"')}${input('Cambio aplicado · EUR por unidad','rate',rate ?? '', 'number','min="0.000001" step="any"')}${select('Tipo de gasto','phase',[['prepaid','Pagado antes del viaje'],['destination','Durante el viaje']],defaultPhase)}${select('Actividad asociada','activityId',activities,old?.activityId ?? '')}</div>${input('Notas','notes',old?.notes ?? '')}<label class="field"><span>Recibo (opcional)</span><input name="receiptFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small>${existingReceipt ? 'Ya hay un recibo adjunto; elige un archivo para reemplazarlo.' : 'Se guarda localmente en este dispositivo.'}</small></label>${existingReceipt ? `<button type="button" class="button" data-finance-action="view-receipt" data-id="${esc(existingReceipt)}">Ver recibo adjunto</button>` : ''}${formActions('Guardar gasto')}</form>`
  return html
}
function budgetForm(_state: State, old?: Budget) {
  const html = `<form data-finance-form="budget"><input type="hidden" name="id" value="${esc(old?.id ?? '')}"><div class="form-grid">${select('Ámbito','scope',[['total','Total familiar'],['destination','En destino'],['city','Por ciudad'],['day','Por día'],['category','Por categoría']],old?.scope ?? 'total')}${input('Descripción / filtro','qualifier',old?.qualifier ?? '','text','maxlength="100"')}${input('Presupuesto (EUR)', 'amount', old ? fromMinorUnits(old.amountMinor) : '', 'number','required min="0" step="0.01"')}</div>${formActions('Guardar presupuesto')}</form>`
  return html
}
function cashForm(date: string) {
  return `<form data-finance-form="cash">${input('Fecha','date',date,'date','required')}<div class="form-grid">${select('Moneda','currency',[['SGD','SGD'],['MYR','MYR']],'SGD')}${select('Tipo','kind',[['exchange','Cambio de moneda'],['withdrawal','Retirada de cajero'],['refund','Reembolso en efectivo'],['adjustment','Ajuste de saldo']],'exchange')}${input('Importe recibido','amount','', 'number','required min="0.01" step="0.01"')}${input('Comisión','fee','0', 'number','min="0" step="0.01"')}${input('EUR por unidad local','rate','', 'number','min="0.000001" step="any"')}${input('Nota','notes')}</div><p class="muted">El cambio y la retirada solo mueven dinero a la cartera; no cuentan como gasto. Las comisiones sí.</p>${formActions('Registrar movimiento')}</form>`
}
function ratesForm(state: State) {
  return `<form data-finance-form="rates"><p>1 unidad de moneda local equivale a este importe en euros. Los gastos existentes conservan el cambio que tenían al guardarse.</p><div class="form-grid">${input('EUR por 1 SGD','SGD',state.rates.SGD ?? '', 'number','min="0.000001" step="any"')}${input('EUR por 1 MYR','MYR',state.rates.MYR ?? '', 'number','min="0.000001" step="any"')}</div>${formActions('Guardar cambios')}</form>`
}

function dialog(app: AppContext, title: string, html: string, onSave: (form: HTMLFormElement) => Promise<void> | void) {
  const dlg = app.openDialog(title, html)
  const form = dlg.querySelector<HTMLFormElement>('form[data-finance-form]')
  form?.addEventListener('change', event => {
    const target = event.target
    if (form.dataset.financeForm === 'expense' && target instanceof HTMLSelectElement && target.name === 'currency') {
      const rate = form.elements.namedItem('rate') as HTMLInputElement | null
      if (rate) rate.value = target.value === 'EUR' ? '1' : String(app.getState().rates[target.value as 'SGD'|'MYR'] ?? '')
    }
    if (form.dataset.financeForm === 'expense' && target instanceof HTMLInputElement && target.name === 'date') {
      const phase = form.elements.namedItem('phase') as HTMLSelectElement | null
      const city = form.elements.namedItem('city') as HTMLSelectElement | null
      if (phase) phase.value = target.value < '2026-12-03' ? 'prepaid' : 'destination'
      if (city) city.value = target.value < '2026-12-03' ? 'other' : target.value < '2026-12-07' ? 'sg' : 'kl'
    }
  })
  dlg.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-finance-action="dismiss"]')) dlg.close()
  }, { once: true })
  form?.addEventListener('submit', async event => {
    event.preventDefault()
    try { await onSave(form) } catch (error) { app.notify(error instanceof Error ? error.message : 'No se pudo guardar.') }
  }, { once: true })
  return dlg
}

function formData(form: HTMLFormElement) { return new FormData(form) }
function value(data: FormData, key: string) { return String(data.get(key) ?? '').trim() }
function optionalRate(raw: string): number | null { if (!raw) return null; const rate = Number(raw.replace(',', '.')); if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) throw new Error('Comprueba el tipo de cambio.'); return rate }

async function saveExpense(app: AppContext, form: HTMLFormElement, prior?: Expense) {
  const data = formData(form), currency = value(data, 'currency') as Currency, title = value(data, 'title')
  if (!title) throw new Error('Escribe un concepto para el gasto.')
  const amountMinor = toMinorUnits(value(data, 'amount'))
  const activityId = value(data, 'activityId')
  const rate = currency === 'EUR' ? 1 : optionalRate(value(data, 'rate'))
  const eurMinor = currency === 'EUR' ? amountMinor : (rate === null ? (prior?.currency === currency && prior?.amountMinor === amountMinor ? prior.eurMinor ?? null : null) : historicalEuroMinor(amountMinor, currency, rate))
  const file = data.get('receiptFile')
  let receiptId = value(data, 'receiptId')
  let replacedReceiptId = ''
  if (file instanceof File && file.size) {
    const meta = await storeReceipt(file)
    if (receiptId && receiptId !== meta.id) replacedReceiptId = receiptId
    receiptId = meta.id
  }
  const item: Expense = {
    id: value(data, 'id') || crypto.randomUUID(), date: value(data, 'date'), title, amount: fromMinorUnits(amountMinor), amountMinor,
    currency, category: value(data, 'category'), time: value(data, 'time') || '12:00', city: value(data, 'city') as Expense['city'], payer: value(data, 'payer'),
    method: value(data, 'method') as Expense['method'], people: Math.max(1, Math.min(20, Math.floor(Number(value(data, 'people')) || 1))),
    rate, eurMinor, ...(activityId ? { activityId } : {}), ...(receiptId ? { receiptId } : {}), notes: value(data, 'notes'), phase: value(data, 'date') < '2026-12-03' ? 'prepaid' : value(data, 'phase') as Expense['phase'],
  }
  const next = { ...app.getState(), expenses: upsert(app.getState().expenses, item) }
  if (app.commit(next, 'Gasto guardado.')) {
    form?.closest('dialog')?.close()
    if (replacedReceiptId && !app.getState().expenses.some(x => x.receiptId === replacedReceiptId)) await removeReceipt(replacedReceiptId).catch(() => undefined)
  } else if (receiptId !== value(data, 'receiptId')) await removeReceipt(receiptId).catch(() => undefined)
}
function upsert<T extends { id: string }>(items: T[], item: T) { return items.some(x => x.id === item.id) ? items.map(x => x.id === item.id ? item : x) : [...items, item] }

export function openExpense(app: AppContext, activityId?: string) {
  const state = app.getState()
  const html = expenseForm(state, app)
  const dlg = dialog(app, 'Anotar gasto', html, form => saveExpense(app, form))
  if (activityId) { const el = dlg.querySelector<HTMLSelectElement>('[name="activityId"]'); if (el) el.value = activityId }
}

export function mountFinance(element: HTMLElement, app: AppContext): void {
  let filter = ''
  let query = ''
  const paint = () => { element.innerHTML = renderFinance(app.getState(), { filter, query }); bindReceiptLinks(element, app); }
  const commitCash = (form: HTMLFormElement) => {
    const d = formData(form), currency = value(d, 'currency') as 'SGD'|'MYR', amountMinor = toMinorUnits(value(d,'amount')), feeMinor = toMinorUnits(value(d,'fee') || '0'), rate = optionalRate(value(d,'rate'))
    const movement: CashMovement = { id: crypto.randomUUID(), date: value(d,'date'), time: '12:00', currency, kind: value(d,'kind') as CashMovement['kind'], amountMinor, feeMinor, feeEurMinor: rate === null ? null : historicalEuroMinor(feeMinor,currency,rate), eurMinor: value(d,'kind') === 'refund' && rate !== null ? historicalEuroMinor(amountMinor,currency,rate) ?? undefined : undefined, notes: value(d,'notes') }
    const current = app.getState(); if (app.commit({ ...current, cash: [...(current.cash ?? []), movement] }, 'Cartera actualizada.')) form.closest('dialog')?.close()
  }
  element.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-finance-action]')
    if (!target) return
    const action = target.dataset.financeAction!, id = target.dataset.id ?? '', state = app.getState()
    if (action === 'add-expense') openExpense(app)
    else if (action === 'add-budget') dialog(app,'Nuevo presupuesto',budgetForm(state), form => {
      const d = formData(form), scope = value(d,'scope') as Budget['scope'], qualifier = value(d,'qualifier'), amountMinor = toMinorUnits(value(d,'amount'))
      const id = value(d,'id') || crypto.randomUUID()
      const item: Budget = { id, scope, qualifier: scope === 'total' || scope === 'destination' ? '' : qualifier, amountMinor }
      if ((scope === 'city' || scope === 'day' || scope === 'category') && !item.qualifier) throw new Error('Indica ciudad, fecha o categoría para este presupuesto.')
      const current = app.getState()
      const budgets = current.budgets.some(x => x.id === id) ? current.budgets.map(x => x.id === id ? item : x) : [...current.budgets,item]
      if (app.commit({ ...current, budgets }, 'Presupuesto guardado.')) form.closest('dialog')?.close()
    })
    else if (action === 'edit-budget') { const item = state.budgets.find(x => x.id === id); if (item) dialog(app,'Editar presupuesto',budgetForm(state,item), form => {
      const d = formData(form), scope = value(d,'scope') as Budget['scope'], qualifier = value(d,'qualifier'), amountMinor = toMinorUnits(value(d,'amount'))
      if ((scope === 'city' || scope === 'day' || scope === 'category') && !qualifier) throw new Error('Indica ciudad, fecha o categoría para este presupuesto.')
      const nextItem: Budget = { ...item, scope, qualifier: scope === 'total' || scope === 'destination' ? '' : qualifier, amountMinor }
      if (app.commit({ ...app.getState(), budgets: app.getState().budgets.map(x => x.id === item.id ? nextItem : x) }, 'Presupuesto guardado.')) form.closest('dialog')?.close()
    }) }
    else if (action === 'add-cash') dialog(app,'Añadir efectivo',cashForm(app.selectedDate()),commitCash)
    else if (action === 'edit-rates') dialog(app,'Tipos de cambio',ratesForm(state), form => {
      const d = formData(form), nextRates = { SGD: optionalRate(value(d,'SGD')), MYR: optionalRate(value(d,'MYR')) }
      if (app.commit({ ...app.getState(), rates: nextRates }, 'Tipos de cambio guardados.')) form.closest('dialog')?.close()
    })
    else if (action === 'edit-expense' || action === 'duplicate-expense') {
      const item = state.expenses.find(x => x.id === id); if (item) dialog(app, action === 'edit-expense' ? 'Editar gasto' : 'Duplicar gasto',expenseForm(state,app,item,action==='duplicate-expense'),form => saveExpense(app,form,item))
    }
    else if (action === 'delete-expense') {
      const item = state.expenses.find(x => x.id === id); if (!item || !confirm(`¿Borrar «${item.title}»?`)) return
      if (app.commit({ ...state, expenses: state.expenses.filter(x => x.id !== id) }, 'Gasto eliminado.')) { if (item.receiptId && !state.expenses.some(x => x.id !== id && x.receiptId === item.receiptId)) void removeReceipt(item.receiptId).catch(() => undefined) }
    } else if (action === 'delete-budget') app.commit({ ...state, budgets: (state.budgets ?? []).filter(x => x.id !== id) }, 'Presupuesto eliminado.')
    else if (action === 'filter') { filter = target.dataset.value ?? ''; paint() }
    else if (action === 'duplicate-cash') { const item = state.cash?.find(x => x.id === id); if (item) app.commit({ ...state, cash: [...state.cash, { ...item, id: crypto.randomUUID() }] }, 'Movimiento duplicado.') }
    else if (action === 'export-csv') exportFinanceCSV(state)
    else if (action === 'print') window.print()
    else if (action === 'view-receipt') void showReceipt(id, app)
  })
  element.addEventListener('input', event => { const target = event.target; if (target instanceof HTMLInputElement && target.dataset.financeSearch !== undefined) { query = target.value; paint(); const next = element.querySelector<HTMLInputElement>('[data-finance-search]'); next?.focus(); next?.setSelectionRange(query.length,query.length) } })
  element.addEventListener('change', event => { const target = event.target; if (target instanceof HTMLInputElement && target.dataset.financeSearch !== undefined) { query = target.value; paint() } })
  const convert = () => {
    const amount = element.querySelector<HTMLInputElement>('[data-finance-convert-amount]')
    const currency = element.querySelector<HTMLSelectElement>('[data-finance-convert-currency]')
    const output = element.querySelector<HTMLElement>('[data-finance-convert-results]')
    if (!amount || !currency || !output) return
    const numeric = Number(amount.value), current = app.getState()
    if (!Number.isFinite(numeric) || numeric < 0) { output.textContent = 'Introduce un importe válido.'; return }
    const source = currency.value as Currency, eur = source === 'EUR' ? numeric : current.rates[source] === null ? null : numeric * current.rates[source]!
    const format = (n: number | null, code: Currency) => n === null ? 'Falta cambio' : new Intl.NumberFormat('es-ES',{style:'currency',currency:code}).format(n)
    for (const row of output.querySelectorAll<HTMLElement>('[data-currency]')) {
      const code = row.dataset.currency as Currency
      const converted = code === 'EUR' ? eur : code === source ? numeric : eur === null || current.rates[code] === null ? null : eur / current.rates[code]!
      const value = row.querySelector('b')
      if (value) value.textContent = format(converted,code)
    }
  }
  element.addEventListener('input', event => { if ((event.target as HTMLElement).matches('[data-finance-convert-amount]')) convert() })
  element.addEventListener('change', event => { if ((event.target as HTMLElement).matches('[data-finance-convert-currency]')) convert() })
  paint()
}

function exportFinanceCSV(state: State) {
  const header = ['Fecha','Hora','Concepto','Tipo','Ciudad','Categoría','Importe','Moneda','EUR histórico','Pagador','Método','Personas','Actividad','Notas']
  const rows: unknown[][] = state.expenses.map(item => [item.date,item.time ?? '',item.title,(item.phase ?? 'destination') === 'prepaid' ? 'Prepagado' : 'En destino',item.city ?? '',item.category,fromMinorUnits(item.amountMinor ?? toMinorUnits(item.amount)).toFixed(2),item.currency,expenseEuroMinor(item,state.rates) === null ? '' : fromMinorUnits(expenseEuroMinor(item,state.rates)!).toFixed(2),item.payer ?? '',item.method ?? '',item.people ?? '',item.activityId ?? '',item.notes ?? ''])
  for (const item of state.cash ?? []) {
    const label = item.kind === 'exchange' ? 'Cambio de moneda' : item.kind === 'withdrawal' ? 'Retirada de cajero' : item.kind === 'refund' ? 'Reembolso en efectivo' : 'Ajuste de cartera'
    rows.push([item.date,item.time,label,'Movimiento interno','','Cartera',fromMinorUnits(item.amountMinor).toFixed(2),item.currency,item.kind === 'refund' && item.eurMinor != null ? fromMinorUnits(-item.eurMinor).toFixed(2) : '', '', 'Efectivo','','',item.notes])
    if (item.feeMinor > 0) rows.push([item.date,item.time,`Comisión · ${label}`,'En destino','','Comisiones',fromMinorUnits(item.feeMinor).toFixed(2),item.currency,item.feeEurMinor == null ? '' : fromMinorUnits(item.feeEurMinor).toFixed(2),'','Efectivo','','',item.notes])
  }
  const csv = '\uFEFF' + [header,...rows].map(row => row.map(safeCell).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})), a = document.createElement('a'); a.href=url; a.download='asia-trip-gastos.csv'; a.click(); URL.revokeObjectURL(url)
}
function safeCell(value: unknown) { let text=String(value ?? ''); if (/^[\s]*[=+\-@]/.test(text)) text=`'${text}`; return `"${text.replace(/"/g,'""')}"` }
async function bindReceiptLinks(element: HTMLElement, app: AppContext) {
  void app
  // Receipt previews are opened from an explicit button, so no persistent object URLs are kept.
  for (const button of element.querySelectorAll<HTMLButtonElement>('[data-finance-action="view-receipt"]')) button.setAttribute('aria-label','Ver recibo adjunto')
}
async function showReceipt(id: string, app: AppContext) {
  const item = await loadReceipt(id)
  if (!item) { app.notify('No se encuentra el recibo en este dispositivo.'); return }
  const url = URL.createObjectURL(item.blob), w = window.open(url,'_blank','noopener');
  if (!w) app.notify('Permite abrir una ventana para consultar el recibo.')
  window.setTimeout(() => URL.revokeObjectURL(url),60_000)
}
