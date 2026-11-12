// Score labels like "0:01 | S2 0:03": the Full mix track gets the first times, Soprano 2 its own.
const { chromium } = require('playwright');
const FX = process.argv[2], OUT = process.argv[3];
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { console.log('dialog:', d.message()); d.accept(); });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => localStorage.setItem('myParts', '["Soprano 2"]'));
  await page.goto('http://localhost:8765/#/songs');
  await page.fill('input[placeholder^="New song"]', "Don't Stop Me Now");
  await page.click('text=+ Add');
  await page.waitForSelector('text=📄 Scores');
  await page.setInputFiles('input[accept^="application/pdf"]', FX + '/stamped-parts.pdf');
  await page.waitForSelector('text=📖 Score');
  await page.setInputFiles('input[accept^="audio"]', [FX + '/River_Full.mp3']);
  await page.waitForTimeout(500);
  await page.setInputFiles('input[accept^="audio"]', [FX + '/River_Alto.mp3']);
  await page.waitForTimeout(500);
  // rename second track to Soprano 2 and set its part
  const rows = page.locator('.item-row:has(button.play)');
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    for (const t of (await db.getAll('items')).filter((i) => i.kind === 'track' && /Alto/.test(i.name))) { t.name = 'Soprano 2'; t.part = 'Soprano 2'; await db.put('items', t); }
  });
  await page.reload(); await page.waitForTimeout(400);
  console.log('tracks:', await rows.locator('.item-title').allTextContents());
  for (const name of ['Full mix', 'Soprano 2']) {
    await page.locator(`.item-row:has(.item-title:text-is("${name}")) a:has-text("Timestamps")`).click();
    await page.click('text=📄 Use times from the score');
    await page.waitForSelector('.modal');
    console.log(`${name} modal:`, (await page.textContent('.modal')).replace(/\s+/g, ' ').slice(0, 260));
    await page.click('.modal button.primary');
    await page.waitForTimeout(400);
    console.log(`${name} marks:`, (await page.locator('.mark-row .btn.time').allTextContents()).join(' '), '| bars', await page.locator('.mark-row .bar-in').evaluateAll((els) => els.map((e) => e.value).join(',')), '| letters', await page.locator('.mark-row .let-in').evaluateAll((els) => els.map((e) => e.value).join(',')));
    await page.click('#back');
    await page.waitForTimeout(300);
  }
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
