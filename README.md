# Sectional – choir rehearsal helper

A simple iPad/tablet app for choir sectional leaders:

- **Songs**: keeps each song's score PDFs (choir + piano, choir only) and its tracks (Full mix, Soprano, Alto, Tenor, Bass…).
- **Timestamps**: tap-along marking. Play a track and tap **MARK** at each rehearsal letter or phrase, then type the bar and letter. Each track keeps its own timestamps. You can copy them from another track and adjust, or paste a table from the "2027 Time Stamps" doc.
- **Rehearsal**: tap 🎤 and say (or type) what you want to hear ("alto bar 32", "full mix letter B", "bars 10-24", "stop", "again") and it plays from the right spot. You also get notes, a record of the songs and bars covered, and a "Fix next time" list that carries over to the next sectional.
- **Finish & share**: one tap makes a summary you can send by email, Messages or WhatsApp.

Everything stays **on each leader's own iPad**. There's no login, no server and no internet needed once it's installed. The **Help** tab has back-up and restore (to Files / iCloud Drive), which you can also use to copy a setup to another iPad.

See [docs/LEADER-GUIDE.md](docs/LEADER-GUIDE.md) for the one-page guide for leaders.

## Putting it online (one-time)

It's a plain website (HTML, CSS and JavaScript, with no build step). It needs to be served over HTTPS so iPads can install it. The easiest free option is GitHub Pages:

1. On GitHub, open this repository → **Settings** → **Pages**.
2. Under "Build and deployment", choose **Deploy from a branch**, pick the branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
3. After a minute the address appears, e.g. `https://<your-account>.github.io/sectionalapp/`.
4. Send that link to the leaders. On the iPad, open it in **Safari** → **Share** → **Add to Home Screen**.

Any other static host (Netlify, Cloudflare Pages, your choir's website) works too. Just upload the folder.

## Updating the app

After changing files, bump `VERSION` in `sw.js` (e.g. `sectional-v2`). Installed apps pick up the new version the next time they're opened with internet.

## For developers

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # unit tests for timestamps + the command parser
```

| File | What it does |
|---|---|
| `index.html`, `css/app.css` | Page shell and styling (large touch targets) |
| `js/app.js` | Screens: Rehearsal, Songs, Timestamps, Summary, Past, Help |
| `js/commands.js` | Understands typed commands ("alto bar 32", "B to C", "note: …") |
| `js/timestamps.js` | Time formatting, bar → time lookup (estimates between marks), table import |
| `js/voice.js` | Voice commands (browser speech recognition; falls back to keyboard dictation) |
| `js/player.js` | Shared audio player (works around iPad tap-to-play rules) |
| `js/db.js` | On-device storage (IndexedDB), backup/restore |
| `js/pdfviewer.js` | Score viewer (bundled PDF.js in `vendor/pdfjs`, Apache-2.0) |
| `sw.js`, `manifest.webmanifest` | Offline support and home-screen install |

### How bar numbers become times

A track's timestamps are a list of `{time, bar, letter, words}`. When a leader asks for a bar that isn't marked, the app estimates it from the nearest marks either side, assuming a steady tempo, and says "about". The more bars you mark, especially at tempo changes, the more accurate it gets.
