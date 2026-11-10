// Count how often the app changes the iPad sound mode while playing from buttons.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1024, height: 1366 } });
  await page.addInitScript(() => {
    let t = 'auto'; window.__sets = [];
    Object.defineProperty(navigator, 'audioSession', { value: { get type() { return t; }, set type(v) { window.__sets.push(v); t = v; } } });
  });
  await page.goto('http://localhost:8765/');
  const mod = await page.evaluate(async () => {
    const p = await import('/js/player.js');
    const db = await import('/js/db.js');
    const blob = await (await fetch('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')).blob();
    const it = await db.addFile('s', 'track', new File([blob], 'a.wav', { type: 'audio/wav' }), 'A');
    await p.prepare(it);
    for (let i = 0; i < 5; i++) p.playFrom(it, i, null, 'Song');
    p.resume(); p.resume();
    return window.__sets;
  });
  console.log('sound-mode changes during 7 plays:', JSON.stringify(mod));
  await b.close();
})();
