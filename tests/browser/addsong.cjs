const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8765/');
  await page.evaluate(async () => {
    localStorage.setItem('myParts', '["Middles"]');
    const db = await import('/js/db.js');
    for (const t of ['Let River Run', 'Orange Colored Sky', 'Viva la Vida']) await db.put('songs', { id: db.uid(), title: t, createdAt: Date.now() });
  });
  await page.goto('http://localhost:8765/#/rehearsal-new');
  await page.click('label:has-text("Let River Run")');
  await page.click('text=Start rehearsal');
  await page.waitForSelector('text=＋ Add song');
  await page.click('text=＋ Add song');
  await page.click('.modal label:has-text("Viva la Vida")');
  await page.screenshot({ path: process.argv[2] + '/as1.png' });
  await page.click('.modal button.primary');
  await page.waitForTimeout(600);
  console.log('song chips:', await page.locator('.song-bar .chip').allTextContents());
  await page.reload(); await page.waitForTimeout(600);
  console.log('after reload:', await page.locator('.song-bar .chip').allTextContents());
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
