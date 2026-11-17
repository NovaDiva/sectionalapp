// Sectional Practice (phone/) at iPhone size: first run, add a song, score times, play,
// letters/bar, speed, starting note + keyboard, sideways layout, backup, restoring an iPad
// backup, and that the phone and iPad apps keep separate songs.
// usage: node tests/browser/phone.cjs <fixtures> <out>
const { chromium } = require('playwright');
const fs = require('fs');
const FX = process.argv[2], OUT = process.argv[3];
const BASE = 'http://localhost:8765';
(async () => {
  fs.copyFileSync(`${FX}/River_Alto.mp3`, `${FX}/DSMN_Sop2.mp3`);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { console.log('dialog:', d.message().slice(0, 120)); d.accept(); });
  const audio = () => page.evaluate(async () => {
    const p = await import('./js/player.js');
    return { ...p.debugState(), track: p.state.track?.name, speed: p.getSpeed() };
  });

  await page.goto(`${BASE}/phone/`);
  await page.waitForSelector('text=Which part do you sing?');
  await page.screenshot({ path: `${OUT}/phone-1-first-run.png` });
  await page.click('.parts-grid .track-btn:text-is("Soprano 2")');
  await page.click('button:text-is("Save")');
  await page.waitForSelector('text=Welcome!');

  // add a song -> set-up screen
  await page.fill('input[aria-label="New song title"]', "Don't Stop Me Now");
  await page.click('button:text-is("+ Add")');
  await page.waitForSelector('text=🎵 Tracks');
  await page.setInputFiles('input[accept^="application/pdf"]', `${FX}/stamped-parts.pdf`);
  await page.waitForSelector('.item-row:has-text("stamped-parts")');
  await page.setInputFiles('input[accept^="audio"]', [`${FX}/River_Full.mp3`, `${FX}/DSMN_Sop2.mp3`]);
  await page.waitForSelector('.modal');
  console.log('times modal:', (await page.textContent('.modal')).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${OUT}/phone-2-times.png` });
  await page.click('.modal button:text-is("OK")');
  await page.waitForTimeout(300);
  console.log('setup tracks:', (await page.locator('.setup-row').allTextContents()).map((t) => t.replace(/\s+/g, ' ').slice(0, 60)));

  // starting note for Soprano 2 via the one-octave keyboard
  await page.click('.item-row:has-text("Soprano 2") button:text-is("+ Set")');
  await page.waitForSelector('.modal .piano');
  console.log('keys in modal:', await page.locator('.modal .key').count(), '| range', await page.textContent('.modal .kb-range'));
  await page.click('.modal .key[data-midi="65"]');
  await page.click('.modal button:text-is("Save")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/phone-3-setup.png`, fullPage: true });

  // practise screen
  await page.click('text=✓ Done: practise this song');
  await page.waitForSelector('.phone-tracks');
  await page.waitForTimeout(500);
  console.log('track buttons:', await page.locator('.phone-tracks .track-btn').allTextContents());
  console.log('start buttons:', await page.locator('.col-a .start-btn').allTextContents());
  console.log('note buttons:', await page.locator('.note-row .start-btn').allTextContents());
  console.log('mini player hidden on song screen:', await page.isHidden('#mini'));
  await page.screenshot({ path: `${OUT}/phone-4-play.png` });

  await page.click('.track-btn:text-is("Full mix")');
  await page.click('.start-btn.letter:text-is("B")');
  await page.waitForTimeout(800);
  console.log('after B (Full mix, expect ~0:22):', await audio());
  await page.click('.track-btn:text-is("Soprano 2")');
  await page.waitForTimeout(500);
  console.log('switch to Soprano 2 while playing (carries on):', await audio());
  await page.click('.start-btn.letter:text-is("B")');
  await page.waitForTimeout(600);
  console.log('Soprano 2 letter B (expect ~0:26):', await audio());
  await page.fill('.bar-box', '5');
  await page.click('button:text-is("▶ Bar")');
  await page.waitForTimeout(600);
  console.log('bar 5 (expect ~0:15):', await audio());
  await page.click('.speed-btn[data-rate="0.7"]');
  console.log('speed:', (await audio()).speed, '| now:', await page.textContent('.now-name'));
  await page.click('button[aria-label="Stop"]');
  await page.waitForTimeout(200);
  console.log('after Stop:', await audio());
  await page.click('button[aria-label="Play again from the same place"]');
  await page.waitForTimeout(400);
  console.log('after Again:', await audio());
  await page.click('button[aria-label="Pause"]');
  await page.click('.note-btn');
  await page.waitForTimeout(200);
  console.log('starting note:', await audio());
  await page.click('.kb-toggle');
  console.log('keyboard keys:', await page.locator('.kb-wrap .key').count());
  await page.screenshot({ path: `${OUT}/phone-5-play-keyboard.png`, fullPage: true });
  await page.click('.speed-btn[data-rate="1"]');

  // sideways
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  const cols = await page.evaluate(() => { const a = document.querySelector('.col-a').getBoundingClientRect(); const c = document.querySelector('.col-b').getBoundingClientRect(); return { sideBySide: c.left > a.right - 1, aTop: a.top, bTop: c.top }; });
  console.log('sideways columns:', cols);
  await page.screenshot({ path: `${OUT}/phone-6-sideways.png` });
  await page.setViewportSize({ width: 390, height: 844 });

  // mini player elsewhere, song list summary
  await page.click('button[aria-label="Play"]');
  await page.click('#back');
  await page.waitForSelector('.song-item');
  console.log('song list:', (await page.textContent('.song-item')).replace(/\s+/g, ' '), '| mini shown:', await page.isVisible('#mini'));
  await page.click('.mini-stop');

  // overflow check at 320px (iPhone SE 1st gen)
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto(`${BASE}/phone/#/song/${await page.evaluate(async () => (await (await import('./js/db.js')).getAll('songs'))[0].id)}`);
    await page.waitForSelector('.phone-tracks');
    console.log(`width ${w}: page wider than screen?`, await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth));
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // help + backup contents
  await page.click('.tabbar a[data-tab="help"]');
  await page.waitForSelector('text=💾 Back up');
  await page.waitForTimeout(400);
  console.log('version:', await page.textContent('#app-version'));
  await page.screenshot({ path: `${OUT}/phone-7-help.png` });
  const backup = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const d = JSON.parse(await (await db.exportAll()).text());
    return { app: d.app, songs: d.songs.length, items: d.items.length, blobs: d.blobs.length, startNotes: d.songs[0].startNotes };
  });
  console.log('phone backup:', backup);

  // the iPad app (same site) has its own, empty song list
  const ipad = await ctx.newPage();
  await ipad.goto(`${BASE}/`);
  const ipadSongs = await ipad.evaluate(async () => (await (await import('/js/db.js')).getAll('songs')).length);
  console.log('iPad app songs (expect 0):', ipadSongs);
  // make an iPad backup with one song and restore it on the phone
  const ipadBackup = await ipad.evaluate(async () => {
    const db = await import('/js/db.js');
    const song = await db.put('songs', { id: 'ipadsong1', title: 'Let the River Run', createdAt: Date.now(), startNotes: { 'Soprano 2': 67 } });
    const blob = await (await fetch('/phone/../icons/icon-192.png')).blob(); // any file stands in for an MP3
    const it = await db.addFile(song.id, 'track', new File([blob], 'River_Full.mp3', { type: 'audio/mpeg' }), 'Full mix');
    it.marks = [{ t: 9, bar: 5, letter: 'A', label: '' }]; it.part = null; await db.put('items', it);
    await db.put('rehearsals', { id: 'r1', title: 'Tuesday', date: '2026-11-17', songIds: [song.id], notes: [], log: [] });
    const text = await (await db.exportAll({ includeFiles: true })).text();
    await db.deleteSong(song.id); await db.del('rehearsals', 'r1');
    return text;
  });
  fs.writeFileSync(`${OUT}/ipad-backup.json`, ipadBackup);
  await ipad.close();
  await page.setInputFiles('input[accept^="application/json"]', `${OUT}/ipad-backup.json`);
  await page.waitForTimeout(800);
  await page.click('.tabbar a[data-tab="songs"]');
  await page.waitForTimeout(300);
  console.log('phone songs after iPad restore:', (await page.locator('.song-item .item-title').allTextContents()));
  const stores = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  console.log('databases:', stores);

  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
