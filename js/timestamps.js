// Timestamp helpers: formatting, bar -> time lookup, and importing pasted tables.
// A "mark" is { t: seconds, bar: number|null, letter: string|null, label: string }.

export function formatTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// "1:23" -> 83, "83" -> 83, "1:02:03" -> 3723. Returns null when unreadable.
export function parseTime(text) {
  if (text == null) return null;
  const clean = String(text).replace(/[*~()]|approx\.?/gi, '').trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(clean)) return null;
  return clean.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
}

export function sortMarks(marks) {
  return [...marks].sort((a, b) => a.t - b.t);
}

// Describe a mark for buttons and lists: "Bar 15 (A) · Letter A"
export function markTitle(m) {
  const parts = [];
  if (m.bar != null && m.bar !== '') parts.push(`Bar ${m.bar}${m.letter ? ` (${m.letter})` : ''}`);
  else if (m.letter) parts.push(`Letter ${m.letter}`);
  if (m.label) parts.push(m.label);
  return parts.join(' · ') || 'Mark';
}

export function findLetter(marks, letter) {
  const L = String(letter).toUpperCase();
  return sortMarks(marks).find((m) => (m.letter || '').toUpperCase() === L) || null;
}

export function lettersIn(marks) {
  const seen = [];
  for (const m of sortMarks(marks)) {
    const L = (m.letter || '').toUpperCase();
    if (L && !seen.includes(L)) seen.push(L);
  }
  return seen;
}

// Work out where a bar starts. Uses an exact mark if there is one, otherwise
// estimates from the nearest marks on either side (steady tempo assumption).
// Returns { t, approx } or null if the track has no bar numbers at all.
export function timeForBar(marks, bar) {
  const pts = sortMarks(marks)
    .filter((m) => m.bar != null && m.bar !== '' && isFinite(Number(m.bar)))
    .map((m) => ({ t: m.t, bar: Number(m.bar) }));
  if (!pts.length) return null;

  const exact = pts.find((p) => p.bar === bar);
  if (exact) return { t: exact.t, approx: false };

  // Between two marks (first matching segment in time order, which handles repeats).
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b.bar > a.bar && bar > a.bar && bar < b.bar) {
      return { t: a.t + ((bar - a.bar) * (b.t - a.t)) / (b.bar - a.bar), approx: true };
    }
  }

  if (pts.length === 1) return { t: pts[0].t, approx: true };

  // Outside the marked range: extend using the nearest pair with a usable rate.
  const rate = (a, b) => (b.t - a.t) / (b.bar - a.bar);
  if (bar < pts[0].bar) {
    const pair = firstRisingPair(pts);
    if (!pair) return { t: pts[0].t, approx: true };
    return { t: Math.max(0, pts[0].t - (pts[0].bar - bar) * rate(...pair)), approx: true };
  }
  const last = pts[pts.length - 1];
  const pair = lastRisingPair(pts);
  if (!pair) return { t: last.t, approx: true };
  return { t: last.t + (bar - last.bar) * rate(...pair), approx: true };
}

function firstRisingPair(pts) {
  for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1].bar > pts[i].bar) return [pts[i], pts[i + 1]];
  return null;
}
function lastRisingPair(pts) {
  for (let i = pts.length - 1; i > 0; i--) if (pts[i].bar > pts[i - 1].bar) return [pts[i - 1], pts[i]];
  return null;
}

// Import a pasted timestamps table, e.g. a song section from the
// "2027 Time Stamps" doc:
//   | Time | Bar | Where you are |
//   |---|---|---|
//   | **0:33** | **15 (A)** | **Letter A** |
// Also accepts plain lines that start with a time: "0:33 15 A Letter A" or "0:33 - bar 15 - text".
export function parseTimestampTable(text) {
  const marks = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\*\*/g, '').trim());
      if (cells.length < 2 || /^:?-{2,}/.test(cells[0])) continue;
      const t = parseTime(cells[0]);
      if (t == null) continue; // header row
      const { bar, letter } = parseBarCell(cells[1]);
      const label = (cells[2] || '').trim();
      marks.push({ t, bar, letter: letter || letterFromLabel(label), label });
      continue;
    }
    const m = line.match(/^~?(\d+:\d{2})\s*[-–·,]?\s*(.*)$/);
    if (!m) continue;
    const t = parseTime(m[1]);
    let rest = m[2].trim();
    let bar = null, letter = null;
    const bm = rest.match(/^(?:bar|b|m)?\s*(\d+)\s*(?:\(?([A-Z])\)?(?=\s|$|[-–·,]))?\s*[-–·,]?\s*/i);
    if (bm) {
      bar = Number(bm[1]);
      if (bm[2] && bm[2] === bm[2].toUpperCase()) letter = bm[2];
      rest = rest.slice(bm[0].length);
    }
    marks.push({ t, bar, letter: letter || letterFromLabel(rest), label: rest.trim() });
  }
  return sortMarks(marks);
}

function parseBarCell(cell) {
  const m = String(cell || '').match(/(\d+)\s*(?:\(\s*([A-Za-z]{1,2})\s*\))?/);
  if (!m) {
    const only = String(cell || '').match(/^\(?([A-Z])\)?$/);
    return { bar: null, letter: only ? only[1] : null };
  }
  return { bar: Number(m[1]), letter: m[2] ? m[2].toUpperCase() : null };
}

function letterFromLabel(label) {
  const m = String(label || '').match(/\b(?:letter|rehearsal)\s+([A-Z])\b/i);
  return m ? m[1].toUpperCase() : null;
}

// Parse what a leader types in the "Bar / letter" box while marking: "15", "15 A", "A", "15A".
export function parseBarLetter(text) {
  const s = String(text || '').trim();
  if (!s) return { bar: null, letter: null };
  const m = s.match(/^(\d+)?\s*([A-Za-z])?$/);
  if (!m) return { bar: null, letter: null };
  return { bar: m[1] ? Number(m[1]) : null, letter: m[2] ? m[2].toUpperCase() : null };
}
