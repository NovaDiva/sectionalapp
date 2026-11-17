// Sectional Practice (phone): all data lives on this phone in IndexedDB. Nothing is uploaded.
// Its own database, so it never mixes with the iPad app's data on the same device.
// Stores:
//   songs  { id, title, createdAt, startNotes?: { part: midi }, trackId?: chosen track }
//   items  { id, songId, kind: 'score'|'track', name, mime, size, blobId, part?, marks?, createdAt }
//   blobs  { id, blob }   (the actual PDF / audio file)
// Same shapes as the iPad app (js/db.js), so an iPad "everything" backup can be restored here.

const DB_NAME = 'sectional-practice';
const VERSION = 1;
export const APP = 'sectional-practice';
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('songs', { keyPath: 'id' });
      const items = db.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('songId', 'songId');
      db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function getAll(name) { return wrap((await store(name)).getAll()); }
export async function get(name, id) { return id == null ? undefined : wrap((await store(name)).get(id)); }
export async function put(name, value) { await wrap((await store(name, 'readwrite')).put(value)); return value; }
export async function del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); }

export async function itemsForSong(songId) {
  const s = await store('items');
  return wrap(s.index('songId').getAll(songId));
}

export async function addFile(songId, kind, file, name) {
  const blobId = uid();
  await put('blobs', { id: blobId, blob: file });
  const item = {
    id: uid(), songId, kind, name: name || file.name, mime: file.type, size: file.size,
    blobId, createdAt: Date.now(),
  };
  if (kind === 'track') item.marks = [];
  return put('items', item);
}

export async function getBlob(blobId) {
  const rec = await get('blobs', blobId);
  return rec?.blob || null;
}

export async function deleteItem(item) {
  await del('blobs', item.blobId);
  await del('items', item.id);
}

export async function deleteSong(songId) {
  for (const it of await itemsForSong(songId)) await deleteItem(it);
  await del('songs', songId);
}

const VOICE_ORDER = ['full', 'soprano', 'alto', 'tenor', 'bass', 'piano'];
export function sortByName(items) {
  const rank = (n) => {
    const l = n.toLowerCase();
    const i = VOICE_ORDER.findIndex((v) => l.includes(v));
    return i < 0 ? 99 : i;
  };
  return [...items].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// ---------- Backup / restore ----------

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Always includes the files: a phone backup is for moving everything to a new phone.
export async function exportAll() {
  const data = { app: APP, version: 1, exportedAt: new Date().toISOString() };
  for (const name of ['songs', 'items']) data[name] = await getAll(name);
  try { data.choirParts = JSON.parse(localStorage.getItem('choirParts') || 'null'); } catch { /* none */ }
  data.blobs = [];
  for (const it of data.items) {
    const blob = await getBlob(it.blobId);
    if (blob) data.blobs.push({ id: it.blobId, dataURL: await blobToDataURL(blob) });
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

// Restores a phone backup, or the songs from an iPad Sectional backup (rehearsal notes are left out).
export async function importAll(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('This file is not a Sectional backup.'); }
  if (data.app !== APP && data.app !== 'sectional-app') throw new Error('This file is not a Sectional backup.');
  const haveBlobs = new Set((data.blobs || []).map((b) => b.id));
  for (const b of data.blobs || []) {
    const blob = await (await fetch(b.dataURL)).blob();
    await put('blobs', { id: b.id, blob });
  }
  let skipped = 0;
  for (const it of data.items || []) {
    if (!haveBlobs.has(it.blobId) && !(await get('blobs', it.blobId))) {
      // No file in the backup: keep timestamps for a file already on this phone.
      const existing = await get('items', it.id);
      if (existing && it.marks) { existing.marks = it.marks; await put('items', existing); } else skipped++;
      continue;
    }
    await put('items', it);
  }
  for (const rec of data.songs || []) await put('songs', rec);
  if (Array.isArray(data.choirParts)) localStorage.setItem('choirParts', JSON.stringify(data.choirParts));
  return { songs: (data.songs || []).length, skipped, fromIpad: data.app === 'sectional-app' };
}
