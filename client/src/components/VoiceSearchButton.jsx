import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { transcribeVoice } from '../lib/api.js';

/**
 * Voice search (v3.8) — YouTube-style overlay, LOCAL transcription.
 *
 * Primary path: record the mic with MediaRecorder and transcribe on
 * this machine with Whisper (the app's own inference service). No
 * audio leaves the laptop, and there is no dependence on a browser
 * vendor's cloud recognizer — Chrome's SpeechRecognition sends audio
 * to Google and fails with a generic "network" error on many real
 * networks even when the internet works (the v3.7.1 field failure).
 *
 * Fallback: only if the local speech service is unreachable (503) AND
 * the browser offers SpeechRecognition, the overlay switches to the
 * browser recognizer and says so via its own error messages.
 *
 * Mic access still needs a secure context (localhost / HTTPS / the
 * Chrome insecure-origin flag) — the overlay explains that case.
 */
const SPEECH_LANGS = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };
const MAX_SECONDS = 15;

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
  const [phase, setPhase] = useState('idle'); // recording | transcribing | heard | problem
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef(null); // MediaRecorder or SpeechRecognition
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const doneRef = useRef(false);

  const hasRecorder =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined';
  const Recognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  function stopAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try { recRef.current?.stop?.(); } catch { /* already stopped */ }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopAll(), []);

  if (!hasRecorder && !Recognition) return null;

  function close() {
    // Mark done FIRST: stopping the recorder fires onstop, which must
    // not start a transcription for a clip the user abandoned.
    doneRef.current = true;
    stopAll();
    setOpen(false);
  }

  function fail(messageKey) {
    doneRef.current = true;
    stopAll();
    setProblem(t(messageKey));
    setPhase('problem');
  }

  function commit(text) {
    if (doneRef.current) return;
    doneRef.current = true;
    setHeard(text);
    setPhase('heard');
    setTimeout(() => {
      onTranscript(text);
      setOpen(false);
    }, 650);
  }

  // ── Primary: local Whisper ──────────────────────────────────────────
  async function startLocal() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail('voiceMicBlocked');
      return;
    }
    if (doneRef.current) {
      // Overlay was closed while the permission prompt was up.
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    streamRef.current = stream;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find((m) => window.MediaRecorder.isTypeSupported(m));
    const rec = new window.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (doneRef.current) return; // closed mid-recording
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      setPhase('transcribing');
      try {
        const data = await transcribeVoice(blob, lang);
        const text = (data.text ?? '').trim();
        if (text) commit(text);
        else fail('voiceNoSpeech');
      } catch (err) {
        if (err.status === 503 && Recognition) {
          startBrowserFallback();
        } else if (err.status === 503) {
          fail('voiceServiceDown');
        } else {
          fail('voiceError');
        }
      }
    };
    rec.start();
    setPhase('recording');
    setSeconds(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) {
        try { rec.stop(); } catch { /* noop */ }
      }
    }, 250);
  }

  // ── Fallback: browser cloud recognizer (only when local is down) ───
  function startBrowserFallback() {
    setPhase('recording');
    setHeard('');
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
      if (final.trim()) {
        try { rec.stop(); } catch { /* noop */ }
        commit(final.trim());
      }
    };
    rec.onerror = (event) => {
      if (doneRef.current) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') fail('voiceMicBlocked');
      else if (event.error === 'no-speech' || event.error === 'aborted') fail('voiceNoSpeech');
      else if (event.error === 'network') fail('voiceNetwork');
      else fail('voiceError');
    };
    try {
      rec.start();
    } catch {
      fail('voiceError');
    }
  }

  function start() {
    setHeard('');
    setProblem('');
    setSeconds(0);
    doneRef.current = false;
    setPhase('recording');
    setOpen(true);
    if (!window.isSecureContext) {
      setProblem(t('voiceInsecure'));
      setPhase('problem');
      return;
    }
    if (hasRecorder) startLocal();
    else startBrowserFallback();
  }

  function stopRecording() {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
  }

  const busy = phase === 'recording' || phase === 'transcribing';
  const micColor = phase === 'problem' ? '#9e9e9e' : '#b3261e';

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
            <button
              type="button"
              onClick={phase === 'recording' && hasRecorder ? stopRecording : undefined}
              aria-label={t('voiceSearch')}
              style={{
                width: 96, height: 96, borderRadius: '50%', border: 'none',
                background: micColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 44, color: '#fff', cursor: phase === 'recording' ? 'pointer' : 'default',
                animation: phase === 'recording' ? 'fwsPulse 1.6s ease-out infinite' : 'none',
              }}
            >
              🎤
            </button>
            <p style={{ fontSize: 20, color: '#555', marginTop: 26 }}>
              {phase === 'problem'
                ? t('voiceProblemTitle')
                : phase === 'transcribing'
                  ? t('transcribing')
                  : phase === 'heard'
                    ? t('voiceSearch')
                    : `${t('recording')} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
            </p>
            <p
              style={{
                fontSize: 30, lineHeight: 1.35, textAlign: 'center',
                minHeight: 82, color: heard ? '#111' : '#999', fontWeight: 500,
                margin: '6px 0 0',
              }}
            >
              {phase === 'problem' ? problem : heard || t('voiceTrySaying')}
            </p>
            {phase === 'recording' && hasRecorder && (
              <button type="button" onClick={stopRecording} style={{ marginTop: 18 }}>
                {t('tapWhenDone')}
              </button>
            )}
            {phase === 'problem' && (
              <div className="row" style={{ marginTop: 18 }}>
                <button type="button" onClick={start}>{t('voiceRetry')}</button>
                <button type="button" className="secondary" onClick={close}>{t('voiceClose')}</button>
              </div>
            )}
            {busy && phase !== 'recording' && (
              <p className="muted">{t('transcribing')}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
