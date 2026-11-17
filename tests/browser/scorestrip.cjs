// Score viewer in rehearsal: slim one-row player strip, bottom player hidden, tap the score to hide/show it.
const { chromium } = require('playwright');
const FX = process.argv[2], OUT = process.argv[3];
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  await page.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.setItem('myParts', '["Soprano 2"]'); localStorage.removeItem('scoreTapTip'); });
  await page.goto('http://localhost:8765/#/songs');
  await page.fill('input[placeholder^="New song"]', "Don't Stop Me Now");
  await page.click('text=+ Add');
  await page.waitForSelector('text=📄 Scores');
  await page.setInputFiles('input[accept^="application/pdf"]', FX + '/stamped-parts.pdf');
  await page.waitForSelector('text=📖 Score');
  await page.setInputFiles('input[accept^="audio"]', [FX + '/River_Full.mp3', FX + '/River_Alto.mp3']);
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    for (const t of (await db.getAll('items')).filter((i) => i.kind === 'track')) {
      if (/Alto/.test(t.name)) { t.name = 'Soprano 2'; t.part = 'Soprano 2'; }
      t.marks = [{ t: 1, bar: 1, letter: 'A', label: '' }, { t: 12, bar: 5, letter: null, label: '' }, { t: 22, bar: 9, letter: 'B', label: '' }, { t: 30, bar: 13, letter: 'C', label: '' }];
      await db.put('items', t);
    }
  });
  await page.click('.tabbar >> text=Rehearsal');
  await page.click('text=Start a new rehearsal');
  await page.click(`label:has-text("Don't Stop Me Now")`);
  await page.click('text=Start rehearsal');
  await page.waitForSelector('.play-panel');
  await page.click('.start-btn.letter:has-text("B")'); // something playing, so the bottom player would show
  await page.click('.song-bar button:has-text("📖")');
  await page.waitForSelector('.overlay .strip');
  await page.waitForTimeout(1200);
  const box = await page.locator('.overlay .strip').boundingBox();
  const pdf = await page.locator('.pdf-body').boundingBox();
  console.log('strip height:', Math.round(box.height), 'score area from y', Math.round(pdf.y), 'of 1366');
  console.log('bottom player visible:', await page.locator('#mini').isVisible());
  console.log('strip buttons:', (await page.locator('.strip-row').innerText()).replace(/\s+/g, ' '));
  console.log('track options:', await page.locator('.strip-track option').allTextContents());
  await page.screenshot({ path: OUT + '/strip1.png' });
  await page.selectOption('.strip-track', { label: 'Soprano 2' });
  await page.click('.strip .start-btn.letter:has-text("C")');
  console.log('playing:', await page.evaluate(async () => (await import('/js/player.js')).describe()));
  await page.click('.strip-more-btn');
  console.log('more panel visible:', await page.locator('.strip-more').isVisible(), 'speed:', await page.locator('.strip-more .speed-btn').count(), 'keyboard btn:', await page.locator('.strip-more .kb-toggle').count());
  await page.screenshot({ path: OUT + '/strip2.png' });
  await page.click('.strip-more-btn');
  await page.mouse.click(500, 1000); // tap the music
  await page.waitForTimeout(200);
  console.log('after tap: strip visible:', await page.locator('.overlay .strip').isVisible());
  await page.screenshot({ path: OUT + '/strip3.png' });
  await page.mouse.click(500, 1000);
  console.log('after 2nd tap: strip visible:', await page.locator('.overlay .strip').isVisible());
  // Keyboard voice (no direct listening): the More panel opens with the type box focused
  console.log('cmd inputs:', await page.locator('input.cmd').count(), 'in strip:', await page.locator('.strip input.cmd').count());
  await page.click('.strip .big-ctl.mic');
  await page.waitForTimeout(300);
  console.log('keyboard voice: more open', await page.locator('.strip-more').isVisible(), 'tip', await page.locator('.strip .voice-tip').isVisible(), 'box focused', await page.evaluate(() => document.activeElement?.classList.contains('cmd')));
  // Mark up: taps draw, they don't hide the strip
  await page.click('button:has-text("Mark up")');
  await page.click('button:has-text("Mark up")');
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
