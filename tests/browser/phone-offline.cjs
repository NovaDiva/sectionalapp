// Sectional Practice works offline after the first visit (service worker in /phone/),
// and the iPad app's service worker is not the one in charge of /phone/.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/phone/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  console.log('scope:', await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope));
  console.log('controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.tabbar');
  await page.click('.tabbar a[data-tab="help"]');
  await page.waitForSelector('text=💾 Back up');
  console.log('offline title:', await page.textContent('#title'), '| caches:', await page.evaluate(() => caches.keys()));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
