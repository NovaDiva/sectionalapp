// One shared audio player for the whole app.
// iPad note: Safari only lets audio start from a tap, so playFrom() must be called
// straight from a tap/submit handler with the track's URL already prepared
// (see prepare()). Seeking happens once the file's details have loaded.

import { getBlob } from './db.js';
import { formatTime } from './timestamps.js';

const audio = new Audio();
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
  audio.play().catch(() => {});
  emit();
  return true;
}

export function again() {
  if (!state.track) return false;
  return playFrom(state.track, state.lastStart, state.lastEnd, state.songTitle);
}
export function pause() { audio.pause(); }
export function resume() { if (state.track) { stopAt = null; audio.play().catch(() => {}); } }
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
  return `${state.songTitle ? state.songTitle + ' · ' : ''}${state.track.name}`;
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
