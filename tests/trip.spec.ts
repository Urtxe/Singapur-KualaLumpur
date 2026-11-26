import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4173/asia-trip/';

test('keeps the travel guide, city maps and all three Google Maps modes', async ({ page }) => {
  page.setDefaultTimeout(8000);
  const errors: string[] = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await expect(page.getByRole('heading',{name:'Hoy',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Explorar',exact:true}).click();
  await page.getByRole('searchbox',{name:'Buscar lugares'}).fill('Gardens by the Bay');
  await expect(page.getByRole('heading',{name:'Gardens by the Bay',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mapa',exact:true}).click();
  await expect(page.getByLabel('Día del mapa')).toBeVisible();
  await page.locator('.map-itinerary button').first().click();
  await page.getByRole('button',{name:/Cómo llegar a/}).first().click();
  const link = page.getByRole('link',{name:'Abrir en Google Maps'});
  await expect(link).toHaveAttribute('href',/travelmode=walking/);
  await page.locator('#direction-mode').selectOption('transit');
  await expect(link).toHaveAttribute('href',/travelmode=transit/);
  await page.locator('#direction-mode').selectOption('driving');
  await expect(link).toHaveAttribute('href',/travelmode=driving/);
  await expect(link).toHaveAttribute('target','_blank');
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-action="map-city"]').selectOption('kl');
  await page.getByLabel('Puntos del mapa',{exact:true}).selectOption('medical');
  await expect(page.locator('.map-pin').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('persists edits to an original activity and moves a custom activity between days', async ({ page }) => {
  await page.goto(`${base}#agenda`);
  const day = page.getByLabel('Día de la agenda');
  await day.fill('2026-12-04');
  await day.dispatchEvent('change');
  const original = page.locator('.pl-activity[data-item="little-india"]');
  await original.getByRole('button',{name:/Más opciones de/}).click();
  await original.getByRole('button',{name:'Editar',exact:true}).click();
  let modal = page.getByRole('dialog');
  await modal.locator('[name="time"]').fill('09:17');
  await modal.getByRole('button',{name:'Guardar actividad'}).click();
  await page.reload();
  await day.fill('2026-12-04');
  await day.dispatchEvent('change');
  await expect(original).toContainText('09:17');
  await page.getByRole('button',{name:'Añadir actividad',exact:true}).click();
  modal = page.getByRole('dialog',{name:'Nueva actividad'});
  await modal.getByLabel('Nombre',{exact:true}).fill('Pausa de prueba');
  await modal.locator('[name="time"]').fill('14:30');
  await modal.getByRole('button',{name:'Guardar actividad'}).click();
  const custom = page.locator('.pl-activity').filter({hasText:'Pausa de prueba'});
  await custom.getByRole('button',{name:/Más opciones de/}).click();
  await custom.getByRole('button',{name:'Mover a otro día'}).click();
  modal = page.getByRole('dialog',{name:'Mover actividad'});
  await modal.getByLabel('Nuevo día').selectOption('2026-12-05');
  await modal.getByRole('button',{name:'Mover',exact:true}).click();
  await day.fill('2026-12-05');
  await day.dispatchEvent('change');
  await expect(custom).toBeVisible();
  await custom.getByRole('button',{name:/Marcar realizada/}).click();
  await expect(custom.getByText('Realizada',{exact:true})).toBeVisible();
});

test('combines a plan from another phone with local expenses and deduplicates replay', async ({ browser }) => {
  const sending = await browser.newContext({acceptDownloads:true});
  const receiving = await browser.newContext();
  try {
    const phoneA = await sending.newPage();
    await phoneA.goto(`${base}#agenda`);
    await phoneA.getByRole('button',{name:'Añadir actividad',exact:true}).click();
    const activity = phoneA.getByRole('dialog',{name:'Nueva actividad'});
    await activity.getByLabel('Nombre',{exact:true}).fill('Pausa del iPhone');
    await activity.getByRole('button',{name:'Guardar actividad'}).click();
    await phoneA.goto(`${base}#compartir`);
    await phoneA.getByText('Enviar mis cambios',{exact:true}).click();
    await expect(phoneA.getByRole('radio',{name:'Planificación'})).toBeChecked();
    const [download] = await Promise.all([
      phoneA.waitForEvent('download'), phoneA.locator('[data-exchange-action="download-json"]').click(),
    ]);
    const bytes = await readFile((await download.path())!);
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const phoneB = await receiving.newPage();
    await phoneB.goto(`${base}#gastos`);
    await phoneB.getByRole('button',{name:'Anotar gasto'}).click();
    const expense = phoneB.getByRole('dialog',{name:'Anotar gasto'});
    await expense.getByText('Más detalles',{exact:true}).click();
    await expense.getByLabel('Concepto').fill('Gasto propio del POCO');
    await expense.getByLabel('Importe').fill('12.40');
    await expense.getByRole('button',{name:'Guardar gasto'}).click();
    await expect(phoneB.getByText('Gasto propio del POCO',{exact:true}).first()).toBeVisible();

    await phoneB.goto(`${base}#compartir`);
    await phoneB.getByText('Recibir cambios',{exact:true}).click();
    const selectFile = phoneB.locator('[data-exchange-file]');
    await selectFile.setInputFiles({name:'malicioso.json',mimeType:'application/json',buffer:Buffer.from('{mal formado')});
    await expect(phoneB.locator('.toast')).toContainText('El archivo no contiene un JSON válido.');
    for (let attempt=0; attempt<2; attempt++) {
      const receive = phoneB.locator('[data-exchange-receive]');
      if (await receive.getAttribute('open') === null) await receive.locator('summary').first().click();
      await selectFile.setInputFiles({name:`plan-${attempt}.json`,mimeType:'application/json',buffer:bytes});
      await phoneB.locator('[data-exchange-action="apply"]').click();
    }
    await phoneB.goto(`${base}#agenda`);
    await expect(phoneB.getByRole('heading',{name:'Pausa del iPhone'})).toHaveCount(1);
    await phoneB.goto(`${base}#gastos`);
    await expect(phoneB.getByText('Gasto propio del POCO',{exact:true}).first()).toBeVisible();
  } finally { await Promise.all([sending.close(),receiving.close()]); }
});

test('keeps local diary notes after a reload and exports an Excel-compatible expense CSV', async ({ page }) => {
  await page.goto(`${base}#diario`);
  await page.getByRole('button',{name:'Añadir nota'}).click();
  const dialog = page.getByRole('dialog',{name:'Nueva nota'});
  await dialog.getByLabel('Nota',{exact:true}).fill('Noche memorable');
  await dialog.getByRole('button',{name:'Guardar nota'}).click();
  const context = page.context();
  await page.close();
  page = await context.newPage();
  await page.goto(`${base}#diario`);
  await expect(page.getByText('Noche memorable',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Gastos',exact:true}).click();
  await page.getByRole('button',{name:'Anotar gasto'}).click();
  const expense = page.getByRole('dialog',{name:'Anotar gasto'});
  await expense.getByText('Más detalles',{exact:true}).click();
  await expense.getByLabel('Concepto').fill('=1+1');
  await expense.getByLabel('Importe').fill('12.34');
  await expense.getByRole('button',{name:'Guardar gasto'}).click();
  const exportButton = page.getByRole('button',{name:'Exportar CSV'});
  if (!(await exportButton.isVisible())) await page.getByRole('button',{name:'Movimientos',exact:true}).click();
  const [download] = await Promise.all([page.waitForEvent('download'),exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(await readFile((await download.path())!,'utf8')).toContain("'=1+1");
});

test('explicitly restores a deleted note from a complete backup', async ({ page }) => {
  await page.goto(`${base}#diario`);
  await page.getByRole('button',{name:'Añadir nota'}).click();
  const note = page.getByRole('dialog',{name:'Nueva nota'});
  await note.getByLabel('Nota',{exact:true}).fill('Recuerdo de la copia');
  await note.getByRole('button',{name:'Guardar nota'}).click();
  await page.getByRole('link',{name:'Más',exact:true}).click();
  await page.getByRole('link',{name:'Compartir e importar'}).click();
  await page.getByText('Copias y recuperación',{exact:true}).click();
  const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar copia completa'}).click()]);
  const snapshot = await readFile((await download.path())!);
  expect(JSON.parse(snapshot.toString()).version).toBe(2);
  await page.getByRole('link',{name:'Más',exact:true}).click();
  await page.getByRole('link',{name:'Diario',exact:true}).click();
  await page.getByRole('button',{name:'Editar nota'}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Borrar nota'}).click();
  await expect(page.getByRole('main').getByText('Recuerdo de la copia')).toHaveCount(0);
  await page.getByRole('link',{name:'Más',exact:true}).click();
  await page.getByRole('link',{name:'Compartir e importar'}).click();
  await page.getByText('Recibir cambios',{exact:true}).click();
  await page.locator('[data-exchange-file]').setInputFiles({name:'copia-completa.json',mimeType:'application/json',buffer:snapshot});
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-exchange-action="restore-backup"]').click();
  await expect(page.locator('.toast')).toContainText('copia completa');
  await page.getByRole('link',{name:'Más',exact:true}).click();
  await page.getByRole('link',{name:'Diario',exact:true}).click();
  await expect(page.getByText('Recuerdo de la copia',{exact:true})).toBeVisible();
});

test('switches between Normal, Noche and Sistema and remembers the chosen theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${base}#mas`);
  const root = page.locator('html');
  const appearance = page.getByRole('group', { name: 'Apariencia' });
  const night = appearance.getByRole('button', { name: 'Noche' });
  const normal = appearance.getByRole('button', { name: 'Normal' });
  const system = appearance.getByRole('button', { name: 'Sistema' });

  await expect(system).toHaveAttribute('aria-pressed', 'true');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await night.click();
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#15192e');
  await page.reload();
  await expect(night).toHaveAttribute('aria-pressed', 'true');
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await normal.click();
  await expect(root).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8f4ef');
  await page.getByRole('link', { name: 'Explorar', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Más', exact: true }).click();
  await system.click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
});

test('works offline under the subpath and keeps a keyboard path at 375 px', async ({ browser }) => {
  const context = await browser.newContext({viewport:{width:375,height:812}});
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',entry=>{ if(entry.type()==='error') errors.push(entry.text()); });
    await page.goto(base);
    await expect(page.getByText('Disponible offline',{exact:true})).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    for (const route of ['inicio','agenda','lugares','gastos','compartir','viaje']) {
      await page.goto(`${base}#${route}`);
      await expect(page.locator('main h1').first()).toBeVisible();
      const dimensions = await page.evaluate(()=>{
        const width = document.documentElement.clientWidth;
        const scroll = document.documentElement.scrollWidth;
        const offenders = scroll > width ? Array.from(document.querySelectorAll('main *')).filter(el=>el.getBoundingClientRect().right > width+1 && !el.closest('.pl-day-pills,.map-plot')).slice(0,8).map(el=>[el.tagName,el.className]) : [];
        return { width, scroll, offenders };
      });
      expect(dimensions.scroll, `${route} at ${dimensions.width}px: ${JSON.stringify(dimensions.offenders)}`).toBeLessThanOrEqual(dimensions.width);
    }
    await context.setOffline(true);
    await page.goto(`${base}#agenda`);
    await page.reload();
    await expect(page.locator('.pl-activity').first()).toBeVisible();
    await page.goto(`${base}#gastronomia`);
    await expect(page.getByRole('heading',{name:'Gastronomía',exact:true})).toBeVisible();
    await page.goto(`${base}#lugares`);
    const photo = page.locator('[data-place="merlion"]').getByRole('img', { name: /Merlion/ });
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
