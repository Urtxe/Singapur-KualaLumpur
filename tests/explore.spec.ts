import { expect, test } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/asia-trip/';

test('Explorar starts with a curated selection and supports choosing a day before adding a place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}#lugares`);
  await expect(page.getByRole('heading', { name: 'Explorar', exact: true })).toBeVisible();
  await expect(page.locator('.explore-place')).toHaveCount(9);
  const merlion = page.locator('[data-place="merlion"]').getByRole('img', { name: /Merlion/ });
  const tekka = page.locator('[data-place="tekka"]').getByRole('img', { name: /Tekka Centre/ });
  const batu = page.locator('[data-place="batu-caves"]').getByRole('img', { name: /Batu Caves/ });
  for (const [image, id] of [[merlion, 'merlion'], [tekka, 'tekka'], [batu, 'batu-caves']] as const) {
    await expect(image).toHaveAttribute('src', new RegExp(`places/${id}[.]webp$`));
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }

  await page.getByLabel('Añadir al día').selectOption('2026-12-08');
  await page.getByRole('button', { name: 'Añadir al plan' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await expect(dialog.locator('input[name="date"][type="date"]')).toHaveValue('2026-12-08');
  await expect(dialog.locator('input[name="title"]')).not.toHaveValue('');
});

test('Explorar filters experiences and offers offline map context without horizontal overflow', async ({ page }) => {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}#lugares`);
    await page.getByRole('button', { name: 'Gratis', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gratis', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.explore-place').count()).toBeGreaterThan(0);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page, `page width at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
  }

  await page.getByRole('button', { name: 'Todos los lugares', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Hotel Mi Rochor');
  const hotel = page.locator('[data-place="mi-rochor"]');
  await expect(hotel.getByRole('heading', { name: 'Hotel Mi Rochor' })).toBeVisible();
  await expect(hotel.getByRole('img')).toHaveCount(0);
  await hotel.getByRole('button', { name: /Añadir a favoritos/ }).click();
  await expect(hotel.getByRole('button', { name: /Quitar de favoritos/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).clear();

  await page.getByRole('button', { name: 'Favoritos', exact: true }).click();
  await expect(hotel).toBeVisible();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de lugares' })).toBeVisible();
  await expect(page.getByText(/no representa calles ni navegación/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Gastronomía/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Eventos/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Transporte/ })).toBeVisible();
});

test('loads a food photo, a reused place photo and approximate transport durations', async ({ page }) => {
  await page.goto(`${base}#gastronomia`);
  const foodPhoto = page.locator('.food-photo').first();
  await foodPhoto.scrollIntoViewIfNeeded();
  await expect.poll(() => foodPhoto.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await page.getByText('Paradas para comer en Singapur', { exact: true }).click();
  await expect(page.locator('.food-stops')).toContainText('08:00–22:00');

  await page.goto(`${base}#lugares`);
  await page.getByRole('button', { name: 'Todos los lugares', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Sultan Mosque');
  const mosque = page.locator('[data-place="sultan-mosque"]');
  const placePhoto = mosque.getByRole('img', { name: /Sultan Mosque/ });
  await expect(placePhoto).toHaveAttribute('src', /places\/kampong-glam[.]webp$/);
  await placePhoto.scrollIntoViewIfNeeded();
  await expect.poll(() => placePhoto.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await mosque.getByText('Detalles del lugar').click();
  await expect(mosque.getByText(/CC BY-SA 4[.]0/)).toBeVisible();
  await expect(mosque).toContainText('10:00–12:00 y 14:00–16:00');

  await page.goto(`${base}#transporte`);
  await expect(page.locator('.route-grid')).toContainText('27 nov 2026');
  await expect(page.locator('.route-grid')).toContainText('55–80 min');
  await expect(page.locator('.route-grid')).not.toContainText('Duración exacta pendiente');
});

test('shows the latest entry and actual walking leg from the plan on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}#agenda`);
  const day = page.getByLabel('Día de la agenda');
  await day.fill('2026-12-08');
  await day.dispatchEvent('change');
  await page.getByText('Paseos del plan base', { exact: true }).click();
  await expect(page.locator('.travel-walks')).toContainText(/1[.]?700 m/);
  await page.getByRole('button', { name: /Ver Torres Petronas: visita interior/ }).click();
  const visit = page.getByRole('dialog');
  await expect(visit).toContainText('la entrada reservada a las 09:30');
  await visit.getByText(/Horario y visita/).click();
  await expect(visit.getByText('Último acceso', { exact: true })).toBeVisible();
  await expect(visit).toContainText('21:30');
  await visit.getByText('Trayectos a pie de referencia').click();
  await expect(visit.getByRole('link', { name: 'Trazado en OpenStreetMap' })).toHaveAttribute('href', /^https:\/\/routing[.]openstreetmap[.]de\//);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
