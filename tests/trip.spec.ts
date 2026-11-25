import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const baseURL = 'http://127.0.0.1:4173/asia-trip/';

test.describe('Asia Trip 2026', () => {
  test('desktop navigation, place search and schematic map work', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseURL);

    await expect(page.getByRole('heading', { name: 'Asia Trip 2026' })).toBeVisible();
    await page.getByRole('link', { name: 'Lugares' }).click();
    await expect(page).toHaveURL(/#lugares$/);
    const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
    await search.fill('Gardens by the Bay');
    await expect(page.getByText('Gardens by the Bay', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Mapa' }).click();
    await expect(page.getByLabel('Día del mapa')).toBeVisible();
    await expect(page.locator('.map-pin').first()).toBeVisible();
    await page.locator('.map-itinerary button').first().click();
    await page.getByRole('button', { name: /Cómo llegar a/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Cómo llegar' })).toBeVisible();
    const directions = page.getByRole('link', { name: 'Abrir en Google Maps' });
    await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir/);
    await expect(directions).toHaveAttribute('target', '_blank');
    await page.getByLabel('Modo').selectOption('transit');
    await expect(directions).toHaveAttribute('href', /travelmode=transit/);
    await page.getByLabel('Modo').selectOption('driving');
    await expect(directions).toHaveAttribute('href', /travelmode=driving/);
    expect(pageErrors).toEqual([]);
  });

  test('activity status and edited time persist, and a custom activity can move days', async ({ page }) => {
    await page.goto(`${baseURL}#agenda`);
    const day = page.getByLabel('Día de la agenda');
    await day.selectOption('2026-12-04');
    const firstActivity = page.locator('[data-activity]').first();
    const status = firstActivity.getByRole('combobox', { name: /^Estado de / });
    await status.selectOption('done');

    const title = await firstActivity.locator('h3').textContent();
    if (!title) throw new Error('La actividad no muestra un título');
    await page.getByRole('button', { name: `Editar actividad ${title}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar actividad' });
    await dialog.getByLabel('Hora').fill('09:17');
    await dialog.getByRole('button', { name: 'Guardar actividad' }).click();
    await expect(page.locator('[data-activity]').filter({ hasText: title }).getByText('09:17')).toBeVisible();

    await page.reload();
    await page.getByLabel('Día de la agenda').selectOption('2026-12-04');
    const persistedActivity = page.locator('[data-activity]').filter({ hasText: title });
    await expect(persistedActivity.getByRole('combobox', { name: `Estado de ${title}` })).toHaveValue('done');
    await expect(persistedActivity.getByText('09:17')).toBeVisible();

    await page.getByRole('button', { name: 'Añadir actividad' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Nueva actividad' });
    await addDialog.getByLabel('Nombre').fill('Pausa de prueba');
    await addDialog.getByLabel('Día').selectOption('2026-12-04');
    await addDialog.getByLabel('Hora').fill('14:30');
    await addDialog.getByLabel('Duración (minutos)').fill('30');
    await addDialog.getByRole('button', { name: 'Guardar actividad' }).click();

    let customActivity = page.locator('[data-activity]').filter({ hasText: 'Pausa de prueba' });
    await customActivity.getByRole('combobox', { name: 'Estado de Pausa de prueba' }).selectOption('done');
    const moveDown = customActivity.getByRole('button', { name: 'Bajar Pausa de prueba' });
    if (await moveDown.isEnabled()) await moveDown.click();
    else await customActivity.getByRole('button', { name: 'Subir Pausa de prueba' }).click();
    customActivity = page.locator('[data-activity]').filter({ hasText: 'Pausa de prueba' });
    await expect(customActivity.getByRole('combobox', { name: 'Estado de Pausa de prueba' })).toHaveValue('done');
    await customActivity.getByRole('button', { name: 'Editar actividad Pausa de prueba' }).click();
    const moveDialog = page.getByRole('dialog', { name: 'Editar actividad' });
    await moveDialog.getByLabel('Día').selectOption('2026-12-05');
    await moveDialog.getByRole('button', { name: 'Guardar actividad' }).click();
    await page.getByLabel('Día de la agenda').selectOption('2026-12-05');
    customActivity = page.locator('[data-activity]').filter({ hasText: 'Pausa de prueba' });
    await expect(customActivity).toBeVisible();
    await expect(customActivity.getByRole('combobox', { name: 'Estado de Pausa de prueba' })).toHaveValue('done');
  });

  test('diary expenses, manual currency conversion, notes and backup validation', async ({ page }) => {
    await page.goto(`${baseURL}#diario`);
    await page.getByRole('button', { name: 'Gastos' }).click();
    await page.getByRole('button', { name: 'Configurar presupuesto' }).click();
    const budgetDialog = page.getByRole('dialog');
    await budgetDialog.getByLabel('Presupuesto (EUR)').fill('1200');
    await budgetDialog.getByLabel('EUR por 1 SGD').fill('0.68');
    await budgetDialog.getByRole('button', { name: 'Guardar presupuesto' }).click();

    await page.getByRole('button', { name: 'Añadir gasto' }).click();
    const expenseDialog = page.getByRole('dialog');
    await expenseDialog.getByLabel('Concepto').fill('Cena de prueba');
    await expenseDialog.getByLabel('Importe').fill('25');
    await expenseDialog.getByLabel('Moneda').selectOption('SGD');
    await expenseDialog.getByRole('button', { name: /Guardar gasto/ }).click();
    await expect(page.getByText('Cena de prueba')).toBeVisible();
    await expect(page.getByText(/17[,.]00\s*€/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Notas' }).click();
    await page.getByRole('button', { name: 'Añadir nota' }).click();
    const noteDialog = page.getByRole('dialog');
    await noteDialog.getByLabel('Nota').fill('Noche memorable');
    await noteDialog.getByRole('button', { name: /Guardar nota/ }).click();
    await expect(page.getByText('Noche memorable')).toBeVisible();

    await page.getByRole('button', { name: 'Copias' }).click();
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
    const csv = await readFile((await csvDownload.path())!, 'utf8');
    expect(csv).toContain('Cena de prueba');
    expect(csv).toContain('17');

    const [backupDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar JSON' }).click(),
    ]);
    expect(backupDownload.suggestedFilename()).toMatch(/\.json$/);
    const backup = await readFile((await backupDownload.path())!, 'utf8');
    expect(JSON.parse(backup).version).toBe(1);
    await page.getByRole('button', { name: 'Notas' }).click();
    await page.getByRole('button', { name: 'Editar nota' }).click();
    const editNote = page.getByRole('dialog', { name: 'Editar nota' });
    page.once('dialog', dialog => dialog.accept());
    await editNote.getByRole('button', { name: 'Borrar nota' }).click();
    await expect(page.getByRole('main').getByText('Noche memorable')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copias' }).click();
    await page.getByLabel('Restaurar copia JSON').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{not valid json'),
    });
    await expect(page.locator('.toast')).toContainText(/inválid|válid|error/i);
    await page.getByRole('button', { name: 'Gastos' }).click();
    await expect(page.getByText('Cena de prueba')).toBeVisible();
    await page.getByRole('button', { name: 'Notas' }).click();
    await expect(page.getByRole('main').getByText('Noche memorable')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copias' }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByLabel('Restaurar copia JSON').setInputFiles({
      name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup),
    });
    await expect(page.locator('.toast')).toContainText('Copia restaurada');
    await page.getByRole('button', { name: 'Notas' }).click();
    await expect(page.getByText('Noche memorable')).toBeVisible();
  });

  test('mobile layout, keyboard access and offline after first service worker install', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(baseURL);
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Asia Trip 2026' })).toBeVisible();
    const assertNoOverflow = async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    };
    await assertNoOverflow();

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    await page.getByRole('link', { name: 'Agenda' }).click();
    await expect(page).toHaveURL(/#agenda$/);
    await expect(page.locator('[data-activity]').first()).toBeVisible();
    await assertNoOverflow();
    await page.getByRole('link', { name: 'Lugares' }).click();
    await assertNoOverflow();
    await page.getByRole('link', { name: 'Diario' }).click();
    await assertNoOverflow();
    await page.getByRole('link', { name: 'Agenda' }).click();
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

    const installed = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.ready;
      return Boolean(navigator.serviceWorker.controller);
    });
    expect(installed).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
    await page.getByRole('link', { name: 'Viaje' }).click();
    await expect(page.getByRole('heading', { name: /Viaje/ })).toBeVisible();
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
});
