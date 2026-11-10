// Voice commands using the browser's built-in speech recognition (Safari on
// iPad, Chrome on Android/desktop). Where it isn't available, the app falls
// back to the microphone key on the iPad keyboard (dictation).

import { setSoundMode, releaseMic } from './player.js';

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const voiceSupported = !!Recognition;

let active = null;

/**
 * Listen for one command.
 * @param {{onInterim?: (text: string) => void}} opts
 * @returns {Promise<string>} what was heard ('' if nothing)
 */
let finishActive = null; // ends the current listen() (used by stopListening)

/**
 * Listen for one command.
 * Rejects with Error('no-start') if the iPad never starts listening (then the
 * app falls back to keyboard dictation), or with the browser's error name.
 * @param {{onInterim?: (text: string) => void}} opts
 * @returns {Promise<string>} what was heard ('' if nothing)
 */
export function listen({ onInterim } = {}) {
  if (!Recognition) return Promise.reject(new Error('not-supported'));
  stopListening();
  return new Promise((resolve, reject) => {
    const rec = new Recognition();
    active = rec;
    rec.lang = navigator.language || 'en-GB';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let latest = '';
    let started = false;
    let done = false;
    const timers = [];
    // Settle exactly once, and always reset, so the button can never get stuck.
    const finish = (err) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      if (active === rec) active = null;
      finishActive = null;
      // Close the microphone completely and let go of the recogniser, then hand the sound back
      // to music mode once the iPad has finished closing it (releaseMic waits a moment).
      rec.onresult = rec.onerror = rec.onend = rec.onstart = rec.onaudiostart = null;
      try { rec.abort(); } catch { /* already ended */ }
      releaseMic();
      if (err) reject(err); else resolve((finalText || latest).trim());
    };
    finishActive = () => finish();
    rec.onstart = () => { started = true; };
    rec.onaudiostart = () => { started = true; };
    rec.onresult = (e) => {
      started = true;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      latest = (finalText + interim).trim();
      onInterim?.(latest);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') finish();
      else finish(new Error(e.error || 'voice-error'));
    };
    rec.onend = () => finish(started || finalText || latest ? null : new Error('no-start'));
    // Never started within 6 s: listening isn't working right now.
    timers.push(setTimeout(() => { if (!started) finish(new Error('no-start')); }, 6000));
    // Never listen for more than 12 s.
    timers.push(setTimeout(() => finish(), 12000));
    setSoundMode('play-and-record');
    try { rec.start(); } catch (err) { finish(err); }
  });
}

export function stopListening() {
  if (finishActive) finishActive();
  else if (active) { try { active.stop(); } catch { /* already stopped */ } active = null; }
}

export function isListening() { return !!active; }
