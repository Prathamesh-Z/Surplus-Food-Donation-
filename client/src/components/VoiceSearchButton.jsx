import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * Voice search (v3.7, rebuilt v3.7.1 YouTube-style) — a round mic button
 * opens a full listening overlay: pulsing mic, LIVE transcript as you
 * speak, and specific guidance when something is wrong (mic blocked,
 * insecure page, no speech heard, no network — Chrome's recognizer is
 * a cloud service). The final transcript fills the caller's search box.
 *
 * The button renders only when the browser exposes SpeechRecognition.
 * Note it ALSO needs a secure context (localhost / HTTPS / the Chrome
 * insecure-origin flag) and mic permission — the overlay says so
 * explicitly when those are missing, instead of failing silently.
 */
const SPEECH_LANGS = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };

const OVERLAY_CSS = `
@keyframes fwsPulse {
  0% { box-shadow: 0 0 0 0 rgba(179, 38, 30, 0.45); }
  70% { box-shadow: 0 0 0 34px rgba(179, 38, 30, 0); }
  100% { box-shadow: 0 0 0 0 rgba(179, 38, 30, 0); }
}
@keyframes fwsFadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

export function VoiceSearchButton({ onTranscript }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState('');
  const recRef = useRef(null);
  const doneRef = useRef(false);

  const Recognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  function stop() {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    recRef.current = null;
  }

  useEffect(() => () => stop(), []);

  if (!Recognition) return null;

  function close() {
    stop();
    setOpen(false);
  }

  function start() {
    setHeard('');
    setProblem('');
    doneRef.current = false;
    setOpen(true);

    if (!window.isSecureContext) {
      setProblem(t('voiceInsecure'));
      return;
    }
    const rec = new Recognition();
    recRef.current = rec;
    rec.lang = SPEECH_LANGS[lang] ?? 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) final += text;
        else interim += text;
      }
      setHeard((final || interim).trim());
      if (final.trim() && !doneRef.current) {
        doneRef.current = true;
        const text = final.trim();
        // Brief pause so the user SEES what was heard, then search.
        setTimeout(() => {
          onTranscript(text);
          setOpen(false);
        }, 650);
      }
    };
    rec.onerror = (event) => {
      if (doneRef.current) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setProblem(t('voiceMicBlocked'));
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        setProblem(t('voiceNoSpeech'));
      } else if (event.error === 'network') {
        setProblem(t('voiceNetwork'));
      } else if (event.error !== 'audio-capture') {
        setProblem(t('voiceError'));
      } else {
        setProblem(t('voiceMicBlocked'));
      }
    };
    rec.onend = () => {
      recRef.current = null;
    };
    try {
      rec.start();
    } catch {
      setProblem(t('voiceError'));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={t('voiceSearch')}
        title={t('voiceSearch')}
        style={{
          width: 42, height: 42, borderRadius: '50%', flex: '0 0 auto',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, background: '#eef4ea', border: '1px solid #c9d8c3',
          cursor: 'pointer', padding: 0,
        }}
      >
        🎤
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('voiceSearch')}
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(255,255,255,0.97)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '9vh 24px 24px', animation: 'fwsFadeIn 0.15s ease-out',
          }}
        >
          <style>{OVERLAY_CSS}</style>
          <button
            type="button"
            onClick={close}
            aria-label={t('voiceClose')}
            style={{
              position: 'absolute', top: 14, right: 18, width: 40, height: 40,
              borderRadius: '50%', border: 'none', background: 'transparent',
              fontSize: 22, cursor: 'pointer', color: '#444',
            }}
          >
            ✕
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 640, width: '100%' }}
          >
            <div
              style={{
                width: 96, height: 96, borderRadius: '50%',
                background: problem ? '#9e9e9e' : '#b3261e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 44, color: '#fff',
                animation: problem ? 'none' : 'fwsPulse 1.6s ease-out infinite',
              }}
            >
              🎤
            </div>
            <p style={{ fontSize: 20, color: '#555', marginTop: 26 }}>
              {problem ? t('voiceProblemTitle') : t('listening')}
            </p>
            <p
              style={{
                fontSize: 30, lineHeight: 1.35, textAlign: 'center',
                minHeight: 82, color: heard ? '#111' : '#999', fontWeight: 500,
                margin: '6px 0 0',
              }}
            >
              {problem || heard || t('voiceTrySaying')}
            </p>
            {!problem && (
              <button type="button" className="secondary" onClick={close} style={{ marginTop: 18 }}>
                {t('voiceClose')}
              </button>
            )}
            {problem && (
              <div className="row" style={{ marginTop: 18 }}>
                <button type="button" onClick={start}>{t('voiceRetry')}</button>
                <button type="button" className="secondary" onClick={close}>{t('voiceClose')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
