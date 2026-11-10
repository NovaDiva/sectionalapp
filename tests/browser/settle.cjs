// After a voice command the track warms up muted, pauses, then plays unmuted from the right
// spot (fixes Bluetooth speakers coming back at full volume). Buttons start straight away.
const { chromium } = require('playwright');
const FX = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('myParts', '[]');
    window.__say = 'letter B';
    window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => {
      const res = [Object.assign([{ transcript: window.__say }], { isFinal: true })];
      this.onresult?.({ resultIndex: 0, results: res }); this.onend?.(); }, 200); } stop() {} abort() {} };
  });
  await page.goto('http://localhost:8765/');
  const fs = require('fs');
  const mp3 = fs.readFileSync(FX + '/River_Full.mp3').toString('base64');
  const rid = await page.evaluate(async (b64) => {
    const db = await import('/js/db.js');
    const song = await db.put('songs', { id: db.uid(), title: 'Let River Run', createdAt: Date.now() });
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const t = await db.addFile(song.id, 'track', new File([bytes], 'Full mix.mp3', { type: 'audio/mpeg' }), 'Full mix');
    t.part = null; t.marks = [{ t: 0, bar: 1, letter: null, label: '' }, { t: 20, bar: 17, letter: 'B', label: '' }, { t: 30, bar: 25, letter: 'C', label: '' }];
    await db.put('items', t);
    const r = { id: db.uid(), title: 'Test', date: '2026-11-10', songIds: [song.id], notes: [], covered: {}, log: [], status: 'open', createdAt: Date.now() };
    await db.put('rehearsals', r); return r.id;
  }, mp3);
  await page.goto(`http://localhost:8765/#/rehearsal/${rid}`);
  await page.waitForSelector('.big-ctl.mic'); await page.waitForTimeout(800);
  const st = () => page.evaluate(async () => (await import('/js/player.js')).debugState());
  await page.click('.big-ctl.mic');
  await page.waitForTimeout(450); const a = await st();
  await page.waitForTimeout(400); const bb = await st();
  await page.waitForTimeout(900); const c = await st();
  console.log('voice: warm-up', a.muted ? 'muted' : 'LOUD', a.paused ? 'paused' : 'playing',
    '| gap', bb.paused ? 'paused' : 'playing', '| then', c.muted ? 'MUTED' : 'unmuted', c.paused ? 'paused' : 'playing', 'at', c.time.toFixed(1), 's (letter B = 20 s)');
  await page.click('.start-btn.letter:has-text("C")');
  await page.waitForTimeout(150); const d = await st();
  console.log('button: ', d.muted ? 'MUTED' : 'unmuted', d.paused ? 'paused' : 'playing', 'at', d.time.toFixed(1), 's (letter C = 30 s)');
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
