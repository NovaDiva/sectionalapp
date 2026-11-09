// Turns what a leader types in the rehearsal box into an action.
//   "alto bar 32"          -> play the Alto track of the current song from bar 32
//   "full mix letter B"    -> play the full track from letter B
//   "bars 10-24 sopranos"  -> play bars 10 to 24, then stop
//   "B to C"               -> play from letter B until letter C starts
//   "viva alto from the top", "stop", "again", "back 10", "note: altos flat at C", "fix: tuning bar 40"

import { timeForBar, findLetter, lettersIn, sortMarks, formatTime } from './timestamps.js';

const VOICES = {
  soprano: ['soprano', 'sopranos', 'sop', 'sops', 'sopr'],
  alto: ['alto', 'altos', 'alt'],
  tenor: ['tenor', 'tenors', 'ten'],
  bass: ['bass', 'basses', 'bari', 'baritone', 'baritones'],
  tops: ['tops', 'toppers', 'topline'],
  middles: ['middle', 'middles', 'mids', 'mid'],
  lowers: ['lower', 'lowers', 'low', 'lows', 'bottoms'],
  full: ['full', 'all', 'mix', 'everyone', 'tutti', 'together', 'choir', 'everybody'],
  piano: ['piano', 'accompaniment', 'acc', 'accomp', 'backing', 'instrumental'],
};
const ALIAS = {};
for (const [canon, words] of Object.entries(VOICES)) for (const w of words) ALIAS[w] = canon;

const FILLER = new Set([
  'play', 'please', 'the', 'from', 'at', 'go', 'to', 'start', 'starting', 'part', 'track', 'line',
  'can', 'you', 'we', 'lets', 'let', 'us', 'hear', 'of', 'on', 'in', 'and', 'with', 'for', 'just',
  'a', 'an', 'bit', 'section', 'song', 'only', 'now', 'then', 'up', 'again', 'listen', 'me', 'it',
  'bar', 'bars', 'letter', 'until', 'till', 'through', 'thru', 'version', 'voice', 'top', 'beginning',
]);

// ---- Spoken commands -------------------------------------------------------
// Speech recognition writes what it hears: "Alto's bar thirty two", "letter bee",
// "base from the top". Turn that into the same form as a typed command.

const NUM_UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19 };
const NUM_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SPOKEN_LETTERS = {
  ay: 'A', eh: 'A', bee: 'B', be: 'B', see: 'C', sea: 'C', cee: 'C', dee: 'D', ee: 'E', eff: 'F', ef: 'F',
  gee: 'G', jee: 'G', aitch: 'H', haitch: 'H', eye: 'I', jay: 'J', kay: 'K', el: 'L', ell: 'L', em: 'M',
  en: 'N', oh: 'O', pee: 'P', cue: 'Q', queue: 'Q', are: 'R', ar: 'R', ess: 'S', tee: 'T', tea: 'T',
  you: 'U', vee: 'V', ex: 'X', why: 'Y', zed: 'Z', zee: 'Z',
};
const LETTER_CUES = new Set(['letter', 'rehearsal', 'figure', 'from', 'to', 'until', 'till', 'at', 'section']);
const SOUNDS_LIKE = { base: 'bass', bases: 'basses', tenner: 'tenor', tenners: 'tenors', altar: 'alto', altos: 'altos', tops: 'tops', middle: 'middle', lower: 'lower',
  soprano: 'soprano', sopranos: 'sopranos', bars: 'bars', bah: 'bar', baa: 'bar', ba: 'bar' };

export function normalizeSpoken(input) {
  let text = String(input || '').trim().replace(/[.!?]+$/, '');
  // "Alto's", "altos'" -> "altos"
  text = text.replace(/(\w)['’]s\b/gi, '$1s').replace(/(\w)s['’]/gi, '$1s');
  // Keep "note: ..." and "fix: ..." text as spoken, only tidy the command word.
  if (/^(note|notes|fix|todo|to do|next time|work on)\b/i.test(text)) return text;

  // "first altos" / "1st sopranos" -> "altos 1"; "second altos" -> "altos 2"
  text = text.replace(/\b(first|1st)\s+([a-z]+)/gi, '$2 1').replace(/\b(second|2nd)\s+([a-z]+)/gi, '$2 2');

  const out = [];
  const toks = text.split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const raw = toks[i];
    const w = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const prev = (out[out.length - 1] || '').toLowerCase();
    // Number words: "thirty two" -> 32, "one hundred and four" -> 104, "twenty-one" -> 21
    if (w in NUM_UNITS || w in NUM_TENS || /^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-\w+$/.test(w)) {
      let n = 0, j = i, any = false;
      while (j < toks.length) {
        const x = toks[j].toLowerCase().replace(/[^a-z-]/g, '');
        const parts = x.split('-');
        if (parts.length === 2 && parts[0] in NUM_TENS && parts[1] in NUM_UNITS) { n += NUM_TENS[parts[0]] + NUM_UNITS[parts[1]]; j++; any = true; continue; }
        if (x in NUM_TENS && n % 100 === 0) { n += NUM_TENS[x]; j++; any = true; continue; }
        if (x in NUM_UNITS && n % 10 === 0 && !(n % 100 !== 0 && NUM_UNITS[x] >= 10)) { n += NUM_UNITS[x]; j++; any = true; continue; }
        if (x === 'hundred' && any) { n = (n || 1) * 100; j++; continue; }
        if (x === 'and' && any && n % 100 === 0 && n > 0 && j + 1 < toks.length) { j++; continue; }
        break;
      }
      if (any) { out.push(String(n)); i = j - 1; continue; }
    }
    // "letter bee" -> "letter B"
    if (LETTER_CUES.has(prev) && SPOKEN_LETTERS[w]) { out.push(SPOKEN_LETTERS[w]); continue; }
    // A single letter said on its own after a cue: "from b" -> "from B"
    if (LETTER_CUES.has(prev) && /^[a-z]$/.test(w) && prev !== 'to') { out.push(w.toUpperCase()); continue; }
    if (SOUNDS_LIKE[w]) { out.push(SOUNDS_LIKE[w]); continue; }
    out.push(raw);
  }
  return out.join(' ').trim();
}

export function canonicalVoice(word) {
  return ALIAS[word] || null;
}

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

// Canonical description of a track name: "Alto 2" -> { voices:['alto'], nums:['2'], words:[...] }
function trackKeys(name) {
  const ws = words(name.replace(/(\D)(\d)/g, '$1 $2'));
  return {
    voices: ws.map(canonicalVoice).filter(Boolean),
    nums: ws.filter((w) => /^\d+$/.test(w)),
    words: ws,
  };
}

/**
 * @param {string} input
 * @param {{songs: Array<{id, title, tracks: Array<{id, name, marks}>}>, current?: {songId, trackId}}} ctx
 * @returns {object} action. Always has `type`. Play actions carry songId, trackId, start, end, reply.
 */
export function parseCommand(input, ctx) {
  const text = normalizeSpoken(input);
  if (!text) return { type: 'none' };
  const lower = text.toLowerCase();

  // Notes and to-dos typed into the box.
  let m = text.match(/^(?:note|notes)\s*[:\-]?\s+(.+)$/i);
  if (m) return { type: 'note', text: m[1].trim() };
  m = text.match(/^(?:fix|todo|to do|next time|work on)\s*[:\-]?\s+(.+)$/i);
  if (m) return { type: 'todo', text: m[1].trim() };

  if (/^(stop|pause|wait|hold|halt|shh+|quiet)\b/.test(lower)) return { type: 'pause' };
  if (/^(resume|continue|carry on|keep going|unpause)\b/.test(lower) || /^play$/.test(lower) || lower === 'go') {
    return { type: 'resume' };
  }
  if (/^(again|repeat|replay|one more time|once more)\b/.test(lower)) return { type: 'again' };
  m = lower.match(/^(back|rewind|skip back|go back)\s*(\d+)?\s*(s|sec|secs|seconds)?$/);
  if (m) return { type: 'seek', by: -(Number(m[2]) || 5) };
  m = lower.match(/^(forward|skip|skip forward|ahead)\s*(\d+)?\s*(s|sec|secs|seconds)?$/);
  if (m) return { type: 'seek', by: Number(m[2]) || 5 };
  if (/^(help|\?|what can i (say|type))/.test(lower)) return { type: 'help' };
  // Speed: "slower", "half speed", "normal speed", "speed 80", "80 percent", "play at 70%"
  if (/^(normal|full|regular|original)( speed| tempo)?$|^(speed|tempo) (normal|100)/.test(lower)) return { type: 'speed', rate: 1 };
  if (/\bhalf (speed|tempo)\b/.test(lower)) return { type: 'speed', rate: 0.5 };
  if (/^(slower|slow( it)? down|a bit slower|little slower)$/.test(lower)) return { type: 'speed', by: -0.1 };
  if (/^(faster|speed( it)? up|a bit faster|little faster)$/.test(lower)) return { type: 'speed', by: 0.1 };
  m = lower.match(/^(?:play at |set )?(?:speed|tempo)?\s*(?:to |at )?(\d{2,3})\s*(%|percent|per cent)?(?: speed| tempo)?$/);
  if (m && (m[2] || /speed|tempo/.test(lower))) return { type: 'speed', rate: Math.min(1, Number(m[1]) / 100) };

  return parsePlay(text, ctx || { songs: [] });
}

function parsePlay(text, ctx) {
  const songs = ctx.songs || [];
  if (!songs.length) return { type: 'error', reply: 'There are no songs in this rehearsal yet. Add songs first.' };

  const ws = words(text.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2'));
  const used = new Set();

  // --- Song ---------------------------------------------------------------
  let song = null;
  let bestScore = 0;
  for (const s of songs) {
    const titleWords = words(s.title).filter((w) => w.length >= 3 && !FILLER.has(w));
    let score = 0;
    const hits = [];
    ws.forEach((w, i) => {
      if (titleWords.includes(w) && !canonicalVoice(w)) { score++; hits.push(i); }
    });
    if (score > bestScore) { bestScore = score; song = s; song._hits = hits; }
  }
  if (song) song._hits.forEach((i) => used.add(i));
  if (!song) song = songs.find((s) => s.id === ctx.current?.songId) || (songs.length === 1 ? songs[0] : null);
  if (!song) {
    return {
      type: 'error',
      reply: `Which song? Try starting with part of the title, e.g. "${songs[0].title.split(/\s+/)[0]} alto bar 10".`,
    };
  }
  if (!song.tracks?.length) return { type: 'error', reply: `"${song.title}" has no tracks yet. Add one on the Songs page.` };

  // --- Position words (bar / letter / range) ------------------------------
  // Explicit bar: "bar 32", "bars 32 to 40", "b32", "m32", "measure 32"
  let startBar = null, endBar = null, startLetter = null, endLetter = null, fromTop = false;
  const original = text.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2').split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);

  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    let bm = w.match(/^(?:b|m|bar|bars|measure|measures)(\d+)$/);
    if (bm) { startBar = Number(bm[1]); used.add(i); continue; }
    if (['bar', 'bars', 'measure', 'measures', 'b', 'm'].includes(w) && /^\d+$/.test(ws[i + 1] || '')) {
      startBar = Number(ws[i + 1]); used.add(i); used.add(i + 1); i++; continue;
    }
    if (['letter', 'rehearsal', 'figure', 'section'].includes(w) && /^[a-z]$/.test(ws[i + 1] || '')) {
      startLetter = ws[i + 1].toUpperCase(); used.add(i); used.add(i + 1); i++; continue;
    }
    if (['top', 'beginning', 'start', 'intro'].includes(w) && (i === 0 || ['the', 'from', 'at'].includes(ws[i - 1]) || w === 'intro')) {
      fromTop = true; used.add(i); continue;
    }
  }

  // Range ends: "... to 40", "... until C", "B to C"
  for (let i = 0; i < ws.length - 1; i++) {
    if (!['to', 'until', 'till', 'through', 'thru'].includes(ws[i])) continue;
    const nxt = ws[i + 1];
    const nxtOrig = original[i + 1] || '';
    let nb = nxt.match(/^(?:b|m|bar)?(\d+)$/);
    if (nb && startBar != null) { endBar = Number(nb[1]); used.add(i); used.add(i + 1); continue; }
    if (['bar', 'letter'].includes(nxt) && ws[i + 2]) {
      if (/^\d+$/.test(ws[i + 2])) endBar = Number(ws[i + 2]);
      else if (/^[a-z]$/.test(ws[i + 2])) endLetter = ws[i + 2].toUpperCase();
      used.add(i); used.add(i + 1); used.add(i + 2); continue;
    }
    if (/^[a-z]$/.test(nxt) && (nxtOrig === nxt.toUpperCase() || startLetter || /^[a-z]$/.test(ws[i - 1] || ''))) {
      endLetter = nxt.toUpperCase(); used.add(i); used.add(i + 1);
    }
  }

  // --- Track ----------------------------------------------------------------
  const tracks = song.tracks;
  const voiceIdx = ws.map((w, i) => (!used.has(i) && canonicalVoice(w) ? i : -1)).filter((i) => i >= 0);
  let track = null;
  if (voiceIdx.length) {
    const wantVoices = voiceIdx.map((i) => canonicalVoice(ws[i]));
    // Part number right after a voice word: "alto 2", "soprano 1"
    let wantNum = null;
    for (const i of voiceIdx) {
      if (/^\d$/.test(ws[i + 1] || '') && !used.has(i + 1)) {
        const n = ws[i + 1];
        if (tracks.some((t) => trackKeys(t.name).nums.includes(n))) { wantNum = n; used.add(i + 1); }
      }
    }
    let best = -1;
    for (const t of tracks) {
      const k = trackKeys(t.name);
      let sc = 0;
      for (const v of wantVoices) if (k.voices.includes(v)) sc += 10;
      if (wantNum && k.nums.includes(wantNum)) sc += 3;
      if (sc > best && sc > 0) { best = sc; track = t; }
    }
    voiceIdx.forEach((i) => used.add(i));
    if (!track) {
      const names = tracks.map((t) => t.name).join(', ');
      return { type: 'error', reply: `"${song.title}" has no ${ws[voiceIdx[0]]} track. Tracks: ${names}.` };
    }
  }
  // Free words that match a track name exactly (e.g. a custom "Descant" track).
  if (!track) {
    for (const t of tracks) {
      const k = trackKeys(t.name);
      const hit = ws.findIndex((w, i) => !used.has(i) && w.length >= 3 && !FILLER.has(w) && k.words.includes(w));
      if (hit >= 0) { track = t; used.add(hit); break; }
    }
  }
  if (!track) {
    track =
      (ctx.current?.songId === song.id && tracks.find((t) => t.id === ctx.current.trackId)) ||
      tracks.find((t) => trackKeys(t.name).voices.includes('full')) ||
      tracks[0];
  }
  const marks = sortMarks(track.marks || []);

  // Bare numbers / letters left over: "alto 32", "alto B"
  for (let i = 0; i < ws.length; i++) {
    if (used.has(i)) continue;
    if (startBar == null && startLetter == null && /^\d+$/.test(ws[i])) { startBar = Number(ws[i]); used.add(i); continue; }
    if (startBar == null && startLetter == null && /^[a-z]$/.test(ws[i])) {
      const orig = original[i] || '';
      const isUpper = orig.length === 1 && orig === orig.toUpperCase();
      const prev = ws[i - 1];
      if (isUpper || (ws[i] !== 'a' && ws[i] !== 'i') || ['from', 'at'].includes(prev)) {
        startLetter = ws[i].toUpperCase(); used.add(i);
      }
    }
  }

  // --- Resolve to times ---------------------------------------------------------
  const where = `${song.title} · ${track.name}`;
  let start = 0, end = null, approx = false, desc = 'from the start';

  if (startLetter) {
    const mk = findLetter(marks, startLetter);
    if (!mk) return { type: 'error', reply: noLetterReply(startLetter, track, marks) };
    start = mk.t; desc = `from letter ${startLetter}${mk.bar != null ? ` (bar ${mk.bar})` : ''}`;
  } else if (startBar != null) {
    const r = timeForBar(marks, startBar);
    if (!r) return { type: 'error', reply: `The ${track.name} track has no bar numbers marked yet, so I can't find bar ${startBar}. Add timestamps on the Songs page, or say a letter.` };
    start = r.t; approx = r.approx; desc = `from bar ${startBar}`;
  } else if (!fromTop) {
    // Try matching leftover words against mark labels: "play the chorus", "where it says river"
    const free = ws.filter((w, i) => !used.has(i) && w.length >= 3 && !FILLER.has(w));
    if (free.length && marks.length) {
      let bestMk = null, bestHits = 0;
      for (const mk of marks) {
        const lw = words(mk.label || '');
        const hits = free.filter((w) => lw.includes(w)).length;
        if (hits > bestHits) { bestHits = hits; bestMk = mk; }
      }
      if (bestMk) { start = bestMk.t; desc = `from "${bestMk.label}"`; }
    }
  }

  if (endLetter) {
    const mk = findLetter(marks, endLetter);
    if (!mk) return { type: 'error', reply: noLetterReply(endLetter, track, marks) };
    end = mk.t; desc += ` to letter ${endLetter}`;
  } else if (endBar != null) {
    const r = timeForBar(marks, endBar + 1); // stop when the bar after starts
    if (r) { end = r.t; approx = approx || r.approx; desc += ` to bar ${endBar}`; }
  }
  if (end != null && end <= start) end = null;

  return {
    type: 'play',
    songId: song.id,
    trackId: track.id,
    start,
    end,
    approx,
    reply: `Playing ${where} ${desc}${approx ? ' (about ' : ' ('}${formatTime(start)}${end != null ? `–${formatTime(end)}` : ''}).`,
  };
}

function noLetterReply(letter, track, marks) {
  const ls = lettersIn(marks);
  return ls.length
    ? `I can't find letter ${letter} on the ${track.name} track. Letters marked: ${ls.join(', ')}.`
    : `The ${track.name} track has no letters marked yet. Add timestamps on the Songs page, or say a bar number.`;
}

// Quick-tap suggestions shown under the box for the current song.
export function suggestionsFor(song, currentTrack) {
  if (!song) return [];
  const out = [];
  for (const t of song.tracks || []) out.push({ label: `▶ ${t.name}`, command: `${shortTitle(song)} ${t.name} from the top` });
  const track = currentTrack || song.tracks?.[0];
  if (track) for (const L of lettersIn(track.marks || [])) out.push({ label: `${track.name} · ${L}`, command: `${shortTitle(song)} ${track.name} letter ${L}` });
  return out;
}

export function shortTitle(song) {
  const w = words(song.title).filter((x) => x.length >= 3 && !FILLER.has(x) && !canonicalVoice(x));
  return w.slice(0, 2).join(' ') || song.title;
}
