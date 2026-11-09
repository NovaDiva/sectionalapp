const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let ver = null;
  await page.route('**/sw.js?check=*', async (route) => {
    const res = await route.fetch(); let body = await res.text();
    if (ver) body = body.replace(/VERSION = '[^']+'/, `VERSION = '${ver}'`);
    route.fulfill({ response: res, body });
  });
  await page.goto('http://localhost:8765/#/more'); await page.waitForTimeout(800);
  console.log('banner before:', await page.isVisible('#update'));
  console.log('help version:', await page.textContent('main p.muted.small.center'));
  ver = 'sectional-v99';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  console.log('banner after:', await page.isVisible('#update'));
  await page.screenshot({ path: process.argv[2] });
  await page.click('#update-btn'); await page.waitForLoadState('load'); await page.waitForTimeout(500);
  console.log('reloaded ok, errors:', errs.length ? errs : 'none');
  await b.close();
})();
