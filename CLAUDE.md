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
- Rehearsal commands: chat box with typed commands plus a 🎤 voice button (Web Speech API, with
  keyboard dictation as the fallback). Ready-made buttons under the chat.
- Rehearsal record: songs/letters/bars covered, free-text notes, a "Fix next time" list that carries over.
- Summary is shared with the iPad share sheet (email/WhatsApp).

## Working on it
- `npm test` runs the unit tests (command parser, spoken phrases, timestamps).
- Run locally with `python3 -m http.server`. Check flows in Playwright at iPad size (1024x1366).
- Bump `VERSION` in `sw.js` on every change to app files. The app compares it with the online copy
  and shows a "Tap to update" banner, so leaders never need to reopen the link (that makes a new, empty copy).
- iPad audio must start from a tap: keep `player.prepare()` before commands and `player.unlock()` on the mic tap.

## Status
v4 (9 Nov 2026): version 1 + voice commands + Bluetooth speaker sound fix + update banner.
Carol tested it in a real rehearsal and has a list of changes coming next.
Reminder for Carol: each Safari tab or Home Screen icon has its own separate storage.
