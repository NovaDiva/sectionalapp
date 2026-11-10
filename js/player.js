// One shared audio player for the whole app.
// iPad note: Safari only lets audio start from a tap, so playFrom() must be called
// straight from a tap/submit handler with the track's URL already prepared
// (see prepare()). Seeking happens once the file's details have loaded.

import { getBlob } from './db.js';
import { formatTime } from './timestamps.js';

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
  get playing() { return !audio.paused; },
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

export function playFrom(item, start = 0, end = null, songTitle = '') {
  const url = urls.get(item.blobId);
  if (!url) return false;
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

export function again() {
  if (!state.track) return false;
  return playFrom(state.track, state.lastStart, state.lastEnd, state.songTitle);
}
export function pause() { audio.pause(); }
export function resume() { if (state.track) { stopAt = null; setSoundMode('playback'); audio.play().catch(() => {}); } }
export function toggle() { audio.paused ? resume() : pause(); }
export function seekBy(sec) {
  if (!state.track) return;
  audio.currentTime = Math.max(0, Math.min((audio.duration || 0), audio.currentTime + sec));
  emit();
}
export function seekTo(sec) { if (state.track) { audio.currentTime = Math.max(0, sec); emit(); } }
export function stop() { audio.pause(); stopAt = null; if (state.track) audio.currentTime = state.lastStart || 0; emit(); }

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
