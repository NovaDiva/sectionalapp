// Keyboard-voice: after the command runs, the type box is no longer focused (keyboard closed,
// which ends iPad dictation) and goes back to normal shortly after.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('myParts', '[]'); window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await page.goto('http://localhost:8765/');
  const rid = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const song = await db.put('songs', { id: db.uid(), title: 'Let River Run', createdAt: Date.now() });
    const r = { id: db.uid(), title: 'T', date: '2026-11-10', songIds: [song.id], notes: [], covered: {}, log: [], status: 'open', createdAt: Date.now() };
    await db.put('rehearsals', r); return r.id;
  });
  await page.goto(`http://localhost:8765/#/rehearsal/${rid}`);
  await page.waitForSelector('.big-ctl.mic');
  await page.click('.big-ctl.mic');
  await page.keyboard.type('stop', { delay: 60 });
  await page.waitForTimeout(1900);
  const r = await page.evaluate(() => ({ focused: document.activeElement?.classList.contains('cmd'), ro: document.querySelector('input.cmd').readOnly }));
  console.log('after auto-run: type box focused =', r.focused, '| read-only =', r.ro, r.focused ? 'PROBLEM' : 'OK');
  await page.waitForTimeout(900);
  console.log('later: read-only =', await page.evaluate(() => document.querySelector('input.cmd').readOnly), '| chat:', (await page.locator('.bubble').allTextContents()).slice(-2).join(' | '));
  await page.click('input.cmd'); await page.keyboard.type('letter A');
  console.log('typing still works:', await page.inputValue('input.cmd') === 'letter A' ? 'OK' : 'PROBLEM');
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
