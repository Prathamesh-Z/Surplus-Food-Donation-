import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api.js';

// Pickup by QR: the claimer shows a QR of their pickup code; the provider
// scans it with the device camera (BarcodeDetector where available) or
// falls back to typing the 8-character code. The code — and the whole
// verification design behind it — is unchanged.
export function PickupCodeDisplay({ code }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current && code) {
      QRCode.toCanvas(canvasRef.current, code, { width: 168, margin: 1 }).catch(() => {});
    }
  }, [code]);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span>
        Pickup code: <span className="code">{code}</span>
      </span>
      <canvas ref={canvasRef} style={{ borderRadius: 8, background: '#fff' }} />
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
      const res = await api(`/api/claims/${claimId}/verify`, { method: 'POST', body: { code: finalCode } });
      window.alert(res.alreadyCollected ? 'Already collected earlier — no change.' : 'Collected ✓');
      setOpen(false);
      onDone?.();
    } catch (err) {
      setError(err.data?.error || err.message);
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
