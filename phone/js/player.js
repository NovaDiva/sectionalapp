// One shared audio player for the whole app.
// iPad note: Safari only lets audio start from a tap, so playFrom() must be called
// straight from a tap/submit handler with the track's URL already prepared
// (see prepare()). Seeking happens once the file's details have loaded.

import { getBlob } from './db.js';
import { formatTime } from './timestamps.js';
import { toneWav, TONE } from './pitch.js';

// Sound mode (iPadOS 16.4+ / Safari). 'playback' = music mode, so the iPad sends
// sound to the chosen Bluetooth/AirPlay speaker. While the microphone is in use
// we switch to 'play-and-record', then straight back (see voice.js).
export function setSoundMode(type) {
  // Only when it actually changes: re-applying the same mode makes the iPad reset the
  // audio connection, and some Bluetooth speakers jump back to full volume when that happens.
  try {
    const s = navigator.audioSession;
    if (s && s.type !== type) s.type = type;
  } catch { /* not supported */ }
}
setSoundMode('playback');

const audio = new Audio();

// ---- playback speed (slow down only; pitch stays the same)
export const SPEEDS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
let speed = Number((typeof localStorage !== 'undefined' && localStorage.getItem('speed')) || 1);
if (!SPEEDS.includes(speed)) speed = 1;
function applySpeed() {
  audio.preservesPitch = true;
  audio.webkitPreservesPitch = true; // older Safari
  audio.defaultPlaybackRate = speed;
  audio.playbackRate = speed;
}
export function getSpeed() { return speed; }
export function setSpeed(rate) {
  speed = SPEEDS.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), 1);
  try { localStorage.setItem('speed', String(speed)); } catch { /* private mode */ }
  applySpeed();
  emit();
  return speed;
}
export function speedLabel(r = speed) { return r === 1 ? 'Normal' : `${Math.round(r * 100)}%`; }
audio.preload = 'auto';
const urls = new Map(); // blobId -> object URL
let pendingSeek = null;
let stopAt = null;
const listeners = new Set();

export const state = {
  track: null, // item
  songTitle: '',
  lastStart: 0,
  lastEnd: null,
  get playing() { return settling || !audio.paused; },
  get time() { return audio.currentTime || 0; },
  get duration() { return isFinite(audio.duration) ? audio.duration : 0; },
};

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn(state));

['play', 'pause', 'ended', 'loadedmetadata', 'durationchange'].forEach((e) => audio.addEventListener(e, emit));
// Safari can reset the speed when a new file loads, so set it again.
['loadedmetadata', 'play'].forEach((e) => audio.addEventListener(e, () => { if (audio.playbackRate !== speed) applySpeed(); }));
audio.addEventListener('loadedmetadata', () => {
  if (pendingSeek != null) { audio.currentTime = pendingSeek; pendingSeek = null; }
});
audio.addEventListener('timeupdate', () => {
  if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; }
  emit();
});

// Load the file for a track into memory so it can start instantly on a tap.
export async function prepare(item) {
  if (!item || urls.has(item.blobId)) return urls.get(item?.blobId);
  const blob = await getBlob(item.blobId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(item.blobId, url);
  return url;
}

export function isPrepared(item) { return !!item && urls.has(item.blobId); }

export function load(item, songTitle = '') {
  const url = urls.get(item.blobId);
  if (!url) return false;
  if (state.track?.id !== item.id || audio.src !== url) {
    audio.src = url;
    state.track = item;
    state.songTitle = songTitle;
    pendingSeek = 0;
  }
  return true;
}

// ---- "settled" start, used after a voice command.
// Using the microphone puts the iPad in phone-call sound mode; when music starts again a
// Bluetooth speaker can come back at full volume. Carol found that pausing and playing
// again brings back the right volume. So after a voice command we play half a second of
// SILENCE, pause, then load the track and play it. (Muting is not used: an iPad pauses
// a track that a web app unmutes without a tap, which broke v16.)
export const SETTLE = { silenceMs: 500, pauseMs: 400 };
let silenceUrl = null;
function silence() {
  if (silenceUrl) return silenceUrl;
  // 1 second of silent 8 kHz 8-bit mono WAV, made here (no file needed).
  const n = 8000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let k = 0; k < n; k++) v.setUint8(44 + k, 128);
  silenceUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silenceUrl;
}
let settleTimers = [];
let settling = false;
let settleTarget = null; // { item, start, end }
// Stop the warm-up. If it was still on the silent clip, put the real track back in place
// (at its start point) so Play / Again / Stop work on the track, never on the silence.
function cancelSettle() {
  settleTimers.forEach(clearTimeout);
  settleTimers = [];
  const wasSettling = settling;
  settling = false;
  if (wasSettling && settleTarget && audio.src === silenceUrl) {
    const url = urls.get(settleTarget.item.blobId);
    if (url) { audio.pause(); audio.src = url; pendingSeek = settleTarget.start; stopAt = settleTarget.end; }
  }
  settleTarget = null;
}
function startSettled(item, start, end, songTitle) {
  cancelSettle();
  settling = true;
  settleTarget = { item, start, end };
  state.track = item;
  state.songTitle = songTitle;
  stopAt = null;
  pendingSeek = null;
  audio.src = silence();
  audio.play().catch(() => {});
  settleTimers.push(setTimeout(() => {
    audio.pause();
    settleTimers.push(setTimeout(() => {
      settleTimers = [];
      settling = false;
      settleTarget = null;
      const url = urls.get(item.blobId);
      if (!url) return;
      stopAt = end;
      audio.src = url;
      pendingSeek = start;
      applySpeed();
      audio.play().catch(() => {});
      emit();
    }, SETTLE.pauseMs));
  }, SETTLE.silenceMs));
  emit();
}
export function isSettling() { return settling; }

export function playFrom(item, start = 0, end = null, songTitle = '', { settle = false } = {}) {
  const url = urls.get(item.blobId);
  if (!url) return false;
  stopNotes();
  cancelSettle();
  if (settle) {
    state.lastStart = start;
    state.lastEnd = end;
    setSoundMode('playback');
    startSettled(item, start, end, songTitle);
    return true;
  }
  stopAt = end;
  state.lastStart = start;
  state.lastEnd = end;
  if (state.track?.id !== item.id || audio.src !== url) {
    audio.src = url;
    state.track = item;
    state.songTitle = songTitle;
    pendingSeek = start;
  } else if (audio.readyState >= 1) {
    audio.currentTime = start;
  } else {
    pendingSeek = start;
  }
  setSoundMode('playback');
  applySpeed();
  audio.play().catch(() => {});
  emit();
  return true;
}

// iPad Safari only lets audio start from a tap. Call this inside a tap handler
// (e.g. the microphone button) so a voice command can start playback later.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let unlocked = false;
export function unlock() {
  unlockNotes();
  if (unlocked) return;
  unlocked = true;
  if (audio.src) {
    // Something is loaded: a quick play/pause on the real track does it.
    const wasPaused = audio.paused;
    audio.play().then(() => { if (wasPaused) audio.pause(); }).catch(() => { unlocked = false; });
    return;
  }
  audio.src = SILENT_WAV;
  audio.play().then(() => audio.pause()).catch(() => { unlocked = false; });
}
audio.addEventListener('playing', () => { unlocked = true; });

// ---- giving a note (on-screen piano keyboard, saved starting notes)
// Its own ordinary audio player, so the loaded track stays where it is. A playing track
// is paused first (you give the note before singing). Unlocked with the mic tap (unlock()),
// so a voice command can give a note too. After a VOICE command it uses the same warm-up
// as tracks (0.5 s silence, pause, then the note). Notes are never slowed down.
const noteAudio = new Audio();
noteAudio.preload = 'auto';
const noteUrls = new Map();
let noteTimers = [];
let noteUnlocked = false;
function noteUrl(midi) {
  if (!noteUrls.has(midi)) noteUrls.set(midi, URL.createObjectURL(new Blob([toneWav(midi)], { type: 'audio/wav' })));
  return noteUrls.get(midi);
}
function stopNotes() { noteTimers.forEach(clearTimeout); noteTimers = []; noteAudio.pause(); }
function soundNote(midi) {
  noteAudio.src = noteUrl(midi);
  noteAudio.playbackRate = 1;
  noteAudio.play().catch(() => {});
}
// Play one note, or several one after another (e.g. two parts' starting notes).
export function playNotes(list, { settle = false } = {}) {
  list = (Array.isArray(list) ? list : [list]).filter((m) => Number.isFinite(m));
  if (!list.length) return false;
  stopNotes();
  cancelSettle();
  if (!audio.paused) audio.pause();
  setSoundMode('playback');
  const gap = TONE.seconds * 1000 + 150;
  let at = 0;
  if (settle) {
    noteAudio.src = silence();
    noteAudio.play().catch(() => {});
    noteTimers.push(setTimeout(() => noteAudio.pause(), SETTLE.silenceMs));
    at = SETTLE.silenceMs + SETTLE.pauseMs;
  }
  list.forEach((m, i) => {
    if (i === 0 && at === 0) soundNote(m); // straight from the tap
    else noteTimers.push(setTimeout(() => soundNote(m), at + i * gap));
  });
  emit();
  return true;
}
export const playNote = (midi, opts) => playNotes([midi], opts);
function unlockNotes() {
  if (noteUnlocked) return;
  noteUnlocked = true;
  noteAudio.src = SILENT_WAV;
  noteAudio.play().then(() => noteAudio.pause()).catch(() => { noteUnlocked = false; });
}
noteAudio.addEventListener('playing', () => { noteUnlocked = true; });

export function again(opts = {}) {
  if (!state.track) return false;
  return playFrom(state.track, state.lastStart, state.lastEnd, state.songTitle, opts);
}
export function pause() { stopNotes(); cancelSettle(); audio.pause(); }
export function resume({ settle = false } = {}) {
  if (!state.track) return;
  stopNotes();
  cancelSettle();
  stopAt = null;
  setSoundMode('playback');
  if (settle) startSettled(state.track, audio.currentTime || 0, null, state.songTitle);
  else audio.play().catch(() => {});
}
export function toggle() {
  if (settling) { cancelSettle(); audio.play().catch(() => {}); emit(); return; }
  audio.paused ? resume() : pause();
}
export function seekBy(sec) {
  if (!state.track) return;
  audio.currentTime = Math.max(0, Math.min((audio.duration || 0), audio.currentTime + sec));
  emit();
}
export function seekTo(sec) { if (state.track) { audio.currentTime = Math.max(0, sec); emit(); } }
export function stop() { stopNotes(); cancelSettle(); audio.pause(); stopAt = null; if (state.track) audio.currentTime = state.lastStart || 0; emit(); }

export function describe() {
  if (!state.track) return '';
  return `${state.songTitle ? state.songTitle + ' · ' : ''}${state.track.name}${speed !== 1 ? ` · ${speedLabel()}` : ''}`;
}
export function timeText() { return `${formatTime(state.time)} / ${formatTime(state.duration)}`; }

// Forget a track's cached file (after deleting it).
export function forget(item) {
  const url = urls.get(item.blobId);
  if (!url) return;
  if (state.track?.id === item.id) { audio.pause(); audio.removeAttribute('src'); state.track = null; emit(); }
  URL.revokeObjectURL(url);
  urls.delete(item.blobId);
}

// For tests: what the audio element is doing.
export function debugState() { return { noteSrc: noteAudio.src.slice(0, 20), notePaused: noteAudio.paused, noteTimers: noteTimers.length, muted: audio.muted, paused: audio.paused, time: audio.currentTime, silent: audio.src === silenceUrl, settling }; }
