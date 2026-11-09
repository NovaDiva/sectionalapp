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
  also supported (the format comes from her choir-track-timestamps skill).
- Rehearsal Play tab: big track buttons (track names, choice stays per song), Start-from buttons
  (top / letters / bar box), big Speak/Stop/Again/Back 5s, a type box, then the chat log.
  The 🎤 voice button can be switched off in Help (Bluetooth speakers drop when the mic is used).
- Score viewer: ✏️ Mark up (pen, highlighter, typed notes, eraser, undo), saved in item.annotations
  as fractions of the page size; 🎵 Player toggles the compact track/letter panel.
- Parts: the choir has Soprano 1, Soprano 2, Alto 1, Alto 2 (4-part) and Tops, Middles, Lowers (3-part).
  Each leader picks "my parts" (first-run card / Help), and only those tracks show, plus tracks for everyone
  (item.part = null: full mix, piano). Track part is guessed from the name and can be changed on the song page.
  Parts list is editable in Help and travels in backups; "my parts" stays per iPad (localStorage). See js/parts.js.
- Rehearsal record: songs/letters/bars covered, free-text notes, a "Fix next time" list that carries over.
- Summary is shared with the iPad share sheet (email/WhatsApp).

## Working on it
- `npm test` runs the unit tests (command parser, spoken phrases, timestamps).
- Run locally with `python3 -m http.server`. Check flows in Playwright at iPad size (1024x1366).
- Bump `VERSION` in `sw.js` on every change to app files. The app compares it with the online copy
  and shows a "Tap to update" banner, so leaders never need to reopen the link (that makes a new, empty copy).
- iPad audio must start from a tap: keep `player.prepare()` before commands and `player.unlock()` on the mic tap.

## Status
v5 (9 Nov 2026): after Carol's first rehearsal: big Play controls + track buttons, score mark-up,
voice on/off switch. Earlier: voice commands, Bluetooth sound-mode fix, update banner.
v9 (10 Nov): new rehearsal has a real part choice (r.parts) that filters its tracks. v8: parts + my-parts filtering. v6/v7: Pencil drawing fixed (Carol confirmed) and fresh-file fetching.
Earlier v6 note: on Carol's iPad the mark-up toolbar showed but strokes didn't draw. Fix: non-passive touchstart/move
preventDefault on the drawing canvas (iPad scroll/Scribble was taking the stroke), canvas memory caps,
on-screen error toasts. Not yet confirmed on her iPad. No WebKit browser here, so test on the iPad.
Open question: does the Bluetooth speaker stay connected with the mic (audioSession fix)?
Reminder for Carol: each Safari tab or Home Screen icon has its own separate storage.
