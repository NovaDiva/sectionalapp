const { chromium, devices } = require('playwright');
const FX = process.argv[2], OUT = process.argv[3];
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, hasTouch: true });
  await ctx.addInitScript(() => {
    window.__say = 'Alto\'s letter bee';
    window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => {
      const res = [Object.assign([{ transcript: window.__say }], { isFinal: true })];
      this.onresult?.({ resultIndex: 0, results: res }); this.onend?.(); }, 300); } stop() {} };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { errors.push('console ' + m.type() + ': ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(d.type() === 'prompt' ? 'Choir + piano' : undefined); });
  await page.goto('http://localhost:8765/');
  await page.screenshot({ path: OUT + '/01-home.png' });
  await page.click('text=Songs');
  await page.fill('input[placeholder^="New song"]', 'Let the River Run');
  await page.click('text=+ Add');
  await page.waitForSelector('text=📄 Scores');
  await page.setInputFiles('input[accept^="application/pdf"]', FX + '/score.pdf');
  await page.waitForSelector('text=📖 Score');
  await page.setInputFiles('input[accept^="audio"]', [FX + '/River_Full.mp3', FX + '/River_Alto.mp3']);
  await page.waitForSelector('text=Alto');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/02-song.png' });
  // timestamps: paste table on Full mix
  await page.click('.item-row:has(.item-title:text-is("Full mix")) >> text=Timestamps');
  await page.waitForSelector('.mark-btn');
  await page.click('text=📋 Paste a table');
  await page.fill('.modal textarea', '| Time | Bar | Where you are |\n|---|---|---|\n| 0:01 | 1 | Start |\n| **0:10** | **9 (A)** | **Letter A** |\n| 0:20 | 17 (B) | Chorus |\n| 0:30 | 25 (C) | Letter C |');
  await page.click('text=Add these');
  await page.waitForSelector('.mark-row');
  // tap-along: play and mark
  await page.click('button:has-text("▶ Play")');
  await page.waitForTimeout(1500);
  await page.click('.mark-btn');
  await page.waitForTimeout(300);
  const n = await page.locator('.mark-row').count();
  console.log('marks after tap:', n);
  await page.locator('.mark-row').nth(1).locator('.bar-in').fill('2');
  await page.locator('.mark-row').nth(1).locator('.bar-in').press('Tab');
  await page.screenshot({ path: OUT + '/03-marks.png' });
  // copy to Alto
  await page.click('text=‹ Back');
  await page.click('.item-row:has(.item-title:text-is("Alto")) >> text=Timestamps');
  await page.click('text=⧉ Copy from another track');
  await page.click('.modal button.primary');
  await page.waitForSelector('.mark-row');
  // rehearsal
  await page.click('.tabbar >> text=Rehearsal');
  await page.click('text=Start a new rehearsal');
  await page.click('.track-btn:has-text("Alto 1")');
  await page.click('label:has-text("Let the River Run")');
  await page.click('text=Start rehearsal');
  await page.waitForSelector('.chat');
  await page.waitForTimeout(500);
  for (const cmd of ['alto letter B', 'full bars 9-16', 'stop', 'note: altos flat at C', 'fix: tuning bar 20', 'tenor bar 3']) {
    await page.fill('input.cmd', cmd);
    await page.press('input.cmd', 'Enter');
    await page.waitForTimeout(250);
  }
  await page.click('button.mic');
  await page.waitForTimeout(700);
  console.log('after mic1:', await page.evaluate(() => [typeof window.webkitSpeechRecognition, document.querySelector('#toast').textContent, document.querySelectorAll('.bubble').length, document.querySelector('input.cmd').value]));
  await page.evaluate(() => { window.__say = 'full mix bars nine to sixteen'; });
  await page.click('button.mic');
  await page.waitForTimeout(700);
  console.log('playing after voice:', await page.evaluate(() => !document.querySelector('#mini').hidden));
  const t = await page.evaluate(() => document.querySelector('audio') ? 1 : 0);
  await page.screenshot({ path: OUT + '/04-rehearsal.png' });
  console.log('chat:', (await page.locator('.bubble').allTextContents()).join(' | '));
  await page.click('.track-btn:has-text("Alto")');
  await page.click('.start-btn.letter:has-text("C")');
  await page.fill('.bar-box', '20');
  await page.click('.start-btn:has-text("▶ Bar")');
  await page.fill('input.cmd', 'letter A');
  await page.press('input.cmd', 'Enter');
  await page.waitForTimeout(300);
  await page.click('.speed-btn:has-text("70%")');
  await page.fill('input.cmd', 'half speed'); await page.press('input.cmd', 'Enter');
  await page.waitForTimeout(200);
  console.log('rate after half speed:', await page.evaluate(async () => (await import('/js/player.js')).getSpeed()), 'on:', await page.locator('.play-panel .speed-btn.on').textContent());
  await page.click('.speed-btn:has-text("80%")');
  console.log('mini:', await page.textContent('.mini-name'));
  await page.screenshot({ path: OUT + '/04c-speed.png' });
  await page.click('.speed-btn:has-text("Normal")');
  console.log('buttons:', (await page.locator('.bubble').allTextContents()).slice(-5).join(' | '));
  await page.screenshot({ path: OUT + '/04b-play.png' });
  // Covered / Fix next time are parked (FEATURES in app.js): their tabs must not show
  console.log('tabs:', (await page.locator('.seg-btn').allTextContents()).join(' | '));
  // Notes: Speak a note opens the note box with the dictation tip; then Add note
  await page.click('.seg-btn:has-text("Notes")');
  await page.click('.note-mic');
  console.log('note tip shown:', await page.isVisible('.voice-tip'), '| note box focused:', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'));
  console.log('note prompt:', await page.getAttribute('textarea', 'placeholder'));
  await page.screenshot({ path: OUT + '/05a-speak-note.png' });
  await page.keyboard.type('Breathe after bar 24');
  await page.click('button:has-text("+ Add note")');
  await page.waitForTimeout(200);
  console.log('notes:', (await page.locator('.list-item.note').allTextContents()).map((t) => t.replace(/✕$/, '')).join(' | '));
  await page.screenshot({ path: OUT + '/05-notes.png' });
  // score viewer
  await page.click('.seg-btn:has-text("Play")');
  await page.click('.song-bar >> text=📖');
  await page.waitForSelector('.pdf-page canvas', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/06-score.png' });
  await page.click('.overlay-bar >> text=✏️ Mark up');
  const box = await page.locator('.pdf-page').first().boundingBox();
  const drag = async (x1, y1, x2, y2) => { await page.mouse.move(box.x + x1, box.y + y1); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + x1 + (x2 - x1) * i / 10, box.y + y1 + (y2 - y1) * i / 10); await page.mouse.up(); };
  await drag(120, 300, 500, 340);                       // pen
  await page.click('.tool-btn[data-tool=hl]');
  await drag(100, 480, 800, 480);                       // highlight
  await page.click('.tool-btn[data-tool=text]');
  await page.mouse.click(box.x + 600, box.y + 600);     // text note (dialog answers)
  await page.click('.tool-btn[data-tool=pen]');
  await drag(200, 700, 300, 800);
  await page.click('.tool-btn:has-text("Undo")');      // removes last pen stroke
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/06b-markup.png' });
  await page.click('text=✕ Close');
  await page.waitForTimeout(400);
  await page.click('.song-bar >> text=📖');
  await page.waitForSelector('.ann-canvas', { timeout: 10000 });
  await page.waitForTimeout(400);
  console.log('notes after reopen:', await page.locator('.ann-note').allTextContents());
  console.log('saved marks:', await page.evaluate(async () => { const db = await import('/js/db.js'); const it = (await db.getAll('items')).find(i => i.kind === 'score'); return Object.values(it.annotations || {}).flat().map(o => o.k).join(','); }));
  await page.click('text=✕ Close');
  await page.click('text=Finish & share');
  await page.waitForSelector('textarea.summary');
  console.log('SUMMARY:\n' + await page.inputValue('textarea.summary'));
  await page.screenshot({ path: OUT + '/07-summary.png' });
  // reload persistence
  await page.goto('http://localhost:8765/#/history');
  await page.waitForTimeout(500);
  console.log('history:', await page.locator('.list-item').count());
  await page.goto('http://localhost:8765/#/more');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/08-help.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
