import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const baseURL = 'http://127.0.0.1:4173/asia-trip/';

test('private files and insurance details restore locally and cache checks work under a subpath', async ({ page, browser }) => {
  await page.goto(`${baseURL}#offline`);
  await expect(page.getByRole('heading', { name: 'Offline y documentos' })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar viaje sin conexión' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Viaje preparado' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/recursos comprobados en la caché/)).toBeVisible();

  await page.getByLabel('Aseguradora').fill('Seguro de prueba');
  await page.getByLabel('Referencia de póliza').fill('POLIZA-123');
  const upload = page.getByLabel('Guardar archivo desde el teléfono');
  await expect(upload).toBeEnabled();
  const uploadControl = await upload.elementHandle();
  await page.getByRole('button', { name: 'Guardar datos privados' }).click();
  await upload.setInputFiles({
    name: 'entrada.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nlocal receipt\n%%EOF'),
  });
  await expect(page.getByText('entrada.pdf')).toBeVisible();
  expect(await uploadControl.evaluate(input => input.isConnected)).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('entrada.pdf')).toBeVisible();
  await expect(page.getByLabel('Referencia de póliza')).toHaveValue('POLIZA-123');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('entrada.pdf');

  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar copia de la bóveda' }).click(),
  ]);
  expect(backup.suggestedFilename()).toMatch(/boveda-privada\.json$/);
  const archive = JSON.parse(await readFile((await backup.path())!, 'utf8')) as { files: Array<{ id: string }> };
  const attachmentId = await page.locator('.vault-list [data-vault-action="open"]').getAttribute('data-id');
  expect(archive.files[0]?.id).toBe(attachmentId);
  await page.getByText('Importar copia de la bóveda').locator('input').setInputFiles({
    name: 'vault.json', mimeType: 'application/json', buffer: await readFile((await backup.path())!),
  });
  await expect(page.getByText(/Copia privada importada: 0 archivo\(s\) nuevo\(s\), 1 duplicado/)).toBeVisible();
  await expect(page.locator('.vault-list li')).toHaveCount(1);

  const restoredContext = await browser.newContext();
  try {
    const restoredPage = await restoredContext.newPage();
    await restoredPage.goto(`${baseURL}#offline`);
    const importFile = restoredPage.getByText('Importar copia de la bóveda').locator('input');
    await expect(importFile).toBeEnabled();
    await importFile.setInputFiles({
      name: 'vault.json', mimeType: 'application/json', buffer: await readFile((await backup.path())!),
    });
    await expect(restoredPage.getByText(/Copia privada importada: 1 archivo\(s\) nuevo\(s\), 0 duplicado/)).toBeVisible();
    await expect(restoredPage.locator('[name="policyReference"]')).toHaveValue('POLIZA-123');
    await expect(restoredPage.locator('.vault-list li')).toHaveCount(1);
    await expect(restoredPage.locator('.vault-list [data-vault-action="open"]')).toHaveAttribute('data-id', attachmentId!);
  } finally { await restoredContext.close(); }
});

test('service worker updates wait for user approval and preserve linked receipts', async ({ browser }) => {
  const root = resolve('dist');
  const source = await readFile(resolve(root, 'sw.js'), 'utf8');
  const version = source.match(/const VERSION = '([^']+)'/)?.[1];
  if (!version) throw new Error('Built service worker has no diagnostic version.');
  const mime: Record<string, string> = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
  let servedWorker = source;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/asia-trip/sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      response.end(servedWorker);
      return;
    }
    if (!url.pathname.startsWith('/asia-trip/')) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice('/asia-trip/'.length)) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(`${root}${sep}`)) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start the isolated update test server.');
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${address.port}/asia-trip/#gastos`);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const update = page.getByRole('button', { name: 'Actualizar ahora' });
    await expect(update).toBeHidden();

    await page.getByRole('button', { name: 'Anotar gasto' }).click();
    const form = page.getByRole('dialog').locator('form');
    await form.getByLabel('Concepto').fill('Recibo conservado tras actualizar');
    await form.getByLabel('Importe').fill('12.50');
    await form.locator('[name="receiptFile"]').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nlocal\n%%EOF') });
    await form.getByRole('button', { name: 'Guardar gasto' }).click();
    await expect(page.getByText('Recibo conservado tras actualizar')).toBeVisible();
    await page.goto(`http://127.0.0.1:${address.port}/asia-trip/#offline`);
    await page.getByLabel('Aseguradora').fill('Seguro persistente');
    await page.getByLabel('Referencia de póliza').fill('POLIZA-SW-2026');
    await page.getByRole('button', { name: 'Guardar datos privados' }).click();
    await expect(page.locator('[name="policyReference"]')).toHaveValue('POLIZA-SW-2026');

    const updated = source
      .replace(`const VERSION = '${version}'`, "const VERSION = 'e2e-update'")
      .replace(`const CACHE_NAME = CACHE_PREFIX + '${version}'`, "const CACHE_NAME = CACHE_PREFIX + 'e2e-update'");
    servedWorker = `${updated}\n// Explicit update prompt check\n`;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await expect(update).toBeVisible({ timeout: 20_000 });
    const waitingBeforeApproval = await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
    expect(waitingBeforeApproval).toBe(true);
    await page.getByRole('link', { name: 'Lugares', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lugares', exact: true })).toBeVisible();
    await page.goto(`http://127.0.0.1:${address.port}/asia-trip/#offline`);

    await Promise.all([page.waitForEvent('load'), update.click()]);
    const installedVersion = await page.evaluate(async () => {
      const worker = (await navigator.serviceWorker.getRegistration())?.active;
      if (!worker) return null;
      return await new Promise<string | null>(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data.version ?? null); };
        worker.postMessage('GET_VERSION', [channel.port2]);
      });
    });
    expect(installedVersion).toBe('e2e-update');
    await expect(page.locator('[name="policyReference"]')).toHaveValue('POLIZA-SW-2026');
    await expect(page.locator('.vault-list li').filter({ hasText: 'ticket.pdf' })).toBeVisible();
    await expect(page.locator('.vault-list li').filter({ hasText: 'ticket.pdf' }).getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    await page.goto(`http://127.0.0.1:${address.port}/asia-trip/#gastos`);
    await expect(page.getByText('Recibo conservado tras actualizar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recibo' })).toBeVisible();
  } finally {
    await context.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
});
