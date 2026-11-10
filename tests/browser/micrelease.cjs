// After listening: the recogniser is aborted and the sound mode goes back to music ('playback'),
// via 'auto' so the iPad really re-applies it; buttons don't change the mode.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('myParts', '[]');
    let t = 'auto'; window.__modes = []; window.__aborts = 0;
    Object.defineProperty(navigator, 'audioSession', { value: { get type() { return t; }, set type(v) { window.__modes.push(v); t = v; } } });
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { this.onstart?.(); const res = [Object.assign([{ transcript: 'from the top' }], { isFinal: true })];
        this.onresult?.({ resultIndex: 0, results: res }); this.onend?.(); }, 200); }
      stop() {} abort() { window.__aborts++; } };
  });
  await page.goto('http://localhost:8765/');
  const rid = await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const song = await db.put('songs', { id: db.uid(), title: 'Let River Run', createdAt: Date.now() });
    const r = { id: db.uid(), title: 'T', date: '2026-11-10', songIds: [song.id], notes: [], covered: {}, log: [], status: 'open', createdAt: Date.now() };
    await db.put('rehearsals', r); return r.id;
  });
  await page.goto(`http://localhost:8765/#/rehearsal/${rid}`);
  await page.waitForSelector('.big-ctl.mic');
  await page.evaluate(() => { window.__modes = []; });
  await page.click('.big-ctl.mic');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ modes: window.__modes, now: navigator.audioSession.type, aborts: window.__aborts }));
  console.log('modes during/after listening:', r.modes.join(' -> '), '| now:', r.now, '| recogniser aborted:', r.aborts > 0);
  console.log(r.now === 'playback' && r.modes[0] === 'play-and-record' && r.aborts > 0 ? 'OK' : 'PROBLEM');
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
