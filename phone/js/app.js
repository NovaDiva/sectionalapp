// Sectional Practice: the phone version of Sectional (fewer features, Carol 17 Nov 2026).
// Play part tracks, start from the top / a letter / a bar, Stop / Again / Back 5s, slow down,
// starting notes + a one-octave keyboard, my parts, backup. Times for letters and bars come from
// the times printed on a "with timestamps" score PDF (the score itself is not shown).
// Reuses the iPad app's tested modules: player.js (copied unchanged), and ../../js/ for
// timestamps, pitch, parts, commands and scoretimes.

import * as db from './db.js';
import * as player from './player.js';
import { canonicalVoice } from '../../js/commands.js';
import { noteName, isBlack, LOWEST, HIGHEST } from './pitch.js';
import { choirParts, setChoirParts, myParts, setMyParts, guessPart, partOf, visibleTracks } from '../../js/parts.js';
import { formatTime, lettersIn, findLetter, timeForBar } from './timestamps.js';

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
function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }

const main = () => document.getElementById('main');
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }

function setScreen(title, nodes, { back, screen = '' } = {}) {
  document.getElementById('title').textContent = title;
  const backBtn = document.getElementById('back');
  backBtn.hidden = !back;
  backBtn.onclick = () => { location.hash = back; };
  document.body.dataset.screen = screen;
  fill(main(), nodes);
  main().scrollTop = 0;
  renderMini();
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  });
}

function guessTrackName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const part = guessPart(base);
  if (part) return part;
  const ws = base.toLowerCase().replace(/[_\-.]+/g, ' ').split(/\s+/);
  const nice = { soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor', bass: 'Bass', full: 'Full mix', piano: 'Piano only' };
  for (let i = 0; i < ws.length; i++) {
    const v = canonicalVoice(ws[i]);
    if (v) return nice[v] + (/^\d$/.test(ws[i + 1] || '') ? ` ${ws[i + 1]}` : '');
  }
  return base.replace(/[_]+/g, ' ');
}

function partsText(list) { return list && list.length ? list.join(', ') : 'all parts'; }

// Big buttons to choose "my parts". Calls onSave(list).
function partsPicker(onSave, { saveLabel = 'Save', skip = false } = {}) {
  const chosen = new Set(myParts() || []);
  const btns = choirParts().map((p) => {
    const b = h('button', { class: `track-btn ${chosen.has(p) ? 'on' : ''}`, onclick: () => {
      chosen.has(p) ? chosen.delete(p) : chosen.add(p);
      b.classList.toggle('on', chosen.has(p));
    } }, p);
    return b;
  });
  return h('div', {},
    h('div', { class: 'track-row parts-grid' }, btns),
    h('div', { class: 'row wrap', style: 'margin-top:12px' },
      h('button', { class: 'btn primary big', onclick: () => {
        const list = choirParts().filter((p) => chosen.has(p));
        setMyParts(list);
        onSave(list);
      } }, saveLabel),
      skip ? h('button', { class: 'btn big', onclick: () => { setMyParts([]); onSave([]); } }, 'Show all parts') : null));
}

// ---------------------------------------------------------------- times printed on a score

// Read the times printed on the song's score PDF(s) for each track. Only tracks without
// times are filled, unless `replace`. Returns a list of plain-words results.
async function readTimes(songId, tracks, { replace = false } = {}) {
  const items = await db.itemsForSong(songId);
  const scores = items.filter((i) => i.kind === 'score');
  const want = tracks.filter((t) => replace || !(t.marks || []).length);
  if (!scores.length || !want.length) return [];
  const { readScoreTimes, partTag } = await import('../../js/scoretimes.js');
  const lines = [];
  for (const track of want) {
    const part = partOf(track);
    let found = [];
    for (const sc of scores) {
      try { found = await readScoreTimes(await db.getBlob(sc.blobId), { tag: part ? partTag(part) : '' }); } catch { found = []; }
      if (found.length) break;
    }
    if (!found.length) { lines.push({ ok: false, text: `${track.name}: no times found on the score.` }); continue; }
    const fresh = (await db.get('items', track.id)) || track;
    fresh.marks = found.map(({ t, bar, letter, label }) => ({ t, bar, letter, label }));
    await db.put('items', fresh);
    track.marks = fresh.marks;
    const letters = lettersIn(found);
    const which = found.usedTag ? `${part} times` : (part ? 'full-mix times (may be a little early or late on this part)' : '');
    lines.push({ ok: true, text: `${track.name}: ${letters.length ? `letters ${letters.join(', ')}` : `${found.length} times`}${which ? ` · ${which}` : ''}.` });
  }
  return lines;
}

async function showTimesResult(lines) {
  if (!lines.length) return;
  const anyOk = lines.some((l) => l.ok);
  await modal(anyOk ? '📄 Times read from the score' : 'No times on this score', h('div', {},
    h('ul', { class: 'plain' }, lines.map((l) => h('li', {}, l.text))),
    h('p', { class: 'muted small' }, anyOk
      ? 'You can now start from a letter or a bar number.'
      : 'Only scores with track times printed on them (the "with timestamps" PDFs) can be read. Tracks still play from the top.')),
  [{ label: 'OK', cls: 'btn primary', value: () => true }]);
}

// ---------------------------------------------------------------- speed buttons

function speedButtons() {
  const btns = player.SPEEDS.map((r) => h('button', {
    class: `speed-btn ${player.getSpeed() === r ? 'on' : ''}`, 'data-rate': r, type: 'button',
    'aria-label': r === 1 ? 'Normal speed' : `${Math.round(r * 100)} percent speed`,
    onclick: () => { player.setSpeed(r); toast(r === 1 ? 'Normal speed' : `Playing at ${player.speedLabel(r)}`); },
  }, player.speedLabel(r)));
  onLeave(player.onChange(() => btns.forEach((b) => b.classList.toggle('on', Number(b.dataset.rate) === player.getSpeed()))));
  return h('div', { class: 'speed-row phone-speed' }, btns);
}

// ---------------------------------------------------------------- piano keyboard (one octave)

// C to C (13 keys), with buttons to move down or up an octave. Remembered on this phone.
function pianoKeyboard({ onKey, selected = null } = {}) {
  const SPAN = 12;
  const maxLow = HIGHEST - SPAN;
  let low = Number(localStorage.getItem('phoneKbLow')) || 60; // C4 to C5
  if (selected != null && (selected < low || selected > low + SPAN)) low = Math.floor(selected / 12) * 12;
  low = Math.max(LOWEST, Math.min(maxLow, low));
  let chosen = selected;
  const range = h('span', { class: 'kb-range' });
  const keys = h('div', { class: 'kb-keys' });
  const downBtn = h('button', { class: 'btn kb-shift', type: 'button', 'aria-label': 'Lower octave', onclick: () => shift(-1) }, '◀ Lower');
  const upBtn = h('button', { class: 'btn kb-shift', type: 'button', 'aria-label': 'Higher octave', onclick: () => shift(1) }, 'Higher ▶');
  function shift(d) {
    low = Math.max(LOWEST, Math.min(maxLow, low + 12 * d));
    try { localStorage.setItem('phoneKbLow', String(low)); } catch { /* private mode */ }
    render();
  }
  function press(midi, key) {
    chosen = midi;
    keys.querySelectorAll('.key').forEach((k) => k.classList.toggle('chosen', selected !== null && Number(k.dataset.midi) === midi));
    key.classList.add('sounding');
    clearTimeout(key.timer);
    key.timer = setTimeout(() => key.classList.remove('sounding'), 2000);
    onKey?.(midi);
  }
  function render() {
    range.textContent = `${noteName(low)} – ${noteName(low + SPAN)}`;
    downBtn.disabled = low <= LOWEST;
    upBtn.disabled = low >= maxLow;
    const whites = [];
    for (let m = low; m <= low + SPAN; m++) if (!isBlack(m)) whites.push(m);
    const w = 100 / whites.length;
    const mk = (m, cls, style, label) => {
      const k = h('button', { class: `key ${cls} ${m === chosen && selected !== null ? 'chosen' : ''}`, type: 'button', style,
        'data-midi': m, 'aria-label': noteName(m) + (m === 60 ? ' (middle C)' : ''), onclick: () => press(m, k) }, label);
      return k;
    };
    fill(keys,
      whites.map((m) => mk(m, `white ${m === 60 ? 'middle-c' : ''}`, '',
        h('span', { class: 'key-label' }, m % 12 === 0 ? noteName(m) : noteName(m).replace(/\d+$/, '')))),
      whites.map((m, i) => (isBlack(m + 1) && m + 1 <= low + SPAN
        ? mk(m + 1, 'black', `left:${(i + 1) * w - w * 0.3}%;width:${w * 0.6}%`, h('span', { class: 'key-label' }, noteName(m + 1).replace(/\d+$/, '')))
        : null)));
  }
  render();
  return h('div', { class: 'piano' },
    h('div', { class: 'kb-bar' }, downBtn, range, upBtn),
    keys,
    h('div', { class: 'muted small kb-foot' }, 'Middle C has a dot.'));
}

// ---------------------------------------------------------------- mini player (other screens)

function renderMini() {
  const bar = document.getElementById('mini');
  const s = player.state;
  // The song screen has its own big buttons, so the mini player only shows elsewhere.
  bar.hidden = !s.track || document.body.dataset.screen === 'play';
  if (bar.hidden) return;
  bar.querySelector('.mini-name').textContent = player.describe();
  bar.querySelector('.mini-time').textContent = player.timeText();
  bar.querySelector('.mini-toggle').textContent = s.playing ? '⏸' : '▶';
  bar.querySelector('.mini-toggle').setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
  bar.querySelector('.mini-link').href = `#/song/${s.track.songId}`;
  const pct = s.duration ? (s.time / s.duration) * 100 : 0;
  bar.querySelector('.mini-progress').style.width = `${pct}%`;
}
function setupMini() {
  const bar = document.getElementById('mini');
  bar.querySelector('.mini-toggle').onclick = () => player.toggle();
  bar.querySelector('.mini-stop').onclick = () => player.stop();
  player.onChange(renderMini);
}

// ---------------------------------------------------------------- Songs (home)

async function screenSongs() {
  const songs = (await db.getAll('songs')).sort((a, b) => a.title.localeCompare(b.title));
  const items = await db.getAll('items');
  const input = h('input', { type: 'text', placeholder: 'Song title', 'aria-label': 'New song title', class: 'grow' });
  const add = async () => {
    const title = input.value.trim();
    if (!title) { input.focus(); toast('Type the song title first'); return; }
    const song = await db.put('songs', { id: db.uid(), title, createdAt: Date.now() });
    location.hash = `#/setup/${song.id}`;
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  setScreen('Sectional Practice', [
    myParts() === null ? h('div', { class: 'card setup' },
      h('h2', {}, '👋 Which part do you sing?'),
      h('p', {}, 'Tap your part (or parts), then Save. The app will show your tracks, plus tracks for everyone like the full mix. You can change this any time in ❔ Help.'),
      partsPicker(() => { toast('Saved'); screenSongs(); }, { skip: true })) : null,
    songs.length
      ? h('div', { class: 'list' }, songs.map((s) => {
          const tracks = items.filter((i) => i.songId === s.id && i.kind === 'track');
          const mine = visibleTracks(tracks);
          const letters = lettersIn(mine.flatMap((t) => t.marks || []));
          return h('a', { class: 'list-item song-item', href: `#/song/${s.id}` },
            h('div', { class: 'song-icon' }, '▶'),
            h('div', { class: 'grow' },
              h('div', { class: 'item-title' }, s.title),
              h('div', { class: 'muted small' }, tracks.length
                ? `${mine.length} track${mine.length === 1 ? '' : 's'}${letters.length ? ` · letters ${letters[0]}–${letters[letters.length - 1]}` : ''}`
                : 'No tracks yet')),
            h('span', { class: 'chev' }, '›'));
        }))
      : h('div', { class: 'card' },
          h('h2', {}, 'Welcome!'),
          h('p', {}, 'Add your first song: type its title below and tap + Add. Then add its tracks (MP3s).')),
    h('div', { class: 'card' },
      h('h2', {}, 'Add a song'),
      h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: add }, '+ Add'))),
  ], { screen: 'songs' });
}

// ---------------------------------------------------------------- Song: practise

let showAllParts = false;
async function screenPlay(id) {
  const song = await db.get('songs', id);
  if (!song) { location.hash = '#/'; return; }
  const items = await db.itemsForSong(id);
  const allTracks = db.sortByName(items.filter((i) => i.kind === 'track'));
  const tracks = showAllParts ? allTracks : visibleTracks(allTracks);
  const hiddenCount = allTracks.length - visibleTracks(allTracks).length;
  const hasScore = items.some((i) => i.kind === 'score');
  const refresh = () => { cleanup.forEach((fn) => fn()); cleanup = []; screenPlay(id); };

  if (!allTracks.length) {
    setScreen(song.title, [
      h('div', { class: 'card' },
        h('h2', {}, 'No tracks yet'),
        h('p', {}, 'Add this song\'s tracks (MP3s) first: the full mix and your part.'),
        h('a', { class: 'btn primary big wide', href: `#/setup/${id}` }, '⚙ Add tracks')),
    ], { back: '#/', screen: 'play' });
    return;
  }

  // Load the tracks into memory so a tap starts them straight away (iPhone rule: audio starts from a tap).
  Promise.all(tracks.map((t) => player.prepare(t)));

  const chosen = () => tracks.find((t) => t.id === song.trackId)
    || tracks.find((t) => /full|all|mix|tutti/i.test(t.name)) || tracks[0];

  function play(start, desc) {
    const t = chosen();
    if (!t) { toast('No track for your part. Tap "Show other parts".'); return; }
    if (!player.isPrepared(t)) { toast('Still loading the tracks. Try again in a moment.'); return; }
    player.playFrom(t, start, null, song.title);
    toast(`${t.name} ${desc}`);
  }

  // ---- tracks
  const trackRow = h('div', { class: 'track-row phone-tracks' });
  const renderTracks = () => {
    const cur = chosen();
    fill(trackRow, tracks.length
      ? tracks.map((t) => h('button', {
          class: `track-btn ${t.id === cur?.id ? 'on' : ''}`, 'aria-pressed': t.id === cur?.id ? 'true' : 'false',
          onclick: async () => {
            song.trackId = t.id;
            await db.put('songs', song);
            renderTracks(); renderStarts();
            // Switching track while playing carries on from the same place in the new track.
            if (player.state.playing && player.state.track?.songId === song.id && player.state.track.id !== t.id && player.isPrepared(t)) {
              const again = player.state.lastStart; // "Again" still goes back to where you started
              player.playFrom(t, player.state.time, null, song.title);
              player.state.lastStart = again;
            }
            toast(`${t.name} chosen`);
          },
        }, t.name))
      : h('span', { class: 'muted' }, 'No tracks for your part. Tap "Show other parts" below.'));
  };

  // ---- start from
  const startRow = h('div', { class: 'start-row' });
  const renderStarts = () => {
    const track = chosen();
    const marks = track?.marks || [];
    const letters = lettersIn(marks);
    const hasBars = marks.some((m) => m.bar != null && m.bar !== '');
    const barIn = h('input', { type: 'text', inputmode: 'numeric', class: 'bar-box', placeholder: 'Bar', 'aria-label': 'Bar number' });
    const playBar = () => {
      const bar = parseInt(barIn.value, 10);
      if (!bar) { barIn.focus(); return; }
      const res = timeForBar(marks, bar);
      if (!res) { toast('No bar numbers for this track'); return; }
      barIn.value = ''; barIn.blur();
      play(res.t, `from bar ${bar}${res.approx ? ' (about)' : ''}`);
    };
    barIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') playBar(); });
    fill(startRow,
      h('button', { class: 'start-btn top-btn', onclick: () => play(0, 'from the top') }, '▶ From the top'),
      letters.map((L) => h('button', { class: 'start-btn letter', 'aria-label': `Letter ${L}`, onclick: () => {
        const m = findLetter(marks, L); play(m.t, `from letter ${L}`);
      } }, L)),
      hasBars ? h('span', { class: 'bar-group' }, barIn, h('button', { class: 'start-btn', onclick: playBar }, '▶ Bar')) : null,
      track && !marks.length ? h('div', { class: 'hint' },
        hasScore
          ? h('div', {}, `${track.name} has no times yet. `, h('button', { class: 'link-btn', onclick: async () => {
              await showTimesResult(await readTimes(id, [track], { replace: true }));
              renderStarts();
            } }, '📄 Read them from the score'))
          : h('div', {}, 'Letters and bars need the score with times printed on it. Add it in ', h('a', { href: `#/setup/${id}` }, '⚙ Set up'), '.')) : null);
  };

  // ---- now playing + big controls
  const nowName = h('div', { class: 'now-name' });
  const nowTime = h('div', { class: 'now-time' });
  const nowBar = h('div', { class: 'mini-progress' });
  const toggleBtn = h('button', { class: 'big-ctl play-ctl', 'aria-label': 'Play', onclick: () => {
    const t = chosen();
    const s = player.state;
    if (s.track && s.track.songId === song.id && (s.track.id === t?.id || s.playing)) player.toggle();
    else play(0, 'from the top');
  } });
  const renderNow = () => {
    const s = player.state;
    const here = s.track && s.track.songId === song.id;
    nowName.textContent = here ? `${s.track.name}${player.getSpeed() !== 1 ? ` · ${player.speedLabel()}` : ''}` : 'Ready';
    nowTime.textContent = here ? player.timeText() : '';
    nowBar.style.width = here && s.duration ? `${(s.time / s.duration) * 100}%` : '0';
    fill(toggleBtn, h('span', { class: 'ctl-icon' }, here && s.playing ? '⏸' : '▶'), here && s.playing ? 'Pause' : 'Play');
    toggleBtn.setAttribute('aria-label', here && s.playing ? 'Pause' : 'Play');
  };
  onLeave(player.onChange(renderNow));

  const controls = h('div', { class: 'ctl-row phone-ctl' },
    h('button', { class: 'big-ctl', 'aria-label': 'Back 5 seconds', onclick: () => player.seekBy(-5) }, h('span', { class: 'ctl-icon' }, '⏪'), '5s'),
    toggleBtn,
    h('button', { class: 'big-ctl', 'aria-label': 'Play again from the same place', onclick: () => {
      if (!player.again()) play(0, 'from the top');
    } }, h('span', { class: 'ctl-icon' }, '↺'), 'Again'),
    h('button', { class: 'big-ctl stop', 'aria-label': 'Stop', onclick: () => player.stop() }, h('span', { class: 'ctl-icon' }, '⏹'), 'Stop'));

  // ---- starting notes + keyboard
  const saved = song.startNotes || {};
  const mine = myParts();
  const noteParts = choirParts().filter((p) => saved[p] != null && (showAllParts || !mine?.length || mine.includes(p)));
  const kbWrap = h('div', { class: 'kb-wrap', hidden: true }, pianoKeyboard({ onKey: (m) => player.playNote(m) }));
  const kbBtn = h('button', { class: 'start-btn kb-toggle', type: 'button', 'aria-expanded': 'false', onclick: () => {
    kbWrap.hidden = !kbWrap.hidden;
    kbBtn.classList.toggle('on', !kbWrap.hidden);
    kbBtn.setAttribute('aria-expanded', String(!kbWrap.hidden));
  } }, '🎹 Keyboard');

  renderTracks(); renderStarts(); renderNow();

  setScreen(song.title, [
    h('div', { class: 'play-cols' },
      h('div', { class: 'play-panel col-a' },
        h('div', { class: 'panel-label' }, 'Track'),
        trackRow,
        hiddenCount ? h('button', { class: 'link-btn', onclick: () => { showAllParts = !showAllParts; refresh(); } },
          showAllParts ? 'Only my parts' : `Show other parts (${hiddenCount})`) : null,
        h('div', { class: 'panel-label' }, 'Start from'),
        startRow),
      h('div', { class: 'play-panel col-b' },
        h('div', { class: 'now' }, h('div', { class: 'row space' }, nowName, nowTime), h('div', { class: 'mini-progress-wrap' }, nowBar)),
        controls,
        h('div', { class: 'panel-label' }, '🐢 Speed'),
        speedButtons(),
        h('div', { class: 'panel-label' }, '🎵 Starting note'),
        h('div', { class: 'start-row note-row' },
          noteParts.map((p) => h('button', { class: 'start-btn note-btn', 'aria-label': `Play ${p} starting note`,
            onclick: () => player.playNote(saved[p]) }, `▶ ${p}: ${noteName(saved[p])}`)),
          kbBtn),
        kbWrap)),
    h('a', { class: 'btn wide setup-link', href: `#/setup/${id}` }, '⚙ Set up this song (tracks, score, starting notes)'),
  ], { back: '#/', screen: 'play' });
}

// ---------------------------------------------------------------- Song: set up

async function screenSetup(id) {
  const song = await db.get('songs', id);
  if (!song) { location.hash = '#/'; return; }
  const items = await db.itemsForSong(id);
  const scores = db.sortByName(items.filter((i) => i.kind === 'score'));
  const tracks = db.sortByName(items.filter((i) => i.kind === 'track'));
  const refresh = () => { cleanup.forEach((fn) => fn()); cleanup = []; screenSetup(id); };

  const busy = (msg) => { toast(msg); document.body.classList.add('busy'); };
  const done = () => document.body.classList.remove('busy');

  const addTracks = async (files) => {
    const added = [];
    busy(files.length > 1 ? 'Adding tracks…' : 'Adding track…');
    try {
      for (const f of files) {
        if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|aac|aiff?|ogg)$/i.test(f.name)) { toast(`${f.name} is not an audio file`); continue; }
        const item = await db.addFile(id, 'track', f, guessTrackName(f.name));
        item.part = guessPart(item.name);
        await db.put('items', item);
        added.push(item);
      }
      if (added.length) toast(added.length > 1 ? `${added.length} tracks added` : 'Track added');
      if (scores.length && added.length) await showTimesResult(await readTimes(id, added));
    } finally { done(); }
    refresh();
  };
  const addScores = async (files) => {
    busy('Reading the score…');
    try {
      for (const f of files) {
        if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast(`${f.name} is not a PDF`); continue; }
        await db.addFile(id, 'score', f, f.name.replace(/\.pdf$/i, ''));
      }
      if (tracks.length) await showTimesResult(await readTimes(id, tracks));
      else toast('Score added. Its times are read when you add tracks.');
    } finally { done(); }
    refresh();
  };

  const rename = async (item) => {
    const name = prompt('New name:', item.name);
    if (!name || !name.trim()) return;
    const fresh = (await db.get('items', item.id)) || item;
    fresh.name = name.trim();
    await db.put('items', fresh);
    refresh();
  };
  const remove = async (item) => {
    if (!confirm(`Delete "${item.name}" from this phone?`)) return;
    player.forget(item);
    await db.deleteItem(item);
    refresh();
  };
  const partSelect = (t) => {
    const cur = partOf(t);
    const sel = h('select', { class: 'part-select', 'aria-label': `Part for ${t.name}`, onchange: async () => {
      const fresh = (await db.get('items', t.id)) || t;
      fresh.part = sel.value || null;
      await db.put('items', fresh);
      toast(sel.value ? `${t.name} is for ${sel.value}` : `${t.name} is for everyone`);
      refresh();
    } },
      h('option', { value: '', selected: cur == null }, 'For everyone (full mix, piano)'),
      choirParts().map((p) => h('option', { value: p, selected: cur === p }, `Part: ${p}`)));
    return sel;
  };
  const timesText = (t) => {
    const marks = t.marks || [];
    if (!marks.length) return 'No times yet: plays from the top';
    const letters = lettersIn(marks);
    return letters.length ? `Letters ${letters.join(', ')}` : `${marks.length} times`;
  };

  setScreen(song.title, [
    h('div', { class: 'card' },
      h('div', { class: 'row space' },
        h('h2', {}, '🎵 Tracks'),
        fileButton('+ Add tracks', 'audio/*,.mp3,.m4a,.wav', true, addTracks, 'btn primary')),
      tracks.length
        ? tracks.map((t) => h('div', { class: 'setup-row' },
            h('div', { class: 'item-title' }, t.name),
            partSelect(t),
            h('div', { class: 'muted small' }, timesText(t)),
            h('div', { class: 'row wrap' },
              scores.length ? h('button', { class: 'btn', onclick: async () => {
                if ((t.marks || []).length && !confirm(`Read the times for ${t.name} again from the score?`)) return;
                busy('Reading the score…');
                try { await showTimesResult(await readTimes(id, [t], { replace: true })); } finally { done(); }
                refresh();
              } }, '📄 Read times') : null,
              h('button', { class: 'btn icon', 'aria-label': `Rename ${t.name}`, onclick: () => rename(t) }, '✎'),
              h('button', { class: 'btn icon danger', 'aria-label': `Delete ${t.name}`, onclick: () => remove(t) }, '🗑'))))
        : h('p', { class: 'muted' }, 'Add the full mix and your part track(s). You can pick several files at once (from Files, iCloud Drive or a saved email attachment).'),
      tracks.length ? h('p', { class: 'muted small' }, 'Check the part under each track. "For everyone" is for the full mix or piano.') : null),
    h('div', { class: 'card' },
      h('div', { class: 'row space' },
        h('h2', {}, '📄 Score with times'),
        fileButton('+ Add score', 'application/pdf,.pdf', true, addScores, 'btn')),
      h('p', { class: 'muted small' }, 'Optional. If you have the score with track times printed on it (the "with timestamps" PDF), add it here. The app reads the times so you can start from a letter or a bar. The score is not shown on the phone.'),
      scores.map((s) => h('div', { class: 'item-row' },
        h('div', { class: 'grow item-title' }, `📄 ${s.name}`),
        h('button', { class: 'btn icon danger', 'aria-label': `Delete ${s.name}`, onclick: () => remove(s) }, '🗑')))),
    startNotesCard(song, refresh),
    h('a', { class: 'btn primary big wide', href: `#/song/${id}` }, '✓ Done: practise this song'),
    h('div', { class: 'row end' },
      h('button', { class: 'btn', onclick: async () => {
        const t = prompt('Song title:', song.title);
        if (t && t.trim()) { song.title = t.trim(); await db.put('songs', song); refresh(); }
      } }, '✎ Rename song'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`Delete "${song.title}" and all its tracks from this phone?`)) return;
        items.forEach((i) => i.kind === 'track' && player.forget(i));
        await db.deleteSong(id);
        location.hash = '#/';
      } }, '🗑 Delete song')),
  ], { back: `#/song/${id}`, screen: 'setup' });
}

// The starting note for each part, saved with the song.
function startNotesCard(song, refresh) {
  const saved = song.startNotes || {};
  const mine = myParts();
  const parts = !mine?.length ? choirParts() : choirParts().filter((p) => mine.includes(p) || saved[p] != null);
  const setNote = async (part) => {
    let chosen = saved[part] ?? null;
    const now = h('div', { class: 'kb-now' }, chosen != null ? `Starting note: ${noteName(chosen)}` : 'Tap a key to hear it. Tap Save when it is right.');
    const body = h('div', {},
      pianoKeyboard({ selected: chosen, onKey: (m) => { chosen = m; player.playNote(m); now.textContent = `Starting note: ${noteName(m)}`; } }),
      now);
    const choice = await modal(`Starting note: ${part}`, body, [
      { label: 'Cancel', value: () => null },
      saved[part] != null ? { label: 'Remove', cls: 'btn danger', value: () => 'clear' } : null,
      { label: 'Save', cls: 'btn primary', value: () => 'save' },
    ].filter(Boolean));
    player.pause();
    if (!choice || (choice === 'save' && chosen == null)) return;
    const fresh = (await db.get('songs', song.id)) || song;
    fresh.startNotes = { ...(fresh.startNotes || {}) };
    if (choice === 'clear') delete fresh.startNotes[part];
    else fresh.startNotes[part] = chosen;
    await db.put('songs', fresh);
    toast(choice === 'clear' ? `Starting note for ${part} removed` : `${part}: ${noteName(chosen)} saved`);
    refresh();
  };
  return h('div', { class: 'card' },
    h('h2', {}, '🎹 Starting notes'),
    h('p', { class: 'muted small' }, 'Save the note your part starts on. On the song screen it is then one tap.'),
    parts.map((p) => h('div', { class: 'item-row' },
      h('div', { class: 'grow item-title' }, p),
      saved[p] != null
        ? h('button', { class: 'btn note-play', 'aria-label': `Play ${p} starting note`, onclick: () => player.playNote(saved[p]) }, `▶ ${noteName(saved[p])}`)
        : h('span', { class: 'muted small' }, 'Not set'),
      h('button', { class: 'btn', onclick: () => setNote(p) }, saved[p] != null ? '✎' : '+ Set'))));
}

// ---------------------------------------------------------------- Help & backup

async function screenHelp() {
  let usage = '';
  if (navigator.storage?.estimate) {
    try { const e = await navigator.storage.estimate(); usage = `Using ${(e.usage / 1e6).toFixed(0)} MB on this phone.`; } catch { /* unknown */ }
  }
  const saveBackup = async () => {
    toast('Preparing backup…');
    const blob = await db.exportAll();
    const name = `sectional-practice-backup-${todayISO()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch { /* fall through to download */ }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
  };
  const restore = async ([file]) => {
    if (!file) return;
    if (!confirm('Restore this backup? Songs with the same name will be replaced.')) return;
    try {
      toast('Restoring…');
      const res = await db.importAll(file);
      toast(`Restored ${res.songs} song${res.songs === 1 ? '' : 's'}`);
      if (res.skipped) alert(`${res.skipped} tracks or scores were left out because their files are not in this backup.${res.fromIpad ? ' On the iPad, use "💾 Back up everything" to include the files.' : ''}`);
    } catch (e) { alert(`Could not restore: ${e.message}`); }
  };

  setScreen('Help', [
    h('div', { class: 'card' },
      h('h2', {}, 'How to use it'),
      h('ol', {},
        h('li', {}, 'Songs: type a song title and tap + Add.'),
        h('li', {}, 'Tap + Add tracks and choose the MP3s (full mix and your part).'),
        h('li', {}, 'Have the score with times printed on it? Tap + Add score. Then you can start from a letter or a bar.'),
        h('li', {}, 'Tap ✓ Done. Choose a track, then ▶ From the top, a letter, or type a bar number.'),
        h('li', {}, 'Too fast? Tap 90% … 50% to slow it down. The pitch stays the same.'),
        h('li', {}, 'Need your note? Save it under 🎹 Starting notes, or tap 🎹 Keyboard.'))),
    h('div', { class: 'card' },
      h('h2', {}, 'Put this app on your home screen'),
      h('p', { class: 'item-title' }, 'iPhone'),
      h('ol', {},
        h('li', {}, 'Open this page in Safari.'),
        h('li', {}, 'Tap the Share button (square with an arrow; you may need to tap ⋯ first).'),
        h('li', {}, 'Tap "Add to Home Screen", then "Add".')),
      h('p', { class: 'item-title' }, 'Android phone'),
      h('ol', {},
        h('li', {}, 'Open this page in Chrome.'),
        h('li', {}, 'Tap the ⋮ menu (top right).'),
        h('li', {}, 'Tap "Add to Home screen" (or "Install app"), then "Add".')),
      h('p', {}, 'Always open Practice from its home screen icon. It works without internet. Songs added in Safari don\'t show in the icon\'s app (and the other way round).')),
    h('div', { class: 'card' },
      h('h2', {}, '🎶 My parts'),
      h('p', {}, `You sing: ${partsText(myParts())}. Tap your part(s), then Save. The app shows only those tracks, plus tracks for everyone.`),
      partsPicker(() => { toast('Saved'); screenHelp(); })),
    h('div', { class: 'card' },
      h('h2', {}, 'Choir parts list'),
      h('p', { class: 'muted small' }, 'The parts used in your choir. Tracks are matched to these by name.'),
      h('div', { class: 'row wrap' }, choirParts().map((p) => h('span', { class: 'chip static' }, p,
        h('button', { class: 'chip-x', 'aria-label': `Remove ${p}`, onclick: () => {
          if (!confirm(`Remove "${p}" from the parts list?`)) return;
          setChoirParts(choirParts().filter((x) => x !== p));
          setMyParts((myParts() || []).filter((x) => x !== p));
          screenHelp();
        } }, '✕')))),
      h('button', { class: 'btn', onclick: () => {
        const name = prompt('New part name (e.g. Tenor, Baritone):');
        if (!name || !name.trim() || choirParts().includes(name.trim())) return;
        setChoirParts([...choirParts(), name.trim()]);
        screenHelp();
      } }, '+ Add a part')),
    h('div', { class: 'card' },
      h('h2', {}, 'No sound?'),
      h('ol', {},
        h('li', {}, 'Turn the volume up with the buttons on the side of the phone.'),
        h('li', {}, 'Using a Bluetooth speaker or headphones? Swipe down from the top-right corner, tap the AirPlay icon (triangle with circles) in the music box, and choose them.'),
        h('li', {}, 'Still nothing? Close Practice fully (swipe it away) and open it again.'))),
    h('div', { class: 'card' },
      h('h2', {}, '💾 Back up'),
      h('p', {}, 'Your songs are kept only on this phone. Save a backup now and then (e.g. to Files or iCloud Drive). Use Restore to put them on a new phone.'),
      h('p', { class: 'muted small' }, usage),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: saveBackup }, '💾 Back up everything'),
        fileButton('⤒ Restore a backup', 'application/json,.json', false, restore)),
      h('p', { class: 'muted small' }, 'The backup includes the tracks, so it can be large. Restore also takes an "everything" backup from the iPad Sectional app (its songs, tracks, times and starting notes).')),
    h('p', { class: 'muted small center', id: 'app-version' }, versionText()),
  ], { screen: 'help' });
}

// ---------------------------------------------------------------- router

const routes = [
  [/^#\/?$/, screenSongs, 'songs'],
  [/^#\/song\/([\w]+)$/, screenPlay, 'songs'],
  [/^#\/setup\/([\w]+)$/, screenSetup, 'songs'],
  [/^#\/help$/, screenHelp, 'help'],
];

async function route() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  document.querySelector('.modal-wrap')?.remove();
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
window.addEventListener('error', (e) => { if (e.message) toast(`Problem: ${e.message}`); });
window.addEventListener('unhandledrejection', (e) => { const m = e.reason?.message || String(e.reason || ''); if (m) toast(`Problem: ${m}`); });
setupMini();
route();

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

// ---------------------------------------------------------------- updates
// The version lives in one place: VERSION in this app's sw.js. A banner shows when a newer one is online.
let runningVersion = null;
async function onlineVersion() {
  try {
    const res = await fetch(`./sw.js?check=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.text()).match(/VERSION = '([^']+)'/)?.[1] || null;
  } catch { return null; }
}
function versionText() { return `App version: ${(runningVersion || '').replace('practice-', '') || 'checking…'}`; }
async function checkForUpdate() {
  const v = await onlineVersion();
  if (!v) return;
  if (!runningVersion) {
    runningVersion = v;
    const el = document.getElementById('app-version');
    if (el) el.textContent = versionText();
    return;
  }
  if (v !== runningVersion) document.getElementById('update').hidden = false;
}
document.getElementById('update-btn').onclick = async () => {
  document.getElementById('update-btn').textContent = 'Updating…';
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* offline */ }
  location.reload();
};
checkForUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
setInterval(checkForUpdate, 30 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
