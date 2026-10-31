import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useLang } from '../i18n/LanguageContext.jsx';
import { api, formatApiError } from '../lib/api.js';

// Pickup by QR: the claimer shows a QR of their pickup code; the provider
// scans it with the device camera (BarcodeDetector where available) or
// falls back to typing the 8-character code. The code — and the whole
// verification design behind it — is unchanged.
export function PickupCodeDisplay({ code, variant }) {
  const { t } = useLang();
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    if (code) {
      QRCode.toDataURL(code, { width: 200, margin: 1 })
        .then((url) => {
          if (live) setQrUrl(url);
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [code]);

  // QA-11: copy the 8 characters — QR alone does not help where it cannot
  // be scanned. Clipboard API with a textarea fallback for older browsers.
  async function copyCode() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Card variant (My Claims): the QR sits directly under the donor
  // contact and the code itself is the copy control — a real button, so
  // keyboard and assistive tech get copying without a separate Copy
  // button. Same copyCode behaviour and QR payload as the default.
  if (variant === 'card') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
        {qrUrl && (
          <img
            src={qrUrl}
            alt={`QR — ${code}`}
            width={132}
            height={132}
            style={{ borderRadius: 8, background: '#fff', border: '1px solid #d9e8d2' }}
          />
        )}
        <span>
          {t('pickupCode')}:{' '}
          <button
            type="button"
            className="codeTap"
            onClick={copyCode}
            title={t('copyCode')}
            aria-label={`${t('copyCode')}: ${code}`}
          >
            <span className="code">{code}</span>
          </button>
          {copied && (
            <span className="success" role="status" style={{ marginLeft: 8 }}>✓ {t('copied')}</span>
          )}
        </span>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <span>
        {t('pickupCode')}: <span className="code">{code}</span>
      </span>
      <button type="button" className="secondary" onClick={copyCode} style={{ padding: '6px 12px' }}>
        {copied ? t('copied') : t('copyCode')}
      </button>
      {qrUrl && (
        <img
          src={qrUrl}
          alt={`QR — ${code}`}
          width={132}
          height={132}
          style={{ borderRadius: 8, background: '#fff', border: '1px solid #d9e8d2' }}
        />
      )}
    </span>
  );
}

export function VerifyPickup({ claimId, onDone }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  function stopScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScan() {
    setError('');
    if (!('BarcodeDetector' in window)) {
      setError('This browser cannot scan QR codes — type the 8-character code instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      requestAnimationFrame(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const tick = async () => {
            if (!streamRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) {
                const value = (codes[0].rawValue ?? '').trim().toUpperCase();
                stopScan();
                if (value) submit(value);
                return;
              }
            } catch {
              /* keep scanning */
            }
            setTimeout(() => requestAnimationFrame(tick), 350);
          };
          tick();
        }
      });
    } catch {
      setError('Camera unavailable — type the code instead.');
      setScanning(false);
    }
  }

  async function submit(value) {
    const finalCode = (value ?? code).trim().toUpperCase();
    if (finalCode.length !== 8) {
      setError('The pickup code has 8 characters.');
      return;
    }
    try {
      // QA-02: a wrong code is not an expired token — never refresh on it.
      const res = await api(`/api/claims/${claimId}/verify`, { method: 'POST', body: { code: finalCode }, skipRefresh: true });
      window.alert(res.alreadyCollected ? 'Already collected earlier — no change.' : 'Collected ✓');
      setOpen(false);
      onDone?.();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  if (!open) {
    return (
      <button className="secondary" onClick={() => setOpen(true)}>
        Verify pickup
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-block' }}>
      <span className="row">
        <input
          placeholder="8-character code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={{ width: 170, textTransform: 'uppercase' }}
          maxLength={8}
        />
        <button onClick={() => submit()}>Verify</button>
        <button className="secondary" onClick={scanning ? stopScan : startScan}>
          {scanning ? 'Stop camera' : 'Scan QR'}
        </button>
        <button
          className="secondary"
          onClick={() => {
            stopScan();
            setOpen(false);
          }}
        >
          Close
        </button>
      </span>
      {scanning && <video ref={videoRef} style={{ width: 260, borderRadius: 10, marginTop: 8 }} muted playsInline />}
      {error && <div className="error" style={{ marginTop: 6 }}>{error}</div>}
    </span>
  );
}
