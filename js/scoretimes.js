// Read track times that are already printed on a score PDF (e.g. by Carol's
// choir-track-timestamps skill: small "0:33" labels in the left margin, level
// with each system's bar number, plus labels just right of mid-system
// rehearsal letters; "0:40 / 1:41" for repeats, "~" for approximate times).

// Labels can also carry a part track's own time after a bar, e.g. "0:01 | S2 0:03":
// the first time is the full mix, "S2 0:03" is the Soprano 2 track (T/M/L = Tops/Middles/Lowers).
const TIME = '~?\\d{1,2}:\\d{2}';
const TIMES = `${TIME}(?:\\s*\\/\\s*${TIME})*`;
const SEGMENT = new RegExp(`^(?:([A-Za-z]{1,8}\\s?\\d?)\\s+)?(${TIMES})$`);
const PIECE = /^(?:[|¦]|\/|~?\d{1,2}:\d{2}|[A-Z][A-Za-z]{0,7}\s?\d?)$/; // bits of a label split into items

// "S2" / "Sop 2" / "Soprano 2" -> "S2"; "Tops" -> "T"; "" -> "" (the full-mix time)
export function partTag(name) {
  const m = String(name || '').trim().match(/^([A-Za-z])[A-Za-z]*\s*(\d?)$/);
  return m ? (m[1] + m[2]).toUpperCase() : '';
}

// "0:01 | S2 0:03" -> { '': ['0:01'], S2: ['0:03'] }; null if it isn't a time label.
export function parseLabel(str) {
  const out = {};
  const segs = String(str).split(/\s*[|¦]\s*/);
  for (let i = 0; i < segs.length; i++) {
    const m = segs[i].trim().match(SEGMENT);
    if (!m) return null;
    if (i === 0 && m[1]) return null; // a label starts with a time
    const tag = m[1] ? partTag(m[1]) : '';
    if (tag in out) return null;
    out[tag] = m[2].split('/').map((t) => t.trim());
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Turn the text on each page into timestamp marks.
 * @param {Array<Array<{str: string, x: number, y: number, h: number}>>} pages
 *   text items per page; x/y in points from the page's top-left, h = text height.
 * @param {{tag?: string}} opts tag = the track's part ("S2"); its own times are used when printed.
 * @returns {Array<{t, bar, letter, label}>} sorted by time. Extra properties: .tags (part times
 *   printed on the score, e.g. ['S2']) and .usedTag (the part whose times were used, '' = full mix).
 */
export function marksFromTextItems(pages, { tag = '' } = {}) {
  const marks = [];
  const parsed = [];
  const tags = new Set();
  pages.forEach((items, pi) => {
    const clean = items.map((it) => ({ ...it, str: String(it.str || '').trim() })).filter((it) => it.str);
    // Labels may arrive as one item ("0:09 / 0:12", "0:01 | S2 0:03") or in pieces on the same line; join neighbours.
    const used = new Set();
    clean.forEach((it, i) => {
      if (used.has(i) || !/^~?\d{1,2}:\d{2}/.test(it.str)) return;
      let str = it.str;
      let right = it.x + it.str.length * it.h * 0.5;
      for (let more = true; more;) {
        more = false;
        for (let j = 0; j < clean.length; j++) {
          if (j === i || used.has(j)) continue;
          const o = clean[j];
          if (Math.abs(o.y - it.y) < 2 && o.x >= right - 3 && o.x - right < 12 && o.str.length <= 14
            && o.str.split(/\s+/).every((w) => PIECE.test(w) || (/[:/]/.test(w) && /^\/?~?\d{0,2}:?\d{0,2}$/.test(w)))) {
            str += ` ${o.str}`; right = o.x + o.str.length * o.h * 0.5; used.add(j); more = true;
          }
        }
      }
      str = str.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
      let times = parseLabel(str);
      // Pieces that turned out not to belong: fall back to the item on its own.
      if (!times && str !== it.str) times = parseLabel(it.str.replace(/\s*\/\s*/g, ' / '));
      if (times) { parsed.push({ lab: { ...it, str }, times, pi, clean }); Object.keys(times).forEach((k) => k && tags.add(k)); }
    });
  });
  const want = tag && tags.has(tag) ? tag : '';

  let firstLabel = true;
  for (const { lab, times: all, pi, clean } of parsed) {
    const others = clean.filter((o) => o.str !== lab.str && !/^~?\d{1,2}:\d{2}/.test(o.str));
    // Bar number: small digits on the same line, just to the right (the system's bar number).
    let bar = null, best = Infinity;
    for (const o of others) {
      if (!/^\d{1,3}$/.test(o.str) || o.h > 11) continue;
      const dx = o.x - lab.x, dy = Math.abs(o.y - lab.y);
      if (dx > -5 && dx < 130 && dy < 9 && dx + dy * 3 < best) { best = dx + dy * 3; bar = Number(o.str); }
    }
    // The first label on the first page is bar 1 (bar 1 has no printed number).
    if (bar == null && firstLabel && pi === 0) bar = 1;
    // Rehearsal letter: a larger single capital close by (just left of a mid-system label,
    // or above the start of a system).
    let letter = null; best = Infinity;
    for (const o of others) {
      if (!/^[A-Z]$/.test(o.str) || o.h < 10) continue;
      const dx = lab.x - o.x, dy = Math.abs(o.y - lab.y);
      const near = (dx > -10 && dx < 45 && dy < 14) || (Math.abs(dx) < 140 && lab.y - o.y > -6 && lab.y - o.y < 40 && bar != null);
      if (near && Math.abs(dx) + dy < best) { best = Math.abs(dx) + dy; letter = o.str; }
    }
    const times = all[want] || (want ? null : all['']);
    if (!times) { firstLabel = false; continue; }
    times.forEach((t, k) => {
      const approx = t.startsWith('~');
      const [m, s] = t.replace('~', '').split(':').map(Number);
      const words = [letter ? `Letter ${letter}` : '', k > 0 ? '(repeat)' : '', approx ? '(approx.)' : ''].filter(Boolean).join(' ');
      marks.push({ t: m * 60 + s, bar, letter, label: words });
    });
    firstLabel = false;
  }
  marks.sort((a, b) => a.t - b.t);
  // Drop exact duplicates (same time printed twice).
  const out = marks.filter((m, i) => i === 0 || m.t !== marks[i - 1].t || m.bar !== marks[i - 1].bar);
  out.tags = [...tags];
  out.usedTag = want;
  return out;
}

// Read the text of a PDF (Blob) with PDF.js and find its printed times.
export async function readScoreTimes(blob, opts = {}) {
  const pdfjsLib = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => 'str' in it).map((it) => {
      const [a, b, c, d, e, f] = it.transform;
      const h = Math.hypot(c, d) || it.height || Math.hypot(a, b);
      return { str: it.str, x: e, y: height - f, h };
    }));
  }
  pdf.destroy();
  return marksFromTextItems(pages, opts);
}
