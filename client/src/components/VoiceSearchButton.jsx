import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { transcribeVoice } from '../lib/api.js';

/**
 * Voice search (v3.8 local Whisper; v3.9 silence auto-stop; v3.9.1 UI).
 *
 * The mic lives inside the Browse search input. Clicking it does NOT
 * open a modal: the search box itself switches into a listening state —
 * a compact panel that exactly covers the input (this component must be
 * rendered inside the position:relative search container) showing a
 * pulsing mic, "Listening…", a live level meter and a cancel button.
 * Errors appear as a small dropdown card under the input. Nothing ever
 * covers the page.
 *
 * Flow: MediaRecorder captures the mic; a Web Audio analyser watches
 * the level. After SILENCE_MS of quiet following actual speech the
 * recording stops by itself, the clip is transcribed by the app's LOCAL
 * Whisper service, and the transcript fills the search box and runs the
 * search. A clip with no detected speech energy is never sent. The
 * browser's cloud SpeechRecognition remains only as a fallback when the
 * local service answers 503. Sessions are guarded (active flag +
 * session counter); tracks, AudioContext, timers, monitors and key
 * listeners are all released on stop, cancel and unmount.
 */
const SPEECH_LANGS = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };

/** Silence detection tuning (configurable in one place). */
const SILENCE_MS = 1800; // pause length that ends the recording
const SILENCE_RMS = 0.02; // level above which audio counts as sound
const NO_SPEECH_STOP_MS = 6000; // give up if nothing is said at all
const MAX_SECONDS = 15; // hard cap

const PANEL_CSS = `
@keyframes fwsDotPulse {
  0% { box-shadow: 0 0 0 0 rgba(179, 38, 30, 0.40); }
  70% { box-shadow: 0 0 0 9px rgba(179, 38, 30, 0); }
  100% { box-shadow: 0 0 0 0 rgba(179, 38, 30, 0); }
}
@keyframes fwsDropIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
`;

const BAR_FACTORS = [0.45, 0.8, 1.25, 0.8, 0.45];

export function VoiceSearchButton({ onTranscript, variant = 'inline' }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('idle'); // recording | transcribing | heard | problem
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);
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
    setLevel(0);
  }

  useEffect(() => () => stopAll(), []);

  // Escape cancels an open session/panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

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

  /** Watch the mic level: drives the meter AND the silence auto-stop. */
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
        setLevel(Math.min(1, rms * 3.2));
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
      setLevel(0);
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
          setUsingFallback(true);
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
    setLevel(0);
    setUsingFallback(false);
    doneRef.current = false;
    setPhase('recording');
    setOpen(true);
    if (!window.isSecureContext) {
      setProblem(t('voiceInsecure'));
      setPhase('problem');
      activeRef.current = false;
      return;
    }
    if (hasRecorder) startLocal(session);
    else {
      setUsingFallback(true);
      startBrowserFallback(session);
    }
  }

  function stopRecording() {
    try { recRef.current?.stop?.(); } catch { /* noop */ }
  }

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const statusText =
    phase === 'transcribing'
      ? t('transcribing')
      : phase === 'heard'
        ? heard
        : heard || `${t('listening')} ${clock}`;

  const buttonStyle =
    variant === 'round'
      ? {
          width: 42, height: 42, borderRadius: '50%', flex: '0 0 auto',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, background: '#eef4ea', border: '1px solid #c9d8c3',
          cursor: 'pointer', padding: 0,
        }
      : {
          width: 36, height: 36, borderRadius: '50%', flex: '0 0 auto',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, background: 'transparent', border: 'none',
          cursor: 'pointer', padding: 0,
        };

  return (
    <>
      <style>{PANEL_CSS}</style>
      <button
        type="button"
        onClick={start}
        aria-label={t('voiceSearch')}
        title={t('voiceSearch')}
        style={buttonStyle}
      >
        🎤
      </button>

      {open && phase !== 'problem' && (
        <div
          role="status"
          aria-label={t('voiceSearch')}
          style={{
            position: 'absolute', inset: 0, zIndex: 6,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 4px 0 8px',
            background: '#fff',
            border: `1.5px solid ${phase === 'heard' ? '#2e7d32' : '#b3261e'}`,
            borderRadius: 9,
            boxShadow: '0 2px 10px rgba(0,0,0,0.10)',
            boxSizing: 'border-box',
            animation: 'fwsDropIn 0.12s ease-out',
          }}
        >
          <button
            type="button"
            onClick={phase === 'recording' ? stopRecording : undefined}
            title={phase === 'recording' ? t('tapWhenDone') : undefined}
            aria-label={t('voiceSearch')}
            style={{
              width: 28, height: 28, borderRadius: '50%', border: 'none', flex: '0 0 auto',
              background: phase === 'heard' ? '#2e7d32' : phase === 'transcribing' ? '#9e9e9e' : '#b3261e',
              color: '#fff', fontSize: 14, lineHeight: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: phase === 'recording' ? 'pointer' : 'default', padding: 0,
              animation: phase === 'recording' ? 'fwsDotPulse 1.6s ease-out infinite' : 'none',
            }}
          >
            {phase === 'heard' ? '✓' : '🎤'}
          </button>
          <span
            style={{
              flex: '1 1 auto', minWidth: 0, fontSize: 14,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: phase === 'recording' && !heard ? '#555' : '#111',
            }}
          >
            {statusText}
          </span>
          {phase === 'recording' && !usingFallback && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 18, flex: '0 0 auto' }} aria-hidden="true">
              {BAR_FACTORS.map((f, i) => (
                <span
                  key={i}
                  style={{
                    width: 3, borderRadius: 2, background: '#b3261e',
                    height: Math.max(3, Math.min(18, 3 + level * 15 * f)),
                    transition: 'height 0.1s ease-out',
                  }}
                />
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={close}
            aria-label={t('voiceClose')}
            title={t('voiceClose')}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none', flex: '0 0 auto',
              background: 'transparent', fontSize: 15, color: '#555',
              cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {open && phase === 'problem' && (
        <div
          role="alert"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
            background: '#fff', border: '1px solid #e2e2e2', borderRadius: 10,
            boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
            padding: '10px 12px', boxSizing: 'border-box',
            animation: 'fwsDropIn 0.12s ease-out',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13.5, lineHeight: 1.45, color: '#333', flex: '1 1 auto' }}>
              {problem}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label={t('voiceClose')}
              style={{
                width: 26, height: 26, borderRadius: '50%', border: 'none', flex: '0 0 auto',
                background: 'transparent', fontSize: 13, color: '#555', cursor: 'pointer', padding: 0,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={start} style={{ padding: '6px 12px', fontSize: 13 }}>
              {t('voiceRetry')}
            </button>
            <button type="button" className="secondary" onClick={close} style={{ padding: '6px 12px', fontSize: 13 }}>
              {t('voiceClose')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
