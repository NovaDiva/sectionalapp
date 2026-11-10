# Project notes for Claude

Sectional: an iPad web app for choir sectional leaders, built for Carol.
Live at https://hummingsong-novadiva.github.io/sectionalapp/ (GitHub Pages, served from branch
`claude/choir-sectional-app-wg6esg`, root folder). The repository is public, so never commit scores, tracks or personal data.

## Decisions Carol made (keep to these unless she changes them)
- Must stay simple for leaders with basic iPad skills: big buttons, plain words, few steps.
- Web app added to the home screen (PWA), not an App Store app. Plain HTML/CSS/JS, no build step.
- Each leader manages their own library on their own iPad (IndexedDB). No login, no server.
  Backup/restore in the Help tab is how setups are copied between iPads.
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
- Rehearsal record: songs/letters/bars covered, free-text notes, a "Fix next time" list that carries over.
- Speed: slow down only (Normal, 90…50%), pitch preserved, remembered in localStorage; buttons in rehearsal,
  score player and Timestamps screen; voice "slower / half speed / speed 80 / normal speed". No speeding up.
- Summary is shared with the iPad share sheet (email/WhatsApp).

## Working on it
- `npm test` runs the unit tests (command parser, spoken phrases, timestamps).
- Run locally with `python3 -m http.server`. Check flows in Playwright at iPad size (1024x1366).
- Bump `VERSION` in `sw.js` on every change to app files. The app compares it with the online copy
  and shows a "Tap to update" banner, so leaders never need to reopen the link (that makes a new, empty copy).
- iPad audio must start from a tap: keep `player.prepare()` before commands and `player.unlock()` on the mic tap.

## Status (v13, 10 Nov 2026) - Carol is testing on her iPad; next session = her feedback
Done and live: songs/scores/tracks, tap-along timestamps (+ paste table, + read times printed on the
score), rehearsal Play panel (track buttons, start-from letters/bar, Speak/Stop/Again/Back, speed),
voice + typed commands, notes / covered / fix-next-time, summary sharing, score mark-up (Pencil works,
confirmed by Carol), parts + "my parts" filtering, part choice per rehearsal, add/remove songs mid-rehearsal,
slow-down speed (Normal…50%), update banner, Bluetooth sound-mode attempt, backup/restore.

Still to confirm on Carol's iPad:
- Does the Bluetooth speaker stay connected after using the 🎤? (audioSession fix; otherwise voice can be switched off)
- Reading times from her real "with timestamps" PDFs: how many found, letters correct?
- How slowed-down tracks sound (pitch preserved), especially at 50%.

Still to confirm: does Speak now respond straight away (direct or keyboard mode)? What does Help say for her iPad?
Testing: `npm test` (unit) and tests/browser/README.md (Playwright flows + fixture generator).
Version history: v5 big controls + mark-up; v6/v7 Pencil drawing + fresh-file fetching; v8 parts;
v9 rehearsal part choice; v10 score times; v11 add song mid-rehearsal; v12 speed; v13 Speak fallback to keyboard dictation
(Carol: mic only responded after tapping the type box first) + listen() timeouts.
Reminder for Carol: each Safari tab or Home Screen icon has its own separate storage; always use one icon.
