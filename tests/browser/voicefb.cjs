// 1) no speech recognition at all -> keyboard mode, auto-run after typing stops
// 2) recognition that never starts -> falls back after 4 s; button not stuck
const { chromium } = require('playwright');
const FX = process.argv[2], OUT = process.argv[3];
async function setup(page, mode) {
  await page.addInitScript((mode) => {
    localStorage.setItem('myParts', '[]');
    if (mode === 'none') { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; }
    if (mode === 'dead') { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() {} stop() {} abort() {} }; }
  }, mode);
  await page.goto('http://localhost:8765/');
  const ids = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const song = await db.put('songs', { id: db.uid(), title: 'Let River Run', createdAt: Date.now() });
    const r = { id: db.uid(), title: 'Test', date: '2026-11-10', songIds: [song.id], notes: [], covered: {}, log: [], status: 'open', createdAt: Date.now() };
    await db.put('rehearsals', r); return r.id;
  });
  await page.goto(`http://localhost:8765/#/rehearsal/${ids}`);
  await page.waitForSelector('.big-ctl.mic');
}
(async () => {
  const b = await chromium.launch();
  const errs = [];
  // 1
  let page = await b.newPage({ viewport: { width: 1024, height: 1366 } }); page.on('pageerror', e => errs.push(e.message));
  await setup(page, 'none');
  await page.click('.big-ctl.mic');
  console.log('tip shown:', await page.isVisible('.voice-tip'), 'focused:', await page.evaluate(() => document.activeElement?.classList.contains('cmd')));
  await page.screenshot({ path: OUT + '/v1-tip.png' });
  await page.keyboard.type('stop', { delay: 80 }); // like dictation filling the box
  await page.waitForTimeout(2200);
  console.log('auto-ran:', (await page.locator('.bubble').allTextContents()).slice(-2).join(' | '), 'tip hidden:', !(await page.isVisible('.voice-tip')));
  await page.close();
  // 2
  page = await b.newPage({ viewport: { width: 1024, height: 1366 } }); page.on('pageerror', e => errs.push(e.message));
  await setup(page, 'dead');
  await page.click('.big-ctl.mic');
  await page.waitForTimeout(500);
  console.log('listening state:', await page.textContent('.big-ctl.mic'));
  await page.waitForTimeout(4200);
  console.log('after 4s -> tip shown:', await page.isVisible('.voice-tip'), 'button:', await page.textContent('.big-ctl.mic'));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
