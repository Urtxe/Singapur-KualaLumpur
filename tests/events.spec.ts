import { expect, test } from '@playwright/test'

const base = 'http://127.0.0.1:4173/asia-trip/'

test('la agenda local muestra horarios de espectáculos, accesos y fuentes oficiales', async ({ page }) => {
  await page.goto(`${base}#eventos`)

  const wonderland = page.locator('.guide-card').filter({ has: page.getByRole('heading', { name: 'Christmas Wonderland en Gardens by the Bay', exact: true }) })
  await expect(wonderland).toContainText('sábado 5 dic la entrada está en tarifa Super Peak')
  await expect(wonderland).toContainText('19:45–20:02')
  await expect(wonderland).toContainText('21:05–21:20')
  await expect(wonderland.getByRole('link', { name: 'Programa completo del 5 dic (PDF)' })).toHaveAttribute('href', /Christmas-Wonderland2026-Festive-Entertainment/)

  const santa = page.locator('.guide-card').filter({ has: page.getByRole('heading', { name: 'Encuentro con Santa · Flower Dome', exact: true }) })
  await expect(santa.locator('.event-timing')).toContainText('45 min por sesión')
  await expect(santa.locator('.event-program li')).toHaveCount(7)
  await expect(santa).toContainText('09:15–10:00')
  await expect(santa).toContainText('16:00–16:45')
  await santa.getByRole('button', { name: 'Añadir al plan' }).click()
  const activity = page.getByRole('dialog', { name: 'Nueva actividad' })
  await expect(activity.locator('input[type="date"][name="date"]')).toHaveValue('2026-12-05')
  await expect(activity.locator('[name="duration"]')).toHaveValue('45')
  await expect(activity.locator('[name="time"]')).toHaveValue('')
  await activity.getByRole('button', { name: 'Cancelar' }).click()

  const lake = page.locator('.guide-card').filter({ has: page.getByRole('heading', { name: 'Lake Symphony · fuentes musicales de KLCC', exact: true }) })
  await expect(lake).toContainText('Luz y sonido · 20:00–20:10')
  await expect(lake).toContainText('Solo luz · 19:30, 20:30 y 21:30')
})

test('el plan del 5 dic explica la entrada y los horarios de las luces', async ({ page }) => {
  await page.goto(`${base}#agenda`)
  await page.getByLabel('Día de la agenda').fill('2026-12-05')
  await page.getByLabel('Día de la agenda').dispatchEvent('change')

  const dinner = page.locator('.pl-activity[data-item="sg-early-dinner"]')
  await expect(dinner).toContainText('17:00')
  const lights = page.locator('.pl-activity[data-item="rhapsody"]')
  await expect(lights).toContainText('18:30')
  await expect(lights).not.toContainText('World of Plants')
  const open = lights.getByRole('button', { name: /Ver Christmas Wonderland/ })
  await open.click()
  const details = page.getByRole('dialog', { name: /Christmas Wonderland/ })
  await expect(details.locator('.event-timing')).toContainText('sesiones de acceso a las 18:30, 19:30, 20:30 o 21:30')
  await expect(details).toContainText('S$13 anticipada / S$16 el mismo día')
  await expect(details).toContainText('19:45–20:02')
  await expect(details).toContainText('21:05–21:20')
  await expect(details).toContainText('elegid uno')
  await expect(details).toContainText('World of Plants')
  await details.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(open).toBeFocused()
})
