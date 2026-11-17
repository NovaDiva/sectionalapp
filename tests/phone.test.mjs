// Sectional Practice (phone/): checks that keep it in step with the iPad app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

test('phone player.js is the iPad player.js, unchanged (the tested iPad/iPhone audio rules)', () => {
  assert.equal(read('phone/js/player.js'), read('js/player.js'),
    'js/player.js changed: copy it to phone/js/player.js and bump VERSION in both sw.js files');
});

test('every file the phone app keeps for offline use exists', () => {
  const sw = read('phone/sw.js');
  const files = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(existsSync(resolve(root, 'phone', f === './' ? 'index.html' : f)), `missing ${f}`);
});

test('phone and iPad apps have their own version, cache and database names', () => {
  assert.match(read('phone/sw.js'), /const VERSION = 'practice-v\d+';/);
  assert.match(read('sw.js'), /const VERSION = 'sectional-v\d+';/);
  assert.match(read('phone/js/db.js'), /DB_NAME = 'sectional-practice'/);
});

test('phone app imports only files it keeps offline', () => {
  const sw = read('phone/sw.js');
  for (const f of ['phone/js/app.js', 'phone/js/timestamps.js', 'phone/js/pitch.js']) {
    for (const [, spec] of read(f).matchAll(/(?:from |import\()'([^']+)'/g)) {
      if (!spec) continue;
      const rel = relative(resolve(root, 'phone'), resolve(root, dirname(f), spec)).replace(/\\/g, '/');
      const asListed = rel.startsWith('..') ? rel : `./${rel}`;
      assert.ok(sw.includes(`'${asListed}'`), `${f} imports ${spec}, not in phone/sw.js FILES`);
    }
  }
});
