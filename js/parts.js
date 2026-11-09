// Choir parts and "the parts I lead".
// Each track has item.part: one of the choir parts, or null for tracks meant for
// everyone (full mix, piano). Tracks made before parts existed are guessed from their name.

export const DEFAULT_PARTS = ['Soprano 1', 'Soprano 2', 'Alto 1', 'Alto 2', 'Tops', 'Middles', 'Lowers'];

const store = typeof localStorage !== 'undefined' ? localStorage : null;

function readList(key, fallback) {
  try { const v = JSON.parse(store?.getItem(key) || 'null'); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

export function choirParts() { return readList('choirParts', DEFAULT_PARTS); }
export function setChoirParts(list) { store?.setItem('choirParts', JSON.stringify(list)); }
export function myParts() { return readList('myParts', null); } // null = not chosen yet
export function setMyParts(list) { store?.setItem('myParts', JSON.stringify(list)); }

const norm = (s) => String(s || '').toLowerCase().replace(/[_\-.]+/g, ' ')
  .replace(/\b(sopranos?|sop|s)\s*(\d)\b/g, 'soprano $2').replace(/\b(altos?|alt|a)\s*(\d)\b/g, 'alto $2')
  .replace(/\b(\w+?)(\d)\b/g, '$1 $2').replace(/\s+/g, ' ').trim();
const EVERYONE = /\b(full|mix|all|tutti|everyone|choir|piano|accompaniment|backing|instrumental)\b/;

// Which choir part a track name belongs to (null = for everyone / unknown).
export function guessPart(name, parts = choirParts()) {
  const n = ` ${norm(name)} `;
  if (EVERYONE.test(n)) return null;
  // Longest part names first, so "Soprano 1" wins over "Soprano".
  for (const p of [...parts].sort((a, b) => b.length - a.length)) {
    const pn = norm(p);
    const stem = pn.replace(/s$/, ''); // "tops" also matches "top"
    if (n.includes(` ${pn} `) || (stem.length >= 3 && new RegExp(` ${stem}s? `).test(n))) return p;
  }
  return null;
}

export function partOf(track, parts) {
  return track.part !== undefined ? track.part : guessPart(track.name, parts);
}

// Tracks this leader should see: their parts plus tracks for everyone.
export function visibleTracks(tracks, mine = myParts(), parts = choirParts()) {
  if (!mine || !mine.length) return tracks;
  return tracks.filter((t) => { const p = partOf(t, parts); return p == null || mine.includes(p); });
}
