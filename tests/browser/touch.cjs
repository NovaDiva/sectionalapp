const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8765/');
  const pdf = fs.readFileSync(process.argv[2]).toString('base64');
  const songId = await page.evaluate(async (b64) => {
    const db = await import('/js/db.js');
    const song = await db.put('songs', { id: db.uid(), title: 'Touch test', createdAt: Date.now() });
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    await db.addFile(song.id, 'score', new File([bytes], 's.pdf', { type: 'application/pdf' }), 'Score');
    return song.id;
  }, pdf);
  await page.goto(`http://localhost:8765/#/song/${songId}`);
  await page.waitForSelector('text=📖 Score');
  await page.tap('text=📖 Score');
  await page.waitForSelector('.ann-canvas', { timeout: 10000 });
  await page.tap('text=✏️ Mark up');
  await page.tap('.tool-btn[data-tool=hl]');
  const box = await page.locator('.pdf-page').first().boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const pt = (x, y) => [{ x: box.x + x, y: box.y + y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(100, 400) });
  for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(100 + i * 40, 400) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const saved = await page.evaluate(async () => { const db = await import('/js/db.js'); const it = (await db.getAll('items')).find(i => i.kind === 'score'); return Object.values(it.annotations || {}).flat().map(o => `${o.k}:${o.pts ? o.pts.length : ''}`); });
  console.log('saved after touch drag:', saved, 'scrollTop:', await page.evaluate(() => document.querySelector('.pdf-body').scrollTop));
  await page.screenshot({ path: process.argv[3] });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
