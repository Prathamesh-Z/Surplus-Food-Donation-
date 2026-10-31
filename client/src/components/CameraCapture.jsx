import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * Camera capture (v3.4): live preview via getUserMedia, rear camera by
 * default on mobile (facingMode: environment), a device picker when more
 * than one camera exists, Capture → JPEG File via canvas, Cancel.
 * All tracks are stopped on capture, cancel and unmount — the camera is
 * only ever on while this panel is open, and permission is requested only
 * when the user opens it.
 */
export function CameraCapture({ onCapture, onClose }) {
  const { t } = useLang();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');

  function stop() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  async function start(id) {
    stop();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('cameraUnavailable'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id } } : { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? t('cameraDenied') : t('cameraUnavailable'));
    }
  }

  useEffect(() => {
    start('');
    return stop; // cleanup on unmount / navigation away
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
        stop();
        onCapture(file);
      },
      'image/jpeg',
      0.92
    );
  }

  function cancel() {
    stop();
    onClose();
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginTop: 10 }}>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', maxWidth: 420, borderRadius: 10, background: '#111' }}
        />
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={capture} disabled={Boolean(error)}>
          📸 {t('capturePhoto')}
        </button>
        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              start(e.target.value);
            }}
            style={{ maxWidth: 200 }}
          >
            <option value="">{t('switchCamera')}</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="secondary" onClick={cancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
