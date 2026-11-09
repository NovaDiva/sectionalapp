import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, parseTime, timeForBar, parseTimestampTable, parseBarLetter } from '../js/timestamps.js';
import { parseCommand } from '../js/commands.js';

const marksFull = [
  { t: 1, bar: 1, letter: null, label: 'Start' },
  { t: 33, bar: 15, letter: 'A', label: 'Letter A' },
  { t: 61, bar: 29, letter: 'B', label: 'Chorus "let the river run"' },
  { t: 90, bar: 43, letter: 'C', label: 'Letter C' },
];
const marksAlto = marksFull.map((m) => ({ ...m, t: m.t + 2 }));

const ctx = {
  songs: [
    {
      id: 's1', title: 'Let the River Run',
      tracks: [
        { id: 't-full', name: 'Full mix', marks: marksFull },
        { id: 't-alto', name: 'Alto', marks: marksAlto },
        { id: 't-s1', name: 'Soprano 1', marks: marksFull },
        { id: 't-s2', name: 'Soprano 2', marks: marksFull },
      ],
    },
    { id: 's2', title: 'Viva la Vida', tracks: [{ id: 'v-full', name: 'Full', marks: [] }, { id: 'v-bass', name: 'Bass', marks: [] }] },
  ],
  current: { songId: 's1', trackId: 't-full' },
};

test('formatTime / parseTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(83.4), '1:23');
  assert.equal(parseTime('1:23'), 83);
  assert.equal(parseTime('**0:33**'), 33);
  assert.equal(parseTime('~1:05 (approx.)'), 65);
  assert.equal(parseTime('Time'), null);
});

test('timeForBar exact, between, and beyond marks', () => {
  assert.deepEqual(timeForBar(marksFull, 15), { t: 33, approx: false });
  const mid = timeForBar(marksFull, 22);
  assert.equal(mid.approx, true);
  assert.equal(Math.round(mid.t), 47);
  const after = timeForBar(marksFull, 50);
  assert.ok(after.t > 90 && after.approx);
  assert.equal(timeForBar([], 10), null);
});

test('parseTimestampTable reads the skill doc format', () => {
  const table = `## Let the River Run (Carly Simon)

Track: *river.mp3* (3:40). Score: SATB + piano, 80 bars.

| Time | Bar | Where you are |
|---|---|---|
| 0:01 | 1 | Start: "We're coming to the edge" |
| **0:33** | **15 (A)** | **Letter A** |
| ~1:05 (approx.) | 29 | "Let the river run" |
| 3:38 | 80 | End |`;
  const marks = parseTimestampTable(table);
  assert.equal(marks.length, 4);
  assert.deepEqual(marks[1], { t: 33, bar: 15, letter: 'A', label: 'Letter A' });
  assert.equal(marks[2].t, 65);
  assert.equal(marks[3].label, 'End');
});

test('parseTimestampTable reads plain lines', () => {
  const marks = parseTimestampTable('0:33 15 A Letter A\n1:01 - bar 29 - chorus');
  assert.equal(marks[0].bar, 15);
  assert.equal(marks[0].letter, 'A');
  assert.equal(marks[1].bar, 29);
  assert.equal(marks[1].label, 'chorus');
});

test('parseBarLetter', () => {
  assert.deepEqual(parseBarLetter('15 A'), { bar: 15, letter: 'A' });
  assert.deepEqual(parseBarLetter('15a'), { bar: 15, letter: 'A' });
  assert.deepEqual(parseBarLetter('B'), { bar: null, letter: 'B' });
  assert.deepEqual(parseBarLetter('32'), { bar: 32, letter: null });
});

test('command: voice + bar', () => {
  const a = parseCommand('alto bar 15', ctx);
  assert.equal(a.type, 'play');
  assert.equal(a.trackId, 't-alto');
  assert.equal(a.start, 35);
  assert.equal(a.end, null);
});

test('command: bare number and letter', () => {
  assert.equal(parseCommand('altos 29', ctx).start, 63);
  const b = parseCommand('Alto B', ctx);
  assert.equal(b.start, 63);
  assert.equal(parseCommand('full mix letter c', ctx).start, 90);
});

test('command: ranges', () => {
  const r = parseCommand('bars 15-28 alto', ctx);
  assert.equal(r.start, 35);
  assert.equal(r.end, 63); // stops where bar 29 starts
  const l = parseCommand('B to C', ctx);
  assert.equal(l.trackId, 't-full');
  assert.equal(l.start, 61);
  assert.equal(l.end, 90);
});

test('command: part numbers', () => {
  assert.equal(parseCommand('soprano 2 bar 15', ctx).trackId, 't-s2');
  assert.equal(parseCommand('sop 1 letter A', ctx).trackId, 't-s1');
});

test('command: picks another song by title', () => {
  const v = parseCommand('viva bass from the top', ctx);
  assert.equal(v.songId, 's2');
  assert.equal(v.trackId, 'v-bass');
  assert.equal(v.start, 0);
});

test('command: helpful errors', () => {
  assert.match(parseCommand('alto letter Z', ctx).reply, /Letters marked: A, B, C/);
  assert.match(parseCommand('tenor bar 3', ctx).reply, /no tenor track/);
  assert.match(parseCommand('viva bass bar 12', ctx).reply, /no bar numbers/);
});

test('command: lyric search, controls, notes', () => {
  assert.equal(parseCommand('alto chorus', ctx).start, 63);
  assert.equal(parseCommand('stop', ctx).type, 'pause');
  assert.equal(parseCommand('again', ctx).type, 'again');
  assert.deepEqual(parseCommand('back 10', ctx), { type: 'seek', by: -10 });
  assert.deepEqual(parseCommand('note: altos flat at C', ctx), { type: 'note', text: 'altos flat at C' });
  assert.deepEqual(parseCommand('fix tuning in bar 40', ctx), { type: 'todo', text: 'tuning in bar 40' });
});

test('spoken commands are understood', () => {
  const a = parseCommand("Alto's bar fifteen.", ctx);
  assert.equal(a.trackId, 't-alto');
  assert.equal(a.start, 35);
  assert.equal(parseCommand('full mix letter bee', ctx).start, 61);
  const r = parseCommand('alto bars fifteen to twenty eight', ctx);
  assert.equal(r.start, 35);
  assert.equal(r.end, 63);
  assert.equal(parseCommand('soprano two letter see', ctx).trackId, 't-s2');
  assert.equal(parseCommand('Viva base from the top', ctx).trackId, 'v-bass');
  assert.equal(parseCommand('Stop.', ctx).type, 'pause');
  assert.deepEqual(parseCommand('Note: altos flat at letter C.', ctx), { type: 'note', text: 'altos flat at letter C' });
});

test('three-part and numbered parts', async () => {
  const { guessPart, visibleTracks } = await import('../js/parts.js');
  const parts = ['Soprano 1', 'Soprano 2', 'Alto 1', 'Alto 2', 'Tops', 'Middles', 'Lowers'];
  assert.equal(guessPart('River_Alto1.mp3', parts), 'Alto 1');
  assert.equal(guessPart('Alto 2', parts), 'Alto 2');
  assert.equal(guessPart('S2 practice', parts), 'Soprano 2');
  assert.equal(guessPart('Middles', parts), 'Middles');
  assert.equal(guessPart('Top line', parts), 'Tops');
  assert.equal(guessPart('Full mix', parts), null);
  assert.equal(guessPart('Piano only', parts), null);
  const tracks = [{ name: 'Full mix' }, { name: 'Alto 1' }, { name: 'Alto 2' }, { name: 'Lowers' }, { name: 'Tops' }];
  assert.deepEqual(visibleTracks(tracks, ['Alto 1', 'Lowers'], parts).map((t) => t.name), ['Full mix', 'Alto 1', 'Lowers']);
  assert.equal(visibleTracks(tracks, null, parts).length, 5);
  // an explicit part on the track wins over its name
  assert.deepEqual(visibleTracks([{ name: 'Guide track', part: 'Middles' }], ['Middles'], parts).length, 1);

  const c3 = { songs: [{ id: 'x', title: 'Shenandoah', tracks: [
    { id: 'f', name: 'Full mix', marks: marksFull }, { id: 'tp', name: 'Tops', marks: marksFull },
    { id: 'md', name: 'Middles', marks: marksFull }, { id: 'lw', name: 'Lowers', marks: marksFull },
    { id: 'a1', name: 'Alto 1', marks: marksFull }, { id: 'a2', name: 'Alto 2', marks: marksFull }] }] };
  assert.equal(parseCommand('middles letter B', c3).trackId, 'md');
  assert.equal(parseCommand('lowers bar 15', c3).trackId, 'lw');
  assert.equal(parseCommand('tops from the top', c3).trackId, 'tp');
  assert.equal(parseCommand('tops from the top', c3).start, 0);
  assert.equal(parseCommand('first altos letter A', c3).trackId, 'a1');
  assert.equal(parseCommand('second altos bar 15', c3).trackId, 'a2');
  assert.equal(parseCommand('alto two letter C', c3).trackId, 'a2');
});

test('times printed on a score are read as marks', async () => {
  const { marksFromTextItems } = await import('../js/scoretimes.js');
  const page1 = [
    { str: 'Let the River Run', x: 150, y: 40, h: 20 },
    { str: '0:00', x: 8, y: 150, h: 8 },
    { str: 'A', x: 330, y: 120, h: 16 }, { str: '0:09 / 0:12', x: 352, y: 118, h: 8 },
    { str: '9', x: 62, y: 270, h: 7 }, { str: '0:19', x: 8, y: 272, h: 8 },
    { str: '15', x: 62, y: 410, h: 7 }, { str: 'B', x: 85, y: 395, h: 16 }, { str: '0:33', x: 8, y: 412, h: 8 },
    { str: '2', x: 500, y: 810, h: 10 },
  ];
  const page2 = [{ str: '22', x: 62, y: 130, h: 7 }, { str: '~0:52', x: 8, y: 132, h: 8 }];
  const marks = marksFromTextItems([page1, page2]);
  assert.deepEqual(marks.map((m) => [m.t, m.bar, m.letter]), [
    [0, 1, null], [9, null, 'A'], [12, null, 'A'], [19, 9, null], [33, 15, 'B'], [52, 22, null],
  ]);
  assert.match(marks[2].label, /repeat/);
  assert.match(marks[5].label, /approx/);
  // labels split into pieces are joined
  const split = marksFromTextItems([[{ str: '1:40', x: 8, y: 100, h: 8 }, { str: '/ 2:41', x: 28, y: 100, h: 8 }, { str: '30', x: 62, y: 99, h: 7 }]]);
  assert.deepEqual(split.map((m) => [m.t, m.bar]), [[100, 30], [161, 30]]);
});

test('speed commands', () => {
  assert.deepEqual(parseCommand('slower', ctx), { type: 'speed', by: -0.1 });
  assert.deepEqual(parseCommand('Half speed', ctx), { type: 'speed', rate: 0.5 });
  assert.deepEqual(parseCommand('normal speed', ctx), { type: 'speed', rate: 1 });
  assert.deepEqual(parseCommand('speed 80', ctx), { type: 'speed', rate: 0.8 });
  assert.deepEqual(parseCommand('70 percent', ctx), { type: 'speed', rate: 0.7 });
  assert.deepEqual(parseCommand('play at 60%', ctx), { type: 'speed', rate: 0.6 });
  assert.equal(parseCommand('alto bar 70', ctx).type, 'play'); // a bar number is not a speed
});
