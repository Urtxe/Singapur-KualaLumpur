import { expect, test } from '@playwright/test';

test('opens from a cold cache under a simulated 1 Mbps connection', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium','La emulación de red usa CDP de Chromium.');
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled',{cacheDisabled:true});
  await client.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:125_000,uploadThroughput:125_000,connectionType:'cellular3g'});
  const remote: string[] = [];
  const errors: string[] = [];
  page.on('request',request=>{ if (!request.url().startsWith('http://127.0.0.1:4173/')) remote.push(request.url()); });
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/asia-trip/');
  await expect(page.getByRole('heading',{name:'Hoy',exact:true})).toBeVisible();
  await expect(page.locator('#offline-status-text')).toHaveText(/^(Con conexión|Listo offline)$/);
  const times = await page.evaluate(()=>{
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {loadMs:Math.round(navigation.loadEventEnd),fcpMs:fcp ? Math.round(fcp.startTime) : null};
  });
  await info.attach('medición-red-1mbps', {body:JSON.stringify(times),contentType:'application/json'});
  expect(times.loadMs).toBeLessThan(8000);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});
