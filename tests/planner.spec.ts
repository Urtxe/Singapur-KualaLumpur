import { expect, test } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173/asia-trip/'

test.describe('Planificador y HOY', () => {
  test('permite alternar Plan A/B y editar una alternativa sin alterar Plan A', async ({ page }) => {
    await page.goto(`${baseURL}#agenda`)
    await page.getByLabel('Día de la agenda').fill('2026-12-05')
    await page.getByLabel('Día de la agenda').dispatchEvent('change')

    const original = page.locator('.pl-activity[data-item="merlion-bay"]')
    await expect(original).toBeVisible()
    await original.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByRole('dialog').locator('select[name="plan"]').selectOption('B')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar actividad' }).click()

    await expect(page.locator('.pl-activity[data-item="merlion-bay"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Plan B' }).click()
    const alternate = page.locator('.pl-activity[data-item="merlion-bay"]')
    await expect(alternate).toBeVisible()
    await expect(alternate.locator('.pl-plan-b')).toHaveText('PLAN B')

    await alternate.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Hora de inicio').fill('10:10')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar actividad' }).click()
    await expect(page.locator('.pl-activity[data-item="merlion-bay"]')).toBeVisible()
    await page.getByRole('button', { name: 'Plan A' }).click()
    await expect(page.locator('.pl-activity[data-item="merlion-bay"]')).toHaveCount(0)
  })

  test('admite reordenación táctil con pointer capture y muestra la vista cronológica por fecha', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'La secuencia de puntero real se verifica en Chromium.')
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await page.goto(`${baseURL}#agenda`)
    await page.getByLabel('Día de la agenda').fill('2026-12-04')
    await page.getByLabel('Día de la agenda').dispatchEvent('change')

    const firstId = 'arrival-sin'
    const secondId = 'transfer-hotel-sg'
    const first = page.locator(`.pl-activity[data-item="${firstId}"]`)
    const second = page.locator(`.pl-activity[data-item="${secondId}"]`)
    await expect(first).toBeVisible()
    const grip = first.locator('[data-pl-action="grab"]')
    const gripBox = await grip.boundingBox()
    const secondBox = await second.boundingBox()
    if (!gripBox || !secondBox) throw new Error('No se pudo localizar la fila para reordenarla')
    const start = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 }
    const end = { x: secondBox.x + Math.min(40, secondBox.width / 3), y: secondBox.y + secondBox.height / 2 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + (end.y - start.y) / 3, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x, y: end.y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => page.locator('.pl-timeline .pl-activity').first().getAttribute('data-item')).toBe(secondId)

    await page.getByRole('button', { name: 'Cronología' }).click()
    const firstTime = await page.locator('.pl-activity').first().locator('.pl-time').innerText()
    expect(firstTime).toContain('16:15')
    await page.getByRole('button', { name: 'Semana' }).click()
    await expect(page.locator('.pl-day-section')).toHaveCount(7)
    await context.close()
  })

  test('HOY permite previsualizar otra fecha usando la hora del destino', async ({ page }) => {
    await page.goto(`${baseURL}#inicio`)
    await expect(page.getByRole('heading', { name: 'HOY' })).toBeVisible()
    const preview = page.getByLabel('Fecha de HOY')
    await preview.fill('2026-12-05')
    await preview.dispatchEvent('change')
    await expect(page.getByText(/Vista previa/)).toBeVisible()
    await expect(page.getByText(/SINGAPUR · .* HORA DE ASIA/)).toBeVisible()
    await expect(page.getByText(/PRÓXIMA · 09:30/)).toBeVisible()
  })
})
