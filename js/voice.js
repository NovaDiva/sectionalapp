// Voice commands using the browser's built-in speech recognition (Safari on
// iPad, Chrome on Android/desktop). Where it isn't available, the app falls
// back to the microphone key on the iPad keyboard (dictation).

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const voiceSupported = !!Recognition;

let active = null;

/**
 * Listen for one command.
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
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      latest = (finalText + interim).trim();
      onInterim?.(latest);
    };
    rec.onerror = (e) => {
      active = null;
      if (e.error === 'no-speech' || e.error === 'aborted') resolve('');
      else reject(new Error(e.error || 'voice-error'));
    };
    rec.onend = () => { active = null; resolve((finalText || latest).trim()); };
    try { rec.start(); } catch (err) { active = null; reject(err); }
  });
}

export function stopListening() {
  if (active) { try { active.stop(); } catch { /* already stopped */ } }
}

export function isListening() { return !!active; }
