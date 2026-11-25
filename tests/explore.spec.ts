import { expect, test } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/asia-trip/';

test('Explorar starts with a curated selection and supports choosing a day before adding a place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}#lugares`);
  await expect(page.getByRole('heading', { name: 'Explorar', exact: true })).toBeVisible();
  await expect(page.locator('.explore-place')).toHaveCount(9);
  await expect(page.locator('.explore-photo-note').first()).toContainText('imagen de contexto');

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

  await page.getByRole('button', { name: 'Favoritos', exact: true }).click();
  await expect(page.getByText(/No hay experiencias/)).toBeVisible();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de lugares' })).toBeVisible();
  await expect(page.getByText(/no representa calles ni navegación/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Gastronomía/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Eventos/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Transporte/ })).toBeVisible();
});
