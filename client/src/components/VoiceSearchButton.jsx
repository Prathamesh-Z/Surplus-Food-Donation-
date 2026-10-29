import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { transcribeVoice } from '../lib/api.js';

/**
 * Voice search (v3.8; UX v3.9) — YouTube/Google-style: a mic icon INSIDE
 * the search box opens a listening overlay; you speak, pause, and the
 * search runs by itself. No "Done" tap is required.
 *
 * How it works:
 *  - MediaRecorder captures the mic; a Web Audio analyser watches the
 *    input level. After SILENCE_MS of quiet following actual speech,
 *    recording stops automatically and the clip is transcribed by the
 *    app's LOCAL Whisper service (nothing leaves the laptop).
 *  - If no speech energy is ever detected, the clip is never sent —
 *    the user just gets a "didn't hear anything" message.
 *  - The browser's cloud SpeechRecognition remains only as a fallback
 *    when the local service answers 503 (it endpoints on its own).
 *  - Cancel (✕, backdrop, or the Cancel button) tears down tracks,
 *    the audio context, timers and listeners. A session counter makes
 *    stale async completions harmless.
 */
const SPEECH_LANGS = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };

/** Silence detection tuning (configurable in one place). */
const SILENCE_MS = 1800; // pause length that ends the recording
const SILENCE_RMS = 0.02; // level above which audio counts as sound
const NO_SPEECH_STOP_MS = 6000; // give up if nothing is said at all
const MAX_SECONDS = 15; // hard cap

const OVERLAY_CSS = `
@keyframes fwsPulse {
  0% { box-shadow: 0 0 0 0 rgba(179, 38, 30, 0.45); }
  70% { box-shadow: 0 0 0 34px rgba(179, 38, 30, 0); }
  100% { box-shadow: 0 0 0 0 rgba(179, 38, 30, 0); }
}
@keyframes fwsFadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

export function VoiceSearchButton({ onTranscript, variant = 'round' }) {
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
  const monitorRef = useRef(null);
  const audioCtxRef = useRef(null);
  const doneRef = useRef(false);
  const activeRef = useRef(false);
  const sessionRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const usingFallbackRef = useRef(false);

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
    if (monitorRef.current) clearInterval(monitorRef.current);
    timerRef.current = null;
    monitorRef.current = null;
    try { recRef.current?.stop?.(); } catch { /* already stopped */ }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  }

  useEffect(() => () => stopAll(), []);

  if (!hasRecorder && !Recognition) return null;

  function close() {
    doneRef.current = true;
    activeRef.current = false;
    sessionRef.current += 1; // invalidate anything still in flight
    stopAll();
    setOpen(false);
  }

  function fail(messageKey) {
    doneRef.current = true;
    activeRef.current = false; // session over — Retry may start a new one
    stopAll();
    setProblem(t(messageKey));
    setPhase('problem');
  }

  function commit(text, session) {
    if (doneRef.current || session !== sessionRef.current) return;
    doneRef.current = true;
    setHeard(text);
    setPhase('heard');
    setTimeout(() => {
      if (session === sessionRef.current) {
        onTranscript(text);
        activeRef.current = false;
        setOpen(false);
      }
    }, 650);
  }

  /** Watch the mic level; end the recording after a spoken pause. */
  function startSilenceMonitor(stream, rec, session) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return; // no analyser available — MAX_SECONDS still caps it
    try {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const startedAt = Date.now();
      let lastSoundAt = startedAt;
      monitorRef.current = setInterval(() => {
        if (session !== sessionRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / (data.length / 4));
        const now = Date.now();
        if (rms > SILENCE_RMS) {
          lastSoundAt = now;
          hasSpokenRef.current = true;
        }
        if (hasSpokenRef.current && now - lastSoundAt >= SILENCE_MS) {
          try { rec.stop(); } catch { /* noop */ }
        } else if (!hasSpokenRef.current && now - startedAt >= NO_SPEECH_STOP_MS) {
          try { rec.stop(); } catch { /* noop */ }
        }
      }, 100);
    } catch {
      /* level monitoring is an enhancement; recording still works without it */
    }
  }

  // ── Primary: local Whisper ──────────────────────────────────────────
  async function startLocal(session) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (session === sessionRef.current) fail('voiceMicBlocked');
      return;
    }
    if (doneRef.current || session !== sessionRef.current) {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    streamRef.current = stream;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find((m) => window.MediaRecorder.isTypeSupported(m));
    const rec = new window.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = rec;
    chunksRef.current = [];
    hasSpokenRef.current = false;
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      if (monitorRef.current) clearInterval(monitorRef.current);
      timerRef.current = null;
      monitorRef.current = null;
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      if (doneRef.current || session !== sessionRef.current) return;
      if (!hasSpokenRef.current) {
        fail('voiceNoSpeech');
        return;
      }
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      setPhase('transcribing');
      try {
        const data = await transcribeVoice(blob, lang);
        if (session !== sessionRef.current) return;
        const text = (data.text ?? '').trim();
        if (text) commit(text, session);
        else fail('voiceNoSpeech');
      } catch (err) {
        if (session !== sessionRef.current) return;
        if (err.status === 503 && Recognition) {
          usingFallbackRef.current = true;
          startBrowserFallback(session);
        } else if (err.status === 503) {
          fail('voiceServiceDown');
        } else {
          fail('voiceError');
        }
      }
    };
    rec.start();
    startSilenceMonitor(stream, rec, session);
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
  function startBrowserFallback(session) {
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
        commit(final.trim(), session);
      }
    };
    rec.onend = () => {
      if (!doneRef.current && session === sessionRef.current) fail('voiceNoSpeech');
    };
    rec.onerror = (event) => {
      if (doneRef.current || session !== sessionRef.current) return;
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
    if (activeRef.current) return; // one live session at a time
    activeRef.current = true;
    sessionRef.current += 1;
    const session = sessionRef.current;
    setHeard('');
    setProblem('');
    setSeconds(0);
    doneRef.current = false;
    usingFallbackRef.current = false;
    setPhase('recording');
    setOpen(true);
    if (!window.isSecureContext) {
      setProblem(t('voiceInsecure'));
      setPhase('problem');
      return;
    }
    if (hasRecorder) startLocal(session);
    else startBrowserFallback(session);
  }

  function stopRecording() {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
  }

  const micColor = phase === 'problem' ? '#9e9e9e' : '#b3261e';
  const buttonStyle =
    variant === 'inline'
      ? {
          width: 36, height: 36, borderRadius: '50%', flex: '0 0 auto',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, background: 'transparent', border: 'none',
          cursor: 'pointer', padding: 0,
        }
      : {
          width: 42, height: 42, borderRadius: '50%', flex: '0 0 auto',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, background: '#eef4ea', border: '1px solid #c9d8c3',
          cursor: 'pointer', padding: 0,
        };

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={t('voiceSearch')}
        title={t('voiceSearch')}
        style={buttonStyle}
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
              onClick={phase === 'recording' ? stopRecording : undefined}
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
            {phase === 'recording' && (
              <>
                <p className="muted" style={{ marginTop: 10 }}>{t('voiceAutoStop')}</p>
                <button type="button" className="secondary" onClick={close} style={{ marginTop: 8 }}>
                  {t('voiceClose')}
                </button>
              </>
            )}
            {phase === 'problem' && (
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
