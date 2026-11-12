// Notes for giving a pitch: names, frequencies and a piano-like tone made in the app
// (concert pitch A4 = 440 Hz). No sound files: the tone is built as a short WAV and
// played through an ordinary audio player (see player.playNote).

export const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const LOWEST = 36; // C2
export const HIGHEST = 96; // C7

export function isBlack(midi) { return BLACK.has(((midi % 12) + 12) % 12); }
export function noteName(midi) { return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`; }
export function freq(midi) { return 440 * 2 ** ((midi - 69) / 12); }

// "A4", "F#3", "f♯3", "Bb3", "B flat 3", "C sharp 4" -> MIDI number (C4 = 60), or null.
const STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function parseNote(text) {
  const m = String(text || '').trim().toLowerCase()
    .match(/^([a-g])\s*(#|♯|sharp|b|♭|flat)?\s*(-?\d)$/);
  if (!m) return null;
  let midi = STEP[m[1]] + (Number(m[3]) + 1) * 12;
  if (m[2] && /#|♯|sharp/.test(m[2])) midi++;
  else if (m[2]) midi--;
  return midi >= LOWEST && midi <= HIGHEST ? midi : null;
}

// A clean electric-piano tone: a few harmonics, quick attack, gentle decay, then a fade.
export const TONE = { seconds: 2, rate: 22050 };
export function toneWav(midi, { seconds = TONE.seconds, rate = TONE.rate } = {}) {
  const n = Math.round(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  const f = freq(midi);
  // harmonic: [multiple, loudness, decay per second]; higher ones fade faster
  const parts = [[1, 1, 1.1], [2, 0.45, 2], [3, 0.2, 3], [4, 0.12, 4], [5, 0.05, 5]].filter(([k]) => f * k < rate / 2.2);
  const total = parts.reduce((s, [, a]) => s + a, 0);
  const attack = 0.006 * rate, release = 0.25 * rate;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    for (const [k, a, d] of parts) s += a * Math.exp(-d * t) * Math.sin(2 * Math.PI * f * k * t);
    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > n - release) env = (n - i) / release;
    v.setInt16(44 + i * 2, Math.round((s / total) * env * 0.8 * 32767), true);
  }
  return buf;
}
