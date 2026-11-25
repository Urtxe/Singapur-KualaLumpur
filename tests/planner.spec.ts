import { expect, test } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173/asia-trip/'

test.describe('Planificador y HOY', () => {
  test('crear una actividad solo pide el nombre y permite marcarla realizada', async ({ page }) => {
    await page.goto(`${baseURL}#agenda`)
    await page.getByRole('button', { name: 'Añadir actividad', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('[data-pl-form="activity"] details')).not.toHaveAttribute('open', '')
    await expect(dialog.getByLabel('Nombre')).toBeVisible()
    await expect(dialog.getByLabel('Lugar asociado (opcional)')).toBeVisible()
    await dialog.getByLabel('Nombre').fill('Pausa junto al río')
    await dialog.getByRole('button', { name: 'Guardar actividad' }).click()
    const activity = page.locator('.pl-activity').filter({ has: page.getByRole('heading', { name: 'Pausa junto al río' }) })
    await expect(activity).toBeVisible()
    await activity.getByRole('button', { name: 'Marcar realizada: Pausa junto al río' }).click()
    await expect(activity.locator('.pl-complete-lock')).toHaveText('Realizada')
    await expect(activity.getByRole('button', { name: 'Editar' })).toHaveCount(0)
    await activity.getByRole('button', { name: /Más opciones de/ }).click()
    page.once('dialog', dialog => dialog.accept())
    await activity.getByRole('button', { name: 'Marcar pendiente' }).click()
    await expect(activity.getByRole('button', { name: 'Marcar realizada: Pausa junto al río' })).toBeVisible()
  })

  test('protege los vuelos confirmados frente a edición y reordenación', async ({ page }) => {
    await page.goto(`${baseURL}#agenda`)
    await page.getByLabel('Día de la agenda').fill('2026-12-04')
    await page.getByLabel('Día de la agenda').dispatchEvent('change')
    const flight = page.locator('.pl-activity[data-item="arrival-sin"]')
    await expect(flight).toBeVisible()
    await expect(flight).toHaveAttribute('draggable', 'false')
    await expect(flight.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
    await flight.getByRole('button', { name: 'Más opciones de Llegada, inmigración y equipaje' }).click()
    await expect(flight.getByText(/reserva o actividad realizada está protegida/)).toBeVisible()
  })

  test('permite alternar Plan A/B y editar una alternativa sin alterar Plan A', async ({ page }) => {
    await page.goto(`${baseURL}#agenda`)
    await page.getByLabel('Día de la agenda').fill('2026-12-05')
    await page.getByLabel('Día de la agenda').dispatchEvent('change')

    const original = page.locator('.pl-activity[data-item="merlion-bay"]')
    await expect(original).toBeVisible()
    await original.getByRole('button', { name: /Más opciones de/ }).click()
    await original.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByRole('dialog').locator('details > summary').click()
    await page.getByRole('dialog').locator('select[name="plan"]').selectOption('B')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar actividad' }).click()

    await expect(page.locator('.pl-activity[data-item="merlion-bay"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Plan B' }).click()
    const alternate = page.locator('.pl-activity[data-item="merlion-bay"]')
    await expect(alternate).toBeVisible()
    await expect(alternate.locator('.pl-plan-b')).toHaveText('PLAN B')
    await page.getByRole('button', { name: 'Activar Plan B' }).click()
    await expect(page.getByText('Activo', { exact: true })).toBeVisible()

    await alternate.getByRole('button', { name: /Más opciones de/ }).click()
    await alternate.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByRole('dialog').locator('[name="time"]').fill('10:10')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar actividad' }).click()
    await expect(page.locator('.pl-activity[data-item="merlion-bay"]')).toBeVisible()
    await page.getByRole('button', { name: 'Plan A' }).click()
    await expect(page.locator('.pl-activity[data-item="merlion-bay"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Activar Plan A' }).click()
    await expect(page.getByText('Activo', { exact: true })).toBeVisible()
  })

  test('admite reordenación táctil con pointer capture y muestra la vista cronológica por fecha', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'La secuencia de puntero real se verifica en Chromium.')
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await page.goto(`${baseURL}#agenda`)
    await page.getByLabel('Día de la agenda').fill('2026-12-05')
    await page.getByLabel('Día de la agenda').dispatchEvent('change')

    const firstId = 'merlion-bay'
    const secondId = 'helix-mbs'
    const first = page.locator(`.pl-activity[data-item="${firstId}"]`)
    const second = page.locator(`.pl-activity[data-item="${secondId}"]`)
    await expect(first).toBeVisible()
    await first.evaluate(el => el.scrollIntoView({block:'start',behavior:'instant'}))
    const grip = first.locator('[data-pl-action="grab"]')
    await expect(grip).toBeInViewport()
    await expect(second).toBeInViewport()
    const gripBox = await grip.boundingBox()
    const secondBox = await second.boundingBox()
    if (!gripBox || !secondBox) throw new Error('No se pudo localizar la fila para reordenarla')
    const start = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 }
    const end = { x: secondBox.x + Math.min(40, secondBox.width / 3), y: secondBox.y + Math.min(48,secondBox.height / 2) }
    expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-pl-action="grab"]'),start)).toBe(true)
    const nextFrame = () => page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
    await nextFrame()
    for (let step=1;step<=5;step++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x + (end.x-start.x)*step/5,y:start.y + (end.y-start.y)*step/5,id:1}]})
      await nextFrame()
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => page.locator('.pl-timeline .pl-activity').first().getAttribute('data-item')).toBe(secondId)

    await page.getByText('Más herramientas para organizar el día', { exact: true }).click()
    await page.getByRole('button', { name: 'Cronología' }).click()
    const firstTime = await page.locator('.pl-activity').first().locator('.pl-time').innerText()
    expect(firstTime).toContain('09:30')
    await page.getByText('Más herramientas para organizar el día', { exact: true }).click()
    await page.getByRole('button', { name: 'Semana' }).click()
    await expect(page.locator('.pl-day-section')).toHaveCount(7)
    await context.close()
  })

  test('HOY permite previsualizar otra fecha usando la hora del destino', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-26T12:00:00+08:00'))
    await page.goto(`${baseURL}#inicio`)
    await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
    const preview = page.getByLabel('Fecha de HOY')
    await preview.selectOption('2026-12-05')
    await expect(page.locator('.today-heading')).toContainText('Singapur')
    await expect(page.locator('.today-heading small')).toHaveText('Vista previa')
    await expect(page.getByRole('heading', { name: 'Merlion y paseo breve por Marina Bay' })).toBeVisible()
    await page.getByRole('button', { name: 'Volver a hoy' }).click()
    await expect(preview).toHaveValue('2026-12-04')
  })
})
