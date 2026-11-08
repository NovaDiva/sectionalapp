import * as db from './db.js';
import * as player from './player.js';
import { parseCommand, suggestionsFor, canonicalVoice } from './commands.js';
import { voiceSupported, listen, stopListening, isListening } from './voice.js';
import {
  formatTime, sortMarks, markTitle, lettersIn, parseTimestampTable, parseBarLetter,
} from './timestamps.js';

// ---------------------------------------------------------------- helpers

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren that skips null/false (used for optional bits of a screen)
function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }

const main = () => document.getElementById('main');
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }

function setScreen(title, nodes, { back } = {}) {
  document.getElementById('title').textContent = title;
  const backBtn = document.getElementById('back');
  backBtn.hidden = !back;
  backBtn.onclick = () => { location.hash = back; };
  fill(main(), nodes);
  main().scrollTop = 0;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function timeOfDay(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

function fileButton(label, accept, multiple, onFiles, cls = 'btn') {
  const input = h('input', { type: 'file', accept, multiple, hidden: true, onchange: () => { onFiles([...input.files]); input.value = ''; } });
  return h('label', { class: cls }, label, input);
}

function modal(title, body, actions) {
  return new Promise((resolve) => {
    const close = (val) => { wrap.remove(); resolve(val); };
    const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(null); } },
      h('div', { class: 'modal' },
        h('h2', {}, title),
        body,
        h('div', { class: 'row end' }, actions.map((a) => h('button', { class: a.cls || 'btn', onclick: () => close(a.value()) }, a.label))),
      ));
    document.body.append(wrap);
    wrap.querySelector('textarea, input')?.focus();
  });
}

function guessTrackName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const ws = base.toLowerCase().replace(/[_\-.]+/g, ' ').split(/\s+/);
  const nice = { soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor', bass: 'Bass', full: 'Full mix', piano: 'Piano only' };
  for (let i = 0; i < ws.length; i++) {
    const v = canonicalVoice(ws[i]);
    if (v) return nice[v] + (/^\d$/.test(ws[i + 1] || '') ? ` ${ws[i + 1]}` : '');
  }
  return base.replace(/[_]+/g, ' ');
}

// ---------------------------------------------------------------- mini player

function renderMini() {
  const bar = document.getElementById('mini');
  const s = player.state;
  bar.hidden = !s.track;
  if (!s.track) return;
  bar.querySelector('.mini-name').textContent = player.describe();
  bar.querySelector('.mini-time').textContent = player.timeText();
  bar.querySelector('.mini-toggle').textContent = s.playing ? '⏸' : '▶';
  bar.querySelector('.mini-toggle').setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
  const pct = s.duration ? (s.time / s.duration) * 100 : 0;
  bar.querySelector('.mini-progress').style.width = `${pct}%`;
}

function setupMini() {
  const bar = document.getElementById('mini');
  bar.querySelector('.mini-back').onclick = () => player.seekBy(-5);
  bar.querySelector('.mini-toggle').onclick = () => player.toggle();
  bar.querySelector('.mini-again').onclick = () => player.again();
  bar.querySelector('.mini-stop').onclick = () => player.stop();
  player.onChange(renderMini);
}

// ---------------------------------------------------------------- score viewer

async function openScore(item, { commandBox } = {}) {
  const body = h('div', { class: 'pdf-body' }, h('p', { class: 'muted center' }, 'Opening score…'));
  let ctl = null;
  const close = () => { ctl?.destroy(); ov.remove(); document.body.classList.remove('viewing'); };
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'overlay-bar' },
      h('button', { class: 'btn big-close', onclick: close }, '✕ Close'),
      h('div', { class: 'overlay-title' }, item.name),
      h('button', { class: 'btn icon', 'aria-label': 'Smaller', onclick: () => ctl?.zoomOut() }, '－'),
      h('button', { class: 'btn icon', 'aria-label': 'Fit width', onclick: () => ctl?.fit() }, '⤢'),
      h('button', { class: 'btn icon', 'aria-label': 'Bigger', onclick: () => ctl?.zoomIn() }, '＋'),
    ),
    commandBox || null,
    body,
  );
  document.body.append(ov);
  document.body.classList.add('viewing');
  try {
    const { renderScore } = await import('./pdfviewer.js');
    ctl = await renderScore(body, item);
  } catch (e) {
    fill(body, h('p', { class: 'error center' }, `Sorry, this score could not be opened. ${e.message || ''}`));
  }
}

// ---------------------------------------------------------------- Songs

async function screenSongs() {
  const songs = (await db.getAll('songs')).sort((a, b) => a.title.localeCompare(b.title));
  const items = await db.getAll('items');
  const input = h('input', { type: 'text', placeholder: 'New song title, e.g. Let the River Run', class: 'grow' });
  const add = async () => {
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    const song = await db.put('songs', { id: db.uid(), title, createdAt: Date.now() });
    location.hash = `#/song/${song.id}`;
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  setScreen('Songs', [
    h('div', { class: 'card' },
      h('h2', {}, 'Add a song'),
      h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: add }, '+ Add')),
    ),
    songs.length
      ? h('div', { class: 'list' }, songs.map((s) => {
          const mine = items.filter((i) => i.songId === s.id);
          const nScores = mine.filter((i) => i.kind === 'score').length;
          const nTracks = mine.filter((i) => i.kind === 'track').length;
          return h('a', { class: 'list-item', href: `#/song/${s.id}` },
            h('div', { class: 'grow' },
              h('div', { class: 'item-title' }, s.title),
              h('div', { class: 'muted' }, `${nScores} score${nScores === 1 ? '' : 's'} · ${nTracks} track${nTracks === 1 ? '' : 's'}`)),
            h('span', { class: 'chev' }, '›'));
        }))
      : h('p', { class: 'muted center' }, 'No songs yet. Add your first song above.'),
  ]);
}

async function screenSong(id) {
  const song = await db.get('songs', id);
  if (!song) { location.hash = '#/songs'; return; }
  const items = await db.itemsForSong(id);
  const scores = db.sortByName(items.filter((i) => i.kind === 'score'));
  const tracks = db.sortByName(items.filter((i) => i.kind === 'track'));
  const refresh = () => { cleanup.forEach((fn) => fn()); cleanup = []; screenSong(id); };

  const addScores = async (files) => {
    for (const f of files) {
      if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast(`${f.name} is not a PDF`); continue; }
      const name = scores.length === 0 && files.length === 1 ? 'Score' : f.name.replace(/\.pdf$/i, '');
      await db.addFile(id, 'score', f, name);
    }
    toast('Score added');
    refresh();
  };
  const addTracks = async (files) => {
    for (const f of files) {
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|aac|aiff?|ogg)$/i.test(f.name)) { toast(`${f.name} is not an audio file`); continue; }
      await db.addFile(id, 'track', f, guessTrackName(f.name));
    }
    toast(files.length > 1 ? 'Tracks added' : 'Track added');
    refresh();
  };

  const rename = async (item) => {
    const name = prompt('New name:', item.name);
    if (name && name.trim()) { item.name = name.trim(); await db.put('items', item); refresh(); }
  };
  const remove = async (item) => {
    if (!confirm(`Delete "${item.name}" from this iPad?`)) return;
    player.forget(item);
    await db.deleteItem(item);
    refresh();
  };

  const playTrack = async (t) => {
    if (player.state.track?.id === t.id) { player.toggle(); return; }
    await player.prepare(t);
    player.playFrom(t, 0, null, song.title);
  };

  onLeave(player.onChange((st) => {
    main().querySelectorAll('button[data-track]').forEach((b) => {
      b.textContent = st.track?.id === b.dataset.track && st.playing ? '⏸' : '▶';
    });
  }));

  setScreen(song.title, [
    h('div', { class: 'card' },
      h('div', { class: 'row space' },
        h('h2', {}, '📄 Scores'),
        fileButton('+ Add score (PDF)', 'application/pdf,.pdf', true, addScores, 'btn primary')),
      scores.length
        ? scores.map((s) => h('div', { class: 'item-row' },
            h('button', { class: 'btn big grow left', onclick: () => openScore(s) }, `📖 ${s.name}`),
            h('button', { class: 'btn icon', 'aria-label': 'Rename', onclick: () => rename(s) }, '✎'),
            h('button', { class: 'btn icon danger', 'aria-label': 'Delete', onclick: () => remove(s) }, '🗑')))
        : h('p', { class: 'muted' }, 'Add the choir + piano and/or choir-only PDF.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'row space' },
        h('h2', {}, '🎵 Tracks'),
        fileButton('+ Add tracks', 'audio/*,.mp3,.m4a,.wav', true, addTracks, 'btn primary')),
      tracks.length
        ? tracks.map((t) => h('div', { class: 'item-row' },
            h('button', { class: 'btn icon play', 'data-track': t.id, 'aria-label': `Play ${t.name}`, onclick: () => playTrack(t) },
              player.state.track?.id === t.id && player.state.playing ? '⏸' : '▶'),
            h('div', { class: 'grow' }, h('div', { class: 'item-title' }, t.name)),
            h('a', { class: 'btn', href: `#/marks/${t.id}` }, `⏱ Timestamps (${(t.marks || []).length})`),
            h('button', { class: 'btn icon', 'aria-label': 'Rename', onclick: () => rename(t) }, '✎'),
            h('button', { class: 'btn icon danger', 'aria-label': 'Delete', onclick: () => remove(t) }, '🗑')))
        : h('p', { class: 'muted' }, 'Add the full mix and the part tracks (Soprano, Alto, Tenor, Bass). You can pick several files at once.'),
    ),
    h('div', { class: 'row end' },
      h('button', { class: 'btn', onclick: async () => {
        const t = prompt('Song title:', song.title);
        if (t && t.trim()) { song.title = t.trim(); await db.put('songs', song); refresh(); }
      } }, '✎ Rename song'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`Delete "${song.title}" and all its scores, tracks and timestamps from this iPad?`)) return;
        items.forEach((i) => i.kind === 'track' && player.forget(i));
        await db.deleteSong(id);
        location.hash = '#/songs';
      } }, '🗑 Delete song'),
    ),
  ], { back: '#/songs' });
}

// ---------------------------------------------------------------- Timestamps (tap-along)

async function screenMarks(trackId) {
  const track = await db.get('items', trackId);
  if (!track) { location.hash = '#/songs'; return; }
  const song = await db.get('songs', track.songId);
  const siblings = (await db.itemsForSong(track.songId)).filter((i) => i.kind === 'track' && i.id !== track.id);
  track.marks = sortMarks(track.marks || []);
  await player.prepare(track);
  player.load(track, song.title);

  const save = async () => { track.marks = sortMarks(track.marks); await db.put('items', track); };

  const timeEl = h('div', { class: 'big-time' }, '0:00');
  const range = h('input', { type: 'range', min: 0, max: 100, step: 0.1, value: 0, class: 'scrub', 'aria-label': 'Position in track' });
  const playBtn = h('button', { class: 'btn primary big', onclick: () => {
    if (player.state.track?.id !== track.id) { player.playFrom(track, 0, null, song.title); return; }
    player.toggle();
  } }, '▶ Play');
  let dragging = false;
  range.addEventListener('input', () => { dragging = true; timeEl.textContent = formatTime(Number(range.value)); });
  range.addEventListener('change', () => { dragging = false; player.seekTo(Number(range.value)); });

  const listEl = h('div', { class: 'marks' });
  const countEl = h('span', {});

  function renderList() {
    countEl.textContent = `${track.marks.length} mark${track.marks.length === 1 ? '' : 's'}`;
    if (!track.marks.length) {
      fill(listEl, h('p', { class: 'muted center' }, 'No marks yet. Tap Play, then tap MARK each time a letter or phrase starts.'));
      return;
    }
    fill(listEl, ...track.marks.map((m) => {
      const barIn = h('input', { type: 'text', inputmode: 'numeric', class: 'bar-in', placeholder: 'Bar', value: m.bar ?? '', 'aria-label': 'Bar number' });
      const letIn = h('input', { type: 'text', class: 'let-in', maxlength: 2, placeholder: 'Letter', value: m.letter ?? '', 'aria-label': 'Rehearsal letter', autocapitalize: 'characters' });
      const labIn = h('input', { type: 'text', class: 'grow', placeholder: 'Words / what happens here (optional)', value: m.label || '', 'aria-label': 'Description' });
      barIn.addEventListener('change', () => {
        const p = parseBarLetter(barIn.value);
        m.bar = p.bar;
        if (p.letter && !m.letter) { m.letter = p.letter; letIn.value = p.letter; }
        barIn.value = m.bar ?? '';
        save();
      });
      letIn.addEventListener('change', () => { m.letter = letIn.value.trim().toUpperCase() || null; letIn.value = m.letter || ''; save(); });
      labIn.addEventListener('change', () => { m.label = labIn.value.trim(); save(); });
      const timeBtn = h('button', { class: 'btn time', 'aria-label': `Play from ${formatTime(m.t)}`, onclick: () => player.playFrom(track, m.t, null, song.title) }, `▶ ${formatTime(m.t)}`);
      const nudge = (d) => async () => { m.t = Math.max(0, m.t + d); timeBtn.textContent = `▶ ${formatTime(m.t)}`; await save(); player.playFrom(track, m.t, null, song.title); };
      return h('div', { class: 'mark-row' },
        timeBtn,
        h('button', { class: 'btn icon small', 'aria-label': 'One second earlier', onclick: nudge(-1) }, '−1s'),
        h('button', { class: 'btn icon small', 'aria-label': 'One second later', onclick: nudge(1) }, '+1s'),
        barIn, letIn, labIn,
        h('button', { class: 'btn icon danger', 'aria-label': 'Delete mark', onclick: async () => {
          track.marks = track.marks.filter((x) => x !== m); await save(); renderList();
        } }, '✕'));
    }));
  }

  const markBtn = h('button', { class: 'btn mark-btn', onclick: async () => {
    if (player.state.track?.id !== track.id) { toast('Tap Play first'); return; }
    const t = Math.max(0, player.state.time - 0.25); // small allowance for tap reaction time
    const m = { t, bar: null, letter: null, label: '' };
    track.marks.push(m);
    await save();
    renderList();
    markBtn.classList.add('flash');
    setTimeout(() => markBtn.classList.remove('flash'), 200);
    toast(`Marked ${formatTime(t)}`);
  } }, 'MARK');

  const copyFrom = async () => {
    const withMarks = siblings.filter((s) => (s.marks || []).length);
    if (!withMarks.length) { toast('No other track of this song has timestamps yet'); return; }
    const sel = h('select', { class: 'grow' }, withMarks.map((s) => h('option', { value: s.id }, `${s.name} (${s.marks.length} marks)`)));
    const pick = await modal('Copy timestamps from another track', h('div', {},
      h('p', {}, 'Copies the bars, letters and words. Then play through and use −1s / +1s to correct the times for this track.'), sel),
      [{ label: 'Cancel', value: () => null }, { label: 'Copy', cls: 'btn primary', value: () => sel.value }]);
    if (!pick) return;
    const src = withMarks.find((s) => s.id === pick);
    if (track.marks.length && !confirm(`Replace the ${track.marks.length} marks on ${track.name}?`)) return;
    track.marks = src.marks.map((m) => ({ ...m }));
    await save(); renderList(); toast('Copied');
  };

  const pasteTable = async () => {
    const ta = h('textarea', { rows: 10, placeholder: '| Time | Bar | Where you are |\n|---|---|---|\n| 0:33 | 15 (A) | Letter A |' });
    const text = await modal('Paste a timestamps table', h('div', {},
      h('p', {}, 'Paste a song\'s table from the "2027 Time Stamps" doc (or lines like "0:33 15 A Letter A").'), ta),
      [{ label: 'Cancel', value: () => null }, { label: 'Add these', cls: 'btn primary', value: () => ta.value }]);
    if (!text) return;
    const marks = parseTimestampTable(text);
    if (!marks.length) { toast('No times found in that text'); return; }
    if (track.marks.length && confirm(`Replace the existing ${track.marks.length} marks? (Cancel adds to them instead.)`)) track.marks = [];
    track.marks.push(...marks);
    await save(); renderList(); toast(`Added ${marks.length} marks`);
  };

  const off = player.onChange((s) => {
    const mine = s.track?.id === track.id;
    playBtn.textContent = mine && s.playing ? '⏸ Pause' : '▶ Play';
    if (!dragging) {
      range.max = s.duration || 100;
      range.value = mine ? s.time : 0;
      timeEl.textContent = `${formatTime(mine ? s.time : 0)} / ${formatTime(s.duration)}`;
    }
  });
  onLeave(off);
  renderList();

  setScreen(`Timestamps · ${track.name}`, [
    h('div', { class: 'card' },
      h('div', { class: 'muted' }, song.title),
      h('details', { class: 'howto' }, h('summary', {}, 'How to make timestamps'),
        h('ol', {},
          h('li', {}, 'Tap ▶ Play.'),
          h('li', {}, 'Watch the score. Tap the big MARK button each time a rehearsal letter or main phrase starts.'),
          h('li', {}, 'When the song ends, type the bar number and letter for each mark (e.g. bar 15, letter A).'),
          h('li', {}, 'Tap a time to check it. Use −1s / +1s if it is a little early or late.'),
        ),
        h('p', { class: 'muted' }, 'Each track keeps its own timestamps. Use "Copy from another track" to start from the full mix and then adjust.')),
      h('div', { class: 'player-row' },
        h('button', { class: 'btn icon', 'aria-label': 'Back 5 seconds', onclick: () => player.seekBy(-5) }, '⏪ 5'),
        playBtn,
        h('button', { class: 'btn icon', 'aria-label': 'Forward 5 seconds', onclick: () => player.seekBy(5) }, '5 ⏩'),
        timeEl),
      range,
      markBtn,
    ),
    h('div', { class: 'card' },
      h('div', { class: 'row space' }, h('h2', {}, 'Marks'), countEl),
      listEl,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: copyFrom }, '⧉ Copy from another track'),
        h('button', { class: 'btn', onclick: pasteTable }, '📋 Paste a table'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (!track.marks.length || !confirm('Delete all marks on this track?')) return;
          track.marks = []; await save(); renderList();
        } }, 'Clear all')),
    ),
  ], { back: `#/song/${song.id}` });
}

// ---------------------------------------------------------------- Rehearsal home / new

async function screenRehearsalHome() {
  const rehearsals = await db.getAll('rehearsals');
  const open = rehearsals.filter((r) => r.status !== 'done').sort((a, b) => b.createdAt - a.createdAt);
  const todos = (await db.getAll('todos')).filter((t) => !t.done);
  const songs = await db.getAll('songs');

  setScreen('Rehearsal', [
    open.map((r) => h('a', { class: 'hero continue', href: `#/rehearsal/${r.id}` },
      h('div', { class: 'hero-icon' }, '▶'),
      h('div', {}, h('div', { class: 'hero-title' }, `Continue: ${r.title}`), h('div', {}, fmtDate(r.date))))),
    h('a', { class: 'hero', href: songs.length ? '#/rehearsal-new' : '#/songs', onclick: () => { if (!songs.length) toast('Add a song first'); } },
      h('div', { class: 'hero-icon' }, '＋'),
      h('div', {}, h('div', { class: 'hero-title' }, 'Start a new rehearsal'), h('div', {}, 'Pick the songs, then play tracks and take notes'))),
    todos.length ? h('div', { class: 'card' },
      h('h2', {}, `🔧 To work on (${todos.length})`),
      h('ul', { class: 'plain' }, todos.slice(0, 6).map((t) => h('li', {}, todoText(t, songs)))),
      todos.length > 6 ? h('p', { class: 'muted' }, `…and ${todos.length - 6} more`) : null) : null,
    !songs.length ? h('div', { class: 'card' },
      h('h2', {}, 'Welcome!'),
      h('p', {}, 'Start by adding your songs: go to 🎼 Songs, add a song, then add its score PDFs and tracks.'),
      h('a', { class: 'btn primary', href: '#/songs' }, 'Go to Songs')) : null,
  ]);
}

function todoText(t, songs) {
  const s = songs.find((x) => x.id === t.songId);
  return `${s ? s.title + ': ' : ''}${t.text}`;
}

async function screenRehearsalNew() {
  const songs = (await db.getAll('songs')).sort((a, b) => a.title.localeCompare(b.title));
  const titleIn = h('input', { type: 'text', value: 'Sectional', class: 'grow', 'aria-label': 'Rehearsal name' });
  const dateIn = h('input', { type: 'date', value: todayISO(), 'aria-label': 'Date' });
  const chosen = new Set();
  const songList = h('div', { class: 'list' }, songs.map((s) => {
    const cb = h('input', { type: 'checkbox', onchange: () => (cb.checked ? chosen.add(s.id) : chosen.delete(s.id)) });
    return h('label', { class: 'list-item check' }, cb, h('span', { class: 'item-title' }, s.title));
  }));

  setScreen('New rehearsal', [
    h('div', { class: 'card' },
      h('h2', {}, 'Which section?'),
      h('div', { class: 'row wrap' }, ['Soprano', 'Alto', 'Tenor', 'Bass'].map((v) =>
        h('button', { class: 'chip', onclick: () => { titleIn.value = `${v} sectional`; } }, v))),
      h('div', { class: 'row' }, titleIn, dateIn)),
    h('div', { class: 'card' }, h('h2', {}, 'Which songs?'), songList),
    h('button', { class: 'btn primary big wide', onclick: async () => {
      if (!chosen.size) { toast('Tick at least one song'); return; }
      const r = {
        id: db.uid(), title: titleIn.value.trim() || 'Sectional', date: dateIn.value || todayISO(),
        songIds: songs.filter((s) => chosen.has(s.id)).map((s) => s.id),
        notes: [], covered: {}, log: [], status: 'open', createdAt: Date.now(),
      };
      await db.put('rehearsals', r);
      location.hash = `#/rehearsal/${r.id}`;
    } }, 'Start rehearsal'),
  ], { back: '#/' });
}

// ---------------------------------------------------------------- Rehearsal

const HELP = [
  'Tap 🎤 and say what you want to hear, or type it and tap Go. For example:',
  '• alto bar 32',
  '• full mix letter B',
  '• soprano 1 bars 10-24 (stops after bar 24)',
  '• B to C',
  '• river tenor from the top (another song: start with part of its title)',
  '• stop · again · back 10 · forward 5',
  '• note: altos flat at C',
  '• fix: tuning in bar 40 (adds to "Fix next time")',
].join('\n');

async function screenRehearsal(id, tab = 'play') {
  const r = await db.get('rehearsals', id);
  if (!r) { location.hash = '#/'; return; }
  const songs = await db.songsWithTracks(r.songIds);
  r.currentSongId = r.currentSongId && songs.some((s) => s.id === r.currentSongId) ? r.currentSongId : songs[0]?.id;
  const save = () => db.put('rehearsals', r);
  const curSong = () => songs.find((s) => s.id === r.currentSongId);

  // Load every track into memory so commands start instantly.
  let ready = false;
  const loading = Promise.all(songs.flatMap((s) => s.tracks.map((t) => player.prepare(t)))).then(() => { ready = true; });

  // ---- command handling (shared with the score viewer)
  const logEl = h('div', { class: 'chat' });
  function addLog(who, text) {
    r.log.push({ who, text, at: Date.now() });
    if (r.log.length > 300) r.log = r.log.slice(-300);
    renderLog();
  }
  function renderLog() {
    const items = r.log.slice(-60);
    fill(logEl, ...(items.length ? items.map((e) => h('div', { class: `bubble ${e.who}` }, e.text))
      : [h('div', { class: 'bubble app' }, HELP)]));
    logEl.scrollTop = logEl.scrollHeight;
  }

  function runCommand(text) {
    text = text.trim();
    if (!text) return;
    const cur = player.state.track;
    // The highlighted song wins; keep the playing track only if it belongs to that song.
    const ctx = { songs, current: { songId: r.currentSongId, trackId: cur?.songId === r.currentSongId ? cur.id : null } };
    const a = parseCommand(text, ctx);
    addLog('you', text);
    switch (a.type) {
      case 'play': {
        const song = songs.find((s) => s.id === a.songId);
        const track = song.tracks.find((t) => t.id === a.trackId);
        if (!player.isPrepared(track)) {
          addLog('app', 'Still loading the tracks. Try again in a moment.');
          loading.then(() => addLog('app', 'Tracks ready.'));
          break;
        }
        player.playFrom(track, a.start, a.end, song.title);
        if (r.currentSongId !== song.id) { r.currentSongId = song.id; renderSongBar(); }
        addLog('app', a.reply);
        break;
      }
      case 'pause': player.pause(); addLog('app', 'Stopped.'); break;
      case 'resume':
        if (player.state.track) { player.resume(); addLog('app', 'Playing.'); } else addLog('app', 'Nothing to play yet. Try "alto bar 1".');
        break;
      case 'again': addLog('app', player.again() ? 'Again from the same place.' : 'Nothing played yet.'); break;
      case 'seek': player.seekBy(a.by); addLog('app', `${a.by < 0 ? 'Back' : 'Forward'} ${Math.abs(a.by)} seconds.`); break;
      case 'note': addNote(a.text); addLog('app', 'Note saved.'); break;
      case 'todo': addTodo(a.text); addLog('app', 'Added to "Fix next time".'); break;
      case 'help': addLog('app', HELP); break;
      case 'error': addLog('app', a.reply); break;
      default: break;
    }
    save();
  }

  function commandBox(compact = false) {
    const input = h('input', {
      type: 'text', class: 'grow cmd', placeholder: compact ? 'e.g. alto letter B' : 'Type e.g. "alto bar 32" or "stop"',
      autocapitalize: 'none', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Command',
    });
    const go = () => {
      const v = input.value;
      input.value = '';
      runCommand(v);
      if (compact) { toast(r.log[r.log.length - 1]?.text || ''); input.blur(); }
    };
    const mic = h('button', { class: 'btn icon mic', type: 'button', 'aria-label': 'Speak a command', onclick: async () => {
      if (isListening()) { stopListening(); return; }
      if (!voiceSupported) {
        // No built-in recognition here: use the keyboard's dictation key instead.
        input.focus();
        toast('Tap the 🎤 on the keyboard and speak, then tap Go');
        return;
      }
      player.unlock();
      const wasPlaying = player.state.playing;
      if (wasPlaying) player.pause(); // so the mic hears you, not the track
      mic.classList.add('listening');
      input.value = '';
      input.placeholder = 'Listening… say e.g. "alto bar 32"';
      try {
        const heard = await listen({ onInterim: (t) => { input.value = t; } });
        if (heard) { input.value = heard; go(); }
        else if (wasPlaying) player.resume();
      } catch (e) {
        const msg = /not-allowed|service-not-allowed/.test(e.message)
          ? 'Microphone not allowed. Use the 🎤 on the keyboard instead, or allow the microphone in Settings.'
          : 'Sorry, I didn\'t catch that. Try again, or type it.';
        toast(msg);
      } finally {
        mic.classList.remove('listening');
        input.placeholder = placeholder;
      }
    } }, '🎤');
    const placeholder = input.placeholder;
    const form = h('form', { class: 'row cmd-row', onsubmit: (e) => { e.preventDefault(); go(); } },
      mic, input, h('button', { class: 'btn primary', type: 'submit' }, 'Go'),
      h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Stop', onclick: () => runCommand('stop') }, '⏹'));
    return form;
  }

  // ---- notes / todos
  function addNote(text) {
    r.notes.push({ id: db.uid(), at: Date.now(), text, songId: r.currentSongId || null });
    save();
    if (tab === 'notes') renderTab();
  }
  async function addTodo(text, songId = r.currentSongId) {
    await db.put('todos', { id: db.uid(), text, songId: songId || null, done: false, createdIn: r.id, createdAt: Date.now() });
    if (tab === 'todo') renderTab();
  }

  // ---- song bar
  const songBar = h('div', { class: 'song-bar' });
  function renderSongBar() {
    const s = curSong();
    fill(songBar, 
      h('div', { class: 'row wrap' }, songs.map((x) => h('button', {
        class: `chip ${x.id === r.currentSongId ? 'on' : ''}`,
        onclick: () => { r.currentSongId = x.id; save(); renderSongBar(); if (tab === 'play') renderSuggestions(); },
      }, x.title))),
      s ? h('div', { class: 'row wrap' },
        s.scores.length
          ? s.scores.map((sc) => h('button', { class: 'btn', onclick: () => openScore(sc, { commandBox: commandBox(true) }) }, `📖 ${sc.name}`))
          : h('span', { class: 'muted' }, 'No score PDF for this song yet.'))
        : null,
    );
  }

  // ---- tabs
  const tabBody = h('div', { class: 'tab-body' });
  const tabs = [['play', '▶ Play'], ['notes', '📝 Notes'], ['covered', '✓ Covered'], ['todo', '🔧 Fix next time']];
  const tabBar = h('div', { class: 'seg' }, tabs.map(([k, label]) =>
    h('button', { class: `seg-btn ${k === tab ? 'on' : ''}`, 'data-tab': k, onclick: () => { tab = k; renderTab(); } }, label)));

  const sugEl = h('div', { class: 'row wrap suggestions' });
  function renderSuggestions() {
    const s = curSong();
    const curTrack = s?.tracks.find((t) => t.id === player.state.track?.id);
    fill(sugEl, ...suggestionsFor(s, curTrack).map((x) =>
      h('button', { class: 'chip', onclick: () => runCommand(x.command) }, x.label)));
  }

  async function renderTab() {
    tabBar.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'play') {
      renderLog();
      renderSuggestions();
      fill(tabBody, logEl, sugEl, commandBox());
      logEl.scrollTop = logEl.scrollHeight;
    } else if (tab === 'notes') {
      const ta = h('textarea', { rows: 3, placeholder: 'Type a note, e.g. "Altos rushing at letter C. Breathe after bar 24."' });
      const list = [...r.notes].sort((a, b) => b.at - a.at);
      fill(tabBody, 
        h('div', { class: 'card' }, ta,
          h('div', { class: 'row space' }, h('span', { class: 'muted' }, `For: ${curSong()?.title || 'general'}`),
            h('button', { class: 'btn primary', onclick: () => { if (ta.value.trim()) { addNote(ta.value.trim()); ta.value = ''; renderTab(); } } }, '+ Add note'))),
        list.length ? h('div', { class: 'list' }, list.map((n) => h('div', { class: 'list-item note' },
          h('div', { class: 'grow' },
            h('div', { class: 'muted small' }, `${timeOfDay(n.at)}${n.songId ? ' · ' + (songs.find((s) => s.id === n.songId)?.title || '') : ''}`),
            h('div', {}, n.text)),
          h('button', { class: 'btn icon danger', 'aria-label': 'Delete note', onclick: () => {
            if (!confirm('Delete this note?')) return;
            r.notes = r.notes.filter((x) => x.id !== n.id); save(); renderTab();
          } }, '✕'))))
          : h('p', { class: 'muted center' }, 'No notes yet.'));
    } else if (tab === 'covered') {
      fill(tabBody, ...songs.map((s) => {
        const c = r.covered[s.id] || (r.covered[s.id] = { letters: [], text: '' });
        const letters = [...new Set(s.tracks.flatMap((t) => lettersIn(t.marks || [])))].sort();
        const textIn = h('input', { type: 'text', class: 'grow', value: c.text, placeholder: 'Bars or sections, e.g. bars 1–24, ending' });
        textIn.addEventListener('change', () => { c.text = textIn.value.trim(); save(); });
        return h('div', { class: 'card' },
          h('h2', {}, s.title),
          letters.length ? h('div', { class: 'row wrap' }, h('span', { class: 'muted' }, 'Letters:'), letters.map((L) => {
            const b = h('button', { class: `chip ${c.letters.includes(L) ? 'on' : ''}`, onclick: () => {
              c.letters = c.letters.includes(L) ? c.letters.filter((x) => x !== L) : [...c.letters, L].sort();
              b.classList.toggle('on'); save();
            } }, L);
            return b;
          })) : h('p', { class: 'muted small' }, 'Tip: add letters to this song\'s timestamps to tick them off here.'),
          h('div', { class: 'row' }, textIn),
          h('label', { class: 'row check' }, h('input', { type: 'checkbox', checked: c.whole, onchange: (e) => { c.whole = e.target.checked; save(); } }), 'Sang the whole song'));
      }));
    } else if (tab === 'todo') {
      const all = await db.getAll('todos');
      const allSongs = await db.getAll('songs');
      const relevant = all.filter((t) => !t.songId || r.songIds.includes(t.songId));
      const open = relevant.filter((t) => !t.done);
      const fixedHere = relevant.filter((t) => t.done && t.doneIn === r.id);
      const input = h('input', { type: 'text', class: 'grow', placeholder: 'Something to work on next time' });
      const sel = h('select', {}, h('option', { value: '' }, 'General'),
        songs.map((s) => h('option', { value: s.id, selected: s.id === r.currentSongId }, s.title)));
      const row = (t) => h('label', { class: `list-item check ${t.done ? 'done' : ''}` },
        h('input', { type: 'checkbox', checked: t.done, onchange: async (e) => {
          t.done = e.target.checked; t.doneIn = t.done ? r.id : null; await db.put('todos', t); renderTab();
        } }),
        h('div', { class: 'grow' }, todoText(t, allSongs),
          t.createdIn !== r.id ? h('div', { class: 'muted small' }, 'From an earlier rehearsal') : null),
        h('button', { class: 'btn icon danger', type: 'button', 'aria-label': 'Delete', onclick: async (e) => {
          e.preventDefault(); if (!confirm('Delete this item?')) return; await db.del('todos', t.id); renderTab();
        } }, '✕'));
      fill(tabBody, 
        h('div', { class: 'card' }, h('div', { class: 'row wrap' }, input, sel,
          h('button', { class: 'btn primary', onclick: async () => {
            if (!input.value.trim()) return; await addTodo(input.value.trim(), sel.value || null); renderTab();
          } }, '+ Add'))),
        h('p', { class: 'muted' }, 'Tick an item when it has been fixed today. Unticked items carry over to the next rehearsal.'),
        open.length ? h('div', { class: 'list' }, open.map(row)) : h('p', { class: 'muted center' }, 'Nothing waiting. 🎉'),
        fixedHere.length ? h('h2', {}, 'Fixed today') : null,
        fixedHere.length ? h('div', { class: 'list' }, fixedHere.map(row)) : null);
    }
  }

  const offPlayer = player.onChange(() => { if (tab === 'play') renderSuggestionsThrottled(); });
  let lastTrack = null;
  function renderSuggestionsThrottled() {
    if (player.state.track?.id !== lastTrack) { lastTrack = player.state.track?.id; renderSuggestions(); }
  }
  onLeave(offPlayer);

  renderSongBar();
  setScreen(r.title, [
    h('div', { class: 'row space' },
      h('div', { class: 'muted' }, fmtDate(r.date)),
      h('a', { class: 'btn primary', href: `#/summary/${r.id}` }, r.status === 'done' ? 'Summary' : 'Finish & share')),
    songBar,
    tabBar,
    tabBody,
  ], { back: '#/' });
  renderTab();
}

// ---------------------------------------------------------------- Summary

async function buildSummary(r) {
  const songs = await db.songsWithTracks(r.songIds);
  const allSongs = await db.getAll('songs');
  const todos = await db.getAll('todos');
  const lines = [`${r.title} – ${fmtDate(r.date)}`, ''];
  lines.push(`Songs: ${songs.map((s) => s.title).join(', ')}`, '');

  const cov = songs.map((s) => {
    const c = r.covered?.[s.id];
    if (!c) return null;
    const bits = [];
    if (c.whole) bits.push('whole song');
    if (c.letters?.length) bits.push(`letters ${c.letters.join(', ')}`);
    if (c.text) bits.push(c.text);
    return bits.length ? `• ${s.title}: ${bits.join('; ')}` : null;
  }).filter(Boolean);
  if (cov.length) lines.push('What we covered:', ...cov, '');

  if (r.notes?.length) {
    lines.push('Notes:');
    for (const n of [...r.notes].sort((a, b) => a.at - b.at)) {
      const s = allSongs.find((x) => x.id === n.songId);
      lines.push(`• ${s ? s.title + ': ' : ''}${n.text}`);
    }
    lines.push('');
  }
  const fixed = todos.filter((t) => t.done && t.doneIn === r.id);
  if (fixed.length) lines.push('Fixed today:', ...fixed.map((t) => `• ${todoText(t, allSongs)}`), '');
  const open = todos.filter((t) => !t.done && (!t.songId || r.songIds.includes(t.songId)));
  if (open.length) lines.push('To work on next time:', ...open.map((t) => `• ${todoText(t, allSongs)}`), '');
  return lines.join('\n').trim();
}

async function screenSummary(id) {
  const r = await db.get('rehearsals', id);
  if (!r) { location.hash = '#/'; return; }
  if (r.status !== 'done') { r.status = 'done'; r.finishedAt = Date.now(); await db.put('rehearsals', r); }
  const text = await buildSummary(r);
  const ta = h('textarea', { rows: 16, class: 'summary', 'aria-label': 'Summary text' }, text);
  ta.value = text;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `${r.title} – ${fmtDate(r.date)}`, text: ta.value }); } catch { /* cancelled */ }
    } else copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(ta.value); toast('Copied. Paste it into an email or message.'); }
    catch { ta.select(); document.execCommand('copy'); toast('Copied'); }
  };

  setScreen('Summary', [
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'You can edit the text before sharing.'),
      ta,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary big', onclick: share }, '📤 Share'),
        h('button', { class: 'btn big', onclick: copy }, '📋 Copy'),
        h('a', { class: 'btn big', href: `mailto:?subject=${encodeURIComponent(`${r.title} – ${fmtDate(r.date)}`)}&body=${encodeURIComponent(text)}` }, '✉️ Email'))),
    h('div', { class: 'row space' },
      h('button', { class: 'btn', onclick: async () => { r.status = 'open'; await db.put('rehearsals', r); location.hash = `#/rehearsal/${r.id}`; } }, '↩ Back into rehearsal'),
      h('a', { class: 'btn', href: '#/' }, 'Done')),
  ], { back: '#/history' });
}

// ---------------------------------------------------------------- History

async function screenHistory() {
  const list = (await db.getAll('rehearsals')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const songs = await db.getAll('songs');
  setScreen('Past rehearsals', list.length
    ? h('div', { class: 'list' }, list.map((r) => h('div', { class: 'list-item' },
        h('a', { class: 'grow link-block', href: r.status === 'done' ? `#/summary/${r.id}` : `#/rehearsal/${r.id}` },
          h('div', { class: 'item-title' }, `${r.title}${r.status !== 'done' ? ' (in progress)' : ''}`),
          h('div', { class: 'muted' }, `${fmtDate(r.date)} · ${r.songIds.map((id) => songs.find((s) => s.id === id)?.title).filter(Boolean).join(', ')}`)),
        h('button', { class: 'btn icon danger', 'aria-label': 'Delete rehearsal', onclick: async () => {
          if (!confirm(`Delete "${r.title}" (${fmtDate(r.date)}) and its notes?`)) return;
          await db.del('rehearsals', r.id); screenHistory();
        } }, '🗑'))))
    : h('p', { class: 'muted center' }, 'No rehearsals yet.'));
}

// ---------------------------------------------------------------- More (help, backup)

async function screenMore() {
  let usage = '';
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    usage = `Using ${(e.usage / 1e6).toFixed(0)} MB on this iPad.`;
  }
  const saveBackup = async (includeFiles) => {
    toast('Preparing backup…');
    const blob = await db.exportAll({ includeFiles });
    const name = `sectional-backup-${todayISO()}${includeFiles ? '' : '-notes'}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch { /* fall through to download */ }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
  };
  const restore = async ([file]) => {
    if (!file) return;
    if (!confirm('Restore this backup? Items with the same name will be replaced.')) return;
    try {
      const res = await db.importAll(file);
      toast(`Restored ${res.songs} songs and ${res.rehearsals} rehearsals`);
      if (res.skipped) alert(`${res.skipped} score/track entries were skipped because their files are not on this iPad. Use an "everything" backup to copy files.`);
    } catch (e) { alert(`Could not restore: ${e.message}`); }
  };

  setScreen('Help & backup', [
    h('div', { class: 'card' },
      h('h2', {}, 'Put this app on your home screen'),
      h('ol', {},
        h('li', {}, 'Open this page in Safari.'),
        h('li', {}, 'Tap the Share button (square with an arrow).'),
        h('li', {}, 'Tap "Add to Home Screen", then "Add".'),
        h('li', {}, 'Open Sectional from your home screen. It works without internet.'))),
    h('div', { class: 'card' },
      h('h2', {}, 'Playing tracks by typing'),
      h('pre', { class: 'help' }, HELP)),
    h('div', { class: 'card' },
      h('h2', {}, 'Back up'),
      h('p', {}, 'Everything is kept only on this iPad. Save a backup now and then, e.g. to Files or iCloud Drive.'),
      h('p', { class: 'muted' }, usage),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => saveBackup(true) }, '💾 Back up everything'),
        h('button', { class: 'btn', onclick: () => saveBackup(false) }, '💾 Notes & timestamps only')),
      h('p', { class: 'muted small' }, '"Everything" includes the scores and tracks, so the file can be large. Use it to copy your setup to another iPad.'),
      h('div', { class: 'row' }, fileButton('⤒ Restore a backup', 'application/json,.json', false, restore))),
  ]);
}

// ---------------------------------------------------------------- router

const routes = [
  [/^#\/?$/, screenRehearsalHome, 'rehearsal'],
  [/^#\/rehearsal-new$/, screenRehearsalNew, 'rehearsal'],
  [/^#\/rehearsal\/([\w]+)$/, screenRehearsal, 'rehearsal'],
  [/^#\/summary\/([\w]+)$/, screenSummary, 'history'],
  [/^#\/songs$/, screenSongs, 'songs'],
  [/^#\/song\/([\w]+)$/, screenSong, 'songs'],
  [/^#\/marks\/([\w]+)$/, screenMarks, 'songs'],
  [/^#\/history$/, screenHistory, 'history'],
  [/^#\/more$/, screenMore, 'more'],
];

async function route() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  document.querySelector('.overlay')?.remove();
  document.body.classList.remove('viewing');
  const hash = location.hash || '#/';
  for (const [re, fn, tab] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    try { await fn(...m.slice(1)); } catch (e) {
      console.error(e);
      setScreen('Something went wrong', h('p', { class: 'error' }, e.message || String(e)), { back: '#/' });
    }
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
setupMini();
route();

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
