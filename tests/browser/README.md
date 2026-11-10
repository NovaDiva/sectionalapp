# Browser tests (Playwright, Chromium at iPad size)

```bash
python3 -m http.server 8765 &            # from the repo root
FX=/tmp/fx; OUT=/tmp/shots; mkdir -p $OUT
tests/browser/make-fixtures.sh $FX
node tests/browser/e2e.cjs $FX $OUT            # songs, tracks, timestamps, rehearsal, voice (simulated), speed, score mark-up, summary
node tests/browser/parts.cjs $FX $OUT          # my parts, part filtering, new-rehearsal part choice
node tests/browser/scoretimes-e2e.cjs $FX $OUT # reading times printed on a score
node tests/browser/addsong.cjs $OUT            # adding a song to a running rehearsal
node tests/browser/touch.cjs $FX/score.pdf $OUT/touch.png  # finger drawing on the score
node tests/browser/voicefb.cjs $FX $OUT       # Speak falls back to keyboard dictation; never stuck
node tests/browser/session.cjs                 # sound mode is not re-applied on every play (volume reset)
node tests/browser/settle.cjs $FX              # voice command: silent warm-up, pause, track; buttons/Stop during warm-up; repeats
node tests/browser/micrelease.cjs              # after listening: recogniser aborted, mode back to music
node tests/browser/dictation-end.cjs           # keyboard voice: keyboard closed after the command runs
node tests/browser/update.cjs $OUT/update.png  # "Tap to update" banner
```

Each prints what it saw and `errors: none` / `ERRORS: none` when clean. Screenshots go to $OUT.
Chromium only: iPad Safari behaviour (Pencil, audio routing, speech) must be checked on Carol's iPad.
