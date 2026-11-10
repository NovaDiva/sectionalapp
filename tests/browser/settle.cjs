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
  const mic = async (say) => { await page.evaluate((x) => { window.__say = x; }, say); await page.click('.big-ctl.mic'); };
  const desc = (x) => `${x.silent ? 'SILENCE' : 'track'} ${x.paused ? 'paused' : 'playing'} at ${x.time.toFixed(1)}s${x.muted ? ' MUTED' : ''}`;
  const check = (label, x, wantTime) => console.log(`${label}: ${desc(x)}  ${!x.silent && !x.paused && !x.muted && Math.abs(x.time - wantTime) < 1.5 ? 'OK' : 'PROBLEM'}`);

  // 1. voice command: silence, pause, then the track from letter B
  await mic('letter B');
  await page.waitForTimeout(450); console.log('1. during warm-up:', desc(await st()));
  await page.waitForTimeout(1300); check('1. voice "letter B"', await st(), 20.8);
  console.log('   Speak button now says:', (await page.textContent('.big-ctl.mic')).replace('🎤', ''));
  // 2. buttons straight after
  await page.click('.start-btn.letter:has-text("C")'); await page.waitForTimeout(250); check('2. button C', await st(), 30.2);
  // 3. voice, then a button during the warm-up: the button wins, straight away
  await mic('letter B'); await page.waitForTimeout(500);
  await page.click('.start-btn:has-text("From the top")'); await page.waitForTimeout(250); check('3. button during warm-up', await st(), 0.2);
  await page.waitForTimeout(1200); check('   ...and stays on the track', await st(), 1.4);
  // 4. voice, then Stop during warm-up, then Play on the mini player
  await mic('letter C'); await page.waitForTimeout(500);
  await page.click('.big-ctl.stop'); await page.waitForTimeout(1300);
  const s4 = await st(); console.log('4. stop during warm-up:', desc(s4), s4.paused && !s4.silent ? 'OK' : 'PROBLEM');
  await page.click('.mini-toggle'); await page.waitForTimeout(300); check('   then mini Play', await st(), 30.2);
  // 5. three voice commands in a row
  for (const [w, t] of [['letter B', 20.8], ['again', 20.8], ['letter C', 30.8]]) { await mic(w); await page.waitForTimeout(1750); check(`5. voice "${w}"`, await st(), t); }
  console.log('   Speak button now says:', (await page.textContent('.big-ctl.mic')).replace('🎤', ''));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
