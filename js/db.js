// All data lives on this device in IndexedDB. Nothing is uploaded anywhere.
// Stores:
//   songs      { id, title, createdAt }
//   items      { id, songId, kind: 'score'|'track', name, mime, size, blobId, marks?, createdAt }
//   blobs      { id, blob }            (the actual PDF / audio file)
//   rehearsals { id, title, date, songIds, notes[], covered{songId: {letters[], text}}, log[], status, createdAt, finishedAt }
//   todos      { id, text, songId, done, createdIn, doneIn, createdAt }

const DB_NAME = 'sectional-app';
const VERSION = 1;
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
      db.createObjectStore('rehearsals', { keyPath: 'id' });
      db.createObjectStore('todos', { keyPath: 'id' });
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

// Save a file (PDF or audio) and its description.
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
  for (const t of await getAll('todos')) if (t.songId === songId) await del('todos', t.id);
  await del('songs', songId);
}

// Songs with their tracks (and marks) for the rehearsal command box.
export async function songsWithTracks(songIds) {
  const out = [];
  for (const id of songIds) {
    const song = await get('songs', id);
    if (!song) continue;
    const items = await itemsForSong(id);
    out.push({
      ...song,
      tracks: sortByName(items.filter((i) => i.kind === 'track')),
      scores: sortByName(items.filter((i) => i.kind === 'score')),
    });
  }
  return out;
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

export async function exportAll({ includeFiles }) {
  const data = { app: 'sectional-app', version: 1, exportedAt: new Date().toISOString() };
  for (const name of ['songs', 'items', 'rehearsals', 'todos']) data[name] = await getAll(name);
  if (includeFiles) {
    data.blobs = [];
    for (const it of data.items) {
      const blob = await getBlob(it.blobId);
      if (blob) data.blobs.push({ id: it.blobId, dataURL: await blobToDataURL(blob) });
    }
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'sectional-app') throw new Error('This file is not a Sectional backup.');
  const haveBlobs = new Set((data.blobs || []).map((b) => b.id));
  for (const b of data.blobs || []) {
    const blob = await (await fetch(b.dataURL)).blob();
    await put('blobs', { id: b.id, blob });
  }
  let skipped = 0;
  for (const it of data.items || []) {
    // Notes-only backups: keep timestamps for files already on this device.
    if (!haveBlobs.has(it.blobId) && !(await get('blobs', it.blobId))) {
      const existing = await get('items', it.id);
      if (existing && it.marks) { existing.marks = it.marks; await put('items', existing); }
      else skipped++;
      continue;
    }
    await put('items', it);
  }
  for (const name of ['songs', 'rehearsals', 'todos']) for (const rec of data[name] || []) await put(name, rec);
  return { songs: (data.songs || []).length, rehearsals: (data.rehearsals || []).length, skipped };
}
