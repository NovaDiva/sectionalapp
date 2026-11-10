# Project notes for Claude

Sectional: an iPad web app for choir sectional leaders, built for Carol.
Live at https://hummingsong-novadiva.github.io/sectionalapp/ (GitHub Pages, served from branch
`claude/choir-sectional-app-wg6esg`, root folder). The repository is public, so never commit scores, tracks or personal data.

## Decisions Carol made (keep to these unless she changes them)
- Must stay simple for leaders with basic iPad skills: big buttons, plain words, few steps.
- Web app added to the home screen (PWA), not an App Store app. Plain HTML/CSS/JS, no build step.
- Each leader manages their own library on their own iPad (IndexedDB). No login, no server.
  Backup/restore in the Help tab is how a leader moves THEIR OWN setup to a new iPad.
- Handover (Carol, 11 Nov 2026): every leader starts with an EMPTY app and uploads/sets up their own songs,
  scores and tracks; each choir runs different songs. No shared starter pack / preloaded content.
  Android tablets (Chrome) should work but are untested; Help's install steps are iPad-only so far.
- Timestamps are made in the app by tap-along (MARK button), with no AI. Each track has its own
  timestamps (part tracks don't share timing). Pasting a table from her "2027 Time Stamps" doc is
  also supported (the format comes from her choir-track-timestamps skill), and so is reading the times
  printed on her "with timestamps" score PDFs (js/scoretimes.js: margin labels + bar numbers + letters
  via PDF.js text). Printed times belong to one recording (usually the full mix).
- Rehearsal Play tab: big track buttons (track names, choice stays per song), Start-from buttons
  (top / letters / bar box), big Speak/Stop/Again/Back 5s, a type box, then the chat log.
  The 🎤 voice button can be switched off in Help (Bluetooth speakers drop when the mic is used).
  If direct speech recognition is missing, refused or never starts (4 s), Speak switches to "keyboard voice":
  focus the type box + green tip to use the keyboard's dictation key; the command auto-runs 1.6 s after
  the text stops changing. listen() always settles (timeouts) so the button can't get stuck.
- Score viewer: ✏️ Mark up (pen, highlighter, typed notes, eraser, undo), saved in item.annotations
  as fractions of the page size; 🎵 Player toggles the compact track/letter panel.
- Parts: the choir has Soprano 1, Soprano 2, Alto 1, Alto 2 (4-part) and Tops, Middles, Lowers (3-part).
  Each leader picks "my parts" (first-run card / Help), and only those tracks show, plus tracks for everyone
  (item.part = null: full mix, piano). Track part is guessed from the name and can be changed on the song page.
  Parts list is editable in Help and travels in backups; "my parts" stays per iPad (localStorage). See js/parts.js.
- Rehearsal record: notes (typed, or 🎤 Speak a note = keyboard dictation into the note box; no extra mic code).
  PARKED (v22, Carol): "✓ Covered" and "🔧 Fix next time" tabs are switched off via FEATURES in js/app.js;
  code + data kept; how to restore is in docs/PARKED-FEATURES.md. While parked, "fix: …" saves a note.
- Speed: slow down only (Normal, 90…50%), pitch preserved, remembered in localStorage; buttons in rehearsal,
  score player and Timestamps screen; voice "slower / half speed / speed 80 / normal speed". No speeding up.
- Look: Hummingsong brand (v21). Black header with icons/hummingsong-logo.png (Hummingsong Choirs, white text,
  made for black), teal #1b5a64 replaces the old purple, orange #c95a0c for MARK and the chosen speed, gold for
  flashes; app icon = the hummingbird on white. Colours taken from the logo (hummingsong.com.au not reachable here).
  Header layout CONFIRMED by Carol (v26, "perfect, keep that"): light page-colour strip at the top (--top-band =
  safe-area + 50px) behind the iPad status bar, then the black header with logo + title. Don't change it.
- Summary is shared with the iPad share sheet (email/WhatsApp).

## Working on it
- `npm test` runs the unit tests (command parser, spoken phrases, timestamps).
- Run locally with `python3 -m http.server`. Check flows in Playwright at iPad size (1024x1366).
- Bump `VERSION` in `sw.js` on every change to app files. The app compares it with the online copy
  and shows a "Tap to update" banner, so leaders never need to reopen the link (that makes a new, empty copy).
- iPad audio must start from a tap: keep `player.prepare()` before commands and `player.unlock()` on the mic tap.

## Status (v26, 11 Nov 2026) - Carol is testing on her iPad; next session = her feedback
Done and live: songs/scores/tracks, tap-along timestamps (+ paste table, + read times printed on the
score), rehearsal Play panel (track buttons, start-from letters/bar, Speak/Stop/Again/Back, speed),
voice + typed commands, notes / covered / fix-next-time, summary sharing, score mark-up (Pencil works,
confirmed by Carol), parts + "my parts" filtering, part choice per rehearsal, add/remove songs mid-rehearsal,
slow-down speed (Normal…50%), update banner, Bluetooth sound-mode attempt, backup/restore.

Still to confirm on Carol's iPad:
- Does the Bluetooth speaker stay connected after using the 🎤? (audioSession fix; otherwise voice can be switched off)
- Reading times from her real "with timestamps" PDFs: how many found, letters correct?
- How slowed-down tracks sound (pitch preserved), especially at 50%.

v16 BROKE on the iPad (muted warm-up): WebKit pauses a track that a page unmutes without a tap, which
re-paused playback and left the mic/buttons confused. NEVER use audio.muted for this.
v17: after a VOICE command (direct or keyboard dictation) play 0.5 s of generated SILENCE (silent WAV blob),
pause 0.4 s, then load the track and play from the start point (player.js SETTLE, startSettled). Stop/Play/
Again/buttons during the warm-up go straight to the real track (cancelSettle puts the track back).
v18 (abort + audioSession 'auto'->'playback' flip after listening) and v19 (readOnly/blur/focus-sink to close
the keyboard) did NOT clear the orange mic dot and v19 stopped Speak hearing her after the first command.
v20 = app code restored EXACTLY to v17 (878e743): voice worked repeatedly there; the orange dot during playback
is iPad behaviour after web speech/dictation and is accepted for now.
LESSON: no more speculative microphone/audio-session changes without a way to test on her iPad. Changes that
alter mic or audio-session behaviour should be offered as an opt-in setting, so she can switch back herself.
Options offered to Carol: keep v17 voice (dot stays, small battery cost) / switch voice off in Help /
Bluetooth clicker or foot pedal for hands-free control without the microphone.
Keyboard-voice fallback is only sticky if the iPad refuses/can't listen; a slow start (6 s) falls back once.
Still to confirm: is the volume right after voice commands (v17/v20 warm-up)? Mic/buttons all OK? If the gap is too short/long, tune SETTLE. Does Speak now respond straight away (direct or keyboard mode)? What does Help say for her iPad?
Testing: `npm test` (unit) and tests/browser/README.md (Playwright flows + fixture generator).
Version history: v26 light top band (--top-band = safe-area + 50px, page colour) above the black header so the iPad's status-bar fade is light-on-light (Carol's idea); status bar default + theme colour #f7f5f2; v25 header top padding +24px (logo/title below the iPad's faded status-bar band; Carol: v24 still 'too high'); v24 solid black status-bar strip (status-bar-style black-translucent + html bg black; header already pads safe-area-inset-top); v23 clearer Speak-a-note prompt (keyboard 🎙 key is bottom-left on Carol's iPad, next to .?123); v22 Speak a note + Covered/Fix parked; v21 Hummingsong branding; v20 voice restored to v17; v5 big controls + mark-up; v6/v7 Pencil drawing + fresh-file fetching; v8 parts;
v9 rehearsal part choice; v10 score times; v11 add song mid-rehearsal; v12 speed; v14: setSoundMode only assigns navigator.audioSession.type when it differs (re-applying it
reset Carol's Bluetooth speaker to full volume on every play); v13 Speak fallback to keyboard dictation
(Carol: mic only responded after tapping the type box first) + listen() timeouts.
Reminder for Carol: each Safari tab or Home Screen icon has its own separate storage; always use one icon.
