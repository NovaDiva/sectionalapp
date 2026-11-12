# Project notes for Claude

Sectional: an iPad web app for choir sectional leaders, built for Carol.
Live at https://novadiva.github.io/sectionalapp/ (GitHub Pages, served from branch
`claude/choir-sectional-app-wg6esg`, root folder; moved 12 Nov 2026 from the old hummingsong-novadiva address, whose organisation Carol has deleted). The repository is public, so never commit scores, tracks or personal data.

## Decisions Carol made (keep to these unless she changes them)
- Must stay simple for leaders with basic iPad skills: big buttons, plain words, few steps.
- Web app added to the home screen (PWA), not an App Store app. Plain HTML/CSS/JS, no build step.
- Each leader manages their own library on their own iPad (IndexedDB). No login, no server.
  Backup/restore in the Help tab is how a leader moves THEIR OWN setup to a new iPad.
- Handover (Carol, 11 Nov 2026): every leader starts with an EMPTY app and uploads/sets up their own songs,
  scores and tracks; each choir runs different songs. No shared starter pack / preloaded content.
  Android tablets (Chrome) should work but are untested; Help has iPad + Android install steps (v27).
  Printable leader handout (Claude Doc): https://claude.ai/artifact/NATF5UWzVxiJEBW7a8iNTg
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
- Giving a note (v28, Carol chose: keyboard + saved starting notes, 2 octaves with ◀ ▶ shift, ~2 s per tap,
  clean tone not samples): js/pitch.js makes a piano-like WAV at A=440 (no files); player.playNote/playNotes use a
  SECOND plain Audio element (track stays loaded; a playing track is paused; never slowed; unlocked with the mic
  tap; after a voice command the same 0.5 s silence + 0.4 s pause warm-up). song.startNotes = { part: midi } set on
  the song page (🎹 Starting notes), shown in rehearsal as orange "▶ Part: A4" buttons + 🎹 Keyboard toggle;
  voice/typed "starting note", "give me the note", "lowers starting note" (commands.js 'startnote').
- Summary is shared with the iPad share sheet (email/WhatsApp).

## Working on it
- `npm test` runs the unit tests (command parser, spoken phrases, timestamps).
- Run locally with `python3 -m http.server`. Check flows in Playwright at iPad size (1024x1366).
- Bump `VERSION` in `sw.js` on every change to app files. The app compares it with the online copy
  and shows a "Tap to update" banner, so leaders never need to reopen the link (that makes a new, empty copy).
- iPad audio must start from a tap: keep `player.prepare()` before commands and `player.unlock()` on the mic tap.

## Status (v28, 12 Nov 2026) - WAITING for Carol's feedback after her next real rehearsal
Live: songs/scores/tracks; timestamps (tap-along MARK, paste table, read times printed on the score);
rehearsal (part choice, track buttons, start-from letters/bar, Speak/Stop/Again/Back 5s, speed 50-100%,
+ Add song mid-rehearsal); Notes tab with "Speak a note" (keyboard dictation); score viewer + mark-up
(Pencil confirmed working); parts + "my parts"; summary sharing; Hummingsong branding + confirmed header;
update banner; backup/restore; iPad + Android install steps in Help; v28 piano keyboard + saved starting notes. Covered / Fix next time are PARKED.

When Carol comes back, start by asking/checking (she has not answered these yet):
1. Help -> Voice button: does it say "can listen directly" or "uses the keyboard's 🎤"?
2. Speak: works for several commands in a row? Speaker volume right after a voice command (v17 warm-up:
   0.5 s silence + 0.4 s pause)? Gap too long/short -> tune SETTLE in js/player.js.
3. Bluetooth speaker stays connected after Speak? (if not: voice off in Help, or offer clicker/foot pedal)
4. "Use times from the score" on her real "with timestamps" PDFs: how many times/letters found, correct?
5. Slowed tracks sound OK (pitch kept), esp. 50%?
6. Speak a note (keyboard 🎙 bottom-left) working?
7. v28 starting notes: does the note play through the Bluetooth speaker, at a good volume? Tone OK? Does
   "starting note" by voice work (after the short warm-up)? Keys big enough?
Known/accepted: the orange mic dot stays on during playback after voice use (iPad behaviour).

How to work: check `git status`/`git log` first; read the lessons below before touching mic/audio code.
After every change: `npm test`, the browser flows in tests/browser/README.md (fixtures via make-fixtures.sh),
bump VERSION in sw.js, update this file, commit + push to claude/choir-sectional-app-wg6esg (GitHub Pages
publishes in ~1 min; check with the Actions "pages build and deployment" run). Tell Carol the new version
number she should see at the bottom of Help.

Mic/audio history and LESSONS:
- v14: setSoundMode only assigns navigator.audioSession.type when it differs (re-applying it reset her
  Bluetooth speaker to full volume on every play).
- v16 BROKE on the iPad (muted warm-up): WebKit pauses a track that a page unmutes without a tap.
  NEVER use audio.muted for this.
- v17: after a VOICE command play 0.5 s of generated silence, pause 0.4 s, then the track from the start point
  (player.js SETTLE/startSettled); buttons/Stop during the warm-up go straight to the real track.
- v18 (audioSession flip after listening) and v19 (forcing the keyboard closed) did NOT clear the orange dot and
  v19 broke Speak -> v20 restored the app code exactly to v17 (878e743).
- LESSON: no speculative microphone/audio-session changes without a way to test on her iPad. Offer any such
  change as an opt-in setting she can switch back herself.
- Keyboard-voice fallback is only sticky if the iPad refuses/can't listen; a slow start (6 s) falls back once.

Version history: v28 piano keyboard + starting notes; v27 Android steps in Help; v26 light top band above the black header (Carol: keep);
v25 header top padding; v24 black status strip (replaced by v26); v23 clearer Speak-a-note prompt;
v22 Speak a note + Covered/Fix parked; v21 Hummingsong branding; v20 voice restored to v17; v17 silent warm-up;
v13 keyboard-voice fallback; v12 speed; v11 add song mid-rehearsal; v10 score times; v9 rehearsal part choice;
v8 parts; v6/v7 Pencil drawing + fresh-file fetching; v5 big controls + mark-up.
Reminder for Carol: each Safari tab or Home Screen icon has its own separate storage; always use one icon.
