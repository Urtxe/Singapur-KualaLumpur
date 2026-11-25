import { expect, test } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173/asia-trip/'

test('logs and edits a cash expense without counting an ATM withdrawal as trip spending', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto(`${baseURL}#gastos`)
  await expect(page.getByRole('heading', { name: 'Gastos' })).toBeVisible()

  await page.getByRole('button', { name: 'Anotar gasto' }).click()
  let dialog = page.getByRole('dialog', { name: 'Anotar gasto' })
  await dialog.getByLabel('Concepto').fill('Comida familiar')
  await dialog.getByLabel('Importe').fill('12.50')
  await dialog.getByLabel('Moneda').selectOption('SGD')
  await dialog.getByLabel('Categoría').selectOption('Restaurantes')
  await dialog.getByLabel('Método').selectOption('cash')
  await dialog.getByLabel('Cambio aplicado · EUR por unidad').fill('0.68')
  await dialog.getByRole('button', { name: 'Guardar gasto' }).click()
  await expect(page.locator('.finance-hero')).toContainText('8,50')

  const row = page.locator('.finance-ledger li').filter({ hasText: 'Comida familiar' })
  await row.getByRole('button', { name: 'Editar' }).click()
  dialog = page.getByRole('dialog', { name: 'Editar gasto' })
  await dialog.getByLabel('Importe').fill('13.00')
  await dialog.getByRole('button', { name: 'Guardar gasto' }).click()
  await expect(page.locator('.finance-ledger li').filter({ hasText: 'Comida familiar' })).toContainText('13,00')
  await expect(page.locator('.finance-hero')).toContainText('8,84')

  await page.getByRole('button', { name: 'Añadir efectivo' }).first().click()
  dialog = page.getByRole('dialog', { name: 'Añadir efectivo' })
  await dialog.getByLabel('Tipo').selectOption('withdrawal')
  await dialog.getByLabel('Importe recibido').fill('100')
  await dialog.getByLabel('Comisión').fill('3')
  await dialog.getByLabel('EUR por unidad local').fill('0.68')
  await dialog.getByRole('button', { name: 'Registrar movimiento' }).click()

  await expect(page.locator('.finance-hero')).toContainText('10,88')
  await expect(page.locator('.finance-page')).toContainText('87,00 SGD')
  await expect(page.locator('.finance-cash-list')).toContainText('Retirada')
})

test('migrates a v1 expense and preserves its historical exchange rate after rate changes', async ({ page }) => {
  const legacy = {
    version: 1, activities: [], customPlaces: [], favorites: [], notes: [],
    expenses: [{ id: 'legacy-meal', date: '2026-12-05', title: 'Gasto anterior', amount: 10.01, currency: 'SGD', category: 'Comida' }],
    budget: null, rates: { SGD: 0.7, MYR: 0.18 }, checks: [], theme: 'light', family: false,
  }
  await page.addInitScript(value => {
    localStorage.clear()
    localStorage.setItem('asia-trip-state-v1:/asia-trip/', JSON.stringify(value))
  }, legacy)
  await page.goto(`${baseURL}#gastos`)
  await expect(page.locator('.finance-hero')).toContainText('7,01')
  await page.getByRole('button', { name: 'Editar cambios' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tipos de cambio' })
  await dialog.getByLabel('EUR por 1 SGD').fill('0.5')
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.locator('.finance-ledger li').filter({ hasText: 'Gasto anterior' })).toContainText('7,01')
})

test('allows a prepaid purchase dated before the trip', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto(`${baseURL}#gastos`)
  await page.getByRole('button', { name: 'Anotar gasto' }).click()
  const dialog = page.getByRole('dialog', { name: 'Anotar gasto' })
  await dialog.getByLabel('Fecha').fill('2026-11-20')
  await dialog.getByLabel('Concepto').fill('Billetes de avión')
  await dialog.getByLabel('Importe').fill('850')
  await dialog.getByLabel('Categoría').selectOption('Vuelos')
  await dialog.getByRole('button', { name: 'Guardar gasto' }).click()
  const row = page.locator('.finance-ledger li').filter({ hasText: 'Billetes de avión' })
  await expect(row).toContainText('2026-11-20')
  await expect(row).toContainText('Pagado antes del viaje')
})
