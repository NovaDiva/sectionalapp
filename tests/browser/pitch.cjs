// Piano keyboard + saved starting notes: song page, rehearsal buttons, typed command, keyboard toggle.
const { chromium } = require('playwright');
(async () => {
  const OUT = process.argv[2] || '/tmp';
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/');
  const songId = await page.evaluate(async () => {
    localStorage.setItem('myParts', '["Middles","Lowers"]');
    const db = await import('/js/db.js');
    const s = await db.put('songs', { id: db.uid(), title: 'Let River Run', createdAt: Date.now() });
    return s.id;
  });
  await page.goto(`http://localhost:8765/#/song/${songId}`);
  await page.waitForSelector('text=🎹 Starting notes');
  console.log('rows:', await page.locator('.card:has-text("Starting notes") .item-row').allInnerTexts());
  // Set Middles to A4
  await page.locator('.item-row:has-text("Middles") button:has-text("Set note")').click();
  await page.waitForSelector('.modal .piano');
  console.log('modal range:', await page.locator('.modal .kb-range').textContent());
  await page.click('.modal .key[aria-label="A4"]');
  const st = await page.evaluate(async () => (await import('/js/player.js')).debugState());
  console.log('after key tap, note playing:', !st.notePaused, st.noteSrc);
  console.log('modal says:', await page.locator('.modal .kb-now').textContent());
  await page.screenshot({ path: `${OUT}/pitch-modal.png` });
  await page.click('.modal button:has-text("Save")');
  await page.waitForTimeout(300);
  // Lowers to F#3 using octave shift
  await page.locator('.item-row:has-text("Lowers") button:has-text("Set note")').click();
  await page.click('.modal button:has-text("Lower")');
  console.log('after Lower:', await page.locator('.modal .kb-range').textContent());
  await page.click('.modal button:has-text("Higher")');
  await page.click('.modal .key[aria-label="F♯3"]');
  await page.click('.modal button:has-text("Save")');
  await page.waitForTimeout(300);
  console.log('saved rows:', await page.locator('.card:has-text("Starting notes") .item-row').allInnerTexts());
  console.log('db:', JSON.stringify(await page.evaluate(async (id) => (await (await import('/js/db.js')).get('songs', id)).startNotes, songId)));
  await page.screenshot({ path: `${OUT}/pitch-song.png`, fullPage: true });

  // Rehearsal
  await page.goto('http://localhost:8765/#/rehearsal-new');
  await page.click('.track-btn:has-text("Middles")');
  await page.click('label:has-text("Let River Run")');
  await page.click('text=Start rehearsal');
  await page.waitForSelector('.note-row');
  console.log('rehearsal note buttons (Middles only):', await page.locator('.note-row button').allTextContents());
  await page.click('.note-btn');
  console.log('log:', await page.locator('.bubble').last().textContent());
  await page.fill('input.cmd', 'give me the note');
  await page.click('button.go');
  console.log('cmd reply:', await page.locator('.bubble').last().textContent());
  await page.fill('input.cmd', 'lowers starting note');
  await page.click('button.go');
  console.log('cmd reply (lowers):', await page.locator('.bubble').last().textContent());
  await page.click('.kb-toggle');
  console.log('keyboard shown:', await page.locator('.kb-wrap').isVisible(), 'range', await page.locator('.kb-wrap .kb-range').textContent());
  await page.click('.kb-wrap .key[aria-label="C4 (middle C)"]');
  const st2 = await page.evaluate(async () => (await import('/js/player.js')).debugState());
  console.log('keyboard tap plays:', !st2.notePaused);
  await page.screenshot({ path: `${OUT}/pitch-rehearsal.png` });
  // Stop silences a note
  await page.click('.big-ctl.stop');
  const st3 = await page.evaluate(async () => (await import('/js/player.js')).debugState());
  console.log('after Stop, note paused:', st3.notePaused);
  // Voice-style start: warm-up then note (timers)
  await page.evaluate(async () => (await import('/js/player.js')).playNotes([69, 54], { settle: true }));
  const st4 = await page.evaluate(async () => (await import('/js/player.js')).debugState());
  console.log('settled notes queued timers:', st4.noteTimers);
  await page.waitForTimeout(1200);
  const st5 = await page.evaluate(async () => (await import('/js/player.js')).debugState());
  console.log('after warm-up, note playing:', !st5.notePaused);
  // Score viewer compact panel has the note row
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
