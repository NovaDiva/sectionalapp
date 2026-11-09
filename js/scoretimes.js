// Read track times that are already printed on a score PDF (e.g. by Carol's
// choir-track-timestamps skill: small "0:33" labels in the left margin, level
// with each system's bar number, plus labels just right of mid-system
// rehearsal letters; "0:40 / 1:41" for repeats, "~" for approximate times).

const TIME_LABEL = /^~?\d{1,2}:\d{2}(\s*\/\s*~?\d{1,2}:\d{2})*$/;

/**
 * Turn the text on each page into timestamp marks.
 * @param {Array<Array<{str: string, x: number, y: number, h: number}>>} pages
 *   text items per page; x/y in points from the page's top-left, h = text height.
 * @returns {Array<{t, bar, letter, label}>} sorted by time
 */
export function marksFromTextItems(pages) {
  const marks = [];
  let firstLabel = true;
  pages.forEach((items, pi) => {
    const clean = items.map((it) => ({ ...it, str: String(it.str || '').trim() })).filter((it) => it.str);
    // Labels may arrive as one item ("0:09 / 0:12") or in pieces on the same line; join neighbours.
    const labels = [];
    const used = new Set();
    clean.forEach((it, i) => {
      if (used.has(i) || !/^~?\d{1,2}:\d{2}/.test(it.str)) return;
      let str = it.str;
      let right = it.x + it.str.length * it.h * 0.5;
      for (let j = 0; j < clean.length; j++) {
        if (j === i || used.has(j)) continue;
        const o = clean[j];
        if (Math.abs(o.y - it.y) < 2 && o.x >= right - 2 && o.x - right < 12 && /^\/?\s*~?\d{0,2}:?\d{0,2}$/.test(o.str) && /[:/]/.test(o.str)) {
          str += ` ${o.str}`; right = o.x + o.str.length * o.h * 0.5; used.add(j);
        }
      }
      str = str.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
      if (TIME_LABEL.test(str)) labels.push({ ...it, str });
    });

    for (const lab of labels) {
      const others = clean.filter((o) => o !== lab && !TIME_LABEL.test(o.str));
      // Bar number: small digits on the same line, just to the right (the system's bar number).
      let bar = null, best = Infinity;
      for (const o of others) {
        if (!/^\d{1,3}$/.test(o.str) || o.h > 11) continue;
        const dx = o.x - lab.x, dy = Math.abs(o.y - lab.y);
        if (dx > -5 && dx < 130 && dy < 9 && dx + dy * 3 < best) { best = dx + dy * 3; bar = Number(o.str); }
      }
      // Rehearsal letter: a larger single capital close by (just left of a mid-system label,
      // or above the start of a system).
      let letter = null; best = Infinity;
      for (const o of others) {
        if (!/^[A-Z]$/.test(o.str) || o.h < 10) continue;
        const dx = lab.x - o.x, dy = Math.abs(o.y - lab.y);
        const near = (dx > -10 && dx < 45 && dy < 14) || (Math.abs(dx) < 140 && o.y < lab.y && lab.y - o.y < 40 && bar != null);
        if (near && Math.abs(dx) + dy < best) { best = Math.abs(dx) + dy; letter = o.str; }
      }
      const times = lab.str.split('/').map((t) => t.trim());
      times.forEach((t, k) => {
        const approx = t.startsWith('~');
        const [m, s] = t.replace('~', '').split(':').map(Number);
        const b = bar ?? (firstLabel && pi === 0 && !letter ? 1 : null);
        const words = [letter ? `Letter ${letter}` : '', k > 0 ? '(repeat)' : '', approx ? '(approx.)' : ''].filter(Boolean).join(' ');
        marks.push({ t: m * 60 + s, bar: b, letter, label: words });
      });
      firstLabel = false;
    }
  });
  marks.sort((a, b) => a.t - b.t);
  // Drop exact duplicates (same time printed twice).
  return marks.filter((m, i) => i === 0 || m.t !== marks[i - 1].t || m.bar !== marks[i - 1].bar);
}

// Read the text of a PDF (Blob) with PDF.js and find its printed times.
export async function readScoreTimes(blob) {
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
  return marksFromTextItems(pages);
}
