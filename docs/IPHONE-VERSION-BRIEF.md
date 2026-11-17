# Starting the iPhone version: instructions for Carol

> **Done (17 Nov 2026):** the phone version was built as **Sectional Practice** in `phone/`. Carol's answers and the details are in CLAUDE.md.

## How to start the new session

1. Go to **claude.ai/code** and start a **new session**.
2. Choose the repository **NovaDiva/sectionalapp**. It already holds the iPad app, so the new session can reuse its working parts: track player, speed, starting notes, timestamps and the score-times reader.
3. Copy everything in the grey box below and paste it as your first message.
4. Answer the questions it asks. Your answers decide what the iPhone version keeps.

Before you start, have a think about **who will use the iPhone version**: you or other leaders on the go, or choir members practising at home? That answer shapes most of the other choices.

## Message to paste

```
I'd like a phone version of Sectional, the choir sectional app in this repository, for iPhone,
with fewer features than the iPad app.

Please start by reading CLAUDE.md (project notes, my decisions and the audio lessons learned),
docs/LEADER-GUIDE.md and docs/IPHONE-VERSION-BRIEF.md. Then ask me the questions in the brief's
"Questions to settle first" section before building anything.

Ground rules (same as the iPad app):
- Keep it simple for people with basic phone skills: big buttons, plain words, few steps.
- Home-screen web app (no App Store), plain HTML/CSS/JS, no build step, works offline.
- Everything stays on the person's own phone. No logins, no server.
- The repository is public: never commit scores, tracks or personal details.
- Don't change the iPad app or its address unless I ask. The iPad app is live and in use
  (version 30 at https://novadiva.github.io/sectionalapp/).
- Reuse the iPad app's tested code where it fits, especially js/player.js (iPhone audio must
  start from a tap; follow the lessons in CLAUDE.md before touching audio or microphone code).
- Test at iPhone size in the browser, and tell me what I need to check on my own iPhone.
```

## Questions to settle first (the new session should ask these)

1. **Who is it for?** Leaders, choir members, or both?
2. **Which features stay?** Suggested starting point for a phone, to confirm or change:

   | Feature (iPad app) | Suggested for iPhone |
   |---|---|
   | Play part tracks, choose the track | Keep |
   | Start from the top, a letter or a bar | Keep |
   | Stop / Again / Back 5s | Keep |
   | Slow down (Normal to 50%) | Keep |
   | Starting notes and piano keyboard | Keep (keyboard: one octave on a phone) |
   | View the score | Keep, read-only, or leave out? |
   | Mark up the score (pen, highlighter) | Leave out |
   | Make timestamps (MARK button, paste table, read from score) | Leave out, or only "read from score"? |
   | Speak (voice commands) | Leave out (keeps it simple, avoids microphone issues) |
   | Rehearsal notes, summary and sharing | Leave out |
   | My parts | Keep |
   | Backup and restore | Keep |

3. **How do songs get onto the phone?** Each person adds their own files, or a leader sends a ready-made file (for example an iPad backup the phone can open)? The second is much easier for choir members.
4. **Where does it live?** A separate address, such as https://novadiva.github.io/sectionalapp/phone/ (suggested: same repository, separate folder, own home-screen icon), or a separate repository?
5. **Name and look:** same Hummingsong branding and name ("Sectional"), or a different name for the phone, such as "Sectional Practice"?
6. **Upright only, or sideways too?**

## Notes for the new session

- The iPad app is plain JavaScript modules in js/. The likely reusable parts are player.js (playback, speed,
  the iPhone tap rules, the starting-note player), pitch.js (note tone), timestamps.js (letters and bars),
  parts.js (my parts), scoretimes.js (times printed on scores) and db.js (on-device storage, backup format).
- If the phone app is a folder under the same address, it shares on-device storage with the iPad app on
  the same device. Pick its own database name (or share on purpose) and its own service worker scope and
  VERSION, so updating one app never forces an update banner in the other.
- Keep the iPad app's tests passing (npm test and tests/browser), and add phone-size browser tests for the new app.
