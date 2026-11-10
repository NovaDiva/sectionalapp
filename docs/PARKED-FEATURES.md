# Parked features (switched off, ready to bring back)

Parked by Carol on 10 Nov 2026 (v22) to keep the rehearsal screen simple while more section
leaders test the app. Nothing was deleted: the code, and any data already saved, are still there.

## How to bring them back
In `js/app.js`, near the top:

```js
const FEATURES = { covered: false, fixNextTime: false };
```

Set either to `true`, bump `VERSION` in `sw.js`, and push. Then also restore the matching lines in
`docs/LEADER-GUIDE.md` (see below) and the HELP text comes back automatically.

## ✓ Covered (`FEATURES.covered`)
- Rehearsal tab "✓ Covered": for each song, tap the rehearsal letters worked on, type bars/sections,
  tick "Sang the whole song".
- Saved in `rehearsal.covered[songId] = { letters: [], text: '', whole: false }`.
- Summary section "What we covered:".

## 🔧 Fix next time (`FEATURES.fixNextTime`)
- Rehearsal tab "🔧 Fix next time": items per song (or general), tick when fixed today; unticked
  items carry over to the next rehearsal of those songs.
- Saved in the IndexedDB store `todos` `{ id, text, songId, done, createdIn, doneIn, createdAt }`.
- Home screen card "🔧 To work on (n)".
- Summary sections "Fixed today:" and "To work on next time:".
- Typed or spoken `fix: …` adds an item. While parked, `fix: …` is saved as a note "To fix: …".

## Leader-guide lines to restore
- 5. **✓ Covered**: tap the letters you worked on and add any bars.
- 6. **🔧 Fix next time**: add things to work on (or type `fix: tuning bar 40`). Tick them when they're
  sorted. Anything left unticked shows up again next time.
