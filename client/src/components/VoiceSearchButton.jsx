import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * Voice search (v3.7) — Web Speech API (SpeechRecognition). The button
 * renders ONLY when the browser supports it, so there is never a dead
 * control. Recognition language follows the app's UI language, so a
 * Marathi/Hindi UI listens for Marathi/Hindi food names. The transcript
 * is handed to the caller, which drops it into the normal search box —
 * voice is an input method, not a separate search path.
 */
const SPEECH_LANGS = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };

export function VoiceSearchButton({ onTranscript, onError }) {
  const { t, lang } = useLang();
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const Recognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  useEffect(() => () => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  if (!Recognition) return null;

  function toggle() {
    if (listening) {
      try { recRef.current?.stop(); } catch { /* noop */ }
      setListening(false);
      return;
    }
    const rec = new Recognition();
    recRef.current = rec;
    rec.lang = SPEECH_LANGS[lang] ?? 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      setListening(false);
      if (text) onTranscript(text);
    };
    rec.onerror = () => {
      setListening(false);
      onError?.(t('voiceError'));
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      onError?.(t('voiceError'));
    }
  }

  return (
    <button
      type="button"
      className="secondary"
      onClick={toggle}
      aria-label={t('voiceSearch')}
      title={t('voiceSearch')}
      style={listening ? { borderColor: '#b3261e', color: '#b3261e', fontWeight: 700 } : undefined}
    >
      🎤 {listening ? t('listening') : t('voiceSearch')}
    </button>
  );
}
